import {
  Button,
  getProviderSurface,
  Popover,
  SchemaFieldGroup,
} from "@tethys/ui";
import { useEffect, useId, useRef } from "react";
import {
  dequeueProviderExtension,
  enqueueProviderExtension,
  hasProviderSurface,
  useHasOpenTrap,
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

function useFocusTrap(
  active: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!active) {
      return;
    }
    const container = containerRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        container?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusables();
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [active, containerRef]);
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
    <div className="w-90 p-lg">
      <h2 id={titleId} className="text-label-md text-(--tethys-text-primary)">
        {parsed.title ?? "Provider request"}
      </h2>
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
  const trapped = useHasOpenTrap();
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
  useFocusTrap(active, containerRef, close);

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
