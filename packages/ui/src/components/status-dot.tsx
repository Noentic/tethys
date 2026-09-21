import type React from "react";
import { cn } from "../lib/utils";
import {
  getSessionStateInfo,
  type StatusMotion,
  statusMotionClass,
} from "../session-state";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
  inline?: boolean;
  /** Override the state's own liveness. Omit to follow the state. */
  pulse?: boolean;
  label?: string;
}

/**
 * The state marker (DESIGN.md status-dot). A crisp disc or ring carries the hue
 * and shape; a soft halo behind it carries the liveness, so `running` and
 * `awaiting` read as alive without the marker itself ever going blurry. States
 * that have stopped do not animate at all (motion.stateMotion).
 */
export function StatusDot({
  status,
  inline = false,
  pulse: explicitPulse,
  label: explicitLabel,
  className,
  ...props
}: StatusDotProps) {
  const info = getSessionStateInfo(status);
  const breathes = explicitPulse ?? info.motion !== "none";
  const motion: StatusMotion = breathes
    ? info.motion === "none"
      ? "breathe"
      : info.motion
    : "none";
  const label = explicitLabel ?? info.label;
  const style =
    info.shape === "ring"
      ? {
          backgroundColor: "transparent",
          border: `${inline ? 1.5 : 2}px solid ${info.colorVar}`,
        }
      : { backgroundColor: info.colorVar };

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        inline ? "h-2.5 w-2.5" : "h-3 w-3",
        className,
      )}
    >
      {motion !== "none" && (
        <span
          aria-hidden="true"
          data-testid="status-halo"
          className={cn(
            "absolute inset-0 rounded-full",
            statusMotionClass(motion),
          )}
          style={{
            backgroundColor: `color-mix(in oklab, ${info.colorVar} 20%, transparent)`,
          }}
        />
      )}
      <span
        role="status"
        aria-label={label}
        title={label}
        className={cn(
          "relative inline-block shrink-0 rounded-full transition-colors duration-150",
          inline ? "h-1.5 w-1.5" : "h-2 w-2",
          info.className,
        )}
        style={style}
        {...props}
      />
    </span>
  );
}
