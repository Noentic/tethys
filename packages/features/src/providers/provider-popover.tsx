import {
  Button,
  getProviderSurface,
  Popover,
  SchemaFieldGroup,
  StatusDot,
  useFocusTrap,
  useFocusTrapBelow,
} from "@tethys/ui";
import { useId, useRef } from "react";
import {
  dequeueProviderExtension,
  enqueueProviderExtension,
  hasProviderSurface,
  usePendingExtensions,
} from "./pending-extensions";

interface ExtensionAction {
  id: string;
  label: string;
  kind?: string;
}

interface ExtensionParams {
  title?: string;
  body?: string;
  actions?: ExtensionAction[];
}

function parseParams(params: string): ExtensionParams {
  try {
    const value = JSON.parse(params) as ExtensionParams;
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}

/** Queues one extension request when its method has a registered surface. */
export function queueProviderExtension(params: {
  provider_id: string;
  method: string;
  params: string;
}): boolean {
  return enqueueProviderExtension(params);
}

/**
 * The default vendor-extension surface: the Provider's title, a body through
 * `schema-field-group` spacing, and the Provider's own actions in its order.
 * Register it (or a vendor one) with `registerProviderSurface`.
 */
export function ProviderExtensionSurface({
  params,
  onAction,
}: {
  providerId: string;
  method: string;
  params: string;
  onAction?: (actionId: string) => void;
}) {
  const parsed = parseParams(params);
  const titleId = useId();
  return (
    <div className="wash-warning w-90 rounded-sm border-l-2 border-l-(--tethys-status-warning) p-lg">
      <div className="flex items-center gap-sm">
        <StatusDot status="awaiting_approval" inline />
        <h2 id={titleId} className="text-label-md text-(--tethys-text-primary)">
          {parsed.title ?? "Provider request"}
        </h2>
      </div>
      <SchemaFieldGroup>
        <p className="text-body-sm text-(--tethys-text-secondary)">
          {parsed.body ?? ""}
        </p>
      </SchemaFieldGroup>
      <div className="mt-sm flex justify-end gap-sm">
        {(parsed.actions ?? []).map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant={
              action.kind === "destructive" ? "destructive" : "secondary"
            }
            onClick={() => onAction?.(action.id)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * Hosts a vendor-extension request anchored to the Provider pill (M1.7 U13).
 * Opens only while no other focus trap is open, traps `Tab`, and restores focus
 * to the invoker on close. Reachable only through `registerProviderSurface`.
 */
export function ProviderPopover({
  providerId,
  anchorRef,
  className,
}: {
  providerId: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const extensions = usePendingExtensions(providerId);
  // Because it traps focus it never opens over a lower trap (a dialog, a
  // drawer): the request waits in the Provider's pending list until it closes.
  const trapped = useFocusTrapBelow("popover");
  const containerRef = useRef<HTMLDivElement>(null);
  const top = extensions.find((extension) =>
    hasProviderSurface(extension.provider_id, extension.method),
  );
  const Surface = top
    ? getProviderSurface(top.provider_id, top.method)
    : undefined;

  const close = () => {
    if (top) {
      dequeueProviderExtension(top.provider_id, top);
    }
  };

  const active = Boolean(top && Surface && !trapped);
  useFocusTrap({
    active,
    containerRef,
    tier: "popover",
    onEscape: close,
    initialFocus: "first",
  });

  if (!top || !Surface || trapped) {
    return null;
  }

  return (
    <Popover open onClose={close} anchorRef={anchorRef} className={className}>
      <div ref={containerRef}>
        <Surface
          providerId={top.provider_id}
          method={top.method}
          params={top.params}
        />
      </div>
    </Popover>
  );
}

/** Text pending count for the Provider pill. */
export function ProviderPendingCount({ providerId }: { providerId: string }) {
  const count = usePendingExtensions(providerId).length;
  if (count === 0) {
    return null;
  }
  return (
    <span
      data-testid="provider-pending-count"
      className="ml-1 font-mono text-mono-micro text-(--tethys-status-warning)"
    >
      {count}
    </span>
  );
}
