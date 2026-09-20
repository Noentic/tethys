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
import { useEffect, useRef, useState } from "react";
import { optionValues, SessionConfigPanel } from "./session-config-panel";

const PILL_CLASS =
  "focus-ring flex h-7 items-center gap-1.5 rounded-sm px-2 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";

const SECTION_LABEL_CLASS =
  "px-3 py-1 text-label-sm text-(--tethys-text-muted) uppercase tracking-wider";

/** Short `Model · Effort`-style summary from the Provider's own schema. */
export function configSummary(
  schema: ConfigOption[],
  values: Record<string, string>,
): string {
  return schema
    .slice(0, 2)
    .map((option) => {
      const current = values[option.id] ?? option.current_value;
      return (
        optionValues(option).find((value) => value.id === current)?.name ??
        current
      );
    })
    .filter(Boolean)
    .join(" · ");
}

export interface ModelSelectorProps {
  providers?: ProviderConnection[];
  selectedProviderId: string | null;
  onSelectProvider: (provider: ProviderConnection) => void;
  values: Record<string, string>;
  onConfigChange: (optionId: string, value: string) => void;
  unavailableIds?: string[];
  /** Called after Esc / selection close, so the caller can restore focus. */
  onClosed?: () => void;
}

export function ModelSelector({
  providers: providersProp,
  selectedProviderId,
  onSelectProvider,
  values,
  onConfigChange,
  unavailableIds = [],
  onClosed,
}: ModelSelectorProps) {
  const providers = useProviderConnections(providersProp);
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState<"providers" | "config">("providers");
  const anchorRef = useRef<HTMLButtonElement>(null);

  const anySelectable = hasSelectableProvider(providers);
  const selected =
    providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const label = selected?.name ?? "No provider available";
  const summary =
    selected && selected.configSchema.length > 0
      ? configSummary(selected.configSchema, values)
      : "";

  useEffect(() => {
    if (open && !anySelectable) {
      setColumn("providers");
    }
  }, [open, anySelectable]);

  const close = () => {
    setOpen(false);
    setColumn("providers");
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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Model and provider"
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
          <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
            {summary}
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
        <div className="flex h-[300px] w-(--layout-popover-selector) divide-x divide-(--tethys-hairline) overflow-hidden">
          <div className="flex w-[200px] shrink-0 flex-col overflow-y-auto">
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

          <div className="flex flex-1 flex-col gap-md overflow-y-auto p-md">
            {selected ? (
              <>
                <div className="flex flex-col gap-1 border-b border-(--tethys-hairline) pb-md">
                  <span className="text-heading-md text-(--tethys-text-primary)">
                    {selected.name} Configuration
                  </span>
                  <span className="text-label-sm text-(--tethys-text-muted)">
                    {selected.status === "auth_required"
                      ? "Sign in to configure this provider"
                      : "Session options"}
                  </span>
                </div>
                <SessionConfigPanel
                  options={selected.configSchema}
                  values={values}
                  onChange={onConfigChange}
                  unavailableIds={unavailableIds}
                />
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
