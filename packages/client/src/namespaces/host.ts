//! `host.*` client namespace. Wave 2 owner: shared/stable.

import type { HealthStatus, HostInfo } from "@tethys/bindings";

import type { Call } from "../transport";

export function hostNamespace(call: Call) {
  return {
    info: () => call<HostInfo>("host_info"),
    pair: () => call<void>("host_pair"),
    health: () => call<HealthStatus>("health"),
  };
}
