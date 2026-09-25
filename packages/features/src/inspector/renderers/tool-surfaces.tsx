//! How each Tethys tool surface renders (DESIGN.md `tool-accordion`): its icon,
//! its body, and whether it opens on its own. Providers map their tools onto
//! these surfaces (the adapter's `surface`, else `surfaceOf`), so a new
//! Provider adds no rendering and a new surface is one entry here plus its text
//! in `tool-view.ts` — both records are exhaustive, so neither can be skipped.

import {
  ArrowLeftRight,
  Brain,
  Download,
  FileText,
  Globe,
  ListUnordered,
  MagnifyingGlass,
  Pencil,
  Question,
  Robot,
  Servers,
  Terminal,
  Trash,
  Wrench,
} from "@nebutra/icons";
import type { DiffFileDetail, ToolSurface } from "@tethys/bindings";
import type { ToolCallEntry } from "@tethys/state";
import { cn } from "@tethys/ui";
import type React from "react";
import { surfaceOf } from "../tool-view";
import {
  EditBody,
  McpBody,
  OutputBody,
  PayloadBody,
  QuestionBody,
  RawPayload,
  ShellBody,
  TodoBody,
} from "./tool-bodies";

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

interface BodyProps {
  entry: ToolCallEntry;
  /** The call's file changes (`toolDiffs`), read once by the card. */
  diffs: DiffFileDetail[];
  onOpenChanges?: () => void;
  onOpenLocation?: (path: string, line: number | null) => void;
}

interface SurfaceView {
  icon: IconComponent;
  Body: (props: BodyProps) => React.ReactNode;
  /** Whether the body already shows the payload, so `Raw` would repeat it. */
  showsPayload: boolean;
  /** Whether a call opens itself; everything but an edit's diff starts closed. */
  opens: (entry: ToolCallEntry, diffs: DiffFileDetail[]) => boolean;
}

const closed = () => false;

const SURFACE_VIEW: Record<ToolSurface, SurfaceView> = {
  read: {
    icon: FileText,
    Body: ({ entry }) => <OutputBody entry={entry} />,
    showsPayload: false,
    opens: closed,
  },
  edit: {
    icon: Pencil,
    Body: ({ entry, diffs, onOpenChanges }) => (
      <EditBody entry={entry} diffs={diffs} onOpenChanges={onOpenChanges} />
    ),
    showsPayload: false,
    opens: (_entry, diffs) => diffs.length > 0,
  },
  shell: {
    icon: Terminal,
    Body: ({ entry }) => <ShellBody entry={entry} />,
    showsPayload: false,
    opens: closed,
  },
  search: {
    icon: MagnifyingGlass,
    Body: ({ entry, onOpenLocation }) => (
      <OutputBody entry={entry} onOpenLocation={onOpenLocation} />
    ),
    showsPayload: false,
    opens: closed,
  },
  web_fetch: {
    icon: Download,
    Body: ({ entry }) => <OutputBody entry={entry} />,
    showsPayload: false,
    opens: closed,
  },
  web_search: {
    icon: Globe,
    Body: ({ entry }) => <OutputBody entry={entry} />,
    showsPayload: false,
    opens: closed,
  },
  mcp: {
    icon: Servers,
    Body: ({ entry }) => <McpBody entry={entry} />,
    showsPayload: false,
    opens: closed,
  },
  todo: {
    icon: ListUnordered,
    Body: ({ entry }) => <TodoBody entry={entry} />,
    showsPayload: false,
    opens: closed,
  },
  question: {
    icon: Question,
    Body: ({ entry }) => <QuestionBody entry={entry} />,
    showsPayload: false,
    opens: closed,
  },
  think: {
    icon: Brain,
    Body: ({ entry }) => <PayloadBody entry={entry} />,
    showsPayload: true,
    opens: closed,
  },
  subagent: {
    icon: Robot,
    Body: ({ entry }) => <PayloadBody entry={entry} />,
    showsPayload: true,
    opens: closed,
  },
  other: {
    icon: Wrench,
    Body: ({ entry }) => <PayloadBody entry={entry} />,
    showsPayload: true,
    opens: closed,
  },
};

/** A delete or a move is an edit, but reads as what it did. */
const EDIT_ICON: Partial<Record<string, IconComponent>> = {
  delete: Trash,
  move: ArrowLeftRight,
};

export function ToolSurfaceIcon({
  entry,
  className,
}: {
  entry: ToolCallEntry;
  className?: string;
}) {
  const surface = surfaceOf(entry);
  const Icon =
    (surface === "edit" && EDIT_ICON[entry.toolKind ?? ""]) ||
    SURFACE_VIEW[surface].icon;
  return (
    <Icon
      aria-hidden="true"
      data-tool-surface={surface}
      className={cn("size-3.5 shrink-0", className)}
    />
  );
}

/** Whether a call opens itself: a failure always does (P2), else its surface decides. */
export function opensByDefault(
  entry: ToolCallEntry,
  diffs: DiffFileDetail[],
): boolean {
  return (
    entry.status === "Failed" ||
    SURFACE_VIEW[surfaceOf(entry)].opens(entry, diffs)
  );
}

export function ToolBody(props: BodyProps) {
  const view = SURFACE_VIEW[surfaceOf(props.entry)];
  return (
    <div className="flex flex-col gap-sm">
      <view.Body {...props} />
      {!view.showsPayload && <RawPayload entry={props.entry} />}
    </div>
  );
}
