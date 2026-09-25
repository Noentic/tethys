//! Per-thread permission context and the parked-request registry (M1.7 U3/U4).
//!
//! The policy resolver owns its waiting state here (overview amendment 2): when
//! a request surfaces to the user the resolver parks a `oneshot` keyed by
//! `req_id`, and `permission.respond` / `elicitation_respond` complete it. The
//! webview never decides an outcome; it only supplies the Provider's own
//! `option_id` or typed elicitation answers.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use tethys_schema::elicitation::{ElicitationRequest, ElicitationResponse};
use tethys_schema::thread::{PermissionRequested, ThreadId};
use tethys_schema::workspace::PermissionMode;
use tethys_thread::{PermissionDecision, SessionId};
use tokio::sync::oneshot;

use crate::ApiError;

/// How a thread's workdir relates to its workspace root.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Isolation {
    /// A git worktree: the workdir is not the workspace root.
    Worktree,
    /// The main checkout (or a plain folder).
    MainCheckout,
}

/// Everything the policy engine needs to decide one request for one thread.
#[derive(Debug, Clone)]
pub struct ThreadPermissionContext {
    pub thread_id: ThreadId,
    pub workspace_id: String,
    pub workspace_root: PathBuf,
    pub workdir: PathBuf,
    pub isolation: Isolation,
    /// Whether the workspace root is a git repository.
    pub is_git: bool,
    pub mode: PermissionMode,
    /// Explicit per-workspace YOLO opt-in for a main checkout / plain folder.
    pub yolo_opt_in: bool,
}

struct PendingPermission {
    thread_id: ThreadId,
    request: PermissionRequested,
    sender: oneshot::Sender<PermissionDecision>,
}

struct PendingElicitation {
    thread_id: ThreadId,
    sender: oneshot::Sender<ElicitationResponse>,
}

/// Pending entries are keyed by `(thread_id, req_id)`: ACP request ids are
/// generated per connection and restart at 1, so a bare `req_id` collides
/// across threads (SEC-03).
fn pending_key(thread_id: &ThreadId, req_id: &str) -> String {
    format!("{}\u{0}{req_id}", thread_id.as_str())
}

/// The ACP permission option kinds that are approvals. Anything else —
/// including an unknown `allow`-prefixed kind — is never an approval (§7.6).
pub(crate) fn is_approving_kind(kind: Option<&str>) -> bool {
    matches!(kind, Some("allow_once" | "allow_always"))
}

/// Shared between `ThreadSessions` (writes context) and the policy resolver
/// (reads context, parks requests).
#[derive(Default)]
pub struct PermissionRegistry {
    contexts: Mutex<HashMap<String, ThreadPermissionContext>>,
    sessions_by_thread: Mutex<HashMap<ThreadId, String>>,
    /// Chosen modes, kept per thread so a mode set before the first connection
    /// is not lost when the session registers (SEC/residual risk).
    modes: Mutex<HashMap<ThreadId, PermissionMode>>,
    permission_pending: Mutex<HashMap<String, PendingPermission>>,
    elicitation_pending: Mutex<HashMap<String, PendingElicitation>>,
}

impl PermissionRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Records the context for a newly connected session, applying any mode the
    /// user already chose for this thread.
    pub fn register_session(&self, session: &SessionId, mut context: ThreadPermissionContext) {
        if let Some(mode) = self.modes.lock().get(&context.thread_id).copied() {
            context.mode = mode;
        }
        self.sessions_by_thread
            .lock()
            .insert(context.thread_id.clone(), session.0.clone());
        self.contexts.lock().insert(session.0.clone(), context);
    }

    /// Drops a session's context. Any requests it left parked are answered by
    /// [`PermissionRegistry::cancel_thread`] on connection teardown.
    pub fn unregister_session(&self, session: &SessionId) {
        let context = self.contexts.lock().remove(&session.0);
        if let Some(context) = context {
            self.sessions_by_thread.lock().remove(&context.thread_id);
        }
    }

    pub fn context(&self, session: &SessionId) -> Option<ThreadPermissionContext> {
        self.contexts.lock().get(&session.0).cloned()
    }

    pub fn context_for_thread(&self, thread_id: &ThreadId) -> Option<ThreadPermissionContext> {
        let session = self.sessions_by_thread.lock().get(thread_id).cloned()?;
        self.contexts.lock().get(&session).cloned()
    }

    /// Sets a thread's policy mode (`thread.set_permission_mode`). Persists even
    /// before the thread has a live connection.
    pub fn set_mode(&self, thread_id: &ThreadId, mode: PermissionMode) -> Result<(), ApiError> {
        self.modes.lock().insert(thread_id.clone(), mode);
        let session = self.sessions_by_thread.lock().get(thread_id).cloned();
        if let Some(session) = session {
            if let Some(context) = self.contexts.lock().get_mut(&session) {
                context.mode = mode;
            }
        }
        Ok(())
    }

    /// Sets the explicit YOLO opt-in for a workspace.
    pub fn set_yolo_opt_in(&self, thread_id: &ThreadId, opt_in: bool) {
        let session = self.sessions_by_thread.lock().get(thread_id).cloned();
        if let Some(session) = session {
            if let Some(context) = self.contexts.lock().get_mut(&session) {
                context.yolo_opt_in = opt_in;
            }
        }
    }

    /// Parks a surfaced request, returning the receiver the resolver awaits.
    pub fn park_permission(
        &self,
        thread_id: ThreadId,
        request: PermissionRequested,
    ) -> oneshot::Receiver<PermissionDecision> {
        let (sender, receiver) = oneshot::channel();
        let key = pending_key(&thread_id, &request.req_id);
        self.permission_pending.lock().insert(
            key,
            PendingPermission {
                thread_id,
                request,
                sender,
            },
        );
        receiver
    }

    /// Completes a parked request with the user's chosen option.
    ///
    /// Unknown option kinds are never treated as approval (architecture §7.6).
    /// The entry is validated and only then removed, so a mismatched caller
    /// cannot destroy another thread's parked decision (SEC-04).
    pub fn complete_permission(
        &self,
        thread_id: &ThreadId,
        req_id: &str,
        option_id: Option<String>,
    ) -> Result<(), ApiError> {
        let key = pending_key(thread_id, req_id);
        let pending = {
            let mut map = self.permission_pending.lock();
            match map.get(&key) {
                Some(pending) if &pending.thread_id == thread_id => map.remove(&key),
                _ => None,
            }
        };
        let pending =
            pending.ok_or_else(|| ApiError::NotFound(format!("pending permission {req_id}")))?;
        let decision = match option_id {
            Some(option_id) => {
                let option = pending
                    .request
                    .options
                    .iter()
                    .find(|option| option.option_id == option_id);
                let outcome = if is_approving_kind(option.and_then(|option| option.kind.as_deref()))
                {
                    tethys_schema::thread::PermOutcome::Approved
                } else {
                    tethys_schema::thread::PermOutcome::Rejected
                };
                // Only an option the Provider offered is sent back as selected; an
                // unknown id still rejects, but reaches the agent as a cancel.
                PermissionDecision {
                    outcome,
                    option_id: option.map(|_| option_id),
                    decided_by: tethys_schema::thread::Decider::User,
                }
            }
            None => PermissionDecision {
                outcome: tethys_schema::thread::PermOutcome::Cancelled,
                option_id: None,
                decided_by: tethys_schema::thread::Decider::User,
            },
        };
        let _ = pending.sender.send(decision);
        Ok(())
    }

    /// Parks an elicitation, returning the receiver the responder awaits.
    pub fn park_elicitation(
        &self,
        thread_id: ThreadId,
        request: &ElicitationRequest,
    ) -> oneshot::Receiver<ElicitationResponse> {
        let (sender, receiver) = oneshot::channel();
        let key = pending_key(&thread_id, &request.req_id);
        self.elicitation_pending
            .lock()
            .insert(key, PendingElicitation { thread_id, sender });
        receiver
    }

    /// Completes a parked elicitation with the user's answer.
    pub fn complete_elicitation(
        &self,
        thread_id: &ThreadId,
        response: ElicitationResponse,
    ) -> Result<(), ApiError> {
        let key = pending_key(thread_id, &response.req_id);
        let pending = {
            let mut map = self.elicitation_pending.lock();
            match map.get(&key) {
                Some(pending) if &pending.thread_id == thread_id => map.remove(&key),
                _ => None,
            }
        };
        let pending = pending.ok_or_else(|| {
            ApiError::NotFound(format!("pending elicitation {}", response.req_id))
        })?;
        let _ = pending.sender.send(response);
        Ok(())
    }

    /// Answers every request parked by a thread (cancel path), so no `oneshot`
    /// is dropped while a caller awaits it.
    pub fn cancel_thread(&self, thread_id: &ThreadId) {
        let permission_ids: Vec<String> = self
            .permission_pending
            .lock()
            .iter()
            .filter(|(_, pending)| &pending.thread_id == thread_id)
            .map(|(req_id, _)| req_id.clone())
            .collect();
        for req_id in permission_ids {
            if let Some(pending) = self.permission_pending.lock().remove(&req_id) {
                let _ = pending.sender.send(PermissionDecision::cancelled());
            }
        }

        let elicitation_ids: Vec<String> = self
            .elicitation_pending
            .lock()
            .iter()
            .filter(|(_, pending)| &pending.thread_id == thread_id)
            .map(|(req_id, _)| req_id.clone())
            .collect();
        for req_id in elicitation_ids {
            self.elicitation_pending.lock().remove(&req_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tethys_schema::thread::{PermOption, PermOutcome};

    fn request(req_id: &str) -> PermissionRequested {
        PermissionRequested {
            req_id: req_id.into(),
            title: "Do the thing".into(),
            description: None,
            subject: None,
            options: vec![PermOption {
                option_id: "allow".into(),
                name: "Allow".into(),
                kind: Some("allow_once".into()),
                description: None,
                metadata: None,
            }],
            metadata: None,
        }
    }

    #[tokio::test]
    async fn wrong_thread_respond_does_not_consume_the_parked_entry() {
        let registry = PermissionRegistry::new();
        let a = ThreadId::new("a");
        let b = ThreadId::new("b");
        let receiver = registry.park_permission(a.clone(), request("perm-1"));

        assert!(registry
            .complete_permission(&b, "perm-1", Some("allow".into()))
            .is_err());
        assert!(registry
            .complete_permission(&a, "perm-1", Some("allow".into()))
            .is_ok());
        assert_eq!(
            receiver.await.expect("decision").outcome,
            PermOutcome::Approved
        );
    }

    #[tokio::test]
    async fn colliding_req_ids_across_threads_do_not_overwrite() {
        let registry = PermissionRegistry::new();
        let a = ThreadId::new("a");
        let b = ThreadId::new("b");
        let first = registry.park_permission(a.clone(), request("perm-1"));
        let second = registry.park_permission(b.clone(), request("perm-1"));

        registry
            .complete_permission(&a, "perm-1", Some("allow".into()))
            .expect("complete a");
        registry
            .complete_permission(&b, "perm-1", None)
            .expect("complete b");

        assert_eq!(first.await.expect("a").outcome, PermOutcome::Approved);
        assert_eq!(second.await.expect("b").outcome, PermOutcome::Cancelled);
    }
}
