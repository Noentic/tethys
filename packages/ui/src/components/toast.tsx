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
        "flex w-full max-w-sm items-start gap-3 rounded-lg border p-3.5 shadow-none transition-all duration-200",
        "bg-(--tethys-surface-elevated) border-(--tethys-hairline-strong) text-(--tethys-text-primary)",
        variant === "danger" &&
          "border-(--tethys-status-danger) bg-(--tethys-surface-elevated)",
        variant === "warning" &&
          "border-(--tethys-status-warning) bg-(--tethys-surface-elevated)",
        variant === "success" &&
          "border-(--tethys-status-success) bg-(--tethys-surface-elevated)",
        className,
      )}
    >
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="text-xs font-semibold text-(--tethys-text-primary)">
            {title}
          </h4>
        )}
        <p className="mt-0.5 text-xs text-(--tethys-text-secondary)">
          {message}
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(id)}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 flex h-5 w-5 items-center justify-center rounded text-(--tethys-text-muted) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
        >
          ×
        </button>
      )}
    </div>
  );
}
