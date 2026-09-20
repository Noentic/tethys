//! `permission.*` client namespace. Wave 2 owner: A (M1.8).
//!
//! `respond` sends the user's chosen `option_id` back to the parked resolver;
//! `elicitationRespond` sends the typed answer to the elicitation responder.

import type { ElicitationResponse } from "@tethys/bindings";

import type { Call } from "../transport";

export function permissionNamespace(call: Call) {
  return {
    respond: (threadId: string, reqId: string, optionId?: string | null) =>
      call<void>("permission_respond", { threadId, reqId, optionId }),
    elicitationRespond: (threadId: string, response: ElicitationResponse) =>
      call<void>("elicitation_respond", { threadId, response }),
    elicitation_respond: (threadId: string, response: ElicitationResponse) =>
      call<void>("elicitation_respond", { threadId, response }),
    rulesList: () => call<void>("permission_rules_list"),
    rules_list: () => call<void>("permission_rules_list"),
    rulesSet: () => call<void>("permission_rules_set"),
    rules_set: () => call<void>("permission_rules_set"),
    rulesDelete: () => call<void>("permission_rules_delete"),
    rules_delete: () => call<void>("permission_rules_delete"),
  };
}
