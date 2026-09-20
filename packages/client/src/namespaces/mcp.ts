//! `mcp.*` client namespace. Wave 2 owner: D (M1.11).
//!
//! TODO(D): type `health` against tethys-api; it is still `call<void>()`.

import type {
  Applied,
  AttachmentGrid,
  ImportCandidate,
  ImportScan,
  ProjectionPlan,
  RegistryEntry,
  RegistryEntryView,
  Scope,
  TargetId,
  VerifyStatus,
} from "@tethys/bindings";

import type { Call } from "../transport";

export function mcpNamespace(call: Call) {
  return {
    registryList: (workspaceId?: string) =>
      call<RegistryEntryView[]>("mcp_registry_list", { workspaceId }),
    registry_list: (workspaceId?: string) =>
      call<RegistryEntryView[]>("mcp_registry_list", { workspaceId }),
    registrySet: (
      name: string,
      entry: RegistryEntry,
      scope: Scope,
      workspaceId?: string,
    ) => call<void>("mcp_registry_set", { name, entry, scope, workspaceId }),
    registry_set: (
      name: string,
      entry: RegistryEntry,
      scope: Scope,
      workspaceId?: string,
    ) => call<void>("mcp_registry_set", { name, entry, scope, workspaceId }),
    registryDelete: (name: string, scope: Scope, workspaceId?: string) =>
      call<boolean>("mcp_registry_delete", { name, scope, workspaceId }),
    registry_delete: (name: string, scope: Scope, workspaceId?: string) =>
      call<boolean>("mcp_registry_delete", { name, scope, workspaceId }),
    effective: (providerId?: string, workspaceId?: string) =>
      call<RegistryEntryView[]>("mcp_effective", { providerId, workspaceId }),
    attachments: (workspaceId: string) =>
      call<AttachmentGrid>("mcp_attachments", { workspaceId }),
    projectionPlan: (workspaceId: string, target: TargetId, scope: Scope) =>
      call<ProjectionPlan>("mcp_projection_plan", {
        workspaceId,
        target,
        scope,
      }),
    projection_plan: (workspaceId: string, target: TargetId, scope: Scope) =>
      call<ProjectionPlan>("mcp_projection_plan", {
        workspaceId,
        target,
        scope,
      }),
    projectionApply: (
      workspaceId: string,
      target: TargetId,
      scope: Scope,
      plan: ProjectionPlan,
    ) =>
      call<Applied>("mcp_projection_apply", {
        workspaceId,
        target,
        scope,
        plan,
      }),
    projection_apply: (
      workspaceId: string,
      target: TargetId,
      scope: Scope,
      plan: ProjectionPlan,
    ) =>
      call<Applied>("mcp_projection_apply", {
        workspaceId,
        target,
        scope,
        plan,
      }),
    projectionRollback: (workspaceId: string, target: TargetId, scope: Scope) =>
      call<void>("mcp_projection_rollback", { workspaceId, target, scope }),
    projection_rollback: (
      workspaceId: string,
      target: TargetId,
      scope: Scope,
    ) => call<void>("mcp_projection_rollback", { workspaceId, target, scope }),
    projectionVerify: (workspaceId: string, target: TargetId, scope: Scope) =>
      call<VerifyStatus>("mcp_projection_verify", {
        workspaceId,
        target,
        scope,
      }),
    projection_verify: (workspaceId: string, target: TargetId, scope: Scope) =>
      call<VerifyStatus>("mcp_projection_verify", {
        workspaceId,
        target,
        scope,
      }),
    importScan: (workspaceId: string) =>
      call<ImportScan>("mcp_import_scan", { workspaceId }),
    import_scan: (workspaceId: string) =>
      call<ImportScan>("mcp_import_scan", { workspaceId }),
    importApply: (
      workspaceId: string,
      candidates: ImportCandidate[],
      scope: Scope,
    ) =>
      call<string[]>("mcp_import_apply", {
        workspaceId,
        candidates,
        scope,
      }),
    import_apply: (
      workspaceId: string,
      candidates: ImportCandidate[],
      scope: Scope,
    ) =>
      call<string[]>("mcp_import_apply", {
        workspaceId,
        candidates,
        scope,
      }),
    health: () => call<void>("mcp_health"),
  };
}
