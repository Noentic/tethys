import type { WorkspaceCapabilities } from "@tethys/bindings";
import {
  type WorkspaceCapabilityFixture,
  workspaceCapabilityFixtures,
} from "@tethys/state";

/**
 * D12 fixture-backed capability hook. The real source is worktree F's resolver
 * (`crates/tethys-core/src/workspace/capability.rs`), swapped at the Wave 2
 * checkpoint; this hook never re-invents the canonical fixtures.
 */
export function useCapabilities(
  fixture: WorkspaceCapabilityFixture = "git-remote",
): WorkspaceCapabilities {
  return workspaceCapabilityFixtures[fixture];
}
