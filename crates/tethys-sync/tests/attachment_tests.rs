use std::collections::HashMap;

use tethys_schema::connection::NormalizedCapabilities;
use tethys_schema::sync::{
    AttachmentState, EntryMeta, EntryState, McpTransports, ProjectionTarget, RegistryEntry, Scope,
    TransportKind,
};
use tethys_sync::attachments::{compute_attachment_grid, ProviderInput};

#[test]
fn attachment_grid_calculates_all_cell_states() {
    let servers = vec![
        (
            "stdio-tool".to_string(),
            RegistryEntry {
                transport: TransportKind::Stdio,
                command: Some("cmd".into()),
                args: vec![],
                env: Default::default(),
                url: None,
                headers: Default::default(),
                meta: EntryMeta::default(),
            },
            Scope::Global,
        ),
        (
            "http-tool".to_string(),
            RegistryEntry {
                transport: TransportKind::Http,
                command: None,
                args: vec![],
                env: Default::default(),
                url: Some("https://example.com/mcp".into()),
                headers: Default::default(),
                meta: EntryMeta::default(),
            },
            Scope::Workspace,
        ),
        (
            "opencode-only".to_string(),
            RegistryEntry {
                transport: TransportKind::Stdio,
                command: Some("opencode-cmd".into()),
                args: vec![],
                env: Default::default(),
                url: None,
                headers: Default::default(),
                meta: EntryMeta {
                    providers: Some(vec!["opencode".to_string()]),
                    ..Default::default()
                },
            },
            Scope::Workspace,
        ),
    ];

    let mut projection_states = HashMap::new();
    projection_states.insert("stdio-tool".to_string(), EntryState::InSync);

    let providers = vec![
        // 1. v1 Provider with stdio only
        ProviderInput {
            id: "v1-stdio".to_string(),
            name: "V1 Stdio Agent".to_string(),
            connected: true,
            capabilities: Some(NormalizedCapabilities {
                load_session: true,
                resume: true,
                mcp: McpTransports {
                    stdio: true,
                    http: false,
                    sse: false,
                },
                prompt_embedded_context: false,
                elicitation: false,
            }),
            projection_target: None,
            projection_states: HashMap::new(),
        },
        // 2. Provider negotiating nothing + a projection_target
        ProviderInput {
            id: "projected-claude".to_string(),
            name: "Claude Code File Agent".to_string(),
            connected: true,
            capabilities: Some(NormalizedCapabilities {
                load_session: false,
                resume: false,
                mcp: McpTransports {
                    stdio: false,
                    http: false,
                    sse: false,
                },
                prompt_embedded_context: false,
                elicitation: false,
            }),
            projection_target: Some(ProjectionTarget::ClaudeCode),
            projection_states: projection_states.clone(),
        },
        // 3. Provider negotiating nothing without a target
        ProviderInput {
            id: "no-transports-no-target".to_string(),
            name: "Bare Agent".to_string(),
            connected: true,
            capabilities: Some(NormalizedCapabilities {
                load_session: false,
                resume: false,
                mcp: McpTransports {
                    stdio: false,
                    http: false,
                    sse: false,
                },
                prompt_embedded_context: false,
                elicitation: false,
            }),
            projection_target: None,
            projection_states: HashMap::new(),
        },
        // 4. unconnected Provider
        ProviderInput {
            id: "unconnected".to_string(),
            name: "Offline Agent".to_string(),
            connected: false,
            capabilities: None,
            projection_target: None,
            projection_states: HashMap::new(),
        },
        // 5. Custom-ACP Provider id
        ProviderInput {
            id: "custom-provider-xyz".to_string(),
            name: "Custom Agent XYZ".to_string(),
            connected: true,
            capabilities: Some(NormalizedCapabilities {
                load_session: true,
                resume: true,
                mcp: McpTransports {
                    stdio: true,
                    http: true,
                    sse: false,
                },
                prompt_embedded_context: false,
                elicitation: false,
            }),
            projection_target: None,
            projection_states: HashMap::new(),
        },
    ];

    let grid = compute_attachment_grid(&servers, &providers);

    assert_eq!(grid.servers.len(), 3);
    assert_eq!(grid.providers.len(), 5);
    assert_eq!(grid.cells.len(), 15);

    // Helper to find a cell
    let cell_state = |s: &str, p: &str| -> AttachmentState {
        grid.cells
            .iter()
            .find(|c| c.server_name == s && c.provider_id == p)
            .expect("cell exists")
            .state
            .clone()
    };

    // Case: v1 Provider with stdio only + stdio server -> Attached
    assert_eq!(
        cell_state("stdio-tool", "v1-stdio"),
        AttachmentState::Attached
    );

    // Case: v1 Provider with stdio only + http server -> UnsupportedTransport { needs: Http }
    assert_eq!(
        cell_state("http-tool", "v1-stdio"),
        AttachmentState::UnsupportedTransport {
            needs: TransportKind::Http
        }
    );

    // Case: Provider negotiating nothing + a projection_target -> FileProjection carrying EntryState
    assert_eq!(
        cell_state("stdio-tool", "projected-claude"),
        AttachmentState::FileProjection {
            target: ProjectionTarget::ClaudeCode,
            state: EntryState::InSync,
        }
    );

    // Case: Provider negotiating nothing without a target -> UnsupportedTransport
    assert_eq!(
        cell_state("stdio-tool", "no-transports-no-target"),
        AttachmentState::UnsupportedTransport {
            needs: TransportKind::Stdio
        }
    );

    // Case: unconnected Provider -> NotNegotiated, never Attached
    assert_eq!(
        cell_state("stdio-tool", "unconnected"),
        AttachmentState::NotNegotiated
    );
    assert_eq!(
        cell_state("http-tool", "unconnected"),
        AttachmentState::NotNegotiated
    );

    // Case: A server with providers: ["opencode"] is Excluded for every other Provider
    assert_eq!(
        cell_state("opencode-only", "v1-stdio"),
        AttachmentState::Excluded
    );
    assert_eq!(
        cell_state("opencode-only", "custom-provider-xyz"),
        AttachmentState::Excluded
    );

    // Case: Custom ACP provider appears as column and supports both stdio and http
    assert_eq!(
        cell_state("stdio-tool", "custom-provider-xyz"),
        AttachmentState::Attached
    );
    assert_eq!(
        cell_state("http-tool", "custom-provider-xyz"),
        AttachmentState::Attached
    );
}
