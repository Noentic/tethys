//! `permission.*` client namespace. Wave 2 owner: A (M1.8).
//!
//! TODO(A): type `respond` and the rules methods against tethys-api; every
//! wrapper is still `call<void>()`.

import type { Call } from "../transport";

export function permissionNamespace(call: Call) {
  return {
    respond: () => call<void>("permission_respond"),
    rulesList: () => call<void>("permission_rules_list"),
    rules_list: () => call<void>("permission_rules_list"),
    rulesSet: () => call<void>("permission_rules_set"),
    rules_set: () => call<void>("permission_rules_set"),
    rulesDelete: () => call<void>("permission_rules_delete"),
    rules_delete: () => call<void>("permission_rules_delete"),
  };
}
