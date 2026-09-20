import type React from "react";
import { cn } from "../lib/utils";
import { Badge } from "./badge";

export interface ProtocolPillProps {
  /** Free text: `ACP v2`, `Early Access`, or an adapter name. */
  children: React.ReactNode;
  className?: string;
}

/**
 * `protocol-pill` (DESIGN.md) — `surface-hover` fill, `text-secondary`,
 * `label-sm`, `rounded-xs`, `2px 6px`. Takes free text, because spec §5.2 puts
 * a protocol, a maturity tag and an adapter name on one row and only the
 * protocol is a closed set.
 */
export function ProtocolPill({ children, className }: ProtocolPillProps) {
  return (
    <Badge
      size="sm"
      data-testid="protocol-pill"
      className={cn("rounded-xs", className)}
    >
      {children}
    </Badge>
  );
}
