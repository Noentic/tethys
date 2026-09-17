use std::process::Command;
use std::time::Duration;
use tethys_core::supervisor::{StderrRingBuffer, SupervisedChild};

#[test]
fn test_stderr_ring_buffer_bounds() {
    let capacity = 100;
    let ring = StderrRingBuffer::new(capacity);

    // Write 60 bytes
    ring.write_bytes(&[b'A'; 60]);
    assert_eq!(ring.len(), 60);

    // Write another 60 bytes (total 120, should keep only last 100 bytes)
    ring.write_bytes(&[b'B'; 60]);
    assert_eq!(ring.len(), 100);

    let content = ring.to_string_lossy();
    assert_eq!(content.len(), 100);
    assert!(content.starts_with("AAAAAAAAAAAAAAAAAAAA")); // 40 A's
    assert!(content.ends_with("BBBBBBBBBBBBBBBBBBBB")); // 60 B's
}

#[cfg(unix)]
#[test]
fn test_zero_orphans_after_100_forced_kills() {
    let iterations = 100;
    let mut total_orphans = 0;

    println!("Starting 100 forced kills stress test...");

    for i in 0..iterations {
        let mut cmd = Command::new("sh");
        // Spawn a tree of 3 grandchild sleep processes
        cmd.arg("-c").arg("sleep 10 & sleep 10 & sleep 10 & wait");

        let mut child = SupervisedChild::spawn(cmd, 2 * 1024 * 1024)
            .expect("failed to spawn supervised child");
        let pgid = child.pgid() as i32;

        // Brief yield to allow shell to fork its children
        std::thread::sleep(Duration::from_millis(5));

        // Forcibly terminate the entire process group
        child.force_kill_group().expect("force kill failed");

        // Small yield for OS process table update
        std::thread::sleep(Duration::from_millis(10));

        // Verify with kill(-pgid, 0)
        // If all processes in the group are dead, kill returns ESRCH (-1 with errno 3)
        let res = unsafe { libc::kill(-pgid, 0) };
        if res == 0 {
            total_orphans += 1;
            eprintln!("Iteration {i}: orphaned process group {pgid} detected!");
        }
    }

    println!("Completed 100 forced kills. Total orphaned process groups: {total_orphans}");
    assert_eq!(
        total_orphans, 0,
        "S0.3 Exit criteria failed: expected 0 orphans after 100 forced kills, but found {total_orphans}"
    );
}

#[cfg(unix)]
#[test]
fn test_cancellation_ladder_graceful_escalation() {
    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg("trap 'echo caught sigint; sleep 10' INT; sleep 30");

    let mut child = SupervisedChild::spawn(cmd, 1024).expect("spawn failed");
    let pgid = child.pgid() as i32;

    std::thread::sleep(Duration::from_millis(10));

    // Cancel ladder with 100ms grace period before escalation
    let start = std::time::Instant::now();
    child
        .cancel_ladder(Duration::from_millis(100))
        .expect("cancel ladder failed");

    assert!(start.elapsed() >= Duration::from_millis(100));

    std::thread::sleep(Duration::from_millis(10));
    let res = unsafe { libc::kill(-pgid, 0) };
    assert_eq!(res, -1, "process group should be completely terminated");
}
