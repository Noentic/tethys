//! Login surfaces, chosen from the Provider's declared `authMethods` (spec §5.2).
//!
//! Every surface is input-only: it never reads, stores, proxies or reissues a
//! credential (G7). Closing by **any** route calls `onClose` exactly once, and
//! the caller turns that into one `recheck(profile_id)`.

import type {
  AgentLoginOutcome,
  AgentProfileView,
  LoginTerminalOutput,
} from "@tethys/bindings";
import { TerminalView } from "@tethys/terminal";
import { Button, Input, ModalDialog } from "@tethys/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoginCountdown } from "./login-countdown";

export type LoginCloseReason =
  | "success"
  | "cancel"
  | "escape"
  | "expiry"
  | "process-exit";

/** One typed environment binding; the value is input-only and transient. */
export interface EnvSecretRow {
  key: string;
  value: string;
}

export interface LoginSurfaceProps {
  profile: AgentProfileView;
  /** Fired exactly once for any close route. */
  onClose: (reason: LoginCloseReason) => void;
  /** Fired when the URL+code countdown reaches 0 (re-check trigger). */
  onExpiry?: () => void;
  /**
   * Receives the typed rows once, when saved. The surface keeps nothing: the
   * caller hands each value straight to the host (`agent.env_secret_set`),
   * which writes it to the keychain and stores only a reference (G7).
   */
  onSubmitEnv?: (rows: EnvSecretRow[]) => void | Promise<void>;
  onLogin?: (methodId: string) => Promise<AgentLoginOutcome>;
  onTerminalOutput?: (terminalId: string) => Promise<LoginTerminalOutput>;
  onTerminalWrite?: (terminalId: string, text: string) => Promise<void>;
  onTerminalCancel?: (terminalId: string) => Promise<void>;
  onTerminalExit?: () => Promise<void>;
  /** Runs the vendor command for CLI passthrough; the sheet closes on exit. */
  command?: string;
  /** RFC 3339 expiry for the URL+code method (defaults to ~300s). */
  codeDeadline?: string;
  className?: string;
}

const DEFAULT_CODE_SECONDS = 300;

export function LoginSurface({
  profile,
  onClose,
  onExpiry,
  onSubmitEnv,
  onLogin,
  onTerminalOutput,
  onTerminalWrite,
  onTerminalCancel,
  onTerminalExit,
  command,
  codeDeadline,
  className,
}: LoginSurfaceProps): React.ReactElement | null {
  const closed = useRef(false);
  const closeOnce = useCallback(
    (reason: LoginCloseReason) => {
      if (closed.current) return;
      closed.current = true;
      onClose(reason);
    },
    [onClose],
  );

  const [envRows, setEnvRows] = useState<Array<{ key: string; value: string }>>(
    [{ key: "", value: "" }],
  );
  const [code, setCode] = useState("");
  const [expired, setExpired] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState(
    profile.auth_methods[0]?.id ?? "",
  );
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginAttempt, setLoginAttempt] = useState(0);
  const terminalExited = useRef(false);
  const startedMethod = useRef<string | null>(null);
  // Fixed at mount: recomputing per render would push the deadline forward
  // every time the code field changes.
  const [defaultDeadline] = useState(() =>
    new Date(Date.now() + DEFAULT_CODE_SECONDS * 1000).toISOString(),
  );
  const deadline = codeDeadline ?? defaultDeadline;

  const method = profile.auth_methods.find(
    (candidate) => candidate.id === selectedMethodId,
  );
  const shape = method?.shape ?? null;
  const methodPicker = profile.auth_methods.length > 1 && (
    <label className="flex flex-col gap-xs text-label-sm text-(--tethys-text-secondary)">
      Sign-in method
      <select
        aria-label="Sign-in method"
        className="rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-nested) px-sm py-xs text-body-sm text-(--tethys-text-primary)"
        value={selectedMethodId}
        onChange={(event) => {
          startedMethod.current = null;
          terminalExited.current = false;
          setTerminalId(null);
          setTerminalOutput("");
          setLoginError(null);
          setSelectedMethodId(event.target.value);
        }}
      >
        {profile.auth_methods.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
    </label>
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: a retry bumps the attempt to re-run this login effect.
  useEffect(() => {
    if (
      !method ||
      !onLogin ||
      (shape?.shape !== "agent-auth" && shape?.shape !== "cli-passthrough") ||
      startedMethod.current === method.id
    ) {
      return;
    }
    startedMethod.current = method.id;
    let cancelled = false;
    setLoginError(null);
    void onLogin(method.id)
      .then((outcome) => {
        if (cancelled) {
          if (outcome.kind === "terminal") {
            void onTerminalCancel?.(outcome.terminal_id);
          }
          return;
        }
        if (outcome.kind === "complete") {
          closeOnce("success");
        } else {
          terminalExited.current = false;
          setTerminalId(outcome.terminal_id);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoginError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loginAttempt, method, shape, onLogin, onTerminalCancel, closeOnce]);

  useEffect(() => {
    if (!terminalId || !onTerminalOutput) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await onTerminalOutput(terminalId);
        if (cancelled) return;
        setTerminalOutput(result.output);
        if (result.exited) {
          terminalExited.current = true;
          setTerminalId(null);
          await onTerminalExit?.();
          if (result.exit_code === 0) closeOnce("success");
          else
            setLoginError(
              `Sign-in command exited with code ${result.exit_code ?? "unknown"}.`,
            );
          return;
        }
      } catch (error) {
        if (!cancelled) {
          setLoginError(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      timer = setTimeout(() => void poll(), 300);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (!terminalExited.current) void onTerminalCancel?.(terminalId);
    };
  }, [
    terminalId,
    onTerminalOutput,
    onTerminalCancel,
    onTerminalExit,
    closeOnce,
  ]);

  if (!shape) return null;

  if (shape.shape === "unknown") {
    return (
      <ModalDialog
        open
        onClose={() => closeOnce("escape")}
        title={`Sign in to ${profile.name}`}
      >
        {methodPicker}
        <div
          className={className}
          data-testid="login-surface-unknown"
          aria-disabled="true"
        >
          <span className="text-body-sm text-(--tethys-text-muted)">
            Unsupported sign-in method: {shape.id}
          </span>
        </div>
      </ModalDialog>
    );
  }

  const title = `Sign in to ${profile.name}`;

  if (shape.shape === "env-var") {
    const validKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
    const typed = envRows.filter((row) => row.key.trim() !== "");
    const canSave =
      typed.length > 0 &&
      typed.every((row) => validKey(row.key.trim()) && row.value !== "");
    const submit = async () => {
      const rows = envRows
        .map((row) => ({ key: row.key.trim(), value: row.value }))
        .filter((row) => row.key !== "" && row.value !== "");
      // Nothing typed stays in component state once it has been handed up.
      setEnvRows([{ key: "", value: "" }]);
      setLoginError(null);
      try {
        await onSubmitEnv?.(rows);
        closeOnce("success");
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : String(error));
      }
    };
    return (
      <ModalDialog
        open
        onClose={() => closeOnce("escape")}
        title={title}
        footer={
          <>
            <Button variant="ghost" onClick={() => closeOnce("cancel")}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!canSave}>
              Save
            </Button>
          </>
        }
      >
        <div className={className} data-testid="login-surface-env-var">
          {methodPicker}
          {envRows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
            <div key={index} className="flex items-center gap-2 py-1">
              <Input
                aria-label="Environment variable name"
                value={row.key}
                placeholder="API_KEY"
                onChange={(event) => {
                  const key = event.target.value;
                  setEnvRows((rows) =>
                    rows.map((entry, i) =>
                      i === index ? { ...entry, key } : entry,
                    ),
                  );
                }}
              />
              <Input
                aria-label="Environment variable value"
                type="password"
                autoComplete="off"
                value={row.value}
                placeholder="value"
                onChange={(event) => {
                  const value = event.target.value;
                  setEnvRows((rows) =>
                    rows.map((entry, i) =>
                      i === index ? { ...entry, value } : entry,
                    ),
                  );
                }}
              />
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setEnvRows((rows) => [...rows, { key: "", value: "" }])
            }
          >
            Add variable
          </Button>
          {loginError && (
            <p
              className="text-body-sm text-(--tethys-status-danger)"
              role="alert"
            >
              {loginError}
            </p>
          )}
        </div>
      </ModalDialog>
    );
  }

  if (shape.shape === "url-code") {
    return (
      <ModalDialog
        open
        onClose={() => closeOnce("escape")}
        title={title}
        footer={
          <>
            <Button variant="ghost" onClick={() => closeOnce("cancel")}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={expired || code.trim().length === 0}
              onClick={() => closeOnce("success")}
            >
              Sign in
            </Button>
          </>
        }
      >
        <div className={className} data-testid="login-surface-url-code">
          {methodPicker}
          <a
            className="focus-ring rounded-xs text-body-sm text-(--tethys-text-primary) underline underline-offset-2"
            href="https://agentclientprotocol.com"
            rel="noreferrer"
            target="_blank"
          >
            Sign in with {profile.name} →
          </a>
          <div className="mt-3 flex items-center gap-sm">
            <Input
              aria-label="Authorization code"
              disabled={expired}
              placeholder="Paste code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            {expired ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setExpired(false);
                  setCode("");
                }}
              >
                Request new code
              </Button>
            ) : (
              <LoginCountdown
                deadline={deadline}
                onExpire={() => {
                  setExpired(true);
                  onExpiry?.();
                }}
              />
            )}
          </div>
          {expired && (
            <p className="mt-1 text-label-md text-(--tethys-text-muted)">
              Code expired
            </p>
          )}
        </div>
      </ModalDialog>
    );
  }

  if (shape.shape === "cli-passthrough") {
    const vendorCommand = command ?? profile.launch_spec.program;
    return (
      <ModalDialog
        open
        onClose={() => closeOnce("escape")}
        title={`Sign in to ${profile.name}`}
        description={`Complete sign-in in ${vendorCommand}.`}
        footer={
          <Button variant="secondary" onClick={() => closeOnce("cancel")}>
            Cancel
          </Button>
        }
        maxWidth="max-w-[560px]"
      >
        <div className={className} data-testid="login-surface-cli-passthrough">
          {methodPicker}
          {terminalId ? (
            <TerminalView
              title={`${profile.name} sign-in`}
              output={terminalOutput}
              onData={(text) => {
                if (onTerminalWrite) {
                  void onTerminalWrite(terminalId, text).catch(
                    (error: unknown) => {
                      setLoginError(
                        error instanceof Error ? error.message : String(error),
                      );
                    },
                  );
                }
              }}
            />
          ) : (
            <p className="text-body-sm text-(--tethys-text-muted)">
              {onLogin
                ? "Starting sign-in terminal…"
                : "Terminal sign-in is unavailable."}
            </p>
          )}
          {loginError && (
            <div
              className="mt-sm flex items-center justify-between gap-sm"
              role="alert"
            >
              <span className="text-body-sm text-(--tethys-status-danger)">
                {loginError}
              </span>
              {onLogin && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    startedMethod.current = null;
                    setTerminalId(null);
                    setTerminalOutput("");
                    setLoginError(null);
                    setLoginAttempt((attempt) => attempt + 1);
                  }}
                >
                  Try again
                </Button>
              )}
            </div>
          )}
        </div>
      </ModalDialog>
    );
  }

  // agent-auth: the agent runs its own OAuth; Tethys holds nothing.
  return (
    <ModalDialog
      open
      onClose={() => closeOnce("escape")}
      title={title}
      footer={
        <Button variant="ghost" onClick={() => closeOnce("cancel")}>
          Cancel
        </Button>
      }
    >
      <div className={className} data-testid="login-surface-agent-auth">
        {methodPicker}
        <p className="text-body-sm text-(--tethys-text-muted)">
          Waiting for {profile.name} to finish sign-in…
        </p>
        {loginError && (
          <div className="mt-sm flex items-center justify-between gap-sm">
            <p
              className="text-body-sm text-(--tethys-status-danger)"
              role="alert"
            >
              {loginError}
            </p>
            {onLogin && method && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  startedMethod.current = null;
                  setLoginError(null);
                  setLoginAttempt((attempt) => attempt + 1);
                }}
              >
                Try again
              </Button>
            )}
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
