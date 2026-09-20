import type React from "react";
import { cn } from "../lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-2xl text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center text-(--tethys-text-muted) [&>svg]:h-6 [&>svg]:w-6">
          {icon}
        </div>
      )}
      <h3 className="text-heading-md text-(--tethys-text-primary)">{title}</h3>
      {description && (
        <p className="mt-1 max-w-96 text-body-sm text-(--tethys-text-muted)">
          {description}
        </p>
      )}
      {action && <div className="mt-lg">{action}</div>}
    </div>
  );
}
