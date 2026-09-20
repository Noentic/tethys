import type React from "react";
import { cn } from "../lib/utils";
import { getSessionStateInfo } from "../session-state";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
  inline?: boolean;
  pulse?: boolean;
  label?: string;
}

export function StatusDot({
  status,
  inline = false,
  pulse: explicitPulse,
  label: explicitLabel,
  className,
  ...props
}: StatusDotProps) {
  const info = getSessionStateInfo(status);
  const shouldPulse = explicitPulse ?? info.pulse;
  const label = explicitLabel ?? info.label;

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn(
        "inline-block shrink-0 rounded-full transition-colors duration-150",
        inline ? "h-1.5 w-1.5" : "h-2 w-2",
        info.className,
        shouldPulse && "motion-safe:animate-pulse",
        className,
      )}
      style={{
        backgroundColor: info.colorVar,
      }}
      {...props}
    />
  );
}
