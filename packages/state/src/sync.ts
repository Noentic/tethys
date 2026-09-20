//! Sync & skills domain state (M1.11, worktree D).
//!
//! Pure selectors and view mappers over the M1.4 sync engine's wire types.
//! `mcp.attachments` is authoritative: nothing here re-derives an attachment
//! state from raw capabilities — the mappers only translate a returned
//! `AttachmentState` into a view descriptor.

import type {
  Applied,
  AttachmentCell,
  AttachmentGrid,
  AttachmentState,
  EntryState,
  ImportCandidate,
  ImportScan,
  ProjectionPlan,
  ProviderColumn,
  RegistryEntryView,
  RegistryValue,
  Scope,
  SkillImportSource,
  SkillInfo,
  SkillUpdateApplied,
  SkillUpdateCheck,
  SkillUpdatePlan,
  TargetId,
  TransportKind,
  VerifyStatus,
  WorkspaceId,
} from "@tethys/bindings";
import { useState } from "react";

/**
 * The narrow slice of the typed client the MCP surface uses. `TethysClient`
 * satisfies it; tests provide fakes. Real arguments, no `call<void>`.
 */
export interface McpSyncClient {
  mcp: {
    attachments(workspaceId: string): Promise<AttachmentGrid>;
    registry_list(workspaceId?: string): Promise<RegistryEntryView[]>;
    projection_plan(
      workspaceId: string,
      target: TargetId,
      scope: Scope,
    ): Promise<ProjectionPlan>;
    projection_apply(
      workspaceId: string,
      target: TargetId,
      scope: Scope,
      plan: ProjectionPlan,
    ): Promise<Applied>;
    projection_rollback(
      workspaceId: string,
      target: TargetId,
      scope: Scope,
    ): Promise<void>;
    projection_verify(
      workspaceId: string,
      target: TargetId,
      scope: Scope,
    ): Promise<VerifyStatus>;
    import_scan(workspaceId: string): Promise<ImportScan>;
    import_apply(
      workspaceId: string,
      candidates: ImportCandidate[],
      scope: Scope,
    ): Promise<string[]>;
  };
}

/** The narrow slice of the typed client the Skills surface uses. */
export interface SkillsClient {
  skills: {
    list(workspaceId: string): Promise<SkillInfo[]>;
    trust(workspaceId: string, scope: Scope, name: string): Promise<SkillInfo>;
    enable(
      workspaceId: string,
      scope: Scope,
      name: string,
      enabled: boolean,
    ): Promise<SkillInfo>;
    import(
      workspaceId: string,
      scope: Scope,
      source: SkillImportSource,
    ): Promise<SkillInfo>;
    update_check(
      workspaceId: string,
      scope: Scope,
      name: string,
    ): Promise<SkillUpdateCheck>;
    update_plan(
      workspaceId: string,
      scope: Scope,
      name: string,
    ): Promise<SkillUpdatePlan>;
    update_apply(
      workspaceId: string,
      scope: Scope,
      name: string,
    ): Promise<SkillUpdateApplied>;
  };
}

/** One server row with its cells resolved in Provider column order. */
export interface GridRowView {
  server: AttachmentGrid["servers"][number];
  cells: Array<{ provider: ProviderColumn; state: AttachmentState }>;
}

/** The grid's ordered rows, each carrying one state per Provider column. */
export function gridRows(grid: AttachmentGrid): GridRowView[] {
  const cellsByServer = new Map<string, Map<string, AttachmentCell>>();
  for (const cell of grid.cells) {
    let byProvider = cellsByServer.get(cell.server_name);
    if (byProvider === undefined) {
      byProvider = new Map();
      cellsByServer.set(cell.server_name, byProvider);
    }
    byProvider.set(cell.provider_id, cell);
  }

  return grid.servers.map((server) => ({
    server,
    cells: grid.providers.map((provider) => ({
      provider,
      // ponytail: engine returns the full grid; a missing cell displays as the
      // muted "not connected" state rather than being re-derived.
      state: cellsByServer.get(server.name)?.get(provider.id)?.state ?? {
        kind: "not-negotiated",
      },
    })),
  }));
}

/** Counts for `aria-rowcount` / `aria-colcount` and for choosing an empty state. */
export function gridDimensions(grid: AttachmentGrid): {
  rowCount: number;
  columnCount: number;
} {
  return { rowCount: grid.servers.length, columnCount: grid.providers.length };
}

/** Number of cells the engine reports as attached (excludes excluded/other). */
export function countAttachedCells(grid: AttachmentGrid): number {
  return grid.cells.filter((cell) => cell.state.kind === "attached").length;
}

export type CellTone = "success" | "warning" | "danger" | "muted";

/** A cell's presentation: never colour alone — every state carries a label. */
export interface CellView {
  label: string;
  tone: CellTone;
  sub: string | null;
  /** True when activating the cell opens the fallback projection surface. */
  actionable: boolean;
}

/** Exhaustiveness guard: a new `AttachmentState` variant is a compile error. */
const CELL_TONES = {
  attached: "success",
  "unsupported-transport": "warning",
  "file-projection": "warning",
  excluded: "muted",
  "not-negotiated": "muted",
} satisfies Record<AttachmentState["kind"], CellTone>;

const PROJECTION_STATE_LABELS: Record<EntryState, string> = {
  pending: "pending",
  "in-sync": "in sync",
  drifted: "drifted",
  conflict: "conflict",
  unsupported: "unsupported",
};

const PROJECTION_STATE_TONES: Record<EntryState, CellTone> = {
  pending: "muted",
  "in-sync": "success",
  drifted: "warning",
  conflict: "danger",
  unsupported: "muted",
};

/** Maps one returned `AttachmentState` to its view descriptor. */
export function renderCellState(state: AttachmentState): CellView {
  switch (state.kind) {
    case "attached":
      return {
        label: "Attached",
        tone: CELL_TONES.attached,
        sub: null,
        actionable: false,
      };
    case "unsupported-transport":
      return {
        label: "Unsupported transport",
        tone: CELL_TONES["unsupported-transport"],
        sub: `needs ${transportLabel(state.needs)}`,
        actionable: false,
      };
    case "file-projection":
      return {
        label: "File projection",
        tone: PROJECTION_STATE_TONES[state.state],
        sub: PROJECTION_STATE_LABELS[state.state],
        actionable: true,
      };
    case "excluded":
      return {
        label: "—",
        tone: CELL_TONES.excluded,
        sub: null,
        actionable: false,
      };
    case "not-negotiated":
      return {
        label: "not connected",
        tone: CELL_TONES["not-negotiated"],
        sub: null,
        actionable: false,
      };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function transportLabel(transport: TransportKind): string {
  return transport;
}

/** True when at least one cell is on the vendor-file projection fallback. */
export function hasFallbackProjection(grid: AttachmentGrid): boolean {
  return grid.cells.some((cell) => cell.state.kind === "file-projection");
}

// --- Fixtures -------------------------------------------------------------

const fixtureCell = (
  serverName: string,
  providerId: string,
  state: AttachmentState,
): AttachmentCell => ({
  server_name: serverName,
  provider_id: providerId,
  state,
});

const FIXTURE_PROVIDERS: ProviderColumn[] = [
  { id: "claude-code", name: "Claude Code", connected: true, target: null },
  { id: "opencode", name: "OpenCode", connected: true, target: null },
  { id: "codex", name: "Codex CLI", connected: true, target: "codex" },
  { id: "kiro", name: "Kiro", connected: false, target: null },
];

/** Canonical grids exercising every `AttachmentState` variant. */
export const attachmentGridFixtures = {
  /** Every one of the five cell states, across a 3×4 matrix. */
  allStates: {
    servers: [
      { name: "context7", transport: "stdio", scope: "global" },
      { name: "linear", transport: "http", scope: "workspace" },
      { name: "sentry", transport: "sse", scope: "global" },
    ] satisfies AttachmentGrid["servers"],
    providers: FIXTURE_PROVIDERS,
    cells: [
      fixtureCell("context7", "claude-code", { kind: "attached" }),
      fixtureCell("context7", "opencode", { kind: "attached" }),
      fixtureCell("context7", "codex", {
        kind: "file-projection",
        target: "codex",
        state: "drifted",
      }),
      fixtureCell("context7", "kiro", { kind: "not-negotiated" }),
      fixtureCell("linear", "claude-code", {
        kind: "unsupported-transport",
        needs: "http",
      }),
      fixtureCell("linear", "opencode", { kind: "attached" }),
      fixtureCell("linear", "codex", {
        kind: "file-projection",
        target: "codex",
        state: "conflict",
      }),
      fixtureCell("linear", "kiro", { kind: "excluded" }),
      fixtureCell("sentry", "claude-code", {
        kind: "unsupported-transport",
        needs: "sse",
      }),
      fixtureCell("sentry", "opencode", { kind: "excluded" }),
      fixtureCell("sentry", "codex", {
        kind: "file-projection",
        target: "codex",
        state: "pending",
      }),
      fixtureCell("sentry", "kiro", { kind: "not-negotiated" }),
    ],
  } satisfies AttachmentGrid,

  /** Two servers by four Providers, all attached — the U1 row-order case. */
  twoByFour: {
    servers: [
      { name: "context7", transport: "stdio", scope: "global" },
      { name: "linear", transport: "http", scope: "workspace" },
    ],
    providers: FIXTURE_PROVIDERS,
    cells: FIXTURE_PROVIDERS.flatMap((provider) => [
      fixtureCell("context7", provider.id, { kind: "attached" }),
      fixtureCell("linear", provider.id, { kind: "attached" }),
    ]),
  } satisfies AttachmentGrid,

  /** Zero servers: the header row still renders. */
  noServers: {
    servers: [],
    providers: FIXTURE_PROVIDERS,
    cells: [],
  } satisfies AttachmentGrid,

  /** Zero Providers: the frozen server column still renders. */
  noProviders: {
    servers: [
      { name: "context7", transport: "stdio", scope: "global" },
      { name: "linear", transport: "http", scope: "workspace" },
    ],
    providers: [],
    cells: [],
  } satisfies AttachmentGrid,

  /** Both axes empty: the zero-Providers state applies. */
  empty: { servers: [], providers: [], cells: [] } satisfies AttachmentGrid,
};

/** A projection preview plan; includes the `providers` list the dialog names. */
export const projectionPlanFixture: ProjectionPlan = {
  target: "codex",
  path: "/home/user/Code/tethys/.codex/config.toml",
  scope: "workspace",
  base_hash: "b3-0123456789abcdef",
  created: false,
  diff: [
    "--- a/.codex/config.toml",
    "+++ b/.codex/config.toml",
    "@@ -1,3 +1,5 @@",
    " [mcp_servers.context7]",
    ' command = "npx"',
    '-args = ["-y", "@upstash/context7-mcp"]',
    '+args = ["-y", "@upstash/context7-mcp@latest"]',
  ].join("\n"),
  content: '[mcp_servers.context7]\ncommand = "npx"\n',
  entries: [
    { name: "context7", state: "drifted", projected: true, notes: [] },
    { name: "linear", state: "pending", projected: true, notes: [] },
  ],
  providers: ["codex"],
};

/** A foreign-config scan fixture: two candidates, one conflict, one failure. */
export const importScanFixture: ImportScan = {
  candidates: [
    {
      name: "context7",
      entry: { type: "stdio", command: "npx", args: ["-y", "context7-mcp"] },
      source_path: "/home/user/.cursor/mcp.json",
      scope: "workspace",
      conflict: false,
    },
    {
      name: "linear",
      entry: { type: "http", url: "https://mcp.linear.app/sse" },
      source_path: "/home/user/.cursor/mcp.json",
      scope: "workspace",
      conflict: true,
    },
  ],
  failures: [
    { source_path: "/home/user/.vscode/mcp.json", message: "unreadable JSON" },
  ],
};

/** Registry entry views for the Server Configuration Card. */
export const registryEntryFixtures: RegistryEntryView[] = [
  {
    name: "context7",
    scope: "global",
    entry: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      env: {
        CONTEXT7_API_KEY: { secretRef: "keychain:tethys/context7" },
        LOG_LEVEL: "debug",
      },
    },
  },
  {
    name: "linear",
    scope: "workspace",
    entry: {
      type: "http",
      url: "https://mcp.linear.app/sse",
      headers: {
        Authorization: { secretRef: "keychain:tethys/linear" },
        "X-Client": "tethys",
      },
    },
  },
];

/** Skills for `settings.skills` list fixtures. */
export const skillInfoFixtures: SkillInfo[] = [
  {
    name: "find-docs",
    scope: "workspace",
    path: ".agents/skills/find-docs",
    source: { origin: "folder", url: null, repo: null, reference: null },
    enabled: true,
    requires_trust: false,
    trusted: true,
    content_hash: "b3-aaaa",
    pinned_sha: null,
  },
  {
    name: "audit-code",
    scope: "workspace",
    path: ".agents/skills/audit-code",
    source: { origin: "git-hub", repo: "acme/audit", reference: "v1" },
    enabled: true,
    requires_trust: true,
    trusted: false,
    content_hash: "b3-bbbb",
    pinned_sha: "abcdef12",
  },
];

// --- Workspace scope ------------------------------------------------------

/** Minimal workspace option until worktree F's typed `workspace.list` lands. */
export interface WorkspaceOption {
  id: WorkspaceId;
  name: string;
}

export const workspaceOptionFixtures: WorkspaceOption[] = [
  { id: "tethys", name: "tethys" },
  { id: "sandbox", name: "sandbox" },
];

export interface McpWorkspaceScope {
  workspaceId: WorkspaceId;
  workspaces: WorkspaceOption[];
  selectWorkspace: (id: WorkspaceId) => void;
}

/**
 * D12 fixture-backed scope hook. The real source is worktree F's trust-filtered
 * `workspace.list` (still `call<void>()`); the hook's shape does not change.
 */
export function useMcpWorkspaceScope(
  workspaces: WorkspaceOption[] = workspaceOptionFixtures,
): McpWorkspaceScope {
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId>(
    workspaces[0]?.id ?? "",
  );
  return { workspaceId, workspaces, selectWorkspace: setWorkspaceId };
}

/** Renders a `keychain:…` ref for a secret; never a value. */
export function registryValueText(value: RegistryValue): {
  text: string;
  secret: boolean;
} {
  if (typeof value === "string") {
    return { text: value, secret: false };
  }
  return { text: value.secretRef, secret: true };
}
