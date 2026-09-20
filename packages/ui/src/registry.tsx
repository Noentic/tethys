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

/** A registered action-bar slot, with its DESIGN.md fold priority. */
export interface ActionBarSlotEntry {
  component: ActionBarSlotComponent;
  /**
   * Higher folds later. Undefined is treated as below `usage-bar` — DESIGN's
   * rule that an undeclared slot folds first.
   */
  priority?: number;
}

export type ApprovalDrawerBodyComponent = React.ComponentType<{
  sessions: Array<{ sessionId: string; title: string; status: string }>;
  onOpenSession: (sessionId: string) => void;
  className?: string;
}>;

/** Mounted by the caller wherever a Provider extension request should render. */
export type ProviderSurfaceComponent = React.ComponentType<{
  providerId: string;
  method: string;
  params: string;
  className?: string;
}>;

export const entryRenderers = new Map<string, EntryRendererComponent>();
export const inspectorSlots = new Map<string, InspectorSlotComponent>();
export const actionBarSlots = new Map<string, ActionBarSlotEntry>();
export const providerSurfaces = new Map<string, ProviderSurfaceComponent>();
let approvalDrawerBody: ApprovalDrawerBodyComponent | null = null;

function providerSurfaceKey(providerId: string, method: string): string {
  return `${providerId}\u0000${method}`;
}

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
  priority?: number,
): void {
  actionBarSlots.set(id, { component, priority });
}

/** Registered action-bar slots, highest priority first. */
export function getAllActionBarSlots(): Array<[string, ActionBarSlotEntry]> {
  return Array.from(actionBarSlots.entries()).sort(
    (a, b) =>
      (b[1].priority ?? Number.NEGATIVE_INFINITY) -
      (a[1].priority ?? Number.NEGATIVE_INFINITY),
  );
}

export function registerApprovalDrawerBody(
  component: ApprovalDrawerBodyComponent,
): void {
  approvalDrawerBody = component;
}

export function getApprovalDrawerBody(): ApprovalDrawerBodyComponent | null {
  return approvalDrawerBody;
}

export function registerProviderSurface(
  providerId: string,
  method: string,
  component: ProviderSurfaceComponent,
): void {
  providerSurfaces.set(providerSurfaceKey(providerId, method), component);
}

export function getProviderSurface(
  providerId: string,
  method: string,
): ProviderSurfaceComponent | undefined {
  return providerSurfaces.get(providerSurfaceKey(providerId, method));
}

export function clearRegistriesForTesting(): void {
  entryRenderers.clear();
  inspectorSlots.clear();
  actionBarSlots.clear();
  providerSurfaces.clear();
  approvalDrawerBody = null;
}
