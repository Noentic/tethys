use std::time::Duration;
use tethys_core::acp::{ConnectionStatus, ConnectionStore};

#[test]
fn test_connection_store_leases_and_two_phase_reaping() {
    let grace_period = Duration::from_millis(50);
    let store = ConnectionStore::new(grace_period);

    // 1. Acquire leases for two threads on profile "claude-code"
    let lease1 = store.acquire_lease("claude-code");
    assert_eq!(store.get_status("claude-code"), Some(ConnectionStatus::Connected));
    assert_eq!(store.total_spawns(), 1);

    let lease2 = store.acquire_lease("claude-code");
    assert_eq!(store.get_status("claude-code"), Some(ConnectionStatus::Connected));
    assert_eq!(store.total_spawns(), 1); // Shared pooled connection

    // 2. Drop one lease - should remain connected
    drop(lease1);
    assert_eq!(store.get_status("claude-code"), Some(ConnectionStatus::Connected));

    // 3. Drop second lease - transitions to Draining
    drop(lease2);
    assert_eq!(store.get_status("claude-code"), Some(ConnectionStatus::Draining));

    // 4. Before grace period expires: reap does not terminate
    let reaped_early = store.reap_idle();
    assert_eq!(reaped_early, 0);
    assert_eq!(store.get_status("claude-code"), Some(ConnectionStatus::Draining));

    // 5. After grace period expires: reap terminates resident idle agent
    std::thread::sleep(Duration::from_millis(60));
    let reaped = store.reap_idle();
    assert_eq!(reaped, 1);
    assert_eq!(store.get_status("claude-code"), Some(ConnectionStatus::Terminated));

    // 6. Respawn on next use: new prompt recovers the connection
    let lease3 = store.acquire_lease("claude-code");
    assert_eq!(store.get_status("claude-code"), Some(ConnectionStatus::Connected));
    assert_eq!(store.total_spawns(), 2);
    assert_eq!(store.get_restart_count("claude-code"), 1);

    drop(lease3);
}

#[test]
fn test_connection_store_recovery_on_transport_close() {
    let store = ConnectionStore::new(Duration::from_secs(60));

    let _lease = store.acquire_lease("opencode");
    assert_eq!(store.get_status("opencode"), Some(ConnectionStatus::Connected));

    // Simulate unexpected process crash or transport close
    store.mark_disconnected("opencode");
    assert_eq!(store.get_status("opencode"), Some(ConnectionStatus::Disconnected));

    // Next interaction automatically respawns and recovers
    let lease_recovered = store.acquire_lease("opencode");
    assert_eq!(store.get_status("opencode"), Some(ConnectionStatus::Connected));
    assert_eq!(store.get_restart_count("opencode"), 1);

    drop(lease_recovered);
}
