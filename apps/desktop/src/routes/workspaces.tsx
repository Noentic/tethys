import {
  GitBranch,
  GridSquare,
  ListUnordered,
  MagnifyingGlass,
  Plus,
  Shield,
  Star,
  TerminalWindow,
  Warning,
} from "@nebutra/icons";
import {
  Button,
  Drawer,
  EmptyState,
  IconButton,
  ModalDialog,
  StatusDot,
} from "@tethys/ui";
import type React from "react";
import { useState } from "react";

export interface WorkspaceSession {
  id: string;
  branch: string;
  diffStat: string;
  turn: string;
  provider: "Claude Code" | "Codex" | "OpenCode" | "Gemini CLI";
  status: "running" | "waiting_approval" | "idle" | "error";
}

export type WorkspaceSourceKind =
  | "Git · GitHub"
  | "Git · GitLab"
  | "Git · local"
  | "Folder · no VCS";

export interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  sourceKind: WorkspaceSourceKind;
  isRemote?: boolean;
  needsAttention?: boolean;
  branch?: string;
  statusSummary: string;
  sessions: WorkspaceSession[];
  starred?: boolean;
  permissionMode?: "Supervised" | "Auto" | "YOLO";
}

const DEFAULT_WORKSPACES: WorkspaceItem[] = [
  {
    id: "tethys",
    name: "tethys",
    path: "~/Code/tethys",
    sourceKind: "Git · GitHub",
    isRemote: false,
    branch: "feat/m1.6-design-system-shell",
    statusSummary: "feat/m1.6-design-system-shell · 1 session",
    needsAttention: false,
    starred: true,
    permissionMode: "Supervised",
    sessions: [
      {
        id: "s-m16",
        branch: "feat/m1.6-design-system-shell",
        diffStat: "+34 -12",
        turn: "T8",
        provider: "Claude Code",
        status: "running",
      },
    ],
  },
];

export interface WorkspacesViewProps {
  onNavigate?: (route: string) => void;
}

export function WorkspacesView({ onNavigate }: WorkspacesViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [environmentFilter, setEnvironmentFilter] = useState<
    "local" | "remote"
  >("local");
  const [filterNeedsAttention, setFilterNeedsAttention] =
    useState<boolean>(false);
  const [sortOption, setSortOption] = useState<"recent" | "name" | "sessions">(
    "recent",
  );
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceItem | null>(null);
  const [peekDrawerOpen, setPeekDrawerOpen] = useState<boolean>(false);
  const [peekTab, setPeekTab] = useState<"sessions" | "approvals" | "trust">(
    "sessions",
  );
  const [trustDialogOpen, setTrustDialogOpen] = useState<boolean>(false);
  const [workspaces, setWorkspaces] =
    useState<WorkspaceItem[]>(DEFAULT_WORKSPACES);

  const attentionCount = workspaces.filter((w) => w.needsAttention).length;

  const filteredWorkspaces = workspaces
    .filter((ws) => {
      if (environmentFilter === "local" && ws.isRemote) return false;
      if (environmentFilter === "remote" && !ws.isRemote) return false;
      if (filterNeedsAttention && !ws.needsAttention) return false;
      if (
        searchQuery &&
        !ws.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !ws.path.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOption === "name") return a.name.localeCompare(b.name);
      if (sortOption === "sessions")
        return b.sessions.length - a.sessions.length;
      return 0; // recent order preserved
    });

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, starred: !w.starred } : w)),
    );
  };

  const handleOpenWorkspace = (ws: WorkspaceItem) => {
    setSelectedWorkspace(ws);
    setPeekTab(ws.needsAttention ? "approvals" : "sessions");
    setPeekDrawerOpen(true);
  };

  const handleInitGit = (e: React.MouseEvent, wsId: string) => {
    e.stopPropagation();
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === wsId
          ? {
              ...w,
              sourceKind: "Git · local",
              branch: "main",
              statusSummary: "main · idle",
            }
          : w,
      ),
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-(--tethys-canvas)">
      {/* Top Header Bar */}
      <section
        aria-label="Workspaces toolbar"
        className="flex h-16 items-center justify-between border-b border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-8 shrink-0 gap-4"
      >
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight text-(--tethys-text-primary)">
            Workspaces
          </h1>

          {/* Local vs Remote Segmented Control */}
          <div className="flex rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-panel) p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setEnvironmentFilter("local")}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                environmentFilter === "local"
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) shadow-sm"
                  : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
              }`}
            >
              Local
            </button>
            <button
              type="button"
              onClick={() => setEnvironmentFilter("remote")}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                environmentFilter === "remote"
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) shadow-sm"
                  : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
              }`}
            >
              Remote
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search bar with Ctrl+K pill */}
          <div className="relative flex items-center">
            <MagnifyingGlass className="absolute left-3 size-3.5 text-(--tethys-text-muted)" />
            <input
              type="text"
              aria-label="Search workspaces"
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-60 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-panel) pl-9 pr-12 text-xs text-(--tethys-text-primary) placeholder:text-(--tethys-text-muted) focus:border-(--tethys-hairline-strong) focus:outline-none transition-colors"
            />
            <kbd className="absolute right-2.5 font-mono text-[10px] text-(--tethys-text-muted) bg-(--tethys-surface-elevated) px-1 rounded border border-(--tethys-hairline)">
              Ctrl+K
            </kbd>
          </div>

          {/* Needs Attention Filter Chip */}
          {attentionCount > 0 && (
            <button
              type="button"
              onClick={() => setFilterNeedsAttention((prev) => !prev)}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                filterNeedsAttention
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                  : "border-(--tethys-hairline) bg-(--tethys-surface-panel) text-(--tethys-text-secondary) hover:text-(--tethys-text-primary)"
              }`}
            >
              <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Needs attention ({attentionCount})</span>
            </button>
          )}

          {/* Primary + New button */}
          <Button
            size="sm"
            onClick={() => setTrustDialogOpen(true)}
            className="bg-(--tethys-accent-primary) hover:opacity-90 text-white font-medium rounded-lg px-3.5 py-1 text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>New Workspace</span>
          </Button>
        </div>
      </section>

      {/* Sub-bar: Count, Sort dropdown, and View Mode Toggles */}
      <div className="flex h-11 items-center justify-between border-b border-(--tethys-hairline) px-8 shrink-0 text-xs text-(--tethys-text-muted)">
        <div className="flex items-center gap-4">
          <span className="font-medium text-(--tethys-text-secondary)">
            {filteredWorkspaces.length} Workspaces
          </span>

          <div className="flex items-center gap-1">
            <span className="text-(--tethys-text-muted)">Sort:</span>
            <select
              aria-label="Sort workspaces"
              value={sortOption}
              onChange={(e) =>
                setSortOption(e.target.value as "recent" | "name" | "sessions")
              }
              className="bg-transparent border-0 text-(--tethys-text-secondary) hover:text-(--tethys-text-primary) text-xs outline-none cursor-pointer"
            >
              <option value="recent">Recent Activity</option>
              <option value="name">Alphabetical</option>
              <option value="sessions">Active Sessions</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            size="compact"
            label="Grid view"
            onClick={() => setViewMode("grid")}
            className={
              viewMode === "grid"
                ? "text-(--tethys-text-primary) bg-(--tethys-surface-active)"
                : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
            }
          >
            <GridSquare className="size-4" />
          </IconButton>

          <IconButton
            size="compact"
            label="List view"
            onClick={() => setViewMode("list")}
            className={
              viewMode === "list"
                ? "text-(--tethys-text-primary) bg-(--tethys-surface-active)"
                : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
            }
          >
            <ListUnordered className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* Main Grid / Catalog Area */}
      <main
        aria-label="Workspace Catalog"
        className="flex-1 overflow-y-auto p-8"
      >
        <h2 className="sr-only">Workspace List</h2>
        {filteredWorkspaces.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="No workspaces match the filter"
              description="Clear search or environment filters to view all configured repositories."
              action={
                <Button
                  size="sm"
                  className="bg-(--tethys-accent-primary) text-white"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterNeedsAttention(false);
                    setEnvironmentFilter("local");
                  }}
                >
                  Reset Filters
                </Button>
              }
            />
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                : "flex flex-col gap-2.5 max-w-4xl"
            }
          >
            {filteredWorkspaces.map((ws) => (
              <div
                key={ws.id}
                className={`group flex flex-col justify-between h-52 rounded-xl border bg-(--tethys-surface-panel) p-4 transition-all hover:border-(--tethys-hairline-strong) hover:bg-(--tethys-surface-card-hover) hover:shadow-lg relative ${
                  ws.needsAttention
                    ? "border-amber-500/40"
                    : "border-(--tethys-hairline)"
                }`}
              >
                {/* Card Top: Source badge + Name + Star */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 truncate">
                    <span className="rounded bg-(--tethys-surface-elevated) px-1.5 py-0.5 font-mono text-[10px] text-(--tethys-text-muted) border border-(--tethys-hairline) shrink-0">
                      {ws.sourceKind}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenWorkspace(ws)}
                      className="text-sm font-semibold text-(--tethys-text-primary) hover:underline truncate outline-none text-left"
                    >
                      {ws.name}
                    </button>
                    {ws.needsAttention && (
                      <span
                        title="1 session awaiting your approval"
                        className="flex size-2 rounded-full bg-amber-400 animate-pulse shrink-0"
                      />
                    )}
                  </div>

                  <button
                    type="button"
                    aria-label={
                      ws.starred ? "Unstar workspace" : "Star workspace"
                    }
                    onClick={(e) => toggleStar(e, ws.id)}
                    className="p-1 rounded text-(--tethys-text-muted) hover:text-amber-400 transition-colors shrink-0"
                  >
                    <Star
                      className={`size-3.5 ${
                        ws.starred ? "text-amber-400 fill-amber-400" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Path line */}
                <span className="font-mono text-[11px] text-(--tethys-text-muted) truncate">
                  {ws.path}
                </span>

                {/* Center Canvas: Git topology or Session chips or Single-node */}
                <div className="flex-1 my-2 rounded-lg bg-(--tethys-surface-elevated) border border-(--tethys-hairline) p-2.5 flex flex-col justify-center gap-1.5 overflow-hidden">
                  {ws.sourceKind === "Folder · no VCS" ? (
                    <div className="flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2 text-xs text-(--tethys-text-muted)">
                        <TerminalWindow className="size-4 opacity-70" />
                        <span className="text-[11px]">
                          Single-session folder
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleInitGit(e, ws.id)}
                        className="rounded bg-(--tethys-surface-active) px-2 py-0.5 text-[11px] font-medium text-(--tethys-accent-focus) hover:underline transition-colors"
                      >
                        Initialize git →
                      </button>
                    </div>
                  ) : ws.sessions.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {ws.sessions.map((sess) => (
                        <button
                          key={sess.id}
                          type="button"
                          onClick={() => onNavigate?.(`/thread/${sess.id}`)}
                          className={`flex items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-colors hover:border-(--tethys-hairline-strong) ${
                            sess.status === "waiting_approval"
                              ? "border-amber-500/40 bg-amber-500/5 text-amber-300"
                              : "border-(--tethys-hairline) bg-(--tethys-surface-panel) text-(--tethys-text-primary)"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <GitBranch className="size-3 text-(--tethys-text-muted) shrink-0" />
                            <span className="font-mono text-[11px] font-medium truncate">
                              {sess.branch}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-(--tethys-text-muted) shrink-0">
                            <span className="font-mono">{sess.diffStat}</span>
                            <span className="rounded bg-(--tethys-surface-elevated) px-1 py-0.2 font-mono">
                              {sess.turn}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-xs text-(--tethys-text-muted)">
                      <GitBranch className="size-3.5 opacity-50" />
                      <span className="text-[11px]">
                        Trunk main · ready for new thread
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Footer: Status dot + summary + New Thread action */}
                <div className="flex items-center justify-between pt-1 text-[11px] text-(--tethys-text-muted)">
                  <div className="flex items-center gap-1.5">
                    <StatusDot
                      status={
                        ws.needsAttention
                          ? "warning"
                          : ws.sessions.length > 0
                            ? "healthy"
                            : "idle"
                      }
                    />
                    <span className="truncate">{ws.statusSummary}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate?.("/thread/new")}
                    className="flex items-center gap-1 text-[11px] font-medium text-(--tethys-accent-focus) hover:underline"
                  >
                    <Plus className="size-3" />
                    <span>Thread</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Workspace Peek Drawer (380px) */}
      <Drawer
        open={peekDrawerOpen}
        onClose={() => setPeekDrawerOpen(false)}
        title={selectedWorkspace?.name ?? "Workspace Details"}
        side="right"
        width="w-[380px]"
      >
        {selectedWorkspace && (
          <div className="flex h-full flex-col">
            <div className="border-b border-(--tethys-hairline) p-4 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-(--tethys-text-muted)">
                  {selectedWorkspace.sourceKind}
                </span>
                <span className="font-bold text-sm text-(--tethys-text-primary)">
                  {selectedWorkspace.name}
                </span>
              </div>
              <span className="font-mono text-xs text-(--tethys-text-secondary)">
                {selectedWorkspace.path}
              </span>
            </div>

            <div className="flex border-b border-(--tethys-hairline) px-3 pt-2 gap-2">
              <button
                type="button"
                onClick={() => setPeekTab("sessions")}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
                  peekTab === "sessions"
                    ? "border-b-2 border-(--tethys-accent-focus) text-(--tethys-text-primary)"
                    : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
                }`}
              >
                Sessions ({selectedWorkspace.sessions.length})
              </button>
              <button
                type="button"
                onClick={() => setPeekTab("approvals")}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
                  peekTab === "approvals"
                    ? "border-b-2 border-(--tethys-accent-focus) text-(--tethys-text-primary)"
                    : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
                }`}
              >
                <span>Approvals</span>
                {selectedWorkspace.needsAttention && (
                  <span className="size-1.5 rounded-full bg-amber-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPeekTab("trust")}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
                  peekTab === "trust"
                    ? "border-b-2 border-(--tethys-accent-focus) text-(--tethys-text-primary)"
                    : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
                }`}
              >
                Policy
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              {peekTab === "sessions" ? (
                selectedWorkspace.sessions.length === 0 ? (
                  <div className="py-12 text-center text-xs text-(--tethys-text-muted)">
                    No active sessions running in this workspace.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {selectedWorkspace.sessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-(--tethys-text-primary)">
                            {sess.branch}
                          </span>
                          <span className="text-[10px] text-(--tethys-text-muted)">
                            {sess.provider}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-(--tethys-text-secondary)">
                          <span>Turn {sess.turn}</span>
                          <span className="font-mono">{sess.diffStat}</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setPeekDrawerOpen(false);
                            onNavigate?.(`/thread/${sess.id}`);
                          }}
                          className="mt-1 text-xs self-end"
                        >
                          Open Session →
                        </Button>
                      </div>
                    ))}
                  </div>
                )
              ) : peekTab === "approvals" ? (
                selectedWorkspace.needsAttention ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                      <Warning className="size-4" />
                      <span>Permission Request: session s-m16</span>
                    </div>
                    <p className="text-xs text-(--tethys-text-secondary) leading-relaxed">
                      Provider <strong>Claude Code</strong> requests permission
                      to edit{" "}
                      <code className="font-mono text-[11px] bg-(--tethys-surface-elevated) px-1 rounded">
                        apps/desktop/src/routes/workspaces.tsx
                      </code>
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        className="text-xs bg-(--tethys-accent-primary) text-white"
                      >
                        Allow Once
                      </Button>
                      <Button size="sm" variant="secondary" className="text-xs">
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-(--tethys-text-muted)">
                    No pending approvals for this workspace.
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-4 text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-(--tethys-text-primary)">
                      Permission Mode
                    </span>
                    <span className="text-(--tethys-text-muted)">
                      Current policy:{" "}
                      <strong>
                        {selectedWorkspace.permissionMode ?? "Supervised"}
                      </strong>
                    </span>
                    <p className="text-[11px] text-(--tethys-text-secondary) mt-1">
                      Supervised mode requests explicit confirmation for write
                      tool calls.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Add Workspace Trust Dialog (§2.1) */}
      <ModalDialog
        open={trustDialogOpen}
        onClose={() => setTrustDialogOpen(false)}
        title="Trust this workspace folder?"
      >
        <div className="flex flex-col gap-4 p-4 text-xs text-(--tethys-text-secondary)">
          <div className="flex items-center gap-2 text-(--tethys-status-warning)">
            <Shield className="size-5 shrink-0" />
            <span className="font-medium">
              Coding agents will be able to read, edit, and run commands inside
              this folder.
            </span>
          </div>

          <div className="rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) p-3 font-mono text-[11px]">
            Target: ~/Code/new-project
          </div>

          <p className="leading-relaxed">
            Tethys creates an isolated git worktree per thread so parallel
            agents cannot collide.
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-(--tethys-hairline)">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTrustDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-(--tethys-accent-primary) text-white"
              onClick={() => setTrustDialogOpen(false)}
            >
              Trust & Add Workspace
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
