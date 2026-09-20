import { Button, cn } from "@tethys/ui";

/**
 * The one treatment for "this Provider cannot do this" (DESIGN.md
 * `provider-capability-notice`). Muted, never an error colour — an absent
 * capability is a fact, not a failure.
 */
export function ProviderCapabilityNotice({
  provider,
  capability,
  message,
  action,
  onAction,
  className,
}: {
  provider: string;
  capability: string;
  message?: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <p
      data-testid="provider-capability-notice"
      className={cn(
        "py-sm text-label-sm text-(--tethys-text-muted)",
        className,
      )}
    >
      {message ?? `${provider} cannot ${capability}.`}
      {action && (
        <Button size="sm" variant="ghost" className="ml-1" onClick={onAction}>
          {action}
        </Button>
      )}
    </p>
  );
}
