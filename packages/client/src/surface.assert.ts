//! Compile-time assertion that `createClient`'s public surface is unchanged.
//!
//! R3 requires the client's surface — every namespace key, every camel/snake
//! alias and every flat back-compat helper — to survive the namespace split
//! verbatim. This file is typechecked (`tsc --noEmit` includes all of `src`)
//! and fails to compile if any of them disappears.

import type { TethysClient } from "./index";

type Assert<T extends true> = T;

interface ExpectedClientSurface {
  transport: unknown;
  host: {
    info: unknown;
    pair: unknown;
    health: unknown;
  };
  workspace: {
    list: unknown;
    add: unknown;
    remove: unknown;
    settingsGet: unknown;
    settings_get: unknown;
    settingsSet: unknown;
    settings_set: unknown;
    status: unknown;
    capabilities: unknown;
  };
  agent: {
    profilesList: unknown;
    profiles_list: unknown;
    profilesCreate: unknown;
    profiles_create: unknown;
    profilesUpdate: unknown;
    profiles_update: unknown;
    profilesDelete: unknown;
    profiles_delete: unknown;
    registryList: unknown;
    registry_list: unknown;
    registryInstall: unknown;
    registry_install: unknown;
    registryUpdate: unknown;
    registry_update: unknown;
    connectionsList: unknown;
    connections_list: unknown;
    connectionsRestart: unknown;
    connections_restart: unknown;
    login: unknown;
    logout: unknown;
    stderr: unknown;
    configSchema: unknown;
    config_schema: unknown;
    configGet: unknown;
    config_get: unknown;
    configValidate: unknown;
    config_validate: unknown;
    configPlan: unknown;
    config_plan: unknown;
    configApply: unknown;
    config_apply: unknown;
    configRollback: unknown;
    config_rollback: unknown;
  };
  thread: {
    create: unknown;
    list: unknown;
    get: unknown;
    prompt: unknown;
    queueList: unknown;
    queue_list: unknown;
    queueAdd: unknown;
    queue_add: unknown;
    queueRemove: unknown;
    queue_remove: unknown;
    queueReorder: unknown;
    queue_reorder: unknown;
    cancel: unknown;
    resume: unknown;
    importSessions: unknown;
    import_sessions: unknown;
    fork: unknown;
    archive: unknown;
    delete: unknown;
    setConfigOption: unknown;
    set_config_option: unknown;
    setPermissionMode: unknown;
    set_permission_mode: unknown;
  };
  events: {
    subscribe: unknown;
    unsubscribe: unknown;
    inboxSubscribe: unknown;
    inbox_subscribe: unknown;
  };
  permission: {
    respond: unknown;
    rulesList: unknown;
    rules_list: unknown;
    rulesSet: unknown;
    rules_set: unknown;
    rulesDelete: unknown;
    rules_delete: unknown;
  };
  git: {
    worktreeCreate: unknown;
    worktree_create: unknown;
    worktreeRemove: unknown;
    worktree_remove: unknown;
    worktreeList: unknown;
    worktree_list: unknown;
    worktreeArchive: unknown;
    worktree_archive: unknown;
    checkpointCreate: unknown;
    checkpoint_create: unknown;
    checkpointRestore: unknown;
    checkpoint_restore: unknown;
    checkpointList: unknown;
    checkpoint_list: unknown;
    diffSummary: unknown;
    diff_summary: unknown;
    diffFile: unknown;
    diff_file: unknown;
    stage: unknown;
    unstage: unknown;
    discard: unknown;
    commit: unknown;
    merge: unknown;
    push: unknown;
    prCreate: unknown;
    pr_create: unknown;
  };
  search: {
    files: unknown;
  };
  mcp: {
    registryList: unknown;
    registry_list: unknown;
    registrySet: unknown;
    registry_set: unknown;
    registryDelete: unknown;
    registry_delete: unknown;
    effective: unknown;
    attachments: unknown;
    projectionPlan: unknown;
    projection_plan: unknown;
    projectionApply: unknown;
    projection_apply: unknown;
    projectionRollback: unknown;
    projection_rollback: unknown;
    projectionVerify: unknown;
    projection_verify: unknown;
    importScan: unknown;
    import_scan: unknown;
    importApply: unknown;
    import_apply: unknown;
    health: unknown;
  };
  skills: {
    list: unknown;
    import: unknown;
    updateCheck: unknown;
    update_check: unknown;
    updatePlan: unknown;
    update_plan: unknown;
    updateApply: unknown;
    update_apply: unknown;
    trust: unknown;
    enable: unknown;
  };
  commands: {
    list: unknown;
    expand: unknown;
  };
  terminal: {
    list: unknown;
    attach: unknown;
    write: unknown;
    resize: unknown;
  };
  hostInfo: unknown;
  health: unknown;
  searchFiles: unknown;
  getSyntheticDiff: unknown;
  runStreamBenchmark: unknown;
}

export type ClientSurfacePreserved = Assert<
  TethysClient extends ExpectedClientSurface ? true : false
>;
