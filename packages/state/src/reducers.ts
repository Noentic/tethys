import type {
  AgentCommand,
  CheckpointKind,
  ConfigOption,
  ContentBlock,
  Decider,
  DiffStatistics,
  ElicitationOutcome,
  ElicitationRequest,
  ElicitationValue,
  FileChangeReport,
  Patch,
  PermissionMode,
  PermissionSubject,
  PermOption,
  PermOutcome,
  PlanEntryPriority,
  PlanEntryStatus,
  Role,
  SessionGoal,
  StopReason,
  ToolCallContent,
  ToolKind,
  ToolLocation,
  ToolOrigin,
  TurnEventBody,
  UsageSnapshot,
  WriteVia,
} from "@tethys/bindings";
import { cancelPhaseToState } from "./cancellation";

export type CancellationState =
  | "idle"
  | "cancel_requested"
  | "grace_elapsed"
  | "terminating";

export interface PermissionResolution {
  outcome: PermOutcome;
  autoPicked: boolean;
  decidedBy: Decider;
  optionId?: string | null;
  policy?: string;
  timestamp: number;
}

export interface PermissionRequestItem {
  reqId: string;
  title: string;
  description: string | null;
  subject?: PermissionSubject | null;
  options: PermOption[];
  metadata?: string | null;
  resolution?: PermissionResolution;
}

export interface ElicitationRequestItem {
  reqId: string;
  request: ElicitationRequest;
  resolution?: ElicitationResolution;
}

export interface ElicitationResolution {
  outcome: ElicitationOutcome;
  values: Record<string, ElicitationValue>;
  timestamp: number;
}

export interface BaseSessionEntry {
  id: string;
  kind: string; // Discriminant: "turn_message", "tool_call", "permission_request", "elicitation", "history_divider", etc.
  timestamp: number;
  isHistory?: boolean;
}

export interface TurnMessageEntry extends BaseSessionEntry {
  kind: "turn_message";
  role: Role;
  content: string;
  /** Non-text blocks the message carried (images, resource links). */
  attachments?: ContentBlock[];
  /** True while the message is still streaming (toolbar hidden, aria-busy). */
  streaming?: boolean;
  /**
   * When the message stopped streaming. With `timestamp` it gives a thought
   * its duration (`Thought for 14s`).
   */
  endedAt?: number;
}

export interface ToolCallEntry extends BaseSessionEntry {
  kind: "tool_call";
  toolCallId: string;
  title: string;
  status: "Pending" | "Executing" | "Completed" | "Failed" | "Cancelled";
  toolKind?: ToolKind | null;
  origin?: ToolOrigin | null;
  parentToolCallId?: string | null;
  locations: ToolLocation[];
  input?: string | null;
  output?: string | null;
  metadata?: string | null;
  asyncTaskId?: string | null;
  diffStats?: Record<string, DiffStatistics>;
  /**
   * File changes the call reported as ACP diff content, one per path, kept
   * structured so the transcript can draw the diff rather than print it.
   */
  diffs?: ToolDiff[];
  /** Terminals the call ran in, so its output can be tailed and opened. */
  terminalIds?: string[];
}

/** One file a tool call changed, as a unified patch of hunks. */
export interface ToolDiff {
  path: string;
  patch: string;
}

export interface PermissionRequestEntry extends BaseSessionEntry {
  kind: "permission_request";
  request: PermissionRequestItem;
}

export interface ElicitationEntry extends BaseSessionEntry {
  kind: "elicitation";
  reqId: string;
  request: ElicitationRequest;
  resolution?: ElicitationResolution;
}

export interface PlanStep {
  content: string;
  priority: PlanEntryPriority;
  status: PlanEntryStatus;
}

export interface PlanEntry extends BaseSessionEntry {
  kind: "plan";
  planId: string;
  steps: PlanStep[];
}

export interface TerminalEntry extends BaseSessionEntry {
  kind: "terminal";
  terminalId: string;
  output: string;
}

export interface FileWriteEntry extends BaseSessionEntry {
  kind: "file_write";
  path: string;
  before: string | null;
  after: string;
  via: WriteVia;
}

export interface CheckpointEntry extends BaseSessionEntry {
  kind: "checkpoint";
  oid: string;
  checkpointKind: CheckpointKind;
}

export interface TurnEndEntry extends BaseSessionEntry {
  kind: "turn_end";
  turn: number;
}

export interface HistoryDividerEntry extends BaseSessionEntry {
  kind: "history_divider";
  label: string;
}

export type TurnNoticeKind =
  | "refusal"
  | "max_tokens"
  | "max_turn_requests"
  | "cancelled"
  | "error"
  | "connection_lost"
  | "compaction";

export interface TurnNoticeEntry extends BaseSessionEntry {
  kind: "turn_notice";
  noticeKind: TurnNoticeKind;
  message: string;
  retryable?: boolean;
  summary?: string | null;
}

export interface GenericEntry extends BaseSessionEntry {
  kind: string;
  data?: unknown;
}

export type SessionEntry =
  | TurnMessageEntry
  | ToolCallEntry
  | PermissionRequestEntry
  | ElicitationEntry
  | PlanEntry
  | TerminalEntry
  | FileWriteEntry
  | CheckpointEntry
  | TurnEndEntry
  | HistoryDividerEntry
  | TurnNoticeEntry
  | GenericEntry;

export interface SessionState {
  sessionId: string;
  providerId: string;
  workspaceId: string;
  workdir: string;
  title: string;
  goal: SessionGoal | null;
  fileChangeReport: FileChangeReport | null;
  branchName?: string;
  status: string; // "idle" | "running" | "awaiting_approval" | "error" | "interrupted" | "suspended" | "archived"
  cancellationState: CancellationState;
  /** Absolute RFC 3339 grace deadline while `cancel_requested`; null otherwise. */
  graceDeadline: string | null;
  turnCount: number;
  seq: number;
  /** Supervised / Auto-edit / YOLO; the permission-mode pill reads and writes it. */
  permissionMode: PermissionMode;
  historyEntries: SessionEntry[];
  liveEntries: SessionEntry[];
  entries: SessionEntry[]; // Derived or ordered concatenation: [...historyEntries, divider?, ...liveEntries]
  pendingPermissions: PermissionRequestItem[];
  pendingElicitations: ElicitationRequestItem[];
  resolvedPermissions: Record<string, PermissionResolution>;
  usage?: UsageSnapshot;
  error?: string | null;
  /** Commands the Provider advertised (`CommandsAvailable`); composer `/` group. */
  agentCommands: AgentCommand[];
  /** Current session config options (`ConfigOptionsChanged`); composer chips. */
  configOptions: ConfigOption[];
  /** Negotiated ACP features for this prepared session. */
  capabilities: import("@tethys/bindings").NormalizedCapabilities | null;
}

function extractTextFromContentBlock(block: ContentBlock): string {
  if ("Text" in block && typeof block.Text === "string") {
    return block.Text;
  }
  if ("TextWithMetadata" in block && block.TextWithMetadata) {
    return block.TextWithMetadata.text;
  }
  if ("ResourceLink" in block && block.ResourceLink) {
    return block.ResourceLink.name;
  }
  if ("Image" in block && block.Image) {
    return "[Image]";
  }
  if ("Audio" in block && block.Audio) {
    return "[Audio]";
  }
  if ("Resource" in block && block.Resource) {
    return block.Resource.text ?? block.Resource.uri;
  }
  if ("Unknown" in block && typeof block.Unknown === "string") {
    return block.Unknown;
  }
  return "";
}

function extractTextFromContentBlocks(blocks: ContentBlock[]): string {
  return blocks.map(extractTextFromContentBlock).join("");
}

export function applyPatch<T>(
  current: T | null | undefined,
  patch: Patch<T>,
): T | null | undefined {
  if (patch.type === "Unchanged") {
    return current;
  }
  if (patch.type === "Clear") {
    return null;
  }
  if (patch.type === "Set") {
    return patch.value;
  }
  return current;
}

export function createInitialSessionState(
  sessionId: string,
  providerId: string,
  workspaceId: string,
  title = "New Thread",
  branchName?: string,
  workdir = "",
): SessionState {
  return {
    sessionId,
    providerId,
    workspaceId,
    workdir,
    title,
    goal: null,
    fileChangeReport: null,
    branchName,
    status: "idle",
    cancellationState: "idle",
    graceDeadline: null,
    turnCount: 0,
    seq: 0,
    permissionMode: "supervised",
    historyEntries: [],
    liveEntries: [],
    entries: [],
    pendingPermissions: [],
    pendingElicitations: [],
    resolvedPermissions: {},
    usage: undefined,
    error: null,
    agentCommands: [],
    configOptions: [],
    capabilities: null,
  };
}

function rebuildCombinedEntries(
  history: SessionEntry[],
  live: SessionEntry[],
): SessionEntry[] {
  if (history.length > 0 && live.length > 0) {
    const divider: HistoryDividerEntry = {
      id: "history-divider",
      kind: "history_divider",
      label: "Earlier history (read-only)",
      timestamp: history[history.length - 1].timestamp,
      isHistory: true,
    };
    return [...history, divider, ...live];
  }
  if (history.length > 0) {
    return [...history];
  }
  return [...live];
}

function nonTextAttachments(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.filter(
    (block) =>
      !("Text" in block && typeof block.Text === "string") &&
      !("TextWithMetadata" in block && block.TextWithMetadata),
  );
}

/**
 * Materializes the one visible `turn-notice` for a stop reason. `EndTurn` and
 * `StopSequence` are normal ends and render nothing; `Error` is emitted by the
 * `Error` event so it is not duplicated here.
 */
export function turnNoticeForStopReason(
  stopReason: StopReason | null,
): TurnNoticeEntry | null {
  if (stopReason === null) {
    return null;
  }
  const id = `turn-notice-${Date.now()}`;
  const timestamp = Date.now();
  const make = (
    noticeKind: TurnNoticeKind,
    message: string,
  ): TurnNoticeEntry => ({
    id,
    kind: "turn_notice",
    noticeKind,
    message,
    timestamp,
  });
  if (stopReason === "Refusal") {
    return make(
      "refusal",
      "The prompt was refused and is excluded from the next prompt.",
    );
  }
  if (stopReason === "MaxTokens") {
    return make("max_tokens", "The turn hit the token limit.");
  }
  if (stopReason === "MaxTurnRequests") {
    return make("max_turn_requests", "The turn hit its request limit.");
  }
  if (stopReason === "Cancelled") {
    return make("cancelled", "The turn was cancelled.");
  }
  return null;
}

function turnEndEntry(state: SessionState, seq: number): TurnEndEntry | null {
  if (
    state.turnCount === 0 ||
    (state.status !== "running" && state.status !== "awaiting_approval")
  ) {
    return null;
  }
  return {
    id: `turn-end-${seq}-${state.turnCount}`,
    kind: "turn_end",
    turn: state.turnCount,
    timestamp: Date.now(),
  };
}

/**
 * Text a content item adds to the tool's output. A diff and a terminal are not
 * text: they are kept structured on the entry (`diffs`, `terminalIds`).
 */
function toolContentText(item: ToolCallContent): string {
  if ("Text" in item && typeof item.Text === "string") return item.Text;
  if ("Unknown" in item && typeof item.Unknown === "string")
    return item.Unknown;
  return "";
}

function terminalContent(item: ToolCallContent): string | null {
  return "Terminal" in item && item.Terminal ? item.Terminal.terminal_id : null;
}

/** A later diff for the same path replaces the earlier one. */
function withDiff(diffs: ToolDiff[] | undefined, next: ToolDiff): ToolDiff[] {
  return [...(diffs ?? []).filter((diff) => diff.path !== next.path), next];
}

function diffContent(item: ToolCallContent): {
  path: string;
  stats: DiffStatistics | null;
  metadata: string | null;
} | null {
  if (!("Diff" in item) || !item.Diff) return null;
  return {
    path: item.Diff.path,
    stats: item.Diff.stats ?? null,
    metadata: item.Diff.metadata ?? null,
  };
}

/**
 * A thought ends when the agent moves on to anything else: the next message or
 * tool call closes it, so its duration is the thinking, not the whole turn.
 */
function closeThoughts(entries: SessionEntry[], now: number): SessionEntry[] {
  return entries.map((entry) =>
    entry.kind === "turn_message" &&
    (entry as TurnMessageEntry).role === "Thought" &&
    (entry as TurnMessageEntry).streaming
      ? { ...(entry as TurnMessageEntry), streaming: false, endedAt: now }
      : entry,
  );
}

export function sessionReducer(
  state: SessionState,
  event: TurnEventBody,
  seq?: number,
  /** When Core recorded the event (`EventEnvelope.at_ms`); now when absent. */
  at?: number | null,
): SessionState {
  const currentSeq =
    typeof seq === "number" ? Math.max(state.seq, seq) : state.seq;
  const now = typeof at === "number" && at > 0 ? at : Date.now();

  switch (event.type) {
    case "StateChanged": {
      const bindingState = event.body.state;
      let newStatus = "running";
      let newCancellation = state.cancellationState;

      if (bindingState === "Running") {
        newStatus = "running";
      } else if (bindingState === "RequiresAction") {
        newStatus = "awaiting_approval";
      }

      let nextLive = state.liveEntries;
      if (typeof bindingState === "object" && "Idle" in bindingState) {
        newStatus = "idle";
        newCancellation = "idle";
        nextLive = state.liveEntries.map((entry) =>
          entry.kind === "turn_message" && (entry as TurnMessageEntry).streaming
            ? { ...(entry as TurnMessageEntry), streaming: false, endedAt: now }
            : entry,
        );
        const notice = turnNoticeForStopReason(bindingState.Idle.stop_reason);
        if (notice) {
          nextLive = [...nextLive, notice];
        }
        const turnEnd = turnEndEntry(state, currentSeq);
        if (turnEnd) nextLive = [...nextLive, turnEnd];
      }

      return {
        ...state,
        status: newStatus,
        cancellationState: newCancellation,
        graceDeadline: newCancellation === "idle" ? null : state.graceDeadline,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "MessageUpsert": {
      const msg = event.body;
      const role = msg.role;
      let content = "";
      if (msg.content.type === "Set") {
        content = extractTextFromContentBlocks(msg.content.value);
      }

      const existingIndex = state.liveEntries.findIndex(
        (e) => e.id === msg.message_id,
      );

      let nextLive: SessionEntry[];
      if (existingIndex >= 0) {
        nextLive = [...state.liveEntries];
        const existing = nextLive[existingIndex] as TurnMessageEntry;
        nextLive[existingIndex] = {
          ...existing,
          content: msg.content.type === "Set" ? content : existing.content,
          attachments:
            msg.content.type === "Set"
              ? nonTextAttachments(msg.content.value)
              : existing.attachments,
        };
      } else {
        const newEntry: TurnMessageEntry = {
          id: msg.message_id,
          kind: "turn_message",
          role,
          content,
          attachments:
            msg.content.type === "Set"
              ? nonTextAttachments(msg.content.value)
              : [],
          streaming: role !== "User",
          timestamp: now,
        };
        nextLive = [
          ...(newEntry.role === "Thought"
            ? state.liveEntries
            : closeThoughts(state.liveEntries, now)),
          newEntry,
        ];
      }

      const isUser = role === "User";
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        turnCount: isUser ? state.turnCount + 1 : state.turnCount,
        seq: currentSeq,
      };
    }

    case "MessageChunk": {
      const chunk = event.body;
      const textDelta = extractTextFromContentBlock(chunk.block);
      const existingIndex = state.liveEntries.findIndex(
        (e) => e.id === chunk.message_id,
      );

      let nextLive: SessionEntry[];
      if (existingIndex >= 0) {
        nextLive = [...state.liveEntries];
        const existing = nextLive[existingIndex] as TurnMessageEntry;
        const attachment =
          "Text" in chunk.block || "TextWithMetadata" in chunk.block
            ? undefined
            : chunk.block;
        nextLive[existingIndex] = {
          ...existing,
          content: existing.content + textDelta,
          attachments: attachment
            ? [...(existing.attachments ?? []), attachment]
            : existing.attachments,
        };
      } else {
        const newEntry: TurnMessageEntry = {
          id: chunk.message_id,
          kind: "turn_message",
          role: chunk.role,
          content: textDelta,
          attachments:
            "Text" in chunk.block || "TextWithMetadata" in chunk.block
              ? []
              : [chunk.block],
          streaming: chunk.role !== "User",
          timestamp: now,
        };
        nextLive = [
          ...(newEntry.role === "Thought"
            ? state.liveEntries
            : closeThoughts(state.liveEntries, now)),
          newEntry,
        ];
      }

      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "ToolCallUpsert": {
      const { tool_call_id, patch } = event.body;
      const existingIndex = state.liveEntries.findIndex(
        (e) => e.id === tool_call_id,
      );

      let nextLive: SessionEntry[];
      if (existingIndex >= 0) {
        nextLive = [...state.liveEntries];
        const existing = nextLive[existingIndex] as ToolCallEntry;
        const newTitle = patch.title !== null ? patch.title : existing.title;
        const newStatus =
          patch.status !== null ? patch.status : existing.status;
        const newInput = patch.input !== null ? patch.input : existing.input;
        const newOutput =
          patch.output !== null ? patch.output : existing.output;

        nextLive[existingIndex] = {
          ...existing,
          title: newTitle,
          status: newStatus,
          input: newInput,
          output: newOutput,
          metadata: patch.metadata ?? existing.metadata ?? null,
          asyncTaskId: patch.async_task_id ?? existing.asyncTaskId ?? null,
          toolKind: patch.kind ?? existing.toolKind ?? null,
          origin: patch.origin ?? existing.origin ?? null,
          parentToolCallId:
            patch.parent_tool_call_id ?? existing.parentToolCallId ?? null,
          locations:
            patch.locations && patch.locations.length > 0
              ? patch.locations
              : existing.locations,
        };
      } else {
        const newTitle = patch.title ?? "tool_call";
        const newStatus = patch.status ?? "Pending";

        const newEntry: ToolCallEntry = {
          id: tool_call_id,
          kind: "tool_call",
          toolCallId: tool_call_id,
          title: newTitle,
          status: newStatus,
          toolKind: patch.kind ?? null,
          origin: patch.origin ?? null,
          parentToolCallId: patch.parent_tool_call_id ?? null,
          locations: patch.locations ?? [],
          input: patch.input,
          output: patch.output,
          metadata: patch.metadata,
          asyncTaskId: patch.async_task_id,
          timestamp: now,
        };
        nextLive = [...closeThoughts(state.liveEntries, now), newEntry];
      }

      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "PermissionRequested": {
      const req = event.body;
      const permItem: PermissionRequestItem = {
        reqId: req.req_id,
        title: req.title,
        description: req.description,
        subject: req.subject,
        options: req.options,
        metadata: req.metadata,
      };

      const permEntry: PermissionRequestEntry = {
        id: `perm-${req.req_id}`,
        kind: "permission_request",
        request: permItem,
        timestamp: now,
      };

      const nextLive = [...state.liveEntries, permEntry];
      const nextPending = [
        ...state.pendingPermissions.filter((p) => p.reqId !== req.req_id),
        permItem,
      ];

      return {
        ...state,
        status: "awaiting_approval",
        pendingPermissions: nextPending,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "PermissionResolved": {
      const { req_id, outcome, decided_by, option_id } = event.body;
      const isAuto = decided_by === "Policy";

      const resolution: PermissionResolution = {
        outcome,
        autoPicked: isAuto,
        decidedBy: decided_by,
        optionId: option_id ?? null,
        policy: isAuto ? "workspace-trust-policy" : undefined,
        timestamp: now,
      };

      const nextResolved = {
        ...state.resolvedPermissions,
        [req_id]: resolution,
      };

      const nextPending = state.pendingPermissions.filter(
        (p) => p.reqId !== req_id,
      );

      // Update resolution in live entries if present
      const nextLive = state.liveEntries.map((e) => {
        if (
          e.kind === "permission_request" &&
          (e as PermissionRequestEntry).request.reqId === req_id
        ) {
          return {
            ...e,
            request: {
              ...(e as PermissionRequestEntry).request,
              resolution,
            },
          };
        }
        return e;
      });

      return {
        ...state,
        status: nextPending.length > 0 ? "awaiting_approval" : "running",
        pendingPermissions: nextPending,
        resolvedPermissions: nextResolved,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "PlanUpsert": {
      const { plan_id, plan } = event.body;
      const id = `plan-${plan_id}`;
      const steps: PlanStep[] = plan.entries.map((entry) => ({
        content: entry.content,
        priority: entry.priority,
        status: entry.status,
      }));
      const existingIndex = state.liveEntries.findIndex((e) => e.id === id);
      let nextLive: SessionEntry[];
      if (existingIndex >= 0) {
        nextLive = [...state.liveEntries];
        nextLive[existingIndex] = {
          ...(nextLive[existingIndex] as PlanEntry),
          steps,
        };
      } else {
        const entry: PlanEntry = {
          id,
          kind: "plan",
          planId: plan_id,
          steps,
          timestamp: now,
        };
        nextLive = [...state.liveEntries, entry];
      }
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "TerminalUpsert": {
      const { terminal_id, patch } = event.body;
      const id = `terminal-${terminal_id}`;
      const existingIndex = state.liveEntries.findIndex((e) => e.id === id);
      const replacement = applyPatch<string>("", patch);
      let nextLive: SessionEntry[];
      if (existingIndex >= 0) {
        nextLive = [...state.liveEntries];
        const existing = nextLive[existingIndex] as TerminalEntry;
        nextLive[existingIndex] = {
          ...existing,
          output:
            patch.type === "Unchanged" ? existing.output : (replacement ?? ""),
        };
      } else {
        const entry: TerminalEntry = {
          id,
          kind: "terminal",
          terminalId: terminal_id,
          output: patch.type === "Set" ? (patch.value ?? "") : "",
          timestamp: now,
        };
        nextLive = [...state.liveEntries, entry];
      }
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "TerminalOutputChunk": {
      const { terminal_id, bytes } = event.body;
      const id = `terminal-${terminal_id}`;
      const existingIndex = state.liveEntries.findIndex((e) => e.id === id);
      let nextLive: SessionEntry[];
      if (existingIndex >= 0) {
        nextLive = [...state.liveEntries];
        const existing = nextLive[existingIndex] as TerminalEntry;
        nextLive[existingIndex] = {
          ...existing,
          output: existing.output + bytes,
        };
      } else {
        const entry: TerminalEntry = {
          id,
          kind: "terminal",
          terminalId: terminal_id,
          output: bytes,
          timestamp: now,
        };
        nextLive = [...state.liveEntries, entry];
      }
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "FileWrite": {
      const entry: FileWriteEntry = {
        id: `file-write-${currentSeq}-${state.liveEntries.length}`,
        kind: "file_write",
        path: event.body.path,
        before: event.body.before,
        after: event.body.after,
        via: event.body.via,
        timestamp: now,
      };
      const nextLive = [...state.liveEntries, entry];
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "Checkpoint": {
      const entry: CheckpointEntry = {
        id: `checkpoint-${currentSeq}-${state.liveEntries.length}`,
        kind: "checkpoint",
        oid: event.body.oid,
        checkpointKind: event.body.kind,
        timestamp: now,
      };
      const nextLive = [...state.liveEntries, entry];
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "ElicitationRequested": {
      const request = event.body;
      const item: ElicitationRequestItem = { reqId: request.req_id, request };
      const entry: ElicitationEntry = {
        id: `elicit-${request.req_id}`,
        kind: "elicitation",
        reqId: request.req_id,
        request,
        timestamp: now,
      };
      const nextLive = [...state.liveEntries, entry];
      const nextPending = [
        ...state.pendingElicitations.filter(
          (pending) => pending.reqId !== request.req_id,
        ),
        item,
      ];
      return {
        ...state,
        status: "awaiting_approval",
        pendingElicitations: nextPending,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "ElicitationResolved": {
      const { req_id, outcome, values } = event.body;
      const resolution: ElicitationResolution = {
        outcome,
        values: values ?? {},
        timestamp: now,
      };
      const nextPending = state.pendingElicitations.filter(
        (pending) => pending.reqId !== req_id,
      );
      const nextLive = state.liveEntries.map((entry) =>
        entry.kind === "elicitation" &&
        (entry as ElicitationEntry).reqId === req_id
          ? { ...(entry as ElicitationEntry), resolution }
          : entry,
      );
      return {
        ...state,
        status: nextPending.length > 0 ? "awaiting_approval" : "running",
        pendingElicitations: nextPending,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "ProviderExtension": {
      const requestId = event.body.request_id;
      const entry: GenericEntry = {
        id: requestId
          ? `provider-extension-${requestId}`
          : `provider-extension-notification-${currentSeq}`,
        kind: "provider_extension",
        data: event.body,
        timestamp: now,
      };
      const nextLive = [...state.liveEntries, entry];
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "ProviderExtensionResolved": {
      const nextLive = state.liveEntries.filter(
        (entry) => entry.id !== `provider-extension-${event.body.request_id}`,
      );
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "Compaction": {
      const notice: TurnNoticeEntry = {
        id: `turn-notice-compaction-${currentSeq}-${state.liveEntries.length}`,
        kind: "turn_notice",
        noticeKind: "compaction",
        message: "Context compacted.",
        summary: event.body.summary,
        timestamp: now,
      };
      const nextLive: SessionEntry[] = [...state.liveEntries, notice];
      const turnEnd = turnEndEntry(state, currentSeq);
      if (turnEnd) nextLive.push(turnEnd);
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "Usage": {
      return {
        ...state,
        usage: event.body.snapshot,
        seq: currentSeq,
      };
    }

    case "CommandsAvailable": {
      return {
        ...state,
        agentCommands: event.body.commands,
        seq: currentSeq,
      };
    }

    case "ConfigOptionsChanged": {
      return {
        ...state,
        configOptions: event.body.options,
        seq: currentSeq,
      };
    }

    case "CancelPhaseChanged": {
      // The backend owns the clock and the deadline; the webview only applies
      // the phase it is told (a second click never advances the ladder).
      const view = cancelPhaseToState(event.body.phase);
      return {
        ...state,
        cancellationState: view.state,
        graceDeadline: view.graceDeadline,
        seq: currentSeq,
      };
    }

    case "Error": {
      const notice: TurnNoticeEntry = {
        id: `turn-notice-error-${now}`,
        kind: "turn_notice",
        noticeKind: "error",
        message: event.body.message,
        retryable: event.body.retryable,
        timestamp: now,
      };
      const nextLive = [...state.liveEntries, notice];
      return {
        ...state,
        status: "error",
        error: event.body.message,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "SessionInfo": {
      const title = event.body.title;
      const goal = applyPatch(
        state.goal,
        event.body.goal ?? { type: "Unchanged" },
      );
      const fileChangeReport = applyPatch(
        state.fileChangeReport,
        event.body.file_change_report ?? { type: "Unchanged" },
      );
      return {
        ...state,
        title: title ?? state.title,
        goal: goal === undefined ? state.goal : goal,
        fileChangeReport:
          fileChangeReport === undefined
            ? state.fileChangeReport
            : fileChangeReport,
        seq: currentSeq,
      };
    }

    case "ToolCallContentChunk": {
      const { tool_call_id, item } = event.body;
      const chunk = toolContentText(item);
      const diff = diffContent(item);
      const terminalId = terminalContent(item);
      const patch =
        "Diff" in item && item.Diff && item.Diff.patch.length > 0
          ? { path: item.Diff.path, patch: item.Diff.patch }
          : null;
      if (
        chunk.length === 0 &&
        !diff?.stats &&
        !diff?.metadata &&
        !patch &&
        !terminalId
      ) {
        return { ...state, seq: currentSeq };
      }
      const existingIndex = state.liveEntries.findIndex(
        (entry) => entry.id === tool_call_id && entry.kind === "tool_call",
      );
      if (existingIndex < 0) {
        const entry: ToolCallEntry = {
          id: tool_call_id,
          kind: "tool_call",
          toolCallId: tool_call_id,
          title: "tool_call",
          status: "Executing",
          toolKind: null,
          origin: null,
          parentToolCallId: null,
          locations: [],
          input: null,
          output: chunk.length > 0 ? chunk : null,
          metadata: diff?.metadata,
          diffStats: diff?.stats ? { [diff.path]: diff.stats } : {},
          diffs: patch ? [patch] : undefined,
          terminalIds: terminalId ? [terminalId] : undefined,
          timestamp: now,
        };
        const nextLive = [...state.liveEntries, entry];
        return {
          ...state,
          liveEntries: nextLive,
          entries: rebuildCombinedEntries(state.historyEntries, nextLive),
          seq: currentSeq,
        };
      }
      const nextLive = [...state.liveEntries];
      const existing = nextLive[existingIndex] as ToolCallEntry;
      nextLive[existingIndex] = {
        ...existing,
        metadata: diff?.metadata ?? existing.metadata ?? null,
        diffStats: diff?.stats
          ? { ...existing.diffStats, [diff.path]: diff.stats }
          : existing.diffStats,
        diffs: patch ? withDiff(existing.diffs, patch) : existing.diffs,
        terminalIds:
          terminalId && !existing.terminalIds?.includes(terminalId)
            ? [...(existing.terminalIds ?? []), terminalId]
            : existing.terminalIds,
        output: chunk
          ? existing.output && existing.output.length > 0
            ? `${existing.output}${chunk}`
            : chunk
          : existing.output,
      };
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    case "Unknown": {
      const entry: GenericEntry = {
        id: `unknown-${currentSeq}`,
        kind: "unknown",
        data: { raw: event.body.raw },
        timestamp: now,
      };
      const nextLive = [...state.liveEntries, entry];
      return {
        ...state,
        liveEntries: nextLive,
        entries: rebuildCombinedEntries(state.historyEntries, nextLive),
        seq: currentSeq,
      };
    }

    default:
      return {
        ...state,
        seq: currentSeq,
      };
  }
}

export function loadHistoryIntoSession(
  state: SessionState,
  cachedHistory: SessionEntry[],
  resumeSupported: boolean,
): SessionState {
  const taggedHistory = cachedHistory.map((e) => ({ ...e, isHistory: true }));

  if (resumeSupported) {
    // Resumed session: history is contiguous with live turns, no division needed
    return {
      ...state,
      historyEntries: [],
      liveEntries: taggedHistory,
      entries: taggedHistory,
    };
  }

  // Not resume-supported: cached history separated from fresh live segment
  return {
    ...state,
    historyEntries: taggedHistory,
    liveEntries: state.liveEntries,
    entries: rebuildCombinedEntries(taggedHistory, state.liveEntries),
  };
}
