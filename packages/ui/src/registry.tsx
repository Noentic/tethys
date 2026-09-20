import type React from "react";

export type EntryRendererComponent<T = unknown> = React.ComponentType<{
  entry: T;
  className?: string;
}>;

export type InspectorSlotComponent<T = unknown> = React.ComponentType<{
  sessionId?: string;
  data?: T;
  className?: string;
}>;

export type ActionBarSlotComponent<T = unknown> = React.ComponentType<{
  sessionId?: string;
  data?: T;
  className?: string;
}>;

export const entryRenderers = new Map<string, EntryRendererComponent>();
export const inspectorSlots = new Map<string, InspectorSlotComponent>();
export const actionBarSlots = new Map<string, ActionBarSlotComponent>();

export function UnknownEntryRenderer({
  entry,
}: {
  entry: unknown;
  className?: string;
}) {
  const kind =
    typeof entry === "object" && entry !== null && "kind" in entry
      ? String((entry as { kind: unknown }).kind)
      : "unknown";

  return (
    <section
      aria-label={`Unknown entry: ${kind}`}
      className="rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md text-body-sm text-(--tethys-text-muted)"
    >
      <div className="font-mono text-mono-micro text-(--tethys-text-secondary)">
        [{kind}]
      </div>
      <div className="mt-1 truncate font-mono text-mono-micro text-(--tethys-text-muted)">
        {JSON.stringify(entry)}
      </div>
    </section>
  );
}

export function registerEntryRenderer<T = unknown>(
  kind: string,
  component: EntryRendererComponent<T>,
): void {
  entryRenderers.set(kind, component as EntryRendererComponent);
}

export function getEntryRenderer(kind: string): EntryRendererComponent {
  return entryRenderers.get(kind) ?? UnknownEntryRenderer;
}

export function registerInspectorSlot(
  id: string,
  component: InspectorSlotComponent,
): void {
  inspectorSlots.set(id, component);
}

export function getInspectorSlot(
  id: string,
): InspectorSlotComponent | undefined {
  return inspectorSlots.get(id);
}

export function getAllInspectorSlots(): Array<
  [string, InspectorSlotComponent]
> {
  return Array.from(inspectorSlots.entries());
}

export function registerActionBarSlot(
  id: string,
  component: ActionBarSlotComponent,
): void {
  actionBarSlots.set(id, component);
}

export function getAllActionBarSlots(): Array<
  [string, ActionBarSlotComponent]
> {
  return Array.from(actionBarSlots.entries());
}

export function clearRegistriesForTesting(): void {
  entryRenderers.clear();
  inspectorSlots.clear();
  actionBarSlots.clear();
}
