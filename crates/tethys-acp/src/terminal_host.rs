use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use agent_client_protocol::schema::v1 as acp1;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, PtySize};
use tokio::sync::watch;

const DEFAULT_OUTPUT_LIMIT: usize = 1024 * 1024;
const MAX_OUTPUT_LIMIT: usize = 10 * 1024 * 1024;

static NEXT_TERMINAL_ID: AtomicU64 = AtomicU64::new(1);

struct Terminal {
    session_id: String,
    output: Mutex<Vec<u8>>,
    output_limit: usize,
    truncated: Mutex<bool>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    exit: watch::Receiver<Option<acp1::TerminalExitStatus>>,
}

pub(crate) struct TerminalSnapshot {
    pub output: String,
    pub truncated: bool,
    pub exit_code: Option<u32>,
    pub exited: bool,
}

impl Drop for Terminal {
    fn drop(&mut self) {
        let _ = self.killer.get_mut().kill();
    }
}

#[derive(Default)]
pub(crate) struct TerminalHost {
    terminals: Mutex<HashMap<String, Arc<Terminal>>>,
}

impl TerminalHost {
    pub(crate) async fn create(
        &self,
        session_id: String,
        command: String,
        args: Vec<String>,
        env: Vec<acp1::EnvVariable>,
        cwd: std::path::PathBuf,
        output_byte_limit: Option<u64>,
        on_output: Arc<dyn Fn(String, String) + Send + Sync>,
    ) -> Result<String, String> {
        let id = format!(
            "tethys-terminal-{}",
            NEXT_TERMINAL_ID.fetch_add(1, Ordering::Relaxed)
        );
        let output_limit = output_byte_limit
            .map(|limit| limit.min(MAX_OUTPUT_LIMIT as u64) as usize)
            .unwrap_or(DEFAULT_OUTPUT_LIMIT)
            .max(1);
        let (reader, writer, mut child) = tokio::task::spawn_blocking(move || {
            let system = native_pty_system();
            let pair = system
                .openpty(PtySize {
                    rows: 24,
                    cols: 80,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|error| error.to_string())?;
            let mut builder = CommandBuilder::new(command);
            builder.args(args);
            builder.cwd(cwd);
            for variable in env {
                if variable.name.is_empty()
                    || variable.name.contains(['=', '\0'])
                    || variable.value.contains('\0')
                {
                    return Err("invalid terminal environment variable".to_string());
                }
                builder.env(variable.name, variable.value);
            }
            let child = pair
                .slave
                .spawn_command(builder)
                .map_err(|error| error.to_string())?;
            let reader = pair
                .master
                .try_clone_reader()
                .map_err(|error| error.to_string())?;
            let writer = pair
                .master
                .take_writer()
                .map_err(|error| error.to_string())?;
            Ok::<_, String>((reader, writer, child))
        })
        .await
        .map_err(|error| error.to_string())??;
        let killer = child.clone_killer();
        let (exit_tx, exit) = watch::channel(None);
        let terminal = Arc::new(Terminal {
            session_id,
            output: Mutex::new(Vec::new()),
            output_limit,
            truncated: Mutex::new(false),
            writer: Mutex::new(writer),
            killer: Mutex::new(killer),
            exit,
        });
        self.terminals.lock().insert(id.clone(), terminal.clone());

        let output_terminal = terminal.clone();
        let output_id = id.clone();
        tokio::task::spawn_blocking(move || {
            let mut reader = reader;
            let mut chunk = [0_u8; 4096];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(read) => {
                        let text = String::from_utf8_lossy(&chunk[..read]).into_owned();
                        let mut output = output_terminal.output.lock();
                        output.extend_from_slice(&chunk[..read]);
                        if output.len() > output_terminal.output_limit {
                            let overflow = output.len() - output_terminal.output_limit;
                            output.drain(..overflow);
                            *output_terminal.truncated.lock() = true;
                        }
                        drop(output);
                        on_output(output_id.clone(), text);
                    }
                }
            }
        });

        let wait_terminal = terminal;
        tokio::task::spawn_blocking(move || {
            let status = child.wait().ok().map(|status| {
                let signal = status.signal().map(str::to_string);
                acp1::TerminalExitStatus::new()
                    .exit_code(signal.is_none().then_some(status.exit_code()))
                    .signal(signal)
            });
            exit_tx.send_replace(status);
            drop(wait_terminal);
        });

        Ok(id)
    }

    pub(crate) fn output(
        &self,
        session_id: &str,
        terminal_id: &str,
    ) -> Result<acp1::TerminalOutputResponse, String> {
        let terminal = self.get(session_id, terminal_id)?;
        let snapshot = Self::snapshot(&terminal);
        let status = terminal.exit.borrow().clone();
        Ok(
            acp1::TerminalOutputResponse::new(snapshot.output, snapshot.truncated)
                .exit_status(status),
        )
    }

    pub(crate) fn auth_output(
        &self,
        owner_id: &str,
        terminal_id: &str,
    ) -> Result<TerminalSnapshot, String> {
        let terminal = self.get(owner_id, terminal_id)?;
        Ok(Self::snapshot(&terminal))
    }

    pub(crate) async fn wait_for_exit(
        &self,
        session_id: &str,
        terminal_id: &str,
    ) -> Result<acp1::WaitForTerminalExitResponse, String> {
        let terminal = self.get(session_id, terminal_id)?;
        let mut exit = terminal.exit.clone();
        while exit.borrow().is_none() {
            exit.changed().await.map_err(|error| error.to_string())?;
        }
        let status = exit.borrow().clone().unwrap_or_default();
        Ok(acp1::WaitForTerminalExitResponse::new(status))
    }

    pub(crate) fn kill(&self, session_id: &str, terminal_id: &str) -> Result<(), String> {
        let terminal = self.get(session_id, terminal_id)?;
        let result = terminal
            .killer
            .lock()
            .kill()
            .map_err(|error| error.to_string());
        result
    }

    pub(crate) fn write(
        &self,
        session_id: &str,
        terminal_id: &str,
        text: &str,
    ) -> Result<(), String> {
        let terminal = self.get(session_id, terminal_id)?;
        let result = terminal
            .writer
            .lock()
            .write_all(text.as_bytes())
            .map_err(|error| error.to_string());
        result
    }

    pub(crate) fn write_auth(
        &self,
        owner_id: &str,
        terminal_id: &str,
        text: &str,
    ) -> Result<(), String> {
        self.write(owner_id, terminal_id, text)
    }

    pub(crate) fn cancel_auth(&self, owner_id: &str, terminal_id: &str) -> Result<(), String> {
        let terminal = self.get(owner_id, terminal_id)?;
        let kill_result = if terminal.exit.borrow().is_none() {
            self.kill(owner_id, terminal_id)
        } else {
            Ok(())
        };
        let release_result = self.release(owner_id, terminal_id);
        kill_result.and(release_result)
    }

    pub(crate) fn release(&self, session_id: &str, terminal_id: &str) -> Result<(), String> {
        self.get(session_id, terminal_id)?;
        self.terminals.lock().remove(terminal_id);
        Ok(())
    }

    pub(crate) fn close_session(&self, session_id: &str) {
        self.terminals
            .lock()
            .retain(|_, terminal| terminal.session_id != session_id);
    }

    fn get(&self, session_id: &str, terminal_id: &str) -> Result<Arc<Terminal>, String> {
        let terminal = self
            .terminals
            .lock()
            .get(terminal_id)
            .cloned()
            .ok_or_else(|| format!("unknown terminal {terminal_id}"))?;
        if terminal.session_id != session_id {
            return Err("terminal does not belong to this session".to_string());
        }
        Ok(terminal)
    }

    fn snapshot(terminal: &Terminal) -> TerminalSnapshot {
        let output = String::from_utf8_lossy(&terminal.output.lock()).into_owned();
        let truncated = *terminal.truncated.lock();
        let status = terminal.exit.borrow().clone();
        TerminalSnapshot {
            output,
            truncated,
            exit_code: status.as_ref().and_then(|status| status.exit_code),
            exited: status.is_some(),
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::TerminalHost;
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn terminal_lifecycle_captures_input_output_and_exit() {
        let host = TerminalHost::default();
        let owner = "auth:test-profile".to_string();
        let terminal_id = host
            .create(
                owner.clone(),
                "sh".to_string(),
                vec![
                    "-c".to_string(),
                    r#"read input; printf 'received:%s\n' "$input""#.to_string(),
                ],
                Vec::new(),
                std::env::current_dir().unwrap_or_default(),
                None,
                Arc::new(|_, _| {}),
            )
            .await
            .expect("terminal should start");
        host.write_auth(&owner, &terminal_id, "code\n")
            .expect("terminal input should be accepted");
        let exit = tokio::time::timeout(
            Duration::from_secs(2),
            host.wait_for_exit(&owner, &terminal_id),
        )
        .await
        .expect("terminal should exit")
        .expect("exit status should be available");
        assert_eq!(exit.exit_status.exit_code, Some(0));

        let output = host
            .output(&owner, &terminal_id)
            .expect("terminal output should remain available");
        assert!(output.output.contains("received:code"));
        host.release(&owner, &terminal_id)
            .expect("terminal should release");
        assert!(host.output(&owner, &terminal_id).is_err());
    }
}
