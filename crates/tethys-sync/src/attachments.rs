//! Attachment grid computation (`mcp.attachments`).
//!
//! Pure computation mapping effective MCP servers × connected Providers
//! into attachment cell states (`Attached`, `UnsupportedTransport`, `FileProjection`, `Excluded`, `NotNegotiated`).

use std::collections::HashMap;

use tethys_schema::connection::NormalizedCapabilities;
use tethys_schema::sync::{
    AttachmentCell, AttachmentGrid, AttachmentState, EntryState, ProjectionTarget, ProviderColumn,
    RegistryEntry, Scope, ServerRow, TransportKind,
};

/// Per-Provider input for computing attachment states.
pub struct ProviderInput {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub capabilities: Option<NormalizedCapabilities>,
    pub projection_target: Option<ProjectionTarget>,
    pub projection_states: HashMap<String, EntryState>,
}

/// Computes the attachment grid for the given servers and providers.
pub fn compute_attachment_grid(
    servers: &[(String, RegistryEntry, Scope)],
    providers: &[ProviderInput],
) -> AttachmentGrid {
    let server_rows: Vec<ServerRow> = servers
        .iter()
        .map(|(name, entry, scope)| ServerRow {
            name: name.clone(),
            transport: entry.transport,
            scope: *scope,
        })
        .collect();

    let provider_cols: Vec<ProviderColumn> = providers
        .iter()
        .map(|p| ProviderColumn {
            id: p.id.clone(),
            name: p.name.clone(),
            connected: p.connected,
            target: p.projection_target,
        })
        .collect();

    let mut cells = Vec::with_capacity(servers.len() * providers.len());

    for (s_name, s_entry, _) in servers {
        for p in providers {
            let state = cell_state(s_name, s_entry, p);
            cells.push(AttachmentCell {
                server_name: s_name.clone(),
                provider_id: p.id.clone(),
                state,
            });
        }
    }

    AttachmentGrid {
        servers: server_rows,
        providers: provider_cols,
        cells,
    }
}

fn cell_state(
    server_name: &str,
    server: &RegistryEntry,
    provider: &ProviderInput,
) -> AttachmentState {
    // 1. If server excludes this provider -> Excluded
    if !server.meta.allows_provider(&provider.id) {
        return AttachmentState::Excluded;
    }

    // 2. If unconnected or no capabilities yet -> NotNegotiated
    let Some(caps) = provider.capabilities.as_ref() else {
        return AttachmentState::NotNegotiated;
    };
    if !provider.connected {
        return AttachmentState::NotNegotiated;
    }

    // Check negotiated transports
    let mcp = &caps.mcp;
    let accepts_any = mcp.stdio || mcp.http || mcp.sse;

    if !accepts_any {
        if let Some(target) = provider.projection_target {
            let entry_state = provider
                .projection_states
                .get(server_name)
                .copied()
                .unwrap_or(EntryState::Pending);
            return AttachmentState::FileProjection {
                target,
                state: entry_state,
            };
        } else {
            return AttachmentState::UnsupportedTransport {
                needs: server.transport,
            };
        }
    }

    // Provider accepts at least one transport
    let supported = match server.transport {
        TransportKind::Stdio => mcp.stdio,
        TransportKind::Http => mcp.http,
        TransportKind::Sse => mcp.sse,
    };

    if supported {
        AttachmentState::Attached
    } else {
        AttachmentState::UnsupportedTransport {
            needs: server.transport,
        }
    }
}
