//! Transport-agnostic API client.
//!
//! Same hooks work against the in-process core (Tauri invoke) and — later —
//! a remote `tethysd` (WebSocket). This is the seam that keeps the webview
//! free of transport conditionals.

import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  BenchmarkConfig,
  BenchmarkResult,
  DiffHunk,
  HealthStatus,
  HostInfo,
  SearchItem,
  StreamChunk,
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
      worktreeCreate: () => call<void>("git_worktree_create"),
      worktree_create: () => call<void>("git_worktree_create"),
      worktreeRemove: () => call<void>("git_worktree_remove"),
      worktree_remove: () => call<void>("git_worktree_remove"),
      worktreeList: () => call<void>("git_worktree_list"),
      worktree_list: () => call<void>("git_worktree_list"),
      checkpointCreate: () => call<void>("git_checkpoint_create"),
      checkpoint_create: () => call<void>("git_checkpoint_create"),
      checkpointRestore: () => call<void>("git_checkpoint_restore"),
      checkpoint_restore: () => call<void>("git_checkpoint_restore"),
      checkpointList: () => call<void>("git_checkpoint_list"),
      checkpoint_list: () => call<void>("git_checkpoint_list"),
      diffSummary: () => call<void>("git_diff_summary"),
      diff_summary: () => call<void>("git_diff_summary"),
      diffFile: () => call<void>("git_diff_file"),
      diff_file: () => call<void>("git_diff_file"),
      stage: () => call<void>("git_stage"),
      unstage: () => call<void>("git_unstage"),
      discard: () => call<void>("git_discard"),
      commit: () => call<void>("git_commit"),
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
      registryList: () => call<void>("mcp_registry_list"),
      registry_list: () => call<void>("mcp_registry_list"),
      registrySet: () => call<void>("mcp_registry_set"),
      registry_set: () => call<void>("mcp_registry_set"),
      registryDelete: () => call<void>("mcp_registry_delete"),
      registry_delete: () => call<void>("mcp_registry_delete"),
      effective: () => call<void>("mcp_effective"),
      projectionPlan: () => call<void>("mcp_projection_plan"),
      projection_plan: () => call<void>("mcp_projection_plan"),
      projectionApply: () => call<void>("mcp_projection_apply"),
      projection_apply: () => call<void>("mcp_projection_apply"),
      projectionRollback: () => call<void>("mcp_projection_rollback"),
      projection_rollback: () => call<void>("mcp_projection_rollback"),
      importScan: () => call<void>("mcp_import_scan"),
      import_scan: () => call<void>("mcp_import_scan"),
      importApply: () => call<void>("mcp_import_apply"),
      import_apply: () => call<void>("mcp_import_apply"),
      health: () => call<void>("mcp_health"),
    },

    // === skills namespace ===
    skills: {
      list: () => call<void>("skills_list"),
      import: () => call<void>("skills_import"),
      updateCheck: () => call<void>("skills_update_check"),
      update_check: () => call<void>("skills_update_check"),
      updateApply: () => call<void>("skills_update_apply"),
      update_apply: () => call<void>("skills_update_apply"),
      trust: () => call<void>("skills_trust"),
      enable: () => call<void>("skills_enable"),
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
  DiffHunk,
  HealthStatus,
  HostInfo,
  SearchItem,
  StreamChunk,
};
