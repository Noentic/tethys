import {
  Button,
  getProviderSurface,
  Popover,
  SchemaFieldGroup,
  StatusDot,
  useFocusTrap,
  useFocusTrapBelow,
} from "@tethys/ui";
import { useId, useRef, useState } from "react";
import {
  dequeueProviderExtension,
  dismissProviderExtension,
  hasProviderSurface,
  isProviderExtensionDismissed,
  reopenProviderExtensions,
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

/** Generic action surface used by a Provider registration when its payload fits. */
export function ProviderExtensionSurface({
  params,
  requestId,
  onAction,
}: {
  providerId: string;
  method: string;
  params: string;
  requestId?: string | null;
  onAction?: (response: unknown) => void;
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
      {requestId && (
        <div className="mt-sm flex justify-end gap-sm">
          {(parsed.actions ?? []).map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={
                action.kind === "destructive" ? "destructive" : "secondary"
              }
              onClick={() => onAction?.({ actionId: action.id })}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Thread-scoped Provider request popover anchored to the docked Provider pill. */
export function ProviderPopover({
  threadId,
  anchorRef,
  className,
  onRespond,
}: {
  threadId: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  onRespond?: (requestId: string, response: unknown) => Promise<void>;
}) {
  const extensions = usePendingExtensions(threadId);
  const trapped = useFocusTrapBelow("popover");
  const containerRef = useRef<HTMLDivElement>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const top = extensions.find(
    (extension) =>
      hasProviderSurface(extension.provider_id, extension.method) &&
      !isProviderExtensionDismissed(threadId, extension),
  );
  const Surface = top
    ? getProviderSurface(top.provider_id, top.method)
    : undefined;

  const close = () => {
    if (top) dismissProviderExtension(threadId, top);
  };

  const respond = (response: unknown) => {
    if (!top?.request_id || !onRespond) return;
    const requestId = top.request_id;
    setResponseError(null);
    void onRespond(requestId, response)
      .then(() => dequeueProviderExtension(threadId, requestId))
      .catch((error: unknown) => {
        setResponseError(
          error instanceof Error ? error.message : String(error),
        );
      });
  };

  const active = Boolean(top && Surface && !trapped);
  useFocusTrap({
    active,
    containerRef,
    tier: "popover",
    onEscape: close,
    initialFocus: "first",
  });

  if (!top || !Surface || trapped) return null;

  return (
    <Popover open onClose={close} anchorRef={anchorRef} className={className}>
      <div ref={containerRef}>
        <Surface
          providerId={top.provider_id}
          method={top.method}
          params={top.params}
          requestId={top.request_id}
          onAction={respond}
        />
        {responseError && (
          <p
            role="alert"
            className="mt-sm text-body-sm text-(--tethys-status-danger)"
          >
            {responseError}
          </p>
        )}
      </div>
    </Popover>
  );
}

/** Pending count doubles as the affordance to reopen a dismissed request. */
export function ProviderPendingCount({ threadId }: { threadId: string }) {
  const count = usePendingExtensions(threadId).length;
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => reopenProviderExtensions(threadId)}
      aria-label="Reopen provider requests"
      data-testid="provider-pending-count"
      className="ml-1 font-mono text-mono-micro text-(--tethys-status-warning)"
    >
      {count}
    </button>
  );
}
