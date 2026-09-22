//! Permission policy engine (M1.8 PRM-01..04, architecture §7.6).
//!
//! Three modes narrow, never widen: Supervised always surfaces, Auto-edit
//! auto-approves only edits inside the thread root, and YOLO auto-approves
//! anywhere but only behind its guard (worktree thread, or explicit opt-in).
//! An auto-pick selects an option the Provider actually offered, never a
//! synthesized one; unknown option kinds are never treated as approval.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use tethys_schema::elicitation::{ElicitationRequest, ElicitationResponse};
use tethys_schema::thread::{
    Decider, PermOption, PermOutcome, PermissionRequested, PermissionSubject,
};
use tethys_schema::workspace::PermissionMode;
use tethys_thread::{ElicitationResolver, PermissionDecision, PermissionResolver, SessionId};

use crate::permission::pending::{Isolation, PermissionRegistry, ThreadPermissionContext};

/// Denies every request without surfacing it. The safe fallback for callers
/// that have not wired a policy registry.
pub struct DenyPermissionResolver;

#[async_trait]
impl PermissionResolver for DenyPermissionResolver {
    async fn resolve(
        &self,
        _session: &SessionId,
        _request: PermissionRequested,
    ) -> PermissionDecision {
        PermissionDecision::cancelled()
    }
}

/// The policy resolver injected at `Core::new` / `Core::open`.
pub struct PolicyResolver {
    registry: Arc<PermissionRegistry>,
}

impl PolicyResolver {
    pub fn new(registry: Arc<PermissionRegistry>) -> Self {
        Self { registry }
    }

    /// Resolves a request for one session. Public so the adversarial and
    /// YOLO-guard tests can assert directly against the resolver.
    pub async fn decide(
        &self,
        session: &SessionId,
        request: PermissionRequested,
    ) -> PermissionDecision {
        let context = self.registry.context(session);
        let mode = context
            .as_ref()
            .map(|context| context.mode)
            .unwrap_or(PermissionMode::Supervised);

        if let Some(decision) = auto_decision(mode, context.as_ref(), &request) {
            return decision;
        }

        let thread_id = context
            .as_ref()
            .map(|context| context.thread_id.clone())
            .unwrap_or_else(|| tethys_schema::thread::ThreadId::new("unknown"));
        let receiver = self.registry.park_permission(thread_id, request);
        match receiver.await {
            Ok(decision) => decision,
            Err(_) => PermissionDecision::cancelled(),
        }
    }
}

#[async_trait]
impl PermissionResolver for PolicyResolver {
    async fn resolve(
        &self,
        session: &SessionId,
        request: PermissionRequested,
    ) -> PermissionDecision {
        self.decide(session, request).await
    }
}

/// Auto-decides a request when the mode allows it, or `None` to surface it.
fn auto_decision(
    mode: PermissionMode,
    context: Option<&ThreadPermissionContext>,
    request: &PermissionRequested,
) -> Option<PermissionDecision> {
    match mode {
        PermissionMode::Supervised => None,
        PermissionMode::AutoEdit => {
            let context = context?;
            let path = edit_path(request)?;
            if !path_within(&context.workdir, &path) {
                return None;
            }
            approve(request, Decider::Policy)
        }
        PermissionMode::Yolo => {
            let context = context?;
            if !yolo_allowed(context) {
                tracing::warn!(
                    thread = %context.thread_id,
                    isolation = ?context.isolation,
                    is_git = context.is_git,
                    "YOLO refused; degrading to supervised for this request"
                );
                return None;
            }
            approve(request, Decider::Policy)
        }
    }
}

/// The path an edit-kind permission request touches, if it is an edit.
fn edit_path(request: &PermissionRequested) -> Option<PathBuf> {
    match request.subject.as_ref()? {
        PermissionSubject::File { path } => Some(PathBuf::from(path)),
        _ => None,
    }
}

/// Picks the Provider's own approving option, or surfaces when none exists.
fn approve(request: &PermissionRequested, decided_by: Decider) -> Option<PermissionDecision> {
    let option = request.options.iter().find(|option| approves(option))?;
    Some(PermissionDecision {
        outcome: PermOutcome::Approved,
        option_id: Some(option.option_id.clone()),
        decided_by,
    })
}

fn approves(option: &PermOption) -> bool {
    crate::permission::pending::is_approving_kind(option.kind.as_deref())
}

/// YOLO is allowed on a git worktree, or anywhere with an explicit opt-in.
fn yolo_allowed(context: &ThreadPermissionContext) -> bool {
    context.yolo_opt_in || (context.isolation == Isolation::Worktree && context.is_git)
}

/// Whether `path` (absolute or relative to the workdir) stays inside the
/// thread's own root. For a main-checkout thread the workdir is the workspace
/// root, so this is the whole repo; for a worktree thread it is only the
/// worktree (SEC-01).
///
/// `..` is resolved lexically first, then the deepest existing ancestor is
/// canonicalized, so neither traversal nor a symlink can smuggle an
/// out-of-root path past the check.
fn path_within(workdir: &Path, path: &Path) -> bool {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        workdir.join(path)
    };
    let absolute = crate::normalize_path(&lexical_normalize(&absolute));
    let root = crate::normalize_path(&lexical_normalize(workdir));
    absolute.starts_with(root)
}

/// Collapses `.` and `..` components without touching the filesystem.
fn lexical_normalize(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut parts: Vec<Component<'_>> = Vec::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                if matches!(parts.last(), Some(Component::Normal(_))) {
                    parts.pop();
                } else if !matches!(parts.first(), Some(Component::RootDir)) {
                    parts.push(component);
                }
            }
            Component::CurDir => {}
            other => parts.push(other),
        }
    }
    parts.iter().collect()
}

/// Elicitation responder: parks the request and awaits the user's answer.
pub struct ElicitationPolicyResolver {
    registry: Arc<PermissionRegistry>,
}

impl ElicitationPolicyResolver {
    pub fn new(registry: Arc<PermissionRegistry>) -> Self {
        Self { registry }
    }
}

#[async_trait]
impl ElicitationResolver for ElicitationPolicyResolver {
    async fn resolve(
        &self,
        session: &SessionId,
        request: ElicitationRequest,
    ) -> ElicitationResponse {
        let thread_id = self
            .registry
            .context(session)
            .map(|context| context.thread_id)
            .unwrap_or_else(|| tethys_schema::thread::ThreadId::new("unknown"));
        let receiver = self.registry.park_elicitation(thread_id, &request);
        let req_id = request.req_id.clone();
        match receiver.await {
            Ok(response) => response,
            Err(_) => ElicitationResponse::without_values(
                req_id,
                tethys_schema::elicitation::ElicitationOutcome::Cancelled,
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::permission::pending::ThreadPermissionContext;
    use tethys_schema::thread::ThreadId;

    fn context(
        mode: PermissionMode,
        isolation: Isolation,
        is_git: bool,
    ) -> ThreadPermissionContext {
        ThreadPermissionContext {
            thread_id: ThreadId::new("thread-1"),
            workspace_id: "ws-1".into(),
            workspace_root: PathBuf::from("/repo"),
            workdir: if isolation == Isolation::Worktree {
                PathBuf::from("/repo/.tethys/worktrees/t1")
            } else {
                PathBuf::from("/repo")
            },
            isolation,
            is_git,
            mode,
            yolo_opt_in: false,
        }
    }

    fn request(
        subject: Option<PermissionSubject>,
        options: Vec<PermOption>,
    ) -> PermissionRequested {
        PermissionRequested {
            req_id: "perm-1".into(),
            title: "Do the thing".into(),
            description: None,
            subject,
            options,
            metadata: None,
        }
    }

    fn allow_option() -> PermOption {
        PermOption {
            option_id: "allow".into(),
            name: "Allow".into(),
            kind: Some("allow_once".into()),
        }
    }

    fn deny_option() -> PermOption {
        PermOption {
            option_id: "deny".into(),
            name: "Deny".into(),
            kind: Some("reject_once".into()),
        }
    }

    fn registry_with(context: ThreadPermissionContext) -> Arc<PermissionRegistry> {
        let registry = PermissionRegistry::new();
        registry.register_session(&SessionId::new("s1"), context);
        registry
    }

    #[tokio::test]
    async fn supervised_never_auto_approves() {
        let registry = registry_with(context(
            PermissionMode::Supervised,
            Isolation::Worktree,
            true,
        ));
        let resolver = PolicyResolver::new(registry.clone());
        let session = SessionId::new("s1");
        let request = request(
            Some(PermissionSubject::File {
                path: "/repo/a.rs".into(),
            }),
            vec![allow_option(), deny_option()],
        );
        let handle = tokio::spawn(async move { resolver.decide(&session, request).await });
        // Supervised surfaces; answer it as a rejection to prove it never auto-approved.
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        registry
            .complete_permission(&ThreadId::new("thread-1"), "perm-1", Some("deny".into()))
            .expect("complete");
        let decision = handle.await.expect("join");
        assert_eq!(decision.outcome, PermOutcome::Rejected);
        assert_eq!(decision.decided_by, Decider::User);
    }

    #[tokio::test]
    async fn auto_edit_approves_inside_root_and_surfaces_outside() {
        let registry = registry_with(context(
            PermissionMode::AutoEdit,
            Isolation::MainCheckout,
            true,
        ));
        let resolver = PolicyResolver::new(registry.clone());
        let session = SessionId::new("s1");

        let inside = resolver
            .decide(
                &session,
                request(
                    Some(PermissionSubject::File {
                        path: "src/a.rs".into(),
                    }),
                    vec![allow_option()],
                ),
            )
            .await;
        assert_eq!(inside.outcome, PermOutcome::Approved);
        assert_eq!(inside.decided_by, Decider::Policy);
        assert_eq!(inside.option_id.as_deref(), Some("allow"));

        // Outside the root surfaces, so answering it is required.
        let handle = tokio::spawn({
            let resolver = PolicyResolver::new(registry.clone());
            let session = session.clone();
            async move {
                resolver
                    .decide(
                        &session,
                        request(
                            Some(PermissionSubject::File {
                                path: "../escape.rs".into(),
                            }),
                            vec![allow_option()],
                        ),
                    )
                    .await
            }
        });
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        registry
            .complete_permission(&ThreadId::new("thread-1"), "perm-1", Some("allow".into()))
            .expect("complete");
        let outside = handle.await.expect("join");
        assert_eq!(outside.decided_by, Decider::User);
    }

    #[tokio::test]
    async fn yolo_guard_refuses_main_checkout_without_opt_in() {
        let registry = registry_with(context(PermissionMode::Yolo, Isolation::MainCheckout, true));
        let session = SessionId::new("s1");
        let handle = tokio::spawn({
            let resolver = PolicyResolver::new(registry.clone());
            let session = session.clone();
            async move {
                resolver
                    .decide(&session, request(None, vec![allow_option()]))
                    .await
            }
        });
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        registry
            .complete_permission(&ThreadId::new("thread-1"), "perm-1", Some("deny".into()))
            .expect("complete");
        let decision = handle.await.expect("join");
        assert_eq!(decision.outcome, PermOutcome::Rejected);
        assert_eq!(decision.decided_by, Decider::User);
    }

    #[tokio::test]
    async fn yolo_guard_refuses_non_git_without_opt_in() {
        let registry = registry_with(context(
            PermissionMode::Yolo,
            Isolation::MainCheckout,
            false,
        ));
        let session = SessionId::new("s1");
        let handle = tokio::spawn({
            let resolver = PolicyResolver::new(registry.clone());
            let session = session.clone();
            async move {
                resolver
                    .decide(&session, request(None, vec![allow_option()]))
                    .await
            }
        });
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        registry
            .complete_permission(&ThreadId::new("thread-1"), "perm-1", Some("allow".into()))
            .expect("complete");
        let decision = handle.await.expect("join");
        assert_eq!(decision.decided_by, Decider::User);
    }

    #[tokio::test]
    async fn yolo_approves_on_worktree() {
        let registry = registry_with(context(PermissionMode::Yolo, Isolation::Worktree, true));
        let resolver = PolicyResolver::new(registry);
        let decision = resolver
            .decide(&SessionId::new("s1"), request(None, vec![allow_option()]))
            .await;
        assert_eq!(decision.outcome, PermOutcome::Approved);
        assert_eq!(decision.decided_by, Decider::Policy);
    }

    #[tokio::test]
    async fn no_approving_option_surfaces_instead_of_fabricating() {
        let registry = registry_with(context(PermissionMode::Yolo, Isolation::Worktree, true));
        let session = SessionId::new("s1");
        let handle = tokio::spawn({
            let resolver = PolicyResolver::new(registry.clone());
            let session = session.clone();
            async move {
                resolver
                    .decide(&session, request(None, vec![deny_option()]))
                    .await
            }
        });
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        registry
            .complete_permission(&ThreadId::new("thread-1"), "perm-1", Some("deny".into()))
            .expect("complete");
        let decision = handle.await.expect("join");
        assert_eq!(decision.outcome, PermOutcome::Rejected);
        assert_eq!(decision.decided_by, Decider::User);
    }

    #[test]
    fn unknown_option_kind_is_never_approval() {
        let registry = registry_with(context(
            PermissionMode::Supervised,
            Isolation::Worktree,
            true,
        ));
        let request = request(
            None,
            vec![PermOption {
                option_id: "mystery".into(),
                name: "Mystery".into(),
                kind: Some("escalate".into()),
            }],
        );
        std::mem::drop(registry.park_permission(ThreadId::new("thread-1"), request));
        registry
            .complete_permission(&ThreadId::new("thread-1"), "perm-1", Some("mystery".into()))
            .expect("complete");
        // The completion is asserted through the parked receiver elsewhere; here
        // the guarantee is that `approves` rejects unknown kinds.
        assert!(!approves(&PermOption {
            option_id: "mystery".into(),
            name: "Mystery".into(),
            kind: Some("escalate".into()),
        }));
    }

    #[test]
    fn path_within_handles_parent_traversal() {
        assert!(path_within(Path::new("/repo"), Path::new("src/a.rs")));
        assert!(!path_within(Path::new("/repo"), Path::new("../etc/passwd")));
        assert!(path_within(
            Path::new("/repo/.tethys/worktrees/t1"),
            Path::new("/repo/.tethys/worktrees/t1/a.rs")
        ));
    }

    #[test]
    fn auto_edit_root_does_not_widen_to_the_workspace_root() {
        // A worktree thread must not auto-approve an edit in the main checkout
        // (SEC-01), including via `..`.
        let worktree = Path::new("/repo/.tethys/worktrees/t1");
        assert!(!path_within(worktree, Path::new("/repo/src/main.rs")));
        assert!(!path_within(worktree, Path::new("../src/main.rs")));
        assert!(!path_within(
            worktree,
            Path::new("/repo/.tethys/worktrees/other/a.rs")
        ));
    }

    #[test]
    fn mode_set_before_connection_survives_registration() {
        let registry = PermissionRegistry::new();
        let thread = ThreadId::new("thread-1");
        registry
            .set_mode(&thread, PermissionMode::Yolo)
            .expect("set mode");
        registry.register_session(
            &SessionId::new("s1"),
            context(PermissionMode::Supervised, Isolation::Worktree, true),
        );
        assert_eq!(
            registry
                .context(&SessionId::new("s1"))
                .expect("context")
                .mode,
            PermissionMode::Yolo
        );
    }

    #[test]
    fn unknown_allow_prefixed_kind_is_not_an_approval() {
        for kind in ["allow_once", "allow_always"] {
            assert!(approves(&PermOption {
                option_id: "x".into(),
                name: "X".into(),
                kind: Some(kind.into()),
            }));
        }
        for kind in ["allowlist", "allow_custom", "escalate", "reject_once"] {
            assert!(!approves(&PermOption {
                option_id: "x".into(),
                name: "X".into(),
                kind: Some(kind.into()),
            }));
        }
    }
}
