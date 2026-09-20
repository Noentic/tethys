//! Provider presentation helpers: health → dot status + human sentence.
//!
//! P2/P3 of DESIGN.md's interaction principles: a non-healthy state always
//! carries its reason in words, and "enabled but unreachable" (a fault) is
//! worded differently from "switched off" (a choice).

import type { AgentProfileView } from "@tethys/bindings";

/** A `status-dot` status string for a profile row. */
export function providerDotStatus(profile: AgentProfileView): string {
  if (!profile.enabled) return "disabled";
  switch (profile.health) {
    case "healthy":
      return "healthy";
    case "auth-required":
      return "auth_required";
    case "not-found":
      return "not_found";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

/** The row's mono status subtext — the reason in words. */
export function providerStatusText(profile: AgentProfileView): string {
  if (!profile.enabled) return "Disabled in Tethys settings";
  switch (profile.health) {
    case "healthy": {
      const version = profile.detected_version;
      return version
        ? `Healthy — ACP handshake verified (v${version})`
        : "Healthy — ACP handshake verified";
    }
    case "auth-required":
      return profile.detail ?? "Auth required — sign in to continue";
    case "not-found":
      return (
        profile.detail ??
        `Not found — ${profile.launch_spec.program} is not installed or not on PATH`
      );
    case "error":
      return profile.detail ?? "Error — the last health check failed";
    default:
      return "Not checked yet";
  }
}

/** Telemetry badge text for a completed check, or null while unknown. */
export function healthBadgeText(profile: AgentProfileView): string | null {
  if (profile.last_checked_ms == null) return null;
  if (profile.recheck === "checking") return "Checking…";
  const seconds = Math.max(
    0,
    Math.round((Date.now() - profile.last_checked_ms) / 1000),
  );
  return seconds < 60
    ? `Checked ${seconds}s ago`
    : `Checked ${Math.round(seconds / 60)}m ago`;
}
