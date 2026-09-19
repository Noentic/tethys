//! Pure session handoff: effective entries to ACP-neutral session servers.

use std::collections::BTreeSet;
use std::path::Path;

use tethys_schema::sync::{
    McpTransports, RegistryEntry, RegistryValue, SessionServer, TargetId, TransportKind,
};

use crate::error::SyncError;
use crate::registry::{global_registry_path, workspace_registry_path, Registry};
use crate::secrets::{parse_secret_ref, SecretStore};

/// Loads the registry, filters by transports, and resolves secrets.
///
/// This is the whole spawn-time MCP path: no file is written, and the
/// resolved values exist only in memory for one session.
pub fn spawn_servers(
    home: &Path,
    workspace_root: &Path,
    disabled: &BTreeSet<String>,
    transports: &McpTransports,
    store: &dyn SecretStore,
) -> Result<Vec<SessionServer>, SyncError> {
    let registry = Registry::load(
        Some(&global_registry_path(home)),
        Some(&workspace_registry_path(workspace_root)),
    )?;
    let effective = registry.effective(TargetId::Session, disabled);
    let servers = session_servers(&effective, transports);
    resolve_secrets(&servers, store)
}

/// Filters effective entries by the agent's advertised transports.
///
/// SSE is only kept for v1 agents that advertise it; v2 callers pass
/// `sse = false` because the v2 schema has no SSE transport.
pub fn session_servers(
    entries: &[(String, RegistryEntry)],
    transports: &McpTransports,
) -> Vec<SessionServer> {
    entries
        .iter()
        .filter(|(_, entry)| match entry.transport {
            TransportKind::Stdio => transports.stdio,
            TransportKind::Http => transports.http,
            TransportKind::Sse => transports.sse,
        })
        .map(|(name, entry)| SessionServer {
            name: name.clone(),
            transport: entry.transport,
            command: entry.command.clone(),
            args: entry.args.clone(),
            env: entry.env.clone(),
            url: entry.url.clone(),
            headers: entry.headers.clone(),
        })
        .collect()
}

/// Replaces every `secretRef` with its keychain value.
///
/// All-or-nothing: a missing reference fails with the full list so the
/// caller (M1.2/M1.8 policy) can decide whether to drop or fail the session.
pub fn resolve_secrets(
    servers: &[SessionServer],
    store: &dyn SecretStore,
) -> Result<Vec<SessionServer>, SyncError> {
    let mut missing: Vec<String> = Vec::new();
    let mut resolved = Vec::with_capacity(servers.len());
    for server in servers {
        let mut copy = server.clone();
        for value in copy.env.values_mut().chain(copy.headers.values_mut()) {
            let RegistryValue::Secret { secret_ref } = value else {
                continue;
            };
            match parse_secret_ref(secret_ref) {
                Some(account) => match store.get(account)? {
                    Some(secret) => *value = RegistryValue::plain(secret),
                    None => missing.push(secret_ref.clone()),
                },
                None => missing.push(secret_ref.clone()),
            }
        }
        resolved.push(copy);
    }
    if missing.is_empty() {
        Ok(resolved)
    } else {
        Err(SyncError::MissingSecrets { refs: missing })
    }
}
