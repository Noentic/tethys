//! Whole-process-tree sampling (M1.13, MON-01).
//!
//! The supervisor isolates every agent in its own process group / Job Object,
//! so `ConnectionEntry.pid` is the tree leader. The sampler enumerates the
//! leader plus its descendants and reports one [`ProcessSample`] each; the
//! leader's row carries the tree-summed CPU/RSS.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use sysinfo::{Pid, ProcessesToUpdate, System};
use tethys_schema::agents::ProcessSample;

/// Samples the tree rooted at `leader`. An exited tree yields an empty list.
pub fn sample_tree(leader: u32) -> Vec<ProcessSample> {
    let mut system = System::new();
    sample_tree_with(&mut system, leader)
}

/// Samples using a caller-owned `System`. Refreshes every process on the
/// machine; the long-lived path that avoids that is [`super::Monitor`].
pub fn sample_tree_with(system: &mut System, leader: u32) -> Vec<ProcessSample> {
    system.refresh_processes(ProcessesToUpdate::All, true);
    let leader_pid = Pid::from_u32(leader);
    let members = discover_members(system, leader_pid);
    build_samples(system, leader_pid, &members)
}

/// The leader plus every descendant currently in `system`, sorted by pid.
/// `system` must already hold a machine-wide refresh.
pub(crate) fn discover_members(system: &System, leader: Pid) -> Vec<Pid> {
    let processes = system.processes();
    let mut parents: HashMap<Pid, Pid> = HashMap::new();
    for (pid, process) in processes.iter() {
        if let Some(parent) = process.parent() {
            parents.insert(*pid, parent);
        }
    }

    let mut members: Vec<Pid> = processes
        .keys()
        .copied()
        .filter(|pid| is_descendant(*pid, leader, &parents))
        .collect();
    members.sort();
    members
}

/// One [`ProcessSample`] per member still present in `system`; the leader's
/// row carries the tree-summed CPU/RSS. Empty when `members` is empty.
pub(crate) fn build_samples(
    system: &System,
    leader_pid: Pid,
    members: &[Pid],
) -> Vec<ProcessSample> {
    let processes = system.processes();
    if members.is_empty() {
        return Vec::new();
    }

    let total_cpu: f32 = members
        .iter()
        .filter_map(|pid| processes.get(pid))
        .map(|process| process.cpu_usage())
        .sum();
    let total_rss: u64 = members
        .iter()
        .filter_map(|pid| processes.get(pid))
        .map(|process| process.memory())
        .sum();
    let now = now_secs();

    let mut samples: Vec<ProcessSample> = members
        .iter()
        .filter_map(|pid| processes.get(pid).map(|process| (pid, process)))
        .map(|(pid, process)| {
            let is_leader = *pid == leader_pid;
            ProcessSample {
                pid: pid.as_u32(),
                cpu: if is_leader { total_cpu } else { process.cpu_usage() },
                rss: if is_leader {
                    total_rss as f64
                } else {
                    process.memory() as f64
                },
                uptime_secs: now.saturating_sub(process.start_time()).min(u32::MAX as u64) as u32,
                state: format!("{:?}", process.status()).to_lowercase(),
                leader: is_leader,
            }
        })
        .collect();

    // Leader first, then by pid for a stable table.
    samples.sort_by_key(|sample| (!sample.leader, sample.pid));
    samples
}

fn is_descendant(pid: Pid, leader: Pid, parents: &HashMap<Pid, Pid>) -> bool {
    let mut current = pid;
    let mut guard = 0;
    loop {
        if current == leader {
            return true;
        }
        match parents.get(&current) {
            Some(parent) if *parent != current => current = *parent,
            _ => return false,
        }
        guard += 1;
        if guard > 4096 {
            return false;
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}
