//! Server Configuration Card (spec §5.4; SYN-01).
//!
//! Read-oriented. Renders `RegistryEntryView` fields; a `RegistryValue::Secret`
//! renders its `keychain:…` ref verbatim and there is no reveal affordance —
//! the engine never returns a secret value, so none can surface here.

import type { RegistryEntryView, RegistryValue } from "@tethys/bindings";
import { registryValueText } from "@tethys/state";
import { Badge, Card, ProtocolPill } from "@tethys/ui";
import type React from "react";

export interface ServerConfigCardProps {
  view: RegistryEntryView;
  onClose?: () => void;
}

export function ServerConfigCard({ view, onClose }: ServerConfigCardProps) {
  const { entry } = view;
  return (
    <Card
      data-testid="server-config-card"
      className="flex flex-col gap-md p-lg"
    >
      <header className="flex items-start justify-between gap-md">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-sm">
            <span className="font-mono text-mono-code text-(--tethys-text-primary)">
              {view.name}
            </span>
            <ProtocolPill>{entry.type}</ProtocolPill>
            <Badge variant="muted" size="sm">
              {view.scope}
            </Badge>
          </div>
          <span className="text-label-sm text-(--tethys-text-muted)">
            Server configuration
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="focus-ring text-label-md text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
          >
            Close
          </button>
        )}
      </header>

      {entry.type === "stdio" ? (
        <Field label="Command">
          <code className="font-mono text-mono-code text-(--tethys-text-primary)">
            {entry.command ?? "—"}
          </code>
          {entry.args && entry.args.length > 0 && (
            <code className="mt-1 block font-mono text-mono-micro text-(--tethys-text-secondary)">
              {entry.args.join(" ")}
            </code>
          )}
        </Field>
      ) : (
        <Field label="URL">
          <code className="font-mono text-mono-code text-(--tethys-text-primary)">
            {entry.url ?? "—"}
          </code>
        </Field>
      )}

      <KeyValueSection title="Environment" values={entry.env} />
      <KeyValueSection title="Headers" values={entry.headers} />
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label-sm text-(--tethys-text-muted)">{label}</span>
      {children}
    </div>
  );
}

function KeyValueSection({
  title,
  values,
}: {
  title: string;
  values?: Record<string, RegistryValue>;
}) {
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-(--tethys-hairline) pt-md">
      <span className="text-label-sm text-(--tethys-text-muted)">{title}</span>
      {entries.map(([key, value]) => {
        const { text, secret } = registryValueText(value);
        return (
          <div key={key} className="flex items-center gap-sm">
            <span className="font-mono text-mono-micro text-(--tethys-text-secondary)">
              {key}
            </span>
            <code className="font-mono text-mono-micro text-(--tethys-text-primary)">
              {text}
            </code>
            {secret && (
              <Badge variant="muted" size="sm">
                keychain
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
