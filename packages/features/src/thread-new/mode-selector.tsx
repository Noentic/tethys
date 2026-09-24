import { Check, ChevronDown } from "@nebutra/icons";
import type { ConfigOption, PermissionMode } from "@tethys/bindings";
import { Popover, TruncatedText } from "@tethys/ui";
import { type KeyboardEvent, type RefObject, useRef, useState } from "react";
import { optionValues } from "./config-values";

const PILL_CLASS =
  "focus-ring flex min-h-7 max-w-48 min-w-0 items-center gap-2 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2.5 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";
const ROW_CLASS =
  "focus-ring flex min-h-9 w-full items-start gap-sm rounded-sm px-2.5 py-1.5 text-left text-body-sm text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) aria-selected:text-(--tethys-text-primary)";
const KEY_CLASS =
  "mt-px w-4 shrink-0 font-mono text-mono-micro text-(--tethys-text-muted)";

const APPROVAL_LABELS: Record<PermissionMode, string> = {
  supervised: "Ask first",
  "auto-edit": "Auto-edit",
  yolo: "Full auto",
};

/**
 * What each approval level lets the agent do, in Tethys's own words (the level
 * is Tethys's policy, so the sentence is not invented for a Provider; P11).
 */
const APPROVAL_CONSEQUENCES: Record<PermissionMode, string> = {
  supervised: "Asks before every edit, command and network call",
  "auto-edit": "Edits files in this thread's folder; asks for commands",
  yolo: "Runs everything without asking; every action is logged",
};

const APPROVAL_RANK: Record<PermissionMode, number> = {
  supervised: 0,
  "auto-edit": 1,
  yolo: 2,
};

interface ModeRole {
  kind: "working" | "approval";
  level?: PermissionMode;
}

function modeRole(option: ConfigOption, valueId: string): ModeRole {
  try {
    const metadata: unknown = JSON.parse(option.metadata ?? "{}");
    if (typeof metadata !== "object" || metadata === null) {
      return { kind: "working" };
    }
    const roles = (metadata as { tethysModeRoles?: unknown }).tethysModeRoles;
    if (typeof roles !== "object" || roles === null) {
      return { kind: "working" };
    }
    const role = (roles as Record<string, unknown>)[valueId];
    if (typeof role !== "object" || role === null) {
      return { kind: "working" };
    }
    const data = role as { kind?: unknown; level?: unknown };
    if (
      data.kind === "approval" &&
      (data.level === "supervised" ||
        data.level === "auto-edit" ||
        data.level === "yolo")
    ) {
      return { kind: "approval", level: data.level };
    }
  } catch {
    // Older and third-party metadata has no Tethys role annotation.
  }
  return { kind: "working" };
}

function RowText({
  name,
  consequence,
}: {
  name: string;
  consequence?: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate">{name}</span>
      {consequence && (
        <span className="text-label-sm font-normal text-(--tethys-text-muted)">
          {consequence}
        </span>
      )}
    </span>
  );
}

function SelectedMark() {
  return (
    <Check
      aria-hidden="true"
      className="mt-0.5 size-3.5 shrink-0 text-(--tethys-text-primary)"
    />
  );
}

export interface ModeSelectorProps {
  options: ConfigOption[];
  value?: string;
  onChange: (value: string) => void;
  permissionMode?: PermissionMode;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  worktreeEnabled?: boolean;
  providerName?: string;
  workspaceName?: string;
  onMakeDefault?: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export function ModeSelector({
  options,
  value,
  onChange,
  permissionMode = "supervised",
  onPermissionModeChange,
  worktreeEnabled = false,
  providerName = "Provider",
  workspaceName = "workspace",
  onMakeDefault,
  triggerRef,
}: ModeSelectorProps) {
  const option = options.find((candidate) => candidate.category === "mode");
  const localAnchorRef = useRef<HTMLButtonElement>(null);
  const anchorRef = triggerRef ?? localAnchorRef;
  const [open, setOpen] = useState(false);
  if (!option) return null;

  const values = optionValues(option);
  const current = value ?? option.current_value;
  const workingModes = values.filter(
    (candidate) => modeRole(option, candidate.id).kind === "working",
  );
  const displayedMode = workingModes.find(
    (candidate) => candidate.id === current,
  );
  // A Provider mode that is really a permission preset is never shown as a
  // working mode, so the pill names only the approval then.
  const display = displayedMode
    ? `${displayedMode.name} · ${APPROVAL_LABELS[permissionMode]}`
    : APPROVAL_LABELS[permissionMode];
  // The widest Provider preset that is still no wider than the chosen level:
  // Tethys never sets a Provider mode wider than its own policy (PRM-04), and
  // answers whatever the Provider still asks through `request_permission`.
  const approvalProviderValue = (mode: PermissionMode) => {
    let best: { id: string; rank: number } | undefined;
    for (const candidate of values) {
      const role = modeRole(option, candidate.id);
      if (role.kind !== "approval" || !role.level) continue;
      const rank = APPROVAL_RANK[role.level];
      if (rank <= APPROVAL_RANK[mode] && (!best || rank > best.rank)) {
        best = { id: candidate.id, rank };
      }
    }
    return best;
  };
  const close = () => setOpen(false);
  const chooseWorking = (id: string) => {
    onChange(id);
    close();
  };
  const chooseApproval = (mode: PermissionMode) => {
    const providerValue = approvalProviderValue(mode);
    if (providerValue) onChange(providerValue.id);
    onPermissionModeChange?.(mode);
    close();
  };

  const numberedChoices: Array<
    | { kind: "working"; value: string }
    | { kind: "approval"; value: PermissionMode }
  > = [
    ...workingModes.map((candidate) => ({
      kind: "working" as const,
      value: candidate.id,
    })),
    { kind: "approval", value: "supervised" },
    { kind: "approval", value: "auto-edit" },
    { kind: "approval", value: "yolo" },
  ];

  const chooseNumber = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    const number = Number.parseInt(event.key, 10);
    if (Number.isNaN(number) || number < 1 || number > 9) return;
    const choice = numberedChoices[number - 1];
    if (!choice) return;
    event.preventDefault();
    if (choice.kind === "working") chooseWorking(choice.value);
    else if (choice.value !== "yolo" || worktreeEnabled) {
      chooseApproval(choice.value);
    }
  };

  return (
    <div className="relative min-w-0">
      <button
        ref={anchorRef}
        type="button"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Mode, ${display}`}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((previous) => !previous);
          } else if (event.key === "Escape") {
            close();
          }
        }}
        className={PILL_CLASS}
      >
        <span className="shrink-0 text-(--tethys-text-muted)">Mode</span>
        <TruncatedText
          text={display}
          className="text-(--tethys-text-primary)"
        />
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-(--tethys-text-muted)"
        />
      </button>

      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        side="top"
        className="w-[min(340px,calc(100vw-16px))]"
      >
        <fieldset
          className="m-0 flex min-w-0 flex-col gap-sm border-0 p-sm"
          onKeyDown={chooseNumber}
        >
          <legend className="sr-only">Select a mode or approval level</legend>
          <section aria-label="Working mode">
            <h3 className="truncate px-2 pb-1 text-label-sm text-(--tethys-text-muted)">
              Working mode · {providerName}
            </h3>
            <div role="listbox" aria-label="Working mode">
              {workingModes.map((candidate) => {
                const index = numberedChoices.findIndex(
                  (choice) =>
                    choice.kind === "working" && choice.value === candidate.id,
                );
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    role="option"
                    aria-selected={candidate.id === current}
                    onClick={() => chooseWorking(candidate.id)}
                    className={ROW_CLASS}
                  >
                    <kbd className={KEY_CLASS}>
                      {index < 9 ? index + 1 : ""}
                    </kbd>
                    <RowText
                      name={candidate.name}
                      consequence={candidate.description ?? undefined}
                    />
                    {candidate.id === current && <SelectedMark />}
                  </button>
                );
              })}
            </div>
          </section>

          <section
            aria-label="Approvals"
            className="border-t border-(--tethys-hairline) pt-sm"
          >
            <h3 className="px-2 pb-1 text-label-sm text-(--tethys-text-muted)">
              Approvals · Tethys
            </h3>
            <div role="listbox" aria-label="Approvals">
              {(["supervised", "auto-edit"] as const).map((mode) => {
                const index = numberedChoices.findIndex(
                  (choice) =>
                    choice.kind === "approval" && choice.value === mode,
                );
                return (
                  <button
                    key={mode}
                    type="button"
                    role="option"
                    aria-selected={permissionMode === mode}
                    onClick={() => chooseApproval(mode)}
                    className={ROW_CLASS}
                  >
                    <kbd className={KEY_CLASS}>{index + 1}</kbd>
                    <RowText
                      name={APPROVAL_LABELS[mode]}
                      consequence={APPROVAL_CONSEQUENCES[mode]}
                    />
                    {permissionMode === mode && <SelectedMark />}
                  </button>
                );
              })}
            </div>
          </section>

          <section
            aria-label="Full auto"
            className="border-t border-(--tethys-hairline) pt-sm"
          >
            <div className="flex items-start gap-sm px-2.5">
              <kbd className={KEY_CLASS}>{numberedChoices.length}</kbd>
              <RowText
                name={APPROVAL_LABELS.yolo}
                consequence={
                  worktreeEnabled
                    ? APPROVAL_CONSEQUENCES.yolo
                    : "Full auto needs a new worktree"
                }
              />
              {permissionMode === "yolo" ? (
                <SelectedMark />
              ) : (
                <button
                  type="button"
                  disabled={!worktreeEnabled}
                  onClick={() => chooseApproval("yolo")}
                  className="focus-ring shrink-0 rounded border border-(--tethys-hairline) px-2 py-1 text-label-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Enable
                </button>
              )}
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-x-sm gap-y-1 border-t border-(--tethys-hairline) px-2 pt-sm text-label-sm text-(--tethys-text-muted)">
            <span className="shrink-0">Applies to this thread</span>
            <button
              type="button"
              onClick={onMakeDefault}
              title={`Make default for ${workspaceName}`}
              className="focus-ring flex min-w-0 max-w-full items-center rounded px-1 text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
            >
              <span className="shrink-0">Make default for&nbsp;</span>
              <span className="min-w-0 truncate">{workspaceName}</span>
            </button>
          </footer>
        </fieldset>
      </Popover>
    </div>
  );
}
