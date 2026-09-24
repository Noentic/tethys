//! `model-selector-pill` + `model-selector-popover` (DESIGN.md; spec §3).
//!
//! Two-column popover: a fluid Provider column (at most 200px) and the Provider's own
//! `session-config-panel`. Never indexes a possibly-empty provider list for
//! initial state (the M1.6 shell's `useState(ACP_PROVIDERS[0])` bug).

import { ChevronDown } from "@nebutra/icons";
import type { ConfigOption } from "@tethys/bindings";
import {
  hasSelectableProvider,
  isProviderSelectable,
  type ProviderConnection,
  useProviderConnections,
} from "@tethys/state";
import {
  ActivityOrb,
  cn,
  EmptyState,
  Listbox,
  Popover,
  ProtocolPill,
  StatusDot,
  TruncatedText,
} from "@tethys/ui";
import { type RefObject, useEffect, useRef, useState } from "react";
import { providerIcon } from "../agents/provider-catalog";
import { optionValues } from "./config-values";
import { ModelOptionList } from "./model-option-list";
import { SessionConfigPanel } from "./session-config-panel";
import type { PreparedDraftStatus } from "./use-prepared-draft";

/** The catalog logo with a corner status dot, or a bare status dot when the
 * provider isn't in the catalog (a registry-only or unrecognised profile). */
function ProviderMark({
  providerId,
  status,
}: {
  providerId: string;
  status: string;
}) {
  const icon = providerIcon(providerId);
  if (!icon) return <StatusDot status={status} inline />;
  return (
    <span className="relative inline-flex shrink-0">
      <img src={icon} alt="" aria-hidden="true" className="h-4 w-4" />
      <StatusDot
        status={status}
        inline
        className="absolute -right-0.5 -bottom-0.5"
      />
    </span>
  );
}

// Pen `XrH5y / Provider model pill`: 28px, surface-card, md radius, hairline.
// It grows with the type size and never past the room the prompt card gives it.
const PILL_CLASS =
  "focus-ring flex min-h-7 max-w-full min-w-0 items-center gap-2 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2.5 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";

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
      className="relative min-w-0"
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
          <ProviderMark providerId={selected.id} status={selected.status} />
        ) : (
          <StatusDot status="missing" inline />
        )}
        <TruncatedText
          text={label}
          className={cn(
            "max-w-40 shrink-0",
            selected
              ? "text-(--tethys-text-primary)"
              : "text-(--tethys-text-muted)",
          )}
        />
        {summary && (
          <TruncatedText
            text={`· ${summary}`}
            className="text-label-md text-(--tethys-text-muted)"
          />
        )}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-(--tethys-text-muted)"
        />
      </button>

      <Popover open={open} onClose={close} anchorRef={anchorRef} side="top">
        <div className="flex h-[min(420px,60vh)] w-[min(var(--layout-popover-selector),calc(100vw-16px))] divide-x divide-(--tethys-hairline) overflow-hidden">
          <div className="flex w-[38%] max-w-[200px] min-w-36 shrink-0 flex-col overflow-y-auto p-2">
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
                sublabelPlacement="below"
                selectedId={selected?.id}
                items={providers.map((provider) => ({
                  id: provider.id,
                  value: provider,
                  label: provider.name,
                  icon: (
                    <ProviderMark
                      providerId={provider.id}
                      status={provider.status}
                    />
                  ),
                  sublabel:
                    provider.protocol !== null ? (
                      <ProtocolPill>
                        ACP {provider.protocol.toLowerCase()}
                      </ProtocolPill>
                    ) : provider.status === "auth_required" ? (
                      <span className="text-(--tethys-status-warning)">
                        Sign in required
                      </span>
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-sm p-sm">
            {selected ? (
              <>
                <span className="flex items-center gap-1.5 px-1 text-label-sm text-(--tethys-text-muted)">
                  {draftStatus === "preparing" && <ActivityOrb size={12} />}
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
                    <ModelOptionList
                      option={modelOption}
                      value={
                        values[modelOption.id] ?? modelOption.current_value
                      }
                      onChange={(value) =>
                        onConfigChange(modelOption.id, value)
                      }
                      className="min-h-0 flex-1 rounded-md border border-(--tethys-hairline)"
                    />
                    {moreOptions.length > 0 && (
                      <>
                        <button
                          type="button"
                          aria-expanded={moreOptionsOpen}
                          onClick={() =>
                            setMoreOptionsOpen((previous) => !previous)
                          }
                          className="focus-ring shrink-0 self-start rounded-sm px-2 py-1 text-label-md text-(--tethys-accent-focus) hover:bg-(--tethys-surface-hover)"
                        >
                          {moreOptionsOpen ? "Fewer options" : "More options…"}
                        </button>
                        {moreOptionsOpen && (
                          <div className="max-h-[45%] shrink-0 overflow-y-auto">
                            <SessionConfigPanel
                              options={moreOptions}
                              values={values}
                              onChange={onConfigChange}
                            />
                          </div>
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
