import type {
  ContentBlock,
  Decider,
  Patch,
  PermOption,
  PermOutcome,
  Role,
  TurnEventBody,
  UsageSnapshot,
} from "@tethys/bindings";

export type CancellationState =
  | "idle"
  | "cancel_requested"
  | "grace_elapsed"
  | "terminating";

export interface PermissionResolution {
  outcome: PermOutcome;
  autoPicked: boolean;
  decidedBy: Decider;
  policy?: string;
  timestamp: number;
}

export interface PermissionRequestItem {
  reqId: string;
  title: string;
  description: string | null;
  options: PermOption[];
  resolution?: PermissionResolution;
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
}

export interface ToolCallEntry extends BaseSessionEntry {
  kind: "tool_call";
  toolCallId: string;
  title: string;
  status: "Pending" | "Executing" | "Completed" | "Failed";
  input?: string | null;
  output?: string | null;
}

export interface PermissionRequestEntry extends BaseSessionEntry {
  kind: "permission_request";
  request: PermissionRequestItem;
}

export interface HistoryDividerEntry extends BaseSessionEntry {
  kind: "history_divider";
  label: string;
}

export interface GenericEntry extends BaseSessionEntry {
  kind: string;
  data?: unknown;
}

export type SessionEntry =
  | TurnMessageEntry
  | ToolCallEntry
  | PermissionRequestEntry
  | HistoryDividerEntry
  | GenericEntry;

export interface SessionState {
  sessionId: string;
  providerId: string;
  workspaceId: string;
  title: string;
  branchName?: string;
  status: string; // "idle" | "running" | "awaiting_approval" | "error" | "interrupted" | "suspended" | "archived"
  cancellationState: CancellationState;
  /** Absolute RFC 3339 grace deadline while `cancel_requested`; null otherwise. */
  graceDeadline: string | null;
  turnCount: number;
  seq: number;
  historyEntries: SessionEntry[];
  liveEntries: SessionEntry[];
  entries: SessionEntry[]; // Derived or ordered concatenation: [...historyEntries, divider?, ...liveEntries]
  pendingPermissions: PermissionRequestItem[];
  resolvedPermissions: Record<string, PermissionResolution>;
  usage?: UsageSnapshot;
  error?: string | null;
}

export function extractTextFromContentBlock(block: ContentBlock): string {
  if ("Text" in block && typeof block.Text === "string") {
    return block.Text;
  }
  if ("ResourceLink" in block && block.ResourceLink) {
    return block.ResourceLink.name;
  }
  if ("Image" in block && block.Image) {
    return "[Image]";
  }
  if ("Unknown" in block && typeof block.Unknown === "string") {
    return block.Unknown;
  }
  return "";
}

export function extractTextFromContentBlocks(blocks: ContentBlock[]): string {
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
): SessionState {
  return {
    sessionId,
    providerId,
    workspaceId,
    title,
    branchName,
    status: "idle",
    cancellationState: "idle",
    graceDeadline: null,
    turnCount: 0,
    seq: 0,
    historyEntries: [],
    liveEntries: [],
    entries: [],
    pendingPermissions: [],
    resolvedPermissions: {},
    usage: undefined,
    error: null,
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

export function sessionReducer(
  state: SessionState,
  event: TurnEventBody,
  seq?: number,
): SessionState {
  const currentSeq =
    typeof seq === "number" ? Math.max(state.seq, seq) : state.seq;

  switch (event.type) {
    case "StateChanged": {
      const bindingState = event.body.state;
      let newStatus = "running";
      let newCancellation = state.cancellationState;

      if (bindingState === "Running") {
        newStatus = "running";
      } else if (bindingState === "RequiresAction") {
        newStatus = "awaiting_approval";
      } else if (typeof bindingState === "object" && "Idle" in bindingState) {
        newStatus = "idle";
        newCancellation = "idle";
      }

      return {
        ...state,
        status: newStatus,
        cancellationState: newCancellation,
        graceDeadline: newCancellation === "idle" ? null : state.graceDeadline,
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
        };
      } else {
        const newEntry: TurnMessageEntry = {
          id: msg.message_id,
          kind: "turn_message",
          role,
          content,
          timestamp: Date.now(),
        };
        nextLive = [...state.liveEntries, newEntry];
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
        nextLive[existingIndex] = {
          ...existing,
          content: existing.content + textDelta,
        };
      } else {
        const newEntry: TurnMessageEntry = {
          id: chunk.message_id,
          kind: "turn_message",
          role: chunk.role,
          content: textDelta,
          timestamp: Date.now(),
        };
        nextLive = [...state.liveEntries, newEntry];
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
          input: patch.input,
          output: patch.output,
          timestamp: Date.now(),
        };
        nextLive = [...state.liveEntries, newEntry];
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
        options: req.options,
      };

      const permEntry: PermissionRequestEntry = {
        id: `perm-${req.req_id}`,
        kind: "permission_request",
        request: permItem,
        timestamp: Date.now(),
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
      const { req_id, outcome, decided_by } = event.body;
      const isAuto = decided_by === "Policy";

      const resolution: PermissionResolution = {
        outcome,
        autoPicked: isAuto,
        decidedBy: decided_by,
        policy: isAuto ? "workspace-trust-policy" : undefined,
        timestamp: Date.now(),
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

    case "Usage": {
      return {
        ...state,
        usage: event.body.snapshot,
        seq: currentSeq,
      };
    }

    case "Error": {
      return {
        ...state,
        status: "error",
        error: event.body.message,
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
