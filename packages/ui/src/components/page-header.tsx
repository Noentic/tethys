import type React from "react";
import { cn } from "../lib/utils";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  /** Path above the title, e.g. `Settings / Providers`. */
  breadcrumb?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

// The one view-title pattern: heading-lg over a muted body-sm description, with an
// optional trailing action cluster. Every route header goes through this.
export function PageHeader({
  title,
  breadcrumb,
  description,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-lg", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {breadcrumb && (
          <span className="text-label-sm text-(--tethys-text-muted)">
            {breadcrumb}
          </span>
        )}
        <h1 className="text-heading-lg text-(--tethys-text-primary)">
          {title}
        </h1>
        {description && (
          <p className="text-body-sm text-(--tethys-text-muted)">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-sm">{actions}</div>
      )}
    </div>
  );
}
