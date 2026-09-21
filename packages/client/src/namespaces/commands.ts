//! `commands.*` client namespace. Wave 2 owner: C (M1.10 composer).

import type {
  CommandInfo,
  CommandScope,
  CommandSource,
  ExpandedCommand,
} from "@tethys/bindings";

import type { Call } from "../transport";

export function commandsNamespace(call: Call) {
  return {
    list: (workspaceId?: string, includeShadowed = false) =>
      call<CommandInfo[]>("commands_list", { workspaceId, includeShadowed }),
    expand: (command: string, argsText = "", workspaceId?: string) =>
      call<ExpandedCommand>("commands_expand", {
        command,
        argsText,
        workspaceId,
      }),
    read: (scope: CommandScope, name: string, workspaceId?: string) =>
      call<CommandSource>("commands_read", { scope, name, workspaceId }),
    write: (
      scope: CommandScope,
      name: string,
      body: string,
      workspaceId?: string,
    ) =>
      call<CommandInfo>("commands_write", {
        scope,
        name,
        body,
        workspaceId,
      }),
    delete: (scope: CommandScope, name: string, workspaceId?: string) =>
      call<null>("commands_delete", { scope, name, workspaceId }),
  };
}
