//! `thread.*` client namespace. Wave 2 owners: C (M1.10, most of the
//! namespace) and E (M1.12 `cancel_state`).

import type {
  CancelState,
  ContentBlock,
  CreateThread,
  PermissionMode,
  QueuedPrompt,
  ThreadSummary,
} from "@tethys/bindings";

import type { Call } from "../transport";

export function threadNamespace(call: Call) {
  return {
    create: (request: CreateThread) =>
      call<ThreadSummary>("thread_create", { request }),
    list: () => call<ThreadSummary[]>("thread_list"),
    get: () => call<void>("thread_get"),
    prompt: (id: string, blocks: ContentBlock[]) =>
      call<void>("thread_prompt", { id, blocks }),
    queueList: (id: string) =>
      call<QueuedPrompt[]>("thread_queue_list", { id }),
    queue_list: (id: string) =>
      call<QueuedPrompt[]>("thread_queue_list", { id }),
    queueAdd: (id: string, blocks: ContentBlock[]) =>
      call<QueuedPrompt>("thread_queue_add", { id, blocks }),
    queue_add: (id: string, blocks: ContentBlock[]) =>
      call<QueuedPrompt>("thread_queue_add", { id, blocks }),
    queueRemove: (id: string, queuedId: string) =>
      call<void>("thread_queue_remove", { id, queuedId }),
    queue_remove: (id: string, queuedId: string) =>
      call<void>("thread_queue_remove", { id, queuedId }),
    queueReorder: (id: string, orderedIds: string[]) =>
      call<void>("thread_queue_reorder", { id, orderedIds }),
    queue_reorder: (id: string, orderedIds: string[]) =>
      call<void>("thread_queue_reorder", { id, orderedIds }),
    cancel: (id: string) => call<void>("thread_cancel", { id }),
    cancelState: (id: string) =>
      call<CancelState>("thread_cancel_state", { id }),
    cancel_state: (id: string) =>
      call<CancelState>("thread_cancel_state", { id }),
    resume: (id: string) => call<void>("thread_resume", { id }),
    importSessions: () => call<void>("thread_import_sessions"),
    import_sessions: () => call<void>("thread_import_sessions"),
    fork: () => call<void>("thread_fork"),
    archive: (id: string) => call<void>("thread_archive", { id }),
    delete: (id: string) => call<void>("thread_delete", { id }),
    setConfigOption: (id: string, optionId: string, value: string) =>
      call<void>("thread_set_config_option", { id, optionId, value }),
    set_config_option: (id: string, optionId: string, value: string) =>
      call<void>("thread_set_config_option", { id, optionId, value }),
    setPermissionMode: (id: string, mode: PermissionMode) =>
      call<void>("thread_set_permission_mode", { id, mode }),
    set_permission_mode: (id: string, mode: PermissionMode) =>
      call<void>("thread_set_permission_mode", { id, mode }),
  };
}
