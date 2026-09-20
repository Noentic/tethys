//! Process-tree sampler tests (M1.13 U5). Deterministic and sub-second: a
//! handful of short-lived helpers, never thousands (AGENTS.md).

#![cfg(unix)]

use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use tethys_core::monitor::{sample_tree, sample_tree_with, Monitor};
use sysinfo::System;

#[test]
fn enumerates_a_known_tree_under_one_leader() {
    let mut child = Command::new("sh")
        .arg("-c")
        .arg("sleep 30 & sleep 30 & wait")
        .stdout(Stdio::null())
        .spawn()
        .expect("spawn shell");
    let leader = child.id();

    let deadline = Instant::now() + Duration::from_secs(5);
    let samples = loop {
        let samples = sample_tree(leader);
        if samples.iter().filter(|sample| !sample.leader).count() >= 2 {
            break samples;
        }
        assert!(
            Instant::now() < deadline,
            "children never appeared: {samples:?}"
        );
        std::thread::sleep(Duration::from_millis(20));
    };

    assert!(
        samples.iter().any(|sample| sample.leader && sample.pid == leader),
        "leader included: {samples:?}"
    );
    assert!(samples.len() >= 3, "leader plus two children: {samples:?}");
    assert!(
        samples[0].leader,
        "leader row sorts first for the activity table"
    );
    assert!(samples[0].rss > 0.0, "leader sums tree RSS");

    let _ = child.kill();
    let _ = child.wait();
}

#[test]
fn a_dead_pid_yields_no_sample() {
    assert!(sample_tree(u32::MAX).is_empty());
}

#[test]
fn reuse_a_system_for_repeated_samples() {
    let mut system = System::new();
    let mut child = Command::new("sh")
        .arg("-c")
        .arg("sleep 30")
        .stdout(Stdio::null())
        .spawn()
        .expect("spawn shell");
    let leader = child.id();
    let first = sample_tree_with(&mut system, leader);
    let second = sample_tree_with(&mut system, leader);
    assert!(first.iter().any(|sample| sample.pid == leader));
    assert!(second.iter().any(|sample| sample.pid == leader));
    let _ = child.kill();
    let _ = child.wait();
}

#[test]
fn a_shared_monitor_reports_cpu_for_a_busy_child() {
    // A fresh `System` per sample always reads 0.0: CPU is a delta between two
    // refreshes, so only a long-lived `Monitor` can report it.
    let monitor = Monitor::new();
    let mut child = Command::new("sh")
        .arg("-c")
        .arg("while :; do :; done")
        .stdout(Stdio::null())
        .spawn()
        .expect("spawn busy shell");
    let leader = child.id();

    let deadline = Instant::now() + Duration::from_secs(5);
    let mut observed = 0.0_f32;
    while Instant::now() < deadline {
        observed = monitor
            .sample(leader)
            .iter()
            .find(|sample| sample.leader)
            .map_or(0.0, |sample| sample.cpu);
        if observed > 0.0 {
            break;
        }
        std::thread::sleep(Duration::from_millis(250));
    }

    let _ = child.kill();
    let _ = child.wait();
    assert!(observed > 0.0, "busy child never reported CPU: {observed}");
}

#[test]
fn a_shared_monitor_finds_children_including_ones_started_later() {
    use std::io::Write;

    let monitor = Monitor::new();
    // The shell starts one child, then blocks on stdin until the test releases
    // it, so the second child provably starts after the first was sampled.
    let mut child = Command::new("sh")
        .arg("-c")
        .arg("sleep 30 & read _; sleep 30 & wait")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .expect("spawn shell");
    let leader = child.id();
    let children = |monitor: &Monitor| monitor.sample(leader).iter().filter(|s| !s.leader).count();

    let deadline = Instant::now() + Duration::from_secs(10);
    while children(&monitor) < 1 && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(children(&monitor), 1, "first child sampled before release");

    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(b"go\n")
        .expect("release the shell");

    let mut found = 0;
    while found < 2 && Instant::now() < deadline {
        found = children(&monitor);
        std::thread::sleep(Duration::from_millis(100));
    }

    let _ = child.kill();
    let _ = child.wait();
    assert!(found >= 2, "a scan never discovered the later child: {found}");
}

#[test]
fn a_shared_monitor_forgets_an_exited_tree() {
    let monitor = Monitor::new();
    let mut child = Command::new("sh")
        .arg("-c")
        .arg("sleep 30")
        .stdout(Stdio::null())
        .spawn()
        .expect("spawn shell");
    let leader = child.id();
    assert!(!monitor.sample(leader).is_empty(), "live tree is sampled");

    let _ = child.kill();
    let _ = child.wait();

    let deadline = Instant::now() + Duration::from_secs(5);
    while !monitor.sample(leader).is_empty() {
        assert!(Instant::now() < deadline, "exited tree still sampled");
        std::thread::sleep(Duration::from_millis(50));
    }
}
