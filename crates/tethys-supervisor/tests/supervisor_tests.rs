use tethys_supervisor::StderrRingBuffer;

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
mod unix_tests {
    use std::time::{Duration, Instant};
    use tethys_supervisor::SupervisedChild;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::process::Command;

    async fn wait_for_group_exit(pgid: i32) -> bool {
        let deadline = Instant::now() + Duration::from_millis(500);
        loop {
            if unsafe { libc::kill(-pgid, 0) } == -1 {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    #[tokio::test]
    async fn force_kill_group_terminates_process_group() {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg("sleep 30");

        let mut child =
            SupervisedChild::spawn(cmd, 1024).expect("failed to spawn supervised child");
        let pgid = child.pgid() as i32;

        tokio::time::sleep(Duration::from_millis(10)).await;
        child.force_kill_group().await.expect("force kill failed");

        assert!(
            wait_for_group_exit(pgid).await,
            "process group should be terminated"
        );
    }

    #[tokio::test]
    async fn cancellation_ladder_escalates_after_grace() {
        let mut cmd = Command::new("sh");
        cmd.arg("-c")
            .arg("trap 'echo caught sigint; sleep 10' INT; sleep 30");

        let mut child = SupervisedChild::spawn(cmd, 1024).expect("spawn failed");
        let pgid = child.pgid() as i32;

        tokio::time::sleep(Duration::from_millis(10)).await;

        let start = Instant::now();
        child
            .cancel_ladder(Duration::from_millis(100))
            .await
            .expect("cancel ladder failed");

        assert!(start.elapsed() >= Duration::from_millis(100));
        assert!(
            wait_for_group_exit(pgid).await,
            "process group should be completely terminated"
        );
    }

    #[tokio::test]
    async fn stdio_pipes_round_trip() {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg("cat");

        let mut child = SupervisedChild::spawn(cmd, 1024).expect("spawn failed");
        let mut stdin = child.take_stdin().expect("stdin should be piped");
        let mut stdout = child.take_stdout().expect("stdout should be piped");

        stdin
            .write_all(b"hello supervisor\n")
            .await
            .expect("write failed");
        drop(stdin);

        let mut echoed = [0u8; 32];
        let read = tokio::time::timeout(Duration::from_millis(500), stdout.read(&mut echoed))
            .await
            .expect("read timed out")
            .expect("read failed");
        assert_eq!(&echoed[..read], b"hello supervisor\n");

        let status = child.wait().await.expect("wait failed");
        assert!(status.success());
    }
}
