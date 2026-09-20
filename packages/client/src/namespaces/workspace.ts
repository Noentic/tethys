//! `workspace.*` client namespace. Wave 2 owner: F (M1.16).
//!
//! TODO(F): type `list`, `add`, `remove`, `settings*` and `status` against
//! tethys-api once M1.16 lands the workspace catalog and trust flow.

import type { WorkspaceCapabilities } from "@tethys/bindings";

import type { Call } from "../transport";

export function workspaceNamespace(call: Call) {
  return {
    list: () => call<void>("workspace_list"),
    add: () => call<void>("workspace_add"),
    remove: () => call<void>("workspace_remove"),
    settingsGet: () => call<void>("workspace_settings_get"),
    settings_get: () => call<void>("workspace_settings_get"),
    settingsSet: () => call<void>("workspace_settings_set"),
    settings_set: () => call<void>("workspace_settings_set"),
    status: () => call<void>("workspace_status"),
    capabilities: (workspaceId: string) =>
      call<WorkspaceCapabilities>("workspace_capabilities", { workspaceId }),
  };
}
