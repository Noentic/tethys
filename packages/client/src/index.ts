//! Transport-agnostic API client.
//!
//! Same hooks work against the in-process core (Tauri invoke) and — later —
//! a remote `tethysd` (WebSocket). This is the seam that keeps the webview
//! free of transport conditionals.

import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  Applied,
  BenchmarkConfig,
  BenchmarkResult,
  CheckpointInfo,
  CheckpointPhase,
  CheckpointResult,
  CommitResult,
  DiffFile,
  DiffFileDetail,
  DiffFileStatus,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffSource,
  DiffSummary,
  HealthStatus,
  HostInfo,
  HunkRef,
  ImportCandidate,
  ImportScan,
  ProjectGitConfig,
  ProjectionPlan,
  RegistryEntry,
  RegistryEntryView,
  RestoreOutcome,
  RestorePolicy,
  RestoreTarget,
  Scope,
  SearchItem,
  SetupOutcome,
  SkillImportSource,
  SkillInfo,
  SkillUpdateApplied,
  SkillUpdateCheck,
  SkillUpdatePlan,
  StreamChunk,
  TargetId,
  UndoCapture,
  VerifyStatus,
  WorktreeInfo,
  WorktreeSpec,
} from "@tethys/bindings";

export type Transport = "tauri" | "websocket";

export interface ClientOptions {
  transport?: Transport;
  /** Base URL for `websocket` transport (Phase 3, unused in S0.0). */
  baseUrl?: string;
}

export function createClient(options: ClientOptions = {}) {
  const transport: Transport = options.transport ?? "tauri";

  async function call<T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    if (transport === "tauri") {
      return invoke<T>(command, args);
    }
    throw new Error(`transport "${transport}" not implemented in S0.0`);
  }

  const client = {
    transport,

    // === host namespace ===
    host: {
      info: () => call<HostInfo>("host_info"),
      pair: () => call<void>("host_pair"),
      health: () => call<HealthStatus>("health"),
    },

    // === project namespace ===
    project: {
      list: () => call<void>("project_list"),
      add: () => call<void>("project_add"),
      remove: () => call<void>("project_remove"),
      settingsGet: () => call<void>("project_settings_get"),
      settings_get: () => call<void>("project_settings_get"),
      settingsSet: () => call<void>("project_settings_set"),
      settings_set: () => call<void>("project_settings_set"),
      status: () => call<void>("project_status"),
    },

    // === agent namespace ===
    agent: {
      profilesList: () => call<void>("agent_profiles_list"),
      profiles_list: () => call<void>("agent_profiles_list"),
      profilesCreate: () => call<void>("agent_profiles_create"),
      profiles_create: () => call<void>("agent_profiles_create"),
      profilesUpdate: () => call<void>("agent_profiles_update"),
      profiles_update: () => call<void>("agent_profiles_update"),
      profilesDelete: () => call<void>("agent_profiles_delete"),
      profiles_delete: () => call<void>("agent_profiles_delete"),
      registryList: () => call<void>("agent_registry_list"),
      registry_list: () => call<void>("agent_registry_list"),
      registryInstall: () => call<void>("agent_registry_install"),
      registry_install: () => call<void>("agent_registry_install"),
      registryUpdate: () => call<void>("agent_registry_update"),
      registry_update: () => call<void>("agent_registry_update"),
      connectionsList: () => call<void>("agent_connections_list"),
      connections_list: () => call<void>("agent_connections_list"),
      connectionsRestart: () => call<void>("agent_connections_restart"),
      connections_restart: () => call<void>("agent_connections_restart"),
      login: () => call<void>("agent_login"),
      logout: () => call<void>("agent_logout"),
      stderr: () => call<void>("agent_stderr"),
      configSchema: () => call<void>("agent_config_schema"),
      config_schema: () => call<void>("agent_config_schema"),
      configGet: () => call<void>("agent_config_get"),
      config_get: () => call<void>("agent_config_get"),
      configValidate: () => call<void>("agent_config_validate"),
      config_validate: () => call<void>("agent_config_validate"),
      configPlan: () => call<void>("agent_config_plan"),
      config_plan: () => call<void>("agent_config_plan"),
      configApply: () => call<void>("agent_config_apply"),
      config_apply: () => call<void>("agent_config_apply"),
      configRollback: () => call<void>("agent_config_rollback"),
      config_rollback: () => call<void>("agent_config_rollback"),
    },

    // === thread namespace ===
    thread: {
      create: () => call<void>("thread_create"),
      list: () => call<void>("thread_list"),
      get: () => call<void>("thread_get"),
      prompt: () => call<void>("thread_prompt"),
      queueList: () => call<void>("thread_queue_list"),
      queue_list: () => call<void>("thread_queue_list"),
      queueAdd: () => call<void>("thread_queue_add"),
      queue_add: () => call<void>("thread_queue_add"),
      queueRemove: () => call<void>("thread_queue_remove"),
      queue_remove: () => call<void>("thread_queue_remove"),
      queueReorder: () => call<void>("thread_queue_reorder"),
      queue_reorder: () => call<void>("thread_queue_reorder"),
      cancel: () => call<void>("thread_cancel"),
      resume: () => call<void>("thread_resume"),
      importSessions: () => call<void>("thread_import_sessions"),
      import_sessions: () => call<void>("thread_import_sessions"),
      fork: () => call<void>("thread_fork"),
      archive: () => call<void>("thread_archive"),
      delete: () => call<void>("thread_delete"),
      setConfigOption: () => call<void>("thread_set_config_option"),
      set_config_option: () => call<void>("thread_set_config_option"),
      setPermissionMode: () => call<void>("thread_set_permission_mode"),
      set_permission_mode: () => call<void>("thread_set_permission_mode"),
    },

    // === events namespace ===
    events: {
      subscribe: () => call<void>("events_subscribe"),
      unsubscribe: () => call<void>("events_unsubscribe"),
      inboxSubscribe: () => call<void>("events_inbox_subscribe"),
      inbox_subscribe: () => call<void>("events_inbox_subscribe"),
    },

    // === permission namespace ===
    permission: {
      respond: () => call<void>("permission_respond"),
      rulesList: () => call<void>("permission_rules_list"),
      rules_list: () => call<void>("permission_rules_list"),
      rulesSet: () => call<void>("permission_rules_set"),
      rules_set: () => call<void>("permission_rules_set"),
      rulesDelete: () => call<void>("permission_rules_delete"),
      rules_delete: () => call<void>("permission_rules_delete"),
    },

    // === git namespace ===
    git: {
      worktreeCreate: (spec: WorktreeSpec) =>
        call<WorktreeInfo>("git_worktree_create", { spec }),
      worktree_create: (spec: WorktreeSpec) =>
        call<WorktreeInfo>("git_worktree_create", { spec }),
      worktreeRemove: (threadId: string, force = false, leased = false) =>
        call<void>("git_worktree_remove", { threadId, force, leased }),
      worktree_remove: (threadId: string, force = false, leased = false) =>
        call<void>("git_worktree_remove", { threadId, force, leased }),
      worktreeList: () => call<WorktreeInfo[]>("git_worktree_list"),
      worktree_list: () => call<WorktreeInfo[]>("git_worktree_list"),
      worktreeArchive: (threadId: string) =>
        call<void>("git_worktree_archive", { threadId }),
      worktree_archive: (threadId: string) =>
        call<void>("git_worktree_archive", { threadId }),
      checkpointCreate: (
        threadId: string,
        turn: number,
        phase: CheckpointPhase,
      ) =>
        call<CheckpointResult>("git_checkpoint_create", {
          threadId,
          turn,
          phase,
        }),
      checkpoint_create: (
        threadId: string,
        turn: number,
        phase: CheckpointPhase,
      ) =>
        call<CheckpointResult>("git_checkpoint_create", {
          threadId,
          turn,
          phase,
        }),
      checkpointRestore: (target: RestoreTarget, policy?: RestorePolicy) =>
        call<RestoreOutcome>("git_checkpoint_restore", { target, policy }),
      checkpoint_restore: (target: RestoreTarget, policy?: RestorePolicy) =>
        call<RestoreOutcome>("git_checkpoint_restore", { target, policy }),
      checkpointList: (threadId: string) =>
        call<CheckpointInfo[]>("git_checkpoint_list", { threadId }),
      checkpoint_list: (threadId: string) =>
        call<CheckpointInfo[]>("git_checkpoint_list", { threadId }),
      diffSummary: (source: DiffSource) =>
        call<DiffSummary>("git_diff_summary", { source }),
      diff_summary: (source: DiffSource) =>
        call<DiffSummary>("git_diff_summary", { source }),
      diffFile: (source: DiffSource, path: string) =>
        call<DiffFileDetail>("git_diff_file", { source, path }),
      diff_file: (source: DiffSource, path: string) =>
        call<DiffFileDetail>("git_diff_file", { source, path }),
      stage: (threadId: string, paths: string[]) =>
        call<void>("git_stage", { threadId, paths }),
      unstage: (threadId: string, paths: string[]) =>
        call<void>("git_unstage", { threadId, paths }),
      discard: (threadId: string, source: DiffSource, hunks?: HunkRef[]) =>
        call<void>("git_discard", { threadId, source, hunks }),
      commit: (threadId: string, message: string) =>
        call<CommitResult>("git_commit", { threadId, message }),
      merge: () => call<void>("git_merge"),
      push: () => call<void>("git_push"),
      prCreate: () => call<void>("git_pr_create"),
      pr_create: () => call<void>("git_pr_create"),
    },

    // === search namespace ===
    search: {
      files: (query: string, limit = 20) =>
        call<SearchItem[]>("search_files", { query, limit }),
    },

    // === mcp namespace ===
    mcp: {
      registryList: (projectRoot?: string) =>
        call<RegistryEntryView[]>("mcp_registry_list", { projectRoot }),
      registry_list: (projectRoot?: string) =>
        call<RegistryEntryView[]>("mcp_registry_list", { projectRoot }),
      registrySet: (
        name: string,
        entry: RegistryEntry,
        scope: Scope,
        projectRoot?: string,
      ) => call<void>("mcp_registry_set", { name, entry, scope, projectRoot }),
      registry_set: (
        name: string,
        entry: RegistryEntry,
        scope: Scope,
        projectRoot?: string,
      ) => call<void>("mcp_registry_set", { name, entry, scope, projectRoot }),
      registryDelete: (name: string, scope: Scope, projectRoot?: string) =>
        call<boolean>("mcp_registry_delete", { name, scope, projectRoot }),
      registry_delete: (name: string, scope: Scope, projectRoot?: string) =>
        call<boolean>("mcp_registry_delete", { name, scope, projectRoot }),
      effective: (target: TargetId, projectRoot?: string) =>
        call<RegistryEntryView[]>("mcp_effective", { target, projectRoot }),
      projectionPlan: (target: TargetId, scope: Scope, projectRoot: string) =>
        call<ProjectionPlan>("mcp_projection_plan", {
          target,
          scope,
          projectRoot,
        }),
      projection_plan: (target: TargetId, scope: Scope, projectRoot: string) =>
        call<ProjectionPlan>("mcp_projection_plan", {
          target,
          scope,
          projectRoot,
        }),
      projectionApply: (plan: ProjectionPlan) =>
        call<Applied>("mcp_projection_apply", { plan }),
      projection_apply: (plan: ProjectionPlan) =>
        call<Applied>("mcp_projection_apply", { plan }),
      projectionRollback: (
        target: TargetId,
        scope: Scope,
        projectRoot: string,
      ) =>
        call<void>("mcp_projection_rollback", { target, scope, projectRoot }),
      projection_rollback: (
        target: TargetId,
        scope: Scope,
        projectRoot: string,
      ) =>
        call<void>("mcp_projection_rollback", { target, scope, projectRoot }),
      projectionVerify: (target: TargetId, scope: Scope, projectRoot: string) =>
        call<VerifyStatus>("mcp_projection_verify", {
          target,
          scope,
          projectRoot,
        }),
      projection_verify: (
        target: TargetId,
        scope: Scope,
        projectRoot: string,
      ) =>
        call<VerifyStatus>("mcp_projection_verify", {
          target,
          scope,
          projectRoot,
        }),
      importScan: (projectRoot: string) =>
        call<ImportScan>("mcp_import_scan", { projectRoot }),
      import_scan: (projectRoot: string) =>
        call<ImportScan>("mcp_import_scan", { projectRoot }),
      importApply: (
        projectRoot: string,
        candidates: ImportCandidate[],
        scope: Scope,
      ) =>
        call<string[]>("mcp_import_apply", {
          projectRoot,
          candidates,
          scope,
        }),
      import_apply: (
        projectRoot: string,
        candidates: ImportCandidate[],
        scope: Scope,
      ) =>
        call<string[]>("mcp_import_apply", {
          projectRoot,
          candidates,
          scope,
        }),
      health: () => call<void>("mcp_health"),
    },

    // === skills namespace ===
    skills: {
      list: (projectRoot: string) =>
        call<SkillInfo[]>("skills_list", { projectRoot }),
      import: (projectRoot: string, scope: Scope, source: SkillImportSource) =>
        call<SkillInfo>("skills_import", { projectRoot, scope, source }),
      updateCheck: (projectRoot: string, scope: Scope, name: string) =>
        call<SkillUpdateCheck>("skills_update_check", {
          projectRoot,
          scope,
          name,
        }),
      update_check: (projectRoot: string, scope: Scope, name: string) =>
        call<SkillUpdateCheck>("skills_update_check", {
          projectRoot,
          scope,
          name,
        }),
      updatePlan: (projectRoot: string, scope: Scope, name: string) =>
        call<SkillUpdatePlan>("skills_update_plan", {
          projectRoot,
          scope,
          name,
        }),
      update_plan: (projectRoot: string, scope: Scope, name: string) =>
        call<SkillUpdatePlan>("skills_update_plan", {
          projectRoot,
          scope,
          name,
        }),
      updateApply: (projectRoot: string, scope: Scope, name: string) =>
        call<SkillUpdateApplied>("skills_update_apply", {
          projectRoot,
          scope,
          name,
        }),
      update_apply: (projectRoot: string, scope: Scope, name: string) =>
        call<SkillUpdateApplied>("skills_update_apply", {
          projectRoot,
          scope,
          name,
        }),
      trust: (projectRoot: string, scope: Scope, name: string) =>
        call<SkillInfo>("skills_trust", { projectRoot, scope, name }),
      enable: (
        projectRoot: string,
        scope: Scope,
        name: string,
        enabled: boolean,
      ) =>
        call<SkillInfo>("skills_enable", {
          projectRoot,
          scope,
          name,
          enabled,
        }),
    },

    // === commands namespace ===
    commands: {
      list: () => call<void>("commands_list"),
      expand: () => call<void>("commands_expand"),
    },

    // === terminal namespace ===
    terminal: {
      list: () => call<void>("terminal_list"),
      attach: () => call<void>("terminal_attach"),
      write: () => call<void>("terminal_write"),
      resize: () => call<void>("terminal_resize"),
    },

    // === Backward-compatible flat helpers ===
    /** `host.info` — see `tethys-api::TethysApi`. */
    hostInfo: () => call<HostInfo>("host_info"),
    /** `host.health` — see `tethys-api::TethysApi`. */
    health: () => call<HealthStatus>("health"),
    /** `search.files` — see `tethys-api::TethysApi`. */
    searchFiles: (query: string, limit = 20) =>
      call<SearchItem[]>("search_files", { query, limit }),
    /** `git.diff.synthetic` — S0.1 diff benchmark generator */
    getSyntheticDiff: (lineCount = 20000) =>
      call<DiffHunk[]>("generate_synthetic_diff", { lineCount }),
    /** `bench.stream` — S0.1 IPC channel streaming */
    runStreamBenchmark: async (
      config: BenchmarkConfig,
      onChunk: (chunk: StreamChunk) => void,
    ): Promise<BenchmarkResult> => {
      const channel = new Channel<StreamChunk>();
      channel.onmessage = onChunk;
      return call<BenchmarkResult>("run_stream_benchmark", {
        config,
        onChunk: channel,
      });
    },
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
  CommitResult,
  DiffFile,
  DiffFileDetail,
  DiffFileStatus,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffSource,
  DiffSummary,
  HealthStatus,
  HostInfo,
  HunkRef,
  ProjectGitConfig,
  RestoreOutcome,
  RestorePolicy,
  RestoreTarget,
  SearchItem,
  SetupOutcome,
  StreamChunk,
  UndoCapture,
  WorktreeInfo,
  WorktreeSpec,
};
