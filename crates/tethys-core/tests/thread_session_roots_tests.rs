use std::fs;
use std::sync::Arc;

use tethys_agent_servers::{ConnectionStore, LaunchSpec, StoreOptions};
use tethys_api::ApiError;
use tethys_core::thread_session::{DenyPermissionResolver, SyncSource, ThreadSessions};
use tethys_core::workspace_roots::StaticWorkspaces;
use tethys_schema::connection::{
    AcpProtocol, AgentCompat, ConnectionKey, NormalizedCapabilities,
};
use tethys_schema::sync::McpTransports;
use tethys_schema::thread::CreateThread;
use tethys_sync::MemorySecrets;

const MCP_REGISTRY_JSON: &str = r#"{
  "mcpServers": {
    "uncommitted-server": {
      "type": "stdio",
      "command": "custom-tool",
      "args": ["serve"],
      "x-tethys": { "targets": ["session"] }
    },
    "http-server": {
      "type": "http",
      "url": "https://example.com/mcp",
      "x-tethys": { "targets": ["session"] }
    }
  }
}"#;

#[tokio::test]
async fn git_thread_in_worktree_receives_uncommitted_workspace_root_registry() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let ws_root = dir.path().join("workspace-main");
    let worktree = dir.path().join("worktrees").join("thread-1-wt");
    fs::create_dir_all(home.join(".tethys")).expect("home");
    fs::create_dir_all(ws_root.join(".tethys")).expect("ws_root");
    fs::create_dir_all(&worktree).expect("worktree");

    // Write uncommitted registry in workspace_root, but NOT in worktree
    fs::write(ws_root.join(".tethys").join("mcp.json"), MCP_REGISTRY_JSON).expect("write registry");
    assert!(!worktree.join(".tethys").join("mcp.json").exists());

    let roots = Arc::new(StaticWorkspaces::new().with("ws-1", &ws_root));
    let store = ConnectionStore::new(
        StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver)),
    );
    let sessions = Arc::new(ThreadSessions::new(
        store.clone(),
        SyncSource::new(&home, Arc::new(MemorySecrets::new())),
        roots.clone(),
    ));

    // Register a profile and configure live negotiated capabilities with stdio & http
    let profile_id = sessions.register_profile(
        LaunchSpec::new("agent-1", "/bin/echo"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
        },
    );
    let key = ConnectionKey::new(&profile_id, "local");
    store.set_capabilities_for_test(
        &key,
        Some(NormalizedCapabilities {
            load_session: true,
            resume: true,
            mcp: McpTransports {
                stdio: true,
                http: true,
                sse: false,
            },
            prompt_embedded_context: false,
        }),
    );

    // 1. Git thread whose workdir is a worktree
    let thread_wt = sessions
        .create(CreateThread {
            workspace_id: "ws-1".into(),
            agent_profile_id: profile_id.clone(),
            workdir: worktree.display().to_string(),
        })
        .await
        .expect("create worktree thread");

    let servers = sessions
        .mcp_servers_for_thread(&thread_wt.id)
        .expect("servers for worktree thread");
    assert_eq!(servers.len(), 2, "must receive servers from workspace_root");
    let names: Vec<&str> = servers
        .iter()
        .filter_map(|s| s.get("name").and_then(|n| n.as_str()))
        .collect();
    assert!(names.contains(&"uncommitted-server"));
    assert!(names.contains(&"http-server"));

    // 2. Plain folder thread whose workdir == ws_root
    let thread_plain = sessions
        .create(CreateThread {
            workspace_id: "ws-1".into(),
            agent_profile_id: profile_id,
            workdir: ws_root.display().to_string(),
        })
        .await
        .expect("create plain thread");

    let servers_plain = sessions
        .mcp_servers_for_thread(&thread_plain.id)
        .expect("servers for plain thread");
    assert_eq!(servers_plain, servers, "plain thread must receive identical server set");
}

#[tokio::test]
async fn resume_and_recovery_spawn_carry_workspace_root_servers() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let ws_root = dir.path().join("workspace-main");
    let worktree = dir.path().join("worktrees").join("thread-2-wt");
    fs::create_dir_all(home.join(".tethys")).expect("home");
    fs::create_dir_all(ws_root.join(".tethys")).expect("ws_root");
    fs::create_dir_all(&worktree).expect("worktree");

    fs::write(ws_root.join(".tethys").join("mcp.json"), MCP_REGISTRY_JSON).expect("write registry");

    let roots = Arc::new(StaticWorkspaces::new().with("ws-2", &ws_root));
    let store = ConnectionStore::new(
        StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver)),
    );
    let sessions = Arc::new(ThreadSessions::new(
        store.clone(),
        SyncSource::new(&home, Arc::new(MemorySecrets::new())),
        roots.clone(),
    ));

    let profile_id = sessions.register_profile(
        LaunchSpec::new("agent-2", "/bin/echo"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
        },
    );
    let key = ConnectionKey::new(&profile_id, "local");
    store.set_capabilities_for_test(
        &key,
        Some(NormalizedCapabilities {
            load_session: true,
            resume: true,
            mcp: McpTransports {
                stdio: true,
                http: false,
                sse: false,
            },
            prompt_embedded_context: false,
        }),
    );

    let thread = sessions
        .create(CreateThread {
            workspace_id: "ws-2".into(),
            agent_profile_id: profile_id,
            workdir: worktree.display().to_string(),
        })
        .await
        .expect("create thread");

    let initial = sessions
        .mcp_servers_for_thread(&thread.id)
        .expect("initial mcp servers");

    // After resume, thread still builds servers from workspace_root
    sessions.resume(&thread.id).await.unwrap_err(); // no live process, but resume advances state
    let resumed = sessions
        .mcp_servers_for_thread(&thread.id)
        .expect("resumed mcp servers");

    assert_eq!(initial, resumed, "resumed thread must carry identical workspace-root servers");
    assert_eq!(resumed.len(), 1);
    assert_eq!(resumed[0]["name"], "uncommitted-server");
}

#[tokio::test]
async fn connection_with_no_negotiated_capabilities_yields_capabilities_not_negotiated() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let ws_root = dir.path().join("workspace-main");
    fs::create_dir_all(home.join(".tethys")).expect("home");
    fs::create_dir_all(ws_root.join(".tethys")).expect("ws_root");
    fs::write(ws_root.join(".tethys").join("mcp.json"), MCP_REGISTRY_JSON).expect("write registry");

    let roots = Arc::new(StaticWorkspaces::new().with("ws-3", &ws_root));
    let store = ConnectionStore::new(
        StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver)),
    );
    let sessions = Arc::new(ThreadSessions::new(
        store.clone(),
        SyncSource::new(&home, Arc::new(MemorySecrets::new())),
        roots.clone(),
    ));

    let profile_id = sessions.register_profile(
        LaunchSpec::new("agent-3", "/bin/echo"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
        },
    );
    let key = ConnectionKey::new(&profile_id, "local");
    // Ensure capabilities are None (not negotiated)
    store.set_capabilities_for_test(&key, None);

    let err = sessions.transports_for(&key).unwrap_err();
    assert!(
        matches!(err, ApiError::CapabilitiesNotNegotiated),
        "expected CapabilitiesNotNegotiated, got {err:?}"
    );

    let thread = sessions
        .create(CreateThread {
            workspace_id: "ws-3".into(),
            agent_profile_id: profile_id,
            workdir: ws_root.display().to_string(),
        })
        .await
        .expect("create thread");

    let thread_err = sessions.mcp_servers_for_thread(&thread.id).unwrap_err();
    assert!(
        matches!(thread_err, ApiError::CapabilitiesNotNegotiated),
        "expected CapabilitiesNotNegotiated, got {thread_err:?}"
    );
}

#[test]
fn v1_connection_always_keeps_stdio_servers_http_only_with_mcp_capabilities() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let roots = Arc::new(StaticWorkspaces::new());
    let store = ConnectionStore::new(
        StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver)),
    );
    let sessions = ThreadSessions::new(
        store.clone(),
        SyncSource::new(&home, Arc::new(MemorySecrets::new())),
        roots,
    );

    let profile_id = sessions.register_profile(
        LaunchSpec::new("agent-4", "/bin/echo"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
        },
    );
    let key = ConnectionKey::new(&profile_id, "local");

    // Case 1: V1 connection with mcp.http = false
    store.set_capabilities_for_test(
        &key,
        Some(NormalizedCapabilities {
            load_session: true,
            resume: true,
            mcp: McpTransports {
                stdio: false, // Even if raw is false, v1 floor mandates stdio = true
                http: false,
                sse: false,
            },
            prompt_embedded_context: false,
        }),
    );
    let transports = sessions.transports_for(&key).expect("transports");
    assert!(transports.stdio, "v1 floor mandates stdio = true");
    assert!(!transports.http, "http must remain false when not negotiated");

    // Case 2: V1 connection with mcp.http = true
    store.set_capabilities_for_test(
        &key,
        Some(NormalizedCapabilities {
            load_session: true,
            resume: true,
            mcp: McpTransports {
                stdio: true,
                http: true,
                sse: false,
            },
            prompt_embedded_context: false,
        }),
    );
    let transports_http = sessions.transports_for(&key).expect("transports with http");
    assert!(transports_http.stdio);
    assert!(transports_http.http);
}
