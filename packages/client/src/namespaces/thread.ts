//! `thread.*` client namespace. Wave 2 owners: C (M1.10, most of the
//! namespace) and E (M1.12 `cancel_state`).
//!
//! TODO(C): type `create`, `queue*`, `prompt` and friends against tethys-api;
//! every wrapper is still `call<void>()` with no arguments.

import type { CancelState } from "@tethys/bindings";

import type { Call } from "../transport";

export function threadNamespace(call: Call) {
  return {
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
    cancelState: (id: string) =>
      call<CancelState>("thread_cancel_state", { id }),
    cancel_state: (id: string) =>
      call<CancelState>("thread_cancel_state", { id }),
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
  };
}
