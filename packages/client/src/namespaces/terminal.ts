//! `terminal.*` client namespace. Wave 2 owner: A (M1.7 display-only terminal).
//!
//! TODO(A): type `list`, `attach`, `write` and `resize` against tethys-api;
//! every wrapper is still `call<void>()`.

import type { Call } from "../transport";

export function terminalNamespace(call: Call) {
  return {
    list: () => call<void>("terminal_list"),
    attach: () => call<void>("terminal_attach"),
    write: () => call<void>("terminal_write"),
    resize: () => call<void>("terminal_resize"),
  };
}
