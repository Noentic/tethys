import type { WorkspaceCapabilities } from "@tethys/bindings";
import {
  type WorkspaceCapabilityFixture,
  workspaceCapabilityFixtures,
} from "./workspace-capabilities";

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
 * D12 fixture-backed capability hook. The real source is worktree F's resolver
 * (`crates/tethys-core/src/workspace/capability.rs`), swapped at the Wave 2
 * checkpoint; it never re-invents the canonical fixtures.
 */
export function useWorkspaceReviewCapability(
  fixture: WorkspaceCapabilityFixture = "git-remote",
): ReviewGate {
  return resolveReviewGate(workspaceCapabilityFixtures[fixture]);
}
