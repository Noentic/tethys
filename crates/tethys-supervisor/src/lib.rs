use parking_lot::Mutex;
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Circular ring buffer for stderr capture (architecture §7.5: 2 MB limit).
#[derive(Debug, Clone)]
pub struct StderrRingBuffer {
    capacity: usize,
    buffer: Arc<Mutex<Vec<u8>>>,
}

impl StderrRingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            buffer: Arc::new(Mutex::new(Vec::with_capacity(capacity.min(65536)))),
        }
    }

    pub fn write_bytes(&self, bytes: &[u8]) {
        let mut buf = self.buffer.lock();
        if buf.len() + bytes.len() <= self.capacity {
            buf.extend_from_slice(bytes);
        } else {
            let overflow = (buf.len() + bytes.len()).saturating_sub(self.capacity);
            if overflow >= buf.len() {
                buf.clear();
                let start = bytes.len().saturating_sub(self.capacity);
                buf.extend_from_slice(&bytes[start..]);
            } else {
                buf.drain(..overflow);
                buf.extend_from_slice(bytes);
            }
        }
    }

    pub fn to_string_lossy(&self) -> String {
        let buf = self.buffer.lock();
        String::from_utf8_lossy(&buf).to_string()
    }

    pub fn len(&self) -> usize {
        self.buffer.lock().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// A supervised child process with process group isolation, cancellation ladder,
/// and bounded stderr capture.
pub struct SupervisedChild {
    child: Child,
    pgid: u32,
    stderr_buf: StderrRingBuffer,
}

impl SupervisedChild {
    /// Spawns a command inside a new process group.
    pub fn spawn(mut cmd: Command, stderr_cap: usize) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            // Create a new process group where pgid == child pid
            cmd.process_group(0);
        }

        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn()?;
        let pid = child.id();
        let pgid = pid;

        let stderr_buf = StderrRingBuffer::new(stderr_cap);

        if let Some(mut stderr) = child.stderr.take() {
            let buf_clone = stderr_buf.clone();
            std::thread::Builder::new()
                .name(format!("supervisor-stderr-{pid}"))
                .spawn(move || {
                    let mut chunk = [0u8; 4096];
                    while let Ok(n) = stderr.read(&mut chunk) {
                        if n == 0 {
                            break;
                        }
                        buf_clone.write_bytes(&chunk[..n]);
                    }
                })?;
        }

        Ok(Self {
            child,
            pgid,
            stderr_buf,
        })
    }

    pub fn id(&self) -> u32 {
        self.child.id()
    }

    pub fn pgid(&self) -> u32 {
        self.pgid
    }

    pub fn stderr_buffer(&self) -> &StderrRingBuffer {
        &self.stderr_buf
    }

    /// Tries to wait for child completion without blocking.
    pub fn try_wait(&mut self) -> std::io::Result<Option<std::process::ExitStatus>> {
        self.child.try_wait()
    }

    /// Executes the cancellation ladder per architecture §7.5:
    /// 1. Cooperative cancel / SIGINT
    /// 2. Grace period wait
    /// 3. Escalation to SIGTERM
    /// 4. Force termination with SIGKILL on entire process group
    pub fn cancel_ladder(&mut self, grace_period: Duration) -> std::io::Result<()> {
        if let Ok(Some(_)) = self.child.try_wait() {
            return Ok(());
        }

        #[cfg(unix)]
        {
            let pgid_i32 = -(self.pgid as i32);
            // Step 1: SIGINT to process group
            unsafe {
                libc::kill(pgid_i32, libc::SIGINT);
            }

            let start = Instant::now();
            while start.elapsed() < grace_period {
                if let Ok(Some(_)) = self.child.try_wait() {
                    return Ok(());
                }
                std::thread::sleep(Duration::from_millis(50));
            }

            // Step 2: SIGTERM
            unsafe {
                libc::kill(pgid_i32, libc::SIGTERM);
            }
            std::thread::sleep(Duration::from_millis(100));

            // Step 3: SIGKILL to entire process group
            if self.child.try_wait()?.is_none() {
                unsafe {
                    libc::kill(pgid_i32, libc::SIGKILL);
                }
                let _ = self.child.wait();
            }
        }

        #[cfg(not(unix))]
        {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }

        Ok(())
    }

    /// Forcibly kills the entire process group immediately.
    pub fn force_kill_group(&mut self) -> std::io::Result<()> {
        #[cfg(unix)]
        {
            let pgid_i32 = -(self.pgid as i32);
            unsafe {
                libc::kill(pgid_i32, libc::SIGKILL);
            }
            let _ = self.child.wait();
        }

        #[cfg(not(unix))]
        {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }

        Ok(())
    }
}
