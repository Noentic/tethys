import {
  FolderClosed,
  GitBranch,
  LogoGithub,
  LogoGitlab,
} from "@nebutra/icons";
import type React from "react";
import { cn } from "../lib/utils";
import { Badge } from "./badge";

/**
 * Version control state of a workspace root, mirroring the schema `Vcs` union.
 * Kept structural so `@tethys/ui` stays free of generated bindings; the
 * schema-to-badge mapper owns the exhaustive switch.
 */
export type WorkspaceVcs =
  | { kind: "none" }
  | { kind: "git-local" }
  | { kind: "git-remote"; host: "github" | "gitlab" | "other" };

export interface WorkspaceSourceBadgeProps {
  vcs: WorkspaceVcs;
  /** Appends the secondary `Remote` tag for an SSH/container host. */
  remote?: boolean;
  className?: string;
}

interface SourcePresentation {
  label: string;
  Icon: React.ElementType;
}

function present(vcs: WorkspaceVcs): SourcePresentation {
  if (vcs.kind === "none") {
    return { label: "Folder · no VCS", Icon: FolderClosed };
  }
  if (vcs.kind === "git-local") {
    return { label: "Git · local", Icon: GitBranch };
  }
  switch (vcs.host) {
    case "github":
      return { label: "Git · GitHub", Icon: LogoGithub };
    case "gitlab":
      return { label: "Git · GitLab", Icon: LogoGitlab };
    default:
      return { label: "Git · remote", Icon: GitBranch };
  }
}

/**
 * `workspace-source-badge` (DESIGN.md) — reports where an existing folder's git
 * remote points. Never an entry point for adding a workspace.
 */
export function WorkspaceSourceBadge({
  vcs,
  remote = false,
  className,
}: WorkspaceSourceBadgeProps) {
  const { label, Icon } = present(vcs);

  return (
    <Badge
      variant="muted"
      size="sm"
      data-testid="workspace-source-badge"
      className={cn("gap-1 rounded-xs", className)}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
      {remote && <span className="text-(--tethys-text-muted)">Remote</span>}
    </Badge>
  );
}
