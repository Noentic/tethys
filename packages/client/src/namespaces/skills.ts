//! `skills.*` client namespace. Wave 2 owner: D (M1.11).

import type {
  Scope,
  SkillImportSource,
  SkillInfo,
  SkillUpdateApplied,
  SkillUpdateCheck,
  SkillUpdatePlan,
} from "@tethys/bindings";

import type { Call } from "../transport";

export function skillsNamespace(call: Call) {
  return {
    list: (workspaceId: string) =>
      call<SkillInfo[]>("skills_list", { workspaceId }),
    import: (workspaceId: string, scope: Scope, source: SkillImportSource) =>
      call<SkillInfo>("skills_import", { workspaceId, scope, source }),
    updateCheck: (workspaceId: string, scope: Scope, name: string) =>
      call<SkillUpdateCheck>("skills_update_check", {
        workspaceId,
        scope,
        name,
      }),
    update_check: (workspaceId: string, scope: Scope, name: string) =>
      call<SkillUpdateCheck>("skills_update_check", {
        workspaceId,
        scope,
        name,
      }),
    updatePlan: (workspaceId: string, scope: Scope, name: string) =>
      call<SkillUpdatePlan>("skills_update_plan", {
        workspaceId,
        scope,
        name,
      }),
    update_plan: (workspaceId: string, scope: Scope, name: string) =>
      call<SkillUpdatePlan>("skills_update_plan", {
        workspaceId,
        scope,
        name,
      }),
    updateApply: (workspaceId: string, scope: Scope, name: string) =>
      call<SkillUpdateApplied>("skills_update_apply", {
        workspaceId,
        scope,
        name,
      }),
    update_apply: (workspaceId: string, scope: Scope, name: string) =>
      call<SkillUpdateApplied>("skills_update_apply", {
        workspaceId,
        scope,
        name,
      }),
    trust: (workspaceId: string, scope: Scope, name: string) =>
      call<SkillInfo>("skills_trust", { workspaceId, scope, name }),
    enable: (
      workspaceId: string,
      scope: Scope,
      name: string,
      enabled: boolean,
    ) =>
      call<SkillInfo>("skills_enable", {
        workspaceId,
        scope,
        name,
        enabled,
      }),
  };
}
