import { Card, KeycapPill, PageHeader } from "@tethys/ui";
import { useMemo, useState } from "react";

interface Binding {
  action: string;
  keys: string[];
  scope: "Global" | "Editor" | "Terminal";
}

// The real bindings from `shell/keyboard.ts` plus the composer and terminal
// keys the surfaces own, so the list never claims a shortcut nothing handles.
const BINDINGS: Binding[] = [
  { action: "Toggle command palette", keys: ["Ctrl", "K"], scope: "Global" },
  { action: "Focus tab 1 to 9", keys: ["Ctrl", "1..9"], scope: "Global" },
  { action: "New thread tab", keys: ["Ctrl", "T"], scope: "Global" },
  { action: "Close tab", keys: ["Ctrl", "W"], scope: "Global" },
  { action: "Toggle sessions sidebar", keys: ["Ctrl", "B"], scope: "Global" },
  { action: "Toggle inspector", keys: ["Ctrl", "I"], scope: "Global" },
  { action: "Open settings", keys: ["Ctrl", ","], scope: "Global" },
  { action: "Unstack top modal / drawer", keys: ["Esc"], scope: "Global" },
  { action: "Submit prompt", keys: ["Ctrl", "Enter"], scope: "Editor" },
  { action: "Stop turn", keys: ["Esc"], scope: "Editor" },
];

/** Duplicate key combinations inside one scope are the only conflicts we know. */
function conflictingActions(bindings: Binding[]): Set<string> {
  const seen = new Map<string, number>();
  for (const binding of bindings) {
    const key = `${binding.scope}:${binding.keys.join("+")}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const conflicts = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.scope}:${binding.keys.join("+")}`;
    if ((seen.get(key) ?? 0) > 1) conflicts.add(binding.action);
  }
  return conflicts;
}

export function SettingsKeybindingsView() {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = BINDINGS.filter(
    (binding) =>
      query === "" ||
      binding.action.toLowerCase().includes(query) ||
      binding.keys.join(" ").toLowerCase().includes(query),
  );
  const conflicts = useMemo(() => conflictingActions(BINDINGS), []);

  return (
    <div className="flex flex-col gap-xl">
      <PageHeader breadcrumb="Settings / Keybindings" title="Keybindings" />

      <div className="flex h-8 w-80 items-center gap-2 rounded-sm border border-(--tethys-border-control) bg-(--tethys-surface-panel) px-2.5">
        <span aria-hidden="true" className="text-(--tethys-text-muted)">
          ⌕
        </span>
        <input
          type="text"
          aria-label="Search actions"
          placeholder="Search actions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-full w-full bg-transparent text-body-sm text-(--tethys-text-primary) placeholder-(--tethys-text-muted) outline-none"
        />
      </div>

      <Card className="max-w-[720px] divide-y divide-(--tethys-hairline)">
        {visible.length === 0 ? (
          <p className="px-lg py-xl text-center text-body-sm text-(--tethys-text-muted)">
            No keybinding matches that search.
          </p>
        ) : (
          visible.map((binding) => (
            <div
              key={binding.action}
              data-testid="keybinding-row"
              className="flex h-9 items-center gap-sm px-lg text-body-sm"
            >
              <span className="text-(--tethys-text-primary)">
                {binding.action}
              </span>
              <span className="rounded-xs bg-(--tethys-surface-hover) px-1.5 py-0.5 text-label-sm text-(--tethys-text-muted)">
                {binding.scope}
              </span>
              <span className="ml-auto flex items-center gap-1">
                {binding.keys.map((key) => (
                  <KeycapPill key={key}>{key}</KeycapPill>
                ))}
              </span>
              {conflicts.has(binding.action) && (
                <span className="flex items-center gap-1 text-label-sm text-(--tethys-status-warning)">
                  <span aria-hidden="true">⚠</span>
                  <span>Conflict</span>
                </span>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
