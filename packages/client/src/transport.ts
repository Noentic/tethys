//! Transport seam shared by every client namespace.

import { invoke } from "@tauri-apps/api/core";

export type Transport = "tauri" | "websocket";

export interface ClientOptions {
  transport?: Transport;
  /** Base URL for `websocket` transport (Phase 3, unused in S0.0). */
  baseUrl?: string;
}

/** Invokes one Tauri command by name; the unit every namespace closes over. */
export type Call = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export function createCall(transport: Transport): Call {
  return async <T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    if (transport === "tauri") {
      return invoke<T>(command, args);
    }
    throw new Error(`transport "${transport}" not implemented in S0.0`);
  };
}
