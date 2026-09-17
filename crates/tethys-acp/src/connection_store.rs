use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionStatus {
    Connecting,
    Connected,
    Draining,
    Disconnected,
    Terminated,
}

pub struct ManagedConnection {
    pub profile_id: String,
    pub status: ConnectionStatus,
    pub active_leases: u32,
    pub last_active: Instant,
    pub restart_count: u32,
}

/// Lease token returned to callers. Dropping or releasing the lease decrements the counter.
pub struct LeaseToken {
    profile_id: String,
    store: Arc<ConnectionStore>,
}

impl LeaseToken {
    pub fn profile_id(&self) -> &str {
        &self.profile_id
    }
}

impl Drop for LeaseToken {
    fn drop(&mut self) {
        self.store.release_lease(&self.profile_id);
    }
}

pub struct ConnectionStore {
    connections: RwLock<HashMap<String, ManagedConnection>>,
    idle_grace_period: Duration,
    total_spawns: AtomicU32,
}

impl ConnectionStore {
    pub fn new(idle_grace_period: Duration) -> Arc<Self> {
        Arc::new(Self {
            connections: RwLock::new(HashMap::new()),
            idle_grace_period,
            total_spawns: AtomicU32::new(0),
        })
    }

    /// Acquires a lease on a profile connection. Spawns or reconnects if necessary.
    pub fn acquire_lease(self: &Arc<Self>, profile_id: &str) -> LeaseToken {
        let mut conns = self.connections.write();
        let conn = conns.entry(profile_id.to_string()).or_insert_with(|| {
            self.total_spawns.fetch_add(1, Ordering::Relaxed);
            ManagedConnection {
                profile_id: profile_id.to_string(),
                status: ConnectionStatus::Connected,
                active_leases: 0,
                last_active: Instant::now(),
                restart_count: 0,
            }
        });

        // If dead/disconnected, recover and respawn
        if conn.status == ConnectionStatus::Disconnected || conn.status == ConnectionStatus::Terminated {
            conn.status = ConnectionStatus::Connected;
            conn.restart_count += 1;
            self.total_spawns.fetch_add(1, Ordering::Relaxed);
        }

        conn.active_leases += 1;
        conn.status = ConnectionStatus::Connected;
        conn.last_active = Instant::now();

        LeaseToken {
            profile_id: profile_id.to_string(),
            store: self.clone(),
        }
    }

    /// Releases a lease. Transitions to Draining if active_leases == 0.
    pub(crate) fn release_lease(&self, profile_id: &str) {
        let mut conns = self.connections.write();
        if let Some(conn) = conns.get_mut(profile_id) {
            conn.active_leases = conn.active_leases.saturating_sub(1);
            conn.last_active = Instant::now();
            if conn.active_leases == 0 {
                conn.status = ConnectionStatus::Draining;
            }
        }
    }

    /// Simulates a transport disconnect (e.g. process crash or socket drop).
    pub fn mark_disconnected(&self, profile_id: &str) {
        let mut conns = self.connections.write();
        if let Some(conn) = conns.get_mut(profile_id) {
            conn.status = ConnectionStatus::Disconnected;
        }
    }

    /// Reaps idle connections whose grace period has expired.
    pub fn reap_idle(&self) -> usize {
        let mut conns = self.connections.write();
        let now = Instant::now();
        let mut reaped = 0;

        for conn in conns.values_mut() {
            if conn.status == ConnectionStatus::Draining
                && conn.active_leases == 0
                && now.duration_since(conn.last_active) >= self.idle_grace_period
            {
                conn.status = ConnectionStatus::Terminated;
                reaped += 1;
            }
        }

        reaped
    }

    pub fn get_status(&self, profile_id: &str) -> Option<ConnectionStatus> {
        self.connections.read().get(profile_id).map(|c| c.status)
    }

    pub fn get_restart_count(&self, profile_id: &str) -> u32 {
        self.connections
            .read()
            .get(profile_id)
            .map(|c| c.restart_count)
            .unwrap_or(0)
    }

    pub fn total_spawns(&self) -> u32 {
        self.total_spawns.load(Ordering::Relaxed)
    }
}
