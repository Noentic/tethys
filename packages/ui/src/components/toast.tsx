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
        "bg-[var(--tethys-surface-elevated)] border-[var(--tethys-hairline-strong)] text-[var(--tethys-text-primary)]",
        variant === "danger" &&
          "border-[var(--tethys-status-danger)] bg-[var(--tethys-surface-elevated)]",
        variant === "warning" &&
          "border-[var(--tethys-status-warning)] bg-[var(--tethys-surface-elevated)]",
        variant === "success" &&
          "border-[var(--tethys-status-success)] bg-[var(--tethys-surface-elevated)]",
        className,
      )}
    >
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className="text-xs font-semibold text-[var(--tethys-text-primary)]">
            {title}
          </h4>
        )}
        <p className="mt-0.5 text-xs text-[var(--tethys-text-secondary)]">
          {message}
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(id)}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 flex h-5 w-5 items-center justify-center rounded text-[var(--tethys-text-muted)] hover:bg-[var(--tethys-surface-hover)] hover:text-[var(--tethys-text-primary)]"
        >
          ×
        </button>
      )}
    </div>
  );
}
