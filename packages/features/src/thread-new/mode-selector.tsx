import { ChevronDown } from "@nebutra/icons";
import type { ConfigOption, PermissionMode } from "@tethys/bindings";
import { Popover } from "@tethys/ui";
import { type KeyboardEvent, type RefObject, useRef, useState } from "react";
import { optionValues } from "./session-config-panel";

const PILL_CLASS =
  "focus-ring flex h-7 items-center gap-2 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2.5 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";
const ROW_CLASS =
  "focus-ring flex min-h-9 w-full items-center gap-sm rounded-sm px-2.5 text-left text-body-sm text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)";

const APPROVAL_LABELS: Record<PermissionMode, string> = {
  supervised: "Ask first",
  "auto-edit": "Auto-edit",
  yolo: "Full auto",
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
  const display = `${displayedMode?.name ?? "Mode"} · ${APPROVAL_LABELS[permissionMode]}`;
  const approvalProviderValue = (mode: PermissionMode) =>
    values.find((candidate) => {
      const role = modeRole(option, candidate.id);
      return role.kind === "approval" && role.level === mode;
    });
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

  const chooseNumber = (event: KeyboardEvent<HTMLDivElement>) => {
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
    <div className="relative">
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
        <span className="text-(--tethys-text-muted)">Mode</span>
        <span className="text-(--tethys-text-primary)">{display}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-(--tethys-text-muted)"
        />
      </button>

      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        className="bottom-full left-0 mb-1.5 w-[304px]"
      >
        <div className="flex flex-col gap-sm p-sm" onKeyDown={chooseNumber}>
          <section aria-label="Working mode">
            <h3 className="px-2 pb-1 text-label-sm text-(--tethys-text-muted)">
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
                    {index < 9 && (
                      <kbd className="w-4 font-mono text-mono-micro text-(--tethys-text-muted)">
                        {index + 1}
                      </kbd>
                    )}
                    <span className="truncate">{candidate.name}</span>
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
                    <kbd className="w-4 font-mono text-mono-micro text-(--tethys-text-muted)">
                      {index + 1}
                    </kbd>
                    <span>{APPROVAL_LABELS[mode]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            aria-label="Full auto"
            className="border-t border-(--tethys-hairline) pt-sm"
          >
            <div className="flex items-center gap-sm px-2">
              <kbd className="w-4 font-mono text-mono-micro text-(--tethys-text-muted)">
                {numberedChoices.length}
              </kbd>
              <span className="text-body-sm text-(--tethys-text-primary)">
                Full auto
              </span>
              <button
                type="button"
                disabled={!worktreeEnabled}
                onClick={() => chooseApproval("yolo")}
                className="focus-ring ml-auto rounded border border-(--tethys-hairline) px-2 py-1 text-label-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enable
              </button>
            </div>
            {!worktreeEnabled && (
              <p className="px-8 pt-1 text-label-sm text-(--tethys-text-muted)">
                Full auto needs a new worktree
              </p>
            )}
          </section>

          <footer className="flex items-center justify-between border-t border-(--tethys-hairline) pt-sm text-label-sm text-(--tethys-text-muted)">
            <span>Applies to this thread</span>
            <button
              type="button"
              onClick={onMakeDefault}
              className="focus-ring rounded px-1 text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
            >
              Make default for {workspaceName}
            </button>
          </footer>
        </div>
      </Popover>
    </div>
  );
}
