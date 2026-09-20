//! `workspace.*` client namespace. Wave 2 owner: F (M1.16).

import type {
  TrustGrant,
  WorkspaceCapabilities,
  WorkspaceListItem,
  WorkspaceTrustState,
} from "@tethys/bindings";

import type { Call } from "../transport";

export function workspaceNamespace(call: Call) {
  return {
    list: () => call<WorkspaceListItem[]>("workspace_list"),
    add: (request: TrustGrant) =>
      call<WorkspaceListItem>("workspace_add", { request }),
    remove: (workspaceId: string) =>
      call<void>("workspace_remove", { workspaceId }),
    settingsGet: () => call<void>("workspace_settings_get"),
    settings_get: () => call<void>("workspace_settings_get"),
    settingsSet: () => call<void>("workspace_settings_set"),
    settings_set: () => call<void>("workspace_settings_set"),
    status: (workspaceId: string) =>
      call<WorkspaceTrustState>("workspace_status", { workspaceId }),
    capabilities: (workspaceId: string) =>
      call<WorkspaceCapabilities>("workspace_capabilities", { workspaceId }),
  };
}
