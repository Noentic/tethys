import { GridSquare, ListUnordered, Plus } from "@nebutra/icons";
import {
  Button,
  Chip,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Skeleton,
} from "@tethys/ui";
import { useState } from "react";

export interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  isRemote?: boolean;
  needsAttention?: boolean;
  activeSessionCount?: number;
}

export function WorkspacesView() {
  const [filterMode, setFilterMode] = useState<string>("local");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [attentionOnly, setAttentionOnly] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceItem | null>(null);
  const [peekDrawerOpen, setPeekDrawerOpen] = useState<boolean>(false);
  const [peekTab, setPeekTab] = useState<string>("sessions");
  const [loading] = useState<boolean>(false);

  // Shell placeholder items or empty
  const [workspaces] = useState<WorkspaceItem[]>([]);

  const filteredWorkspaces = workspaces.filter((ws) => {
    if (filterMode === "local" && ws.isRemote) return false;
    if (filterMode === "remote" && !ws.isRemote) return false;
    if (attentionOnly && !ws.needsAttention) return false;
    if (
      searchQuery &&
      !ws.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const attentionCount = workspaces.filter((w) => w.needsAttention).length;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-(--tethys-canvas)">
      {/* Top Bar */}
      <section
        aria-label="Workspaces Toolbar"
        className="flex h-14 items-center justify-between border-b border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-6 shrink-0 gap-4"
      >
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-(--tethys-text-primary)">
            Workspaces
          </h1>

          <SegmentedControl
            options={[
              { value: "local", label: "Local" },
              { value: "remote", label: "Remote" },
            ]}
            value={filterMode}
            onChange={setFilterMode}
          />

          <div className="w-56">
            <Input
              placeholder="Filter workspaces..."
              className="h-8 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Chip
            interactive
            onClick={() => setAttentionOnly((prev) => !prev)}
            className={
              attentionOnly
                ? "bg-[rgba(245,158,11,0.15)] text-(--tethys-status-warning) font-semibold"
                : ""
            }
          >
            Needs attention ({attentionCount})
          </Chip>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            size="compact"
            label="Grid view"
            onClick={() => setViewMode("grid")}
            className={
              viewMode === "grid"
                ? "text-(--tethys-text-primary) bg-(--tethys-surface-active)"
                : ""
            }
          >
            <GridSquare className="h-4 w-4" />
          </IconButton>

          <IconButton
            size="compact"
            label="List view"
            onClick={() => setViewMode("list")}
            className={
              viewMode === "list"
                ? "text-(--tethys-text-primary) bg-(--tethys-surface-active)"
                : ""
            }
          >
            <ListUnordered className="h-4 w-4" />
          </IconButton>

          <Button size="sm" variant="primary">
            <Plus className="mr-1 h-3.5 w-3.5" />
            <span>New Workspace</span>
          </Button>
        </div>
      </section>

      {/* Main Grid / List Area */}
      <main
        aria-label="Workspace Catalog"
        className="flex-1 overflow-y-auto p-6"
      >
        <h2 className="sr-only">Workspace List</h2>
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-card) p-4">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-52" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-card) p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-48" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          </div>
        ) : filteredWorkspaces.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="No workspaces found"
              description="Open a local directory or connect a remote repository to begin."
              action={
                <Button size="sm" variant="secondary" onClick={() => {}}>
                  Open Workspace
                </Button>
              }
            />
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4"
                : "flex flex-col gap-2"
            }
          >
            {filteredWorkspaces.map((ws) => (
              <button
                type="button"
                key={ws.id}
                onClick={() => {
                  setSelectedWorkspace(ws);
                  setPeekDrawerOpen(true);
                }}
                className="group flex flex-col gap-2 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-card) p-4 transition-all hover:border-(--tethys-hairline-strong) hover:bg-(--tethys-surface-card-hover) cursor-pointer outline-none text-left w-full focus-visible:ring-1 focus-visible:ring-(--tethys-accent-focus)"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-(--tethys-text-primary)">
                    {ws.name}
                  </span>
                  {ws.needsAttention && (
                    <span className="rounded bg-[rgba(245,158,11,0.15)] px-1.5 py-0.5 text-[10px] font-medium text-(--tethys-status-warning)">
                      Needs Attention
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-(--tethys-text-muted) truncate">
                  {ws.path}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Modeless Peek-Drawer Shell (380px, Sessions/Approvals tabs) - Filled by M1.16 */}
      <Drawer
        open={peekDrawerOpen}
        onClose={() => setPeekDrawerOpen(false)}
        title={selectedWorkspace?.name ?? "Workspace Peek"}
        side="right"
        width="w-[380px]"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-(--tethys-hairline) p-3">
            <SegmentedControl
              options={[
                { value: "sessions", label: "Sessions" },
                { value: "approvals", label: "Approvals" },
              ]}
              value={peekTab}
              onChange={setPeekTab}
            />
          </div>

          <div className="flex-1 p-4">
            {peekTab === "sessions" ? (
              <div className="py-8 text-center text-xs text-(--tethys-text-muted)">
                Workspace sessions and worktree topology will appear here.
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-(--tethys-text-muted)">
                Pending workspace approval requests will appear here.
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
