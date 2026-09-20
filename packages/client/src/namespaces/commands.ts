//! `commands.*` client namespace. Wave 2 owner: C (M1.10 composer).

import type { CommandInfo, ExpandedCommand } from "@tethys/bindings";

import type { Call } from "../transport";

export function commandsNamespace(call: Call) {
  return {
    list: (workspaceId?: string) =>
      call<CommandInfo[]>("commands_list", { workspaceId }),
    expand: (command: string, argsText = "", workspaceId?: string) =>
      call<ExpandedCommand>("commands_expand", {
        command,
        argsText,
        workspaceId,
      }),
  };
}
