use parking_lot::Mutex;
#[cfg(windows)]
use process_wrap::tokio::JobObject;
#[cfg(unix)]
use process_wrap::tokio::ProcessGroup;
use process_wrap::tokio::{ChildWrapper, CommandWrap, KillOnDrop};
use std::io;
use std::process::{ExitStatus, Stdio};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::{ChildStdin, ChildStdout, Command};

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

/// A supervised child process with process group isolation (Unix) or job object
/// containment (Windows), cancellation ladder, stdio pipes, and bounded stderr capture.
pub struct SupervisedChild {
    child: Box<dyn ChildWrapper>,
    #[cfg(unix)]
    pgid: u32,
    stderr_buf: StderrRingBuffer,
}

impl SupervisedChild {
    /// Spawns a command inside a new process group (Unix) or job object (Windows),
    /// exposing stdin/stdout pipes and capturing stderr into a ring buffer.
    pub fn spawn(cmd: Command, stderr_cap: usize) -> io::Result<Self> {
        let mut cmd = cmd;
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut command = CommandWrap::from(cmd);
        command.wrap(KillOnDrop);
        #[cfg(unix)]
        command.wrap(ProcessGroup::leader());
        #[cfg(windows)]
        command.wrap(JobObject);

        let mut child = command.spawn()?;

        let stderr_buf = StderrRingBuffer::new(stderr_cap);

        if let Some(mut stderr) = child.stderr().take() {
            let buf = stderr_buf.clone();
            tokio::spawn(async move {
                let mut chunk = [0u8; 4096];
                loop {
                    match stderr.read(&mut chunk).await {
                        Ok(0) | Err(_) => break,
                        Ok(read) => buf.write_bytes(&chunk[..read]),
                    }
                }
            });
        }

        Ok(Self {
            #[cfg(unix)]
            pgid: child.id().unwrap_or(0),
            child,
            stderr_buf,
        })
    }

    pub fn id(&self) -> u32 {
        self.child.id().unwrap_or(0)
    }

    pub fn pgid(&self) -> u32 {
        #[cfg(unix)]
        {
            self.pgid
        }
        #[cfg(not(unix))]
        {
            self.id()
        }
    }

    pub fn stderr_buffer(&self) -> &StderrRingBuffer {
        &self.stderr_buf
    }

    pub fn take_stdin(&mut self) -> Option<ChildStdin> {
        self.child.stdin().take()
    }

    pub fn take_stdout(&mut self) -> Option<ChildStdout> {
        self.child.stdout().take()
    }

    /// Tries to wait for child completion without blocking.
    pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        self.child.try_wait()
    }

    /// Waits for the child to exit, reaping every process group member on Unix.
    pub async fn wait(&mut self) -> io::Result<ExitStatus> {
        self.child.wait().await
    }

    /// Executes the cancellation ladder per architecture §7.5:
    /// 1. Cooperative cancel / SIGINT
    /// 2. Grace period wait
    /// 3. Escalation to SIGTERM
    /// 4. Force termination with SIGKILL on the entire process group
    pub async fn cancel_ladder(&mut self, grace_period: Duration) -> io::Result<()> {
        if self.child.try_wait()?.is_some() {
            return Ok(());
        }

        #[cfg(unix)]
        {
            let _ = self.child.signal(libc::SIGINT);

            let deadline = tokio::time::Instant::now() + grace_period;
            while tokio::time::Instant::now() < deadline {
                if self.child.try_wait()?.is_some() {
                    return Ok(());
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }

            let _ = self.child.signal(libc::SIGTERM);
            tokio::time::sleep(Duration::from_millis(100)).await;

            let _ = self.child.signal(libc::SIGKILL);
            self.child.wait().await?;
        }

        #[cfg(not(unix))]
        {
            let _ = grace_period;
            let _ = self.child.start_kill();
            self.child.wait().await?;
        }

        Ok(())
    }

    /// Forcibly kills the entire process group (Unix) or job (Windows) immediately.
    pub async fn force_kill_group(&mut self) -> io::Result<()> {
        #[cfg(unix)]
        let _ = self.child.signal(libc::SIGKILL);
        #[cfg(not(unix))]
        let _ = self.child.start_kill();

        self.child.wait().await?;
        Ok(())
    }
}
