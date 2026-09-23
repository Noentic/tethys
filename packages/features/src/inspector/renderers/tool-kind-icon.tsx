//! The icon per ACP tool kind, shared by the tool accordion and the tool-run
//! group so a read, an edit, or a command reads the same wherever it appears.

import {
  ArrowLeftRight,
  Brain,
  ChevronRight,
  Download,
  FileText,
  MagnifyingGlass,
  Pencil,
  RefreshClockwise,
  Terminal,
  Trash,
  Wrench,
} from "@nebutra/icons";
import { cn } from "@tethys/ui";
import type React from "react";

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const TOOL_KIND_ICON: Record<string, IconComponent> = {
  read: FileText,
  edit: Pencil,
  delete: Trash,
  move: ArrowLeftRight,
  search: MagnifyingGlass,
  execute: Terminal,
  think: Brain,
  fetch: Download,
  switch_mode: RefreshClockwise,
  other: Wrench,
};

export function ToolKindIcon({
  kind,
  className,
}: {
  kind: string | null | undefined;
  className?: string;
}) {
  const Icon = TOOL_KIND_ICON[kind ?? "other"] ?? Wrench;
  return (
    <Icon
      aria-hidden="true"
      data-tool-kind={kind ?? "other"}
      className={cn("size-3.5 shrink-0", className)}
    />
  );
}

/** The disclosure chevron: points right when collapsed, down when open. */
export function DisclosureChevron({
  expanded,
  className,
}: {
  expanded: boolean;
  className?: string;
}) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-150",
        expanded && "rotate-90",
        className,
      )}
    />
  );
}
