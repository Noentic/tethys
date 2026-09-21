import {
  CheckCircleFill,
  Cross,
  CrossCircleFill,
  WarningFill,
} from "@nebutra/icons";
import { cn } from "../lib/utils";

export interface ToastProps {
  id: string;
  title?: string;
  message: string;
  variant?: "default" | "warning" | "danger" | "success";
  onDismiss?: (id: string) => void;
  className?: string;
}

// A state is carried by an icon and a 2px left rule, not by the perimeter: the
// border stays the neutral Level 4 hairline on every side (DESIGN.md State
// colour). The icon means a state is never hue alone.
const STATE_TREATMENT = {
  danger: {
    rule: "border-l-(--tethys-status-danger)",
    icon: CrossCircleFill,
    iconColor: "text-(--tethys-status-danger)",
  },
  warning: {
    rule: "border-l-(--tethys-status-warning)",
    icon: WarningFill,
    iconColor: "text-(--tethys-status-warning)",
  },
  success: {
    rule: "border-l-(--tethys-status-success)",
    icon: CheckCircleFill,
    iconColor: "text-(--tethys-status-success)",
  },
} as const;

export function Toast({
  id,
  title,
  message,
  variant = "default",
  onDismiss,
  className,
}: ToastProps) {
  const treatment =
    variant === "default" ? undefined : STATE_TREATMENT[variant];
  const StateIcon = treatment?.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "edge-lit flex w-full max-w-96 items-start gap-md rounded-lg border p-md transition-colors duration-200",
        "border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) text-(--tethys-text-primary)",
        treatment && ["border-l-2", treatment.rule],
        className,
      )}
    >
      {StateIcon && (
        <StateIcon
          data-testid="toast-icon"
          aria-hidden="true"
          className={cn("mt-0.5 size-4 shrink-0", treatment.iconColor)}
        />
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="text-label-md text-(--tethys-text-primary)">
            {title}
          </h4>
        )}
        <p className="mt-0.5 text-body-sm text-(--tethys-text-secondary)">
          {message}
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(id)}
          aria-label="Dismiss notification"
          className="focus-ring -mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-sm text-(--tethys-text-muted) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
        >
          <Cross className="size-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
