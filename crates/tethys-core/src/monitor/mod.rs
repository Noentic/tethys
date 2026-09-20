//! Per-thread process-tree monitoring (M1.13).

pub mod sampler;

use std::collections::HashMap;

use parking_lot::Mutex;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tethys_schema::agents::ProcessSample;

pub use sampler::{sample_tree, sample_tree_with};

/// A machine-wide scan (to find new children) runs on the first sample of a
/// tree and then every this-many samples. Between scans only the known members
/// are refreshed, which is what keeps sampling under the 1% CPU budget on a
/// machine with thousands of processes. At the 2 s cadence (architecture §7.5)
/// a child that starts and exits between two scans is not observed.
const FULL_SCAN_EVERY: u32 = 5;

/// One tracked tree: its own `System` (so its CPU delta is measured against
/// its own previous refresh, whatever else is sampled) and its known members.
struct Tracked {
    system: System,
    members: Vec<Pid>,
    samples_since_scan: u32,
}

/// A long-lived sampler for the process trees of many connections.
///
/// `sysinfo` derives CPU% from the delta between two refreshes of the *same*
/// `System`, so a fresh `System` per call (as [`sample_tree`] uses) always
/// reads `0.0`. The first sample of a tree therefore reports no CPU; every
/// later poll reports the delta since the previous one. `sysinfo` needs at
/// least `MINIMUM_CPU_UPDATE_INTERVAL` (200 ms) between refreshes for that
/// delta to be meaningful, which the 2 s cadence is well above.
#[derive(Default)]
pub struct Monitor {
    trees: Mutex<HashMap<u32, Tracked>>,
}

impl Monitor {
    pub fn new() -> Self {
        Self::default()
    }

    /// Samples the tree rooted at `leader`; an exited tree yields an empty list
    /// and is forgotten. The lock is held only for the synchronous refresh,
    /// never across an `.await`.
    pub fn sample(&self, leader: u32) -> Vec<ProcessSample> {
        let leader_pid = Pid::from_u32(leader);
        let mut trees = self.trees.lock();
        let tracked = trees.entry(leader).or_insert_with(|| Tracked {
            system: System::new(),
            members: Vec::new(),
            samples_since_scan: 0,
        });

        if tracked.members.is_empty() || tracked.samples_since_scan + 1 >= FULL_SCAN_EVERY {
            tracked.members = discover(leader_pid);
            tracked.samples_since_scan = 0;
        } else {
            tracked.samples_since_scan += 1;
        }

        if !tracked.members.is_empty() {
            tracked
                .system
                .refresh_processes(ProcessesToUpdate::Some(&tracked.members), true);
            let system = &tracked.system;
            tracked.members.retain(|pid| system.process(*pid).is_some());
        }

        if !tracked.members.contains(&leader_pid) {
            trees.remove(&leader);
            return Vec::new();
        }
        sampler::build_samples(&tracked.system, leader_pid, &tracked.members)
    }
}

/// Machine-wide scan for `leader` and its descendants. Uses a throwaway
/// `System` and reads only what discovery needs (the parent link); CPU is
/// measured separately on the tracked members.
fn discover(leader: Pid) -> Vec<Pid> {
    let mut scratch = System::new();
    scratch.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing(),
    );
    sampler::discover_members(&scratch, leader)
}
