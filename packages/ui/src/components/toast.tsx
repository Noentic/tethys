import { Cross } from "@nebutra/icons";
import { cn } from "../lib/utils";

export interface ToastProps {
  id: string;
  title?: string;
  message: string;
  variant?: "default" | "warning" | "danger" | "success";
  onDismiss?: (id: string) => void;
  className?: string;
}

export function Toast({
  id,
  title,
  message,
  variant = "default",
  onDismiss,
  className,
}: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "edge-lit flex w-full max-w-96 items-start gap-md rounded-lg border p-md transition-colors duration-200",
        "border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) text-(--tethys-text-primary)",
        variant === "danger" && "border-(--tethys-status-danger)",
        variant === "warning" && "border-(--tethys-status-warning)",
        variant === "success" && "border-(--tethys-status-success)",
        className,
      )}
    >
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
