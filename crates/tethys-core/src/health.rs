//! Health re-check: one mechanism with seven call sites (spec §5.2).
//!
//! `recheck` resolves the profile's executable, spawns/handshakes it through
//! the connection store, and records the negotiated capabilities, declared
//! `authMethods` and a status. The interval scheduler and the six manual
//! triggers all funnel here, so there is a single behavioural implementation.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use parking_lot::{Mutex, RwLock};
use tethys_agent_servers::ConnectionStore;
use tethys_schema::agents::{AuthMethodView, ProviderHealth, RecheckStatus};
use tethys_schema::connection::{AcpProtocol, ConnectionKey, NormalizedCapabilities};
use tethys_thread::AgentConnection;
use tokio::task::JoinHandle;

/// Last health result for one profile.
#[derive(Debug, Clone, PartialEq)]
pub struct HealthRecord {
    pub health: ProviderHealth,
    pub detail: Option<String>,
    pub protocol: Option<AcpProtocol>,
    pub capabilities: Option<NormalizedCapabilities>,
    pub auth_methods: Vec<AuthMethodView>,
    pub detected_version: Option<String>,
    pub latency_ms: Option<u32>,
    pub last_checked_ms: Option<f64>,
    pub recheck: RecheckStatus,
}

impl Default for HealthRecord {
    fn default() -> Self {
        Self {
            health: ProviderHealth::Unknown,
            detail: None,
            protocol: None,
            capabilities: None,
            auth_methods: Vec::new(),
            detected_version: None,
            latency_ms: None,
            last_checked_ms: None,
            recheck: RecheckStatus::Idle,
        }
    }
}

/// Interval armed at start-up, in seconds. The Providers screen shows the same
/// default until the user changes it (`0` reads `Manual only`).
pub const DEFAULT_INTERVAL_SECS: u64 = 300;

/// Records health for every registered profile and owns the interval timer.
pub struct HealthRegistry {
    store: Arc<ConnectionStore>,
    records: RwLock<HashMap<String, HealthRecord>>,
    authenticated: RwLock<HashSet<String>>,
    enabled: RwLock<Vec<ConnectionKey>>,
    interval_secs: Mutex<u64>,
    scheduler: Mutex<Option<JoinHandle<()>>>,
}

impl HealthRegistry {
    pub fn new(store: Arc<ConnectionStore>) -> Arc<Self> {
        Arc::new(Self {
            store,
            records: RwLock::new(HashMap::new()),
            authenticated: RwLock::new(HashSet::new()),
            enabled: RwLock::new(Vec::new()),
            interval_secs: Mutex::new(0),
            scheduler: Mutex::new(None),
        })
    }

    /// Replaces the enabled-profile snapshot the interval tick walks.
    pub fn set_enabled(&self, keys: Vec<ConnectionKey>) {
        *self.enabled.write() = keys;
    }

    /// The last health result for a profile (`Unknown` before the first check).
    pub fn record(&self, profile_id: &str) -> HealthRecord {
        self.records
            .read()
            .get(profile_id)
            .cloned()
            .unwrap_or_default()
    }

    /// Marks a profile as authenticated after a successful login; the next
    /// re-check then reports `healthy` rather than `auth_required`.
    pub fn mark_authenticated(&self, profile_id: &str) {
        self.authenticated.write().insert(profile_id.to_string());
    }

    /// The configured interval in seconds (`0` = manual only).
    pub fn interval_secs(&self) -> u64 {
        *self.interval_secs.lock()
    }

    /// Whether a scheduled tick is currently armed (`0` disarms it).
    pub fn is_scheduled(&self) -> bool {
        self.scheduler.lock().is_some()
    }

    /// One re-check: executable resolution, handshake, negotiate, record.
    pub async fn recheck(&self, key: &ConnectionKey) {
        let profile_id = key.profile_id.clone();
        {
            let mut records = self.records.write();
            let record = records.entry(profile_id.clone()).or_default();
            record.recheck = RecheckStatus::Checking;
        }

        let Some(spec) = self.store.spec(key) else {
            self.finish(
                &profile_id,
                HealthRecord {
                    health: ProviderHealth::NotFound,
                    detail: Some("profile is not registered".to_string()),
                    last_checked_ms: now_ms(),
                    ..Default::default()
                },
            );
            return;
        };

        if which::which(&spec.program).is_err() {
            let detail = if spec.program == "npx" {
                "needs Node.js — npx is not on PATH".to_string()
            } else {
                format!(
                    "not found — {} is not installed or not on PATH",
                    spec.program
                )
            };
            self.finish(
                &profile_id,
                HealthRecord {
                    health: ProviderHealth::NotFound,
                    detail: Some(detail),
                    last_checked_ms: now_ms(),
                    ..Default::default()
                },
            );
            return;
        }

        let started = Instant::now();
        match self.store.acquire(key).await {
            Ok(lease) => {
                let connection = lease.connection();
                let auth_methods = connection.auth_methods().to_vec();
                let capabilities = connection.capabilities().clone();
                let protocol = Some(connection.protocol());
                let info = connection.info().clone();
                let latency_ms = started.elapsed().as_millis().min(u32::MAX as u128) as u32;
                drop(lease);

                let authenticated = self.authenticated.read().contains(&profile_id);
                let (health, detail) = if !auth_methods.is_empty() && !authenticated {
                    (
                        ProviderHealth::AuthRequired,
                        Some("authentication required".to_string()),
                    )
                } else {
                    (ProviderHealth::Healthy, None)
                };

                self.finish(
                    &profile_id,
                    HealthRecord {
                        health,
                        detail,
                        protocol,
                        capabilities: Some(capabilities),
                        auth_methods,
                        detected_version: (!info.version.is_empty()).then_some(info.version),
                        latency_ms: Some(latency_ms),
                        last_checked_ms: now_ms(),
                        recheck: RecheckStatus::Idle,
                    },
                );
            }
            Err(error) => {
                self.finish(
                    &profile_id,
                    HealthRecord {
                        health: ProviderHealth::Error,
                        detail: Some(error.to_string()),
                        last_checked_ms: now_ms(),
                        ..Default::default()
                    },
                );
            }
        }
    }

    /// Re-checks every enabled profile (`↻ Manual Health Check`).
    pub async fn recheck_all(&self) {
        let keys = self.enabled.read().clone();
        for key in keys {
            self.recheck(&key).await;
        }
    }

    /// Arms or disarms the interval timer. `0` means manual only.
    pub fn set_interval(self: &Arc<Self>, seconds: u64) {
        let seconds = seconds.min(3600);
        *self.interval_secs.lock() = seconds;
        if let Some(task) = self.scheduler.lock().take() {
            task.abort();
        }
        if seconds == 0 {
            return;
        }
        let registry = Arc::clone(self);
        let task = tokio::spawn(async move {
            let cadence = Duration::from_secs(seconds);
            loop {
                tokio::time::sleep(cadence).await;
                registry.recheck_all().await;
            }
        });
        *self.scheduler.lock() = Some(task);
    }

    fn finish(&self, profile_id: &str, record: HealthRecord) {
        self.records.write().insert(profile_id.to_string(), record);
    }
}

fn now_ms() -> Option<f64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|elapsed| elapsed.as_millis() as f64)
}
