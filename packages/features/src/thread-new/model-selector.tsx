//! `model-selector-pill` + `model-selector-popover` (DESIGN.md; spec §3).
//!
//! Two-column popover: a fixed 200px Provider column and the Provider's own
//! `session-config-panel`. Never indexes a possibly-empty provider list for
//! initial state (the M1.6 shell's `useState(ACP_PROVIDERS[0])` bug).

import type { ConfigOption } from "@tethys/bindings";
import {
  hasSelectableProvider,
  isProviderSelectable,
  type ProviderConnection,
  useProviderConnections,
} from "@tethys/state";
import {
  EmptyState,
  Listbox,
  Popover,
  ProtocolPill,
  StatusDot,
} from "@tethys/ui";
import { useEffect, useRef, useState, type RefObject } from "react";
import { optionValues, SessionConfigPanel } from "./session-config-panel";
import type { PreparedDraftStatus } from "./use-prepared-draft";

// Pen `XrH5y / Provider model pill`: 22px, surface-card, md radius, hairline.
const PILL_CLASS =
  "focus-ring flex h-[22px] items-center gap-1.5 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";

const SECTION_LABEL_CLASS =
  "px-3 py-1 text-label-sm text-(--tethys-text-muted) uppercase tracking-wider";

/** The model value shown beside the Provider name in the compact pill. */
function modelSummary(
  schema: ConfigOption[],
  values: Record<string, string>,
): string {
  const option = schema.find((candidate) => candidate.category === "model");
  if (!option) return "";
  const current = values[option.id] ?? option.current_value;
  return (
    optionValues(option).find((value) => value.id === current)?.name ?? current
  );
}

/** The config column's status line: Provider auth wins over draft progress. */
function configColumnCopy(
  provider: ProviderConnection,
  status: PreparedDraftStatus,
): string {
  if (provider.status === "auth_required" || status === "auth-required") {
    return "Sign in to configure this provider";
  }
  switch (status) {
    case "preparing":
      return "Preparing the session…";
    case "error":
      return "Session setup failed";
    default:
      return "Session options";
  }
}

export interface ModelSelectorProps {
  providers?: ProviderConnection[];
  selectedProviderId: string | null;
  onSelectProvider: (provider: ProviderConnection) => void;
  values: Record<string, string>;
  onConfigChange: (optionId: string, value: string) => void;
  /** Real `session/new` options from the prepared draft (never a fixture). */
  configOptions?: ConfigOption[];
  /** Prepared-draft state driving the config column copy. */
  draftStatus?: PreparedDraftStatus;
  draftError?: string | null;
  /** Called after Esc / selection close, so the caller can restore focus. */
  onClosed?: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export function ModelSelector({
  providers: providersProp,
  selectedProviderId,
  onSelectProvider,
  values,
  onConfigChange,
  configOptions = [],
  draftStatus = "idle",
  draftError = null,
  onClosed,
  triggerRef,
}: ModelSelectorProps) {
  const providers = useProviderConnections(providersProp);
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState<"providers" | "config">("providers");
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const localAnchorRef = useRef<HTMLButtonElement>(null);
  const anchorRef = triggerRef ?? localAnchorRef;

  const anySelectable = hasSelectableProvider(providers);
  const selected =
    providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const label = selected?.name ?? "No provider available";
  const summary =
    configOptions.length > 0 ? modelSummary(configOptions, values) : "";
  const panelOptions = configOptions.filter(
    (option) => option.category !== "mode",
  );
  const modelOption = panelOptions.find(
    (option) => option.category === "model",
  );
  const moreOptions = panelOptions.filter((option) => option !== modelOption);

  useEffect(() => {
    if (open && !anySelectable) {
      setColumn("providers");
    }
  }, [open, anySelectable]);

  const close = () => {
    setOpen(false);
    setColumn("providers");
    setMoreOptionsOpen(false);
    onClosed?.();
  };

  return (
    <div
      className="relative"
      role="toolbar"
      aria-label="Provider and session configuration"
      data-active-column={column}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setColumn("config");
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          setColumn("providers");
        }
      }}
    >
      <button
        ref={anchorRef}
        type="button"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Provider and model"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((prev) => !prev);
          } else if (event.key === "Escape") {
            close();
          }
        }}
        className={PILL_CLASS}
      >
        {selected ? (
          <StatusDot status={selected.status} inline />
        ) : (
          <StatusDot status="missing" inline />
        )}
        <span
          className={
            selected
              ? "text-(--tethys-text-primary)"
              : "text-(--tethys-text-muted)"
          }
        >
          {label}
        </span>
        {summary && (
          <span className="text-label-md text-(--tethys-text-muted)">
            · {summary}
          </span>
        )}
        <span aria-hidden="true" className="text-(--tethys-text-muted)">
          {"\u25be"}
        </span>
      </button>

      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        className="bottom-full left-0 mb-1.5"
      >
        <div className="flex h-[250px] w-(--layout-popover-selector) divide-x divide-(--tethys-hairline) overflow-hidden">
          <div className="flex w-[200px] shrink-0 flex-col overflow-y-auto p-2">
            <div className={SECTION_LABEL_CLASS}>Providers</div>
            {providers.length === 0 ? (
              <EmptyState
                title="No connected providers"
                description="Add one in Settings / Providers"
                action={
                  <a
                    href="/settings/providers"
                    className="text-label-md text-(--tethys-accent-focus) hover:underline"
                  >
                    Open Settings / Providers
                  </a>
                }
              />
            ) : (
              <Listbox
                label="Providers"
                selectedId={selected?.id}
                items={providers.map((provider) => ({
                  id: provider.id,
                  value: provider,
                  label: provider.name,
                  icon: <StatusDot status={provider.status} inline />,
                  sublabel:
                    provider.protocol !== null ? (
                      <ProtocolPill>
                        ACP {provider.protocol.toLowerCase()}
                      </ProtocolPill>
                    ) : provider.status === "auth_required" ? (
                      <span className="text-(--tethys-status-warning)">⚠</span>
                    ) : undefined,
                  disabled: !isProviderSelectable(provider),
                }))}
                onSelect={(item) => {
                  onSelectProvider(item.value);
                  setColumn("config");
                  setMoreOptionsOpen(false);
                }}
              />
            )}
            {providers.some(
              (provider) => provider.status === "auth_required",
            ) && (
              <div className="border-t border-(--tethys-hairline) px-3 py-2">
                <a
                  href="/settings/providers"
                  className="text-label-md text-(--tethys-accent-focus) hover:underline"
                >
                  Sign in
                </a>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-md overflow-y-auto p-md">
            {selected ? (
              <>
                <span className="text-label-sm text-(--tethys-text-muted)">
                  {configColumnCopy(selected, draftStatus)}
                </span>
                {draftError !== null && draftStatus === "error" ? (
                  <p
                    role="alert"
                    className="text-body-sm text-(--tethys-status-danger)"
                  >
                    {draftError}
                  </p>
                ) : modelOption ? (
                  <>
                    <SessionConfigPanel
                      options={[modelOption]}
                      values={values}
                      onChange={onConfigChange}
                    />
                    {moreOptions.length > 0 && (
                      <>
                        <button
                          type="button"
                          aria-expanded={moreOptionsOpen}
                          onClick={() =>
                            setMoreOptionsOpen((previous) => !previous)
                          }
                          className="focus-ring self-start rounded-sm px-2 py-1 text-label-md text-(--tethys-accent-focus) hover:bg-(--tethys-surface-hover)"
                        >
                          {moreOptionsOpen ? "Fewer options" : "More options…"}
                        </button>
                        {moreOptionsOpen && (
                          <SessionConfigPanel
                            options={moreOptions}
                            values={values}
                            onChange={onConfigChange}
                          />
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <SessionConfigPanel
                    options={panelOptions}
                    values={values}
                    onChange={onConfigChange}
                    emptyCopy={
                      draftStatus === "preparing"
                        ? "Preparing the session…"
                        : undefined
                    }
                  />
                )}
              </>
            ) : (
              <EmptyState title="No provider selected" />
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}
