//! Login surfaces, chosen from the Provider's declared `authMethods` (spec §5.2).
//!
//! Every surface is input-only: it never reads, stores, proxies or reissues a
//! credential (G7). Closing by **any** route calls `onClose` exactly once, and
//! the caller turns that into one `recheck(profile_id)`.

import type { AgentProfileView, AuthMethodShape } from "@tethys/bindings";
import { Button, Input, ModalDialog } from "@tethys/ui";
import { useCallback, useRef, useState } from "react";
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
  onSubmitEnv?: (rows: EnvSecretRow[]) => void;
  /** Runs the vendor command for CLI passthrough; the sheet closes on exit. */
  command?: string;
  /** RFC 3339 expiry for the URL+code method (defaults to ~300s). */
  codeDeadline?: string;
  className?: string;
}

const DEFAULT_CODE_SECONDS = 300;

/** The shape the surface renders; agent-auth wins, then CLI, then code. */
export function selectedShape(
  profile: AgentProfileView,
): AuthMethodShape | null {
  const shapes = profile.auth_methods.map((method) => method.shape);
  return (
    shapes.find((shape) => shape.shape === "agent-auth") ??
    shapes.find((shape) => shape.shape === "cli-passthrough") ??
    shapes.find((shape) => shape.shape === "url-code") ??
    shapes.find((shape) => shape.shape === "env-var") ??
    shapes[0] ??
    null
  );
}

export function LoginSurface({
  profile,
  onClose,
  onExpiry,
  onSubmitEnv,
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
  // Fixed at mount: recomputing per render would push the deadline forward
  // every time the code field changes.
  const [defaultDeadline] = useState(() =>
    new Date(Date.now() + DEFAULT_CODE_SECONDS * 1000).toISOString(),
  );
  const deadline = codeDeadline ?? defaultDeadline;

  const shape = selectedShape(profile);
  if (!shape) return null;

  if (shape.shape === "unknown") {
    return (
      <div
        className={className}
        data-testid="login-surface-unknown"
        aria-disabled="true"
      >
        <span className="text-body-sm text-(--tethys-text-muted)">
          Unsupported sign-in method: {shape.id}
        </span>
      </div>
    );
  }

  const title = `Sign in to ${profile.name}`;

  if (shape.shape === "env-var") {
    const validKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
    const typed = envRows.filter((row) => row.key.trim() !== "");
    const canSave =
      typed.length > 0 &&
      typed.every((row) => validKey(row.key.trim()) && row.value !== "");
    const submit = () => {
      const rows = envRows
        .map((row) => ({ key: row.key.trim(), value: row.value }))
        .filter((row) => row.key !== "" && row.value !== "");
      // Nothing typed stays in component state once it has been handed up.
      setEnvRows([{ key: "", value: "" }]);
      onSubmitEnv?.(rows);
      closeOnce("success");
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
          <a
            className="text-body-sm text-(--tethys-text-link)"
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
        title={vendorCommand}
        description="Complete sign-in in the terminal."
        footer={
          <Button variant="secondary" onClick={() => closeOnce("process-exit")}>
            Close
          </Button>
        }
        maxWidth="max-w-[560px]"
      >
        <div
          className={`rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-sunken) p-3 font-mono text-mono-micro ${className ?? ""}`}
          data-testid="login-surface-cli-passthrough"
        >
          <span className="text-(--tethys-text-muted)">
            $ {vendorCommand} login
          </span>
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
      <p
        className={`text-body-sm text-(--tethys-text-muted) ${className ?? ""}`}
        data-testid="login-surface-agent-auth"
      >
        Waiting for {profile.name} to finish sign-in…
      </p>
    </ModalDialog>
  );
}
