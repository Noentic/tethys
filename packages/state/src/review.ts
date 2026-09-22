import type { WorkspaceCapabilities } from "@tethys/bindings";
import { useMemo } from "react";
import { useSessionCapabilities } from "./queries";
import type { WorkspaceCapabilityFixture } from "./workspace-capabilities";

/**
 * The review surface's resolved gate (M1.9 U6). One value every review gate
 * reads, derived from `workspace.capabilities` rather than re-deriving VCS
 * status (AD-15).
 */
export interface ReviewGate {
  showDiff: boolean;
  showStage: boolean;
  showRevert: boolean;
  /** Non-null when the whole surface is hidden, with a stated reason. */
  hiddenReason: string | null;
}

export const NO_GIT_REVERT_REASON = "no git · no revert";

export function resolveReviewGate(
  capabilities: WorkspaceCapabilities,
): ReviewGate {
  const hasVcs = capabilities.vcs.kind !== "none";
  return {
    showDiff: hasVcs,
    showStage: hasVcs,
    showRevert: hasVcs && capabilities.restore,
    hiddenReason: hasVcs ? null : NO_GIT_REVERT_REASON,
  };
}

/**
 * The gate for one session's workspace, read from the live
 * `workspace.list` row (`workspace.capabilities`); a `fixture` is the test
 * override. While the workspace is unresolved the gate hides everything and
 * states no reason, so the surface is absent rather than claiming `no git`.
 */
export function useWorkspaceReviewCapability(
  sessionId: string,
  fixture?: WorkspaceCapabilityFixture,
): ReviewGate {
  const capabilities = useSessionCapabilities(sessionId, fixture);
  return useMemo(
    () =>
      capabilities === null
        ? {
            showDiff: false,
            showStage: false,
            showRevert: false,
            hiddenReason: null,
          }
        : resolveReviewGate(capabilities),
    [capabilities],
  );
}
