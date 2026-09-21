//! Commands half of Settings / Skills & Commands (pen `VEtJR` list, `TqJvG`
//! editor). Real capability throughout: `commands.list` fills the grouped list,
//! `commands.read` fills the editor, `commands.write` and `commands.delete`
//! commit. The pen's markdown toolbar is not built — the body is a plain
//! textarea, since there is no markdown editing primitive to reuse here.

import { Terminal } from "@nebutra/icons";
import type { CommandInfo, CommandScope } from "@tethys/bindings";
import { createClient } from "@tethys/client";
import type { CommandsClient } from "@tethys/state";
import { Button, cn } from "@tethys/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

const defaultClient = createClient();

const keyOf = (scope: CommandScope, name: string) => `${scope}:${name}`;

export interface CommandsPaneProps {
  client?: CommandsClient;
  workspaceId?: string;
  workspaceName?: string;
  /** Scope a newly created command is written to. */
  addScope: CommandScope;
  search: string;
  /** Bumped by the page's Add button; a new draft is opened on each change. */
  addSignal?: number;
  className?: string;
}

interface Draft {
  scope: CommandScope;
  name: string;
  body: string;
  isNew: boolean;
}

export function CommandsPane({
  client = defaultClient,
  workspaceId,
  workspaceName,
  addScope,
  search,
  addSignal = 0,
  className,
}: CommandsPaneProps) {
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCommands(await client.commands.list(workspaceId, true));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [client, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (addSignal === 0) return;
    setSelected(null);
    setError(null);
    setDraft({ scope: addScope, name: "", body: "", isNew: true });
  }, [addSignal, addScope]);

  const query = search.trim().toLowerCase();
  const visible = commands.filter(
    (command) =>
      query === "" ||
      command.name.toLowerCase().includes(query) ||
      (command.description ?? "").toLowerCase().includes(query),
  );
  const groups = useMemo(
    () => [
      { scope: "global" as const, label: "Global · ~/.tethys/commands/" },
      {
        scope: "workspace" as const,
        label: `Workspace${workspaceName ? ` · ${workspaceName}` : ""} · .tethys/commands/`,
      },
    ],
    [workspaceName],
  );

  const select = async (command: CommandInfo) => {
    setSelected(keyOf(command.scope, command.name));
    setError(null);
    try {
      const source = await client.commands.read(
        command.scope,
        command.name,
        workspaceId,
      );
      setDraft({
        scope: source.scope,
        name: source.name,
        body: source.body,
        isNew: false,
      });
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const save = async () => {
    if (!draft || draft.name.trim() === "") return;
    setBusy(true);
    try {
      const written = await client.commands.write(
        draft.scope,
        draft.name.trim(),
        draft.body,
        workspaceId,
      );
      setDraft({ ...draft, name: written.name, isNew: false });
      setSelected(keyOf(written.scope, written.name));
      await load();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft || draft.isNew) return;
    setBusy(true);
    try {
      await client.commands.delete(draft.scope, draft.name, workspaceId);
      setDraft(null);
      setSelected(null);
      await load();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const selectedCommand = commands.find(
    (command) => keyOf(command.scope, command.name) === selected,
  );

  return (
    <div className={cn("flex h-full gap-2xl", className)}>
      <div
        data-testid="command-list"
        className="flex w-[704px] shrink-0 flex-col overflow-auto"
      >
        {visible.length === 0 ? (
          <p className="px-3 py-3 text-body-sm text-(--tethys-text-muted)">
            No commands match that search.
          </p>
        ) : (
          groups.map((group) => {
            const rows = visible.filter(
              (command) => command.scope === group.scope,
            );
            if (rows.length === 0) return null;
            return (
              <div key={group.scope}>
                <div
                  data-testid={`command-group-${group.scope}`}
                  className="flex h-[26px] items-center px-3 text-label-sm text-(--tethys-text-muted)"
                >
                  {group.label}
                </div>
                {rows.map((command) => (
                  <button
                    key={keyOf(command.scope, command.name)}
                    type="button"
                    data-testid={`command-row-${command.name}`}
                    aria-pressed={
                      selected === keyOf(command.scope, command.name)
                    }
                    onClick={() => void select(command)}
                    className={cn(
                      "focus-ring flex h-11 w-full items-center gap-3 px-3 text-left",
                      "hover:bg-(--tethys-surface-hover)",
                      selected === keyOf(command.scope, command.name) &&
                        "bg-(--tethys-surface-active)",
                    )}
                  >
                    <Terminal
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-(--tethys-text-muted)"
                    />
                    <span className="shrink-0 font-mono text-mono-code text-(--tethys-text-primary)">
                      /{command.name}
                    </span>
                    <span className="truncate text-label-sm text-(--tethys-text-muted)">
                      {command.description ?? "No description"}
                    </span>
                    {command.shadowed && (
                      <span
                        title="A workspace command of this name wins in the composer"
                        className="ml-auto shrink-0 text-label-sm text-(--tethys-status-warning)"
                      >
                        shadowed
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div
        data-testid="command-editor"
        className="flex w-[360px] shrink-0 flex-col gap-lg overflow-auto rounded-md border border-(--tethys-hairline) p-lg"
      >
        {!draft ? (
          <p className="text-body-sm text-(--tethys-text-muted)">
            Pick a command to edit, or add one.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-sm">
              <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
                /{draft.isNew ? draft.name || "new" : draft.name}
              </span>
              <span className="ml-auto text-label-sm text-(--tethys-text-muted)">
                {draft.scope}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-label-sm text-(--tethys-text-muted)">
                Name
              </span>
              <input
                aria-label="Command name"
                value={draft.name}
                readOnly={!draft.isNew}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                className="focus-ring h-8 rounded-sm border border-(--tethys-border-control) bg-(--tethys-surface-panel) px-2.5 font-mono text-mono-code text-(--tethys-text-primary) read-only:opacity-60"
              />
              {!draft.isNew && (
                <span className="text-label-sm text-(--tethys-text-muted)">
                  The filename is the name — read-only after create.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-label-sm text-(--tethys-text-muted)">
                Body
              </span>
              <textarea
                aria-label="Command body"
                value={draft.body}
                onChange={(event) =>
                  setDraft({ ...draft, body: event.target.value })
                }
                spellCheck={false}
                className="focus-ring min-h-[200px] rounded-sm border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) p-md font-mono text-mono-micro text-(--tethys-text-on-sunken-secondary)"
              />
              <span className="text-label-sm text-(--tethys-text-muted)">
                Use {"{{args}}"} where the typed text goes; otherwise it is
                appended.
              </span>
            </div>

            {selectedCommand?.shadowed && (
              <span
                data-testid="command-shadow-note"
                className="text-label-sm text-(--tethys-status-warning)"
              >
                Workspace overrides this
                {workspaceName ? ` in ${workspaceName}` : ""}
              </span>
            )}

            {error && (
              <p
                role="alert"
                className="text-label-sm text-(--tethys-status-danger)"
              >
                {error}
              </p>
            )}

            <div className="mt-auto flex items-center gap-sm">
              <Button
                size="sm"
                variant="primary"
                disabled={busy || draft.name.trim() === ""}
                onClick={() => void save()}
              >
                Save
              </Button>
              {!draft.isNew && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Delete
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
