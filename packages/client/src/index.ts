//! Transport-agnostic API client.
//!
//! Same hooks work against the in-process core (Tauri invoke) and — later —
//! a remote `tethysd` (WebSocket). This is the seam that keeps the webview
//! free of transport conditionals.

import type {
  BenchmarkConfig,
  BenchmarkResult,
  CheckpointInfo,
  CheckpointPhase,
  CheckpointResult,
  CommandInfo,
  CommitResult,
  ComposerReference,
  DiffFile,
  DiffFileDetail,
  DiffFileStatus,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffSource,
  DiffSummary,
  ExpandedCommand,
  HealthStatus,
  HostInfo,
  HunkRef,
  RestoreOutcome,
  RestorePolicy,
  RestoreTarget,
  SearchItem,
  SetupOutcome,
  StreamChunk,
  UndoCapture,
  WorkspaceGitConfig,
  WorkspaceId,
  WorktreeInfo,
  WorktreeSpec,
} from "@tethys/bindings";
import { agentNamespace } from "./namespaces/agent";
import { benchFlatHelpers } from "./namespaces/bench";
import { commandsNamespace } from "./namespaces/commands";
import { eventsNamespace } from "./namespaces/events";
import { gitNamespace } from "./namespaces/git";
import { hostNamespace } from "./namespaces/host";
import { mcpNamespace } from "./namespaces/mcp";
import { permissionNamespace } from "./namespaces/permission";
import { searchNamespace } from "./namespaces/search";
import { skillsNamespace } from "./namespaces/skills";
import { terminalNamespace } from "./namespaces/terminal";
import { threadNamespace } from "./namespaces/thread";
import { workspaceNamespace } from "./namespaces/workspace";
import { type ClientOptions, createCall, type Transport } from "./transport";

export type { ClientOptions, Transport } from "./transport";

export function createClient(options: ClientOptions = {}) {
  const transport: Transport = options.transport ?? "tauri";
  const call = createCall(transport);

  const client = {
    transport,

    // === namespaces ===
    host: hostNamespace(call),
    workspace: workspaceNamespace(call),
    agent: agentNamespace(call),
    thread: threadNamespace(call),
    events: eventsNamespace(call),
    permission: permissionNamespace(call),
    git: gitNamespace(call),
    search: searchNamespace(call),
    mcp: mcpNamespace(call),
    skills: skillsNamespace(call),
    commands: commandsNamespace(call),
    terminal: terminalNamespace(call),

    // === Backward-compatible flat helpers ===
    /** `host.info` — see `tethys-api::TethysApi`. */
    hostInfo: () => call<HostInfo>("host_info"),
    /** `host.health` — see `tethys-api::TethysApi`. */
    health: () => call<HealthStatus>("health"),
    /** `search.files` — see `tethys-api::TethysApi`. */
    searchFiles: (workspaceId: string, query: string, limit = 20) =>
      call<SearchItem[]>("search_files", { workspaceId, query, limit }),
    ...benchFlatHelpers(call),
  };

  return client;
}

export type TethysClient = ReturnType<typeof createClient>;
export type {
  BenchmarkConfig,
  BenchmarkResult,
  CheckpointInfo,
  CheckpointPhase,
  CheckpointResult,
  CommandInfo,
  CommitResult,
  ComposerReference,
  DiffFile,
  DiffFileDetail,
  DiffFileStatus,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffSource,
  DiffSummary,
  ExpandedCommand,
  HealthStatus,
  HostInfo,
  HunkRef,
  RestoreOutcome,
  RestorePolicy,
  RestoreTarget,
  SearchItem,
  SetupOutcome,
  StreamChunk,
  UndoCapture,
  WorkspaceGitConfig,
  WorkspaceId,
  WorktreeInfo,
  WorktreeSpec,
};
export type ProjectGitConfig = WorkspaceGitConfig;
