import { registerComposerContextSlot, registerInspectorSlot } from "@tethys/ui";
import { DIFF_SUMMARY_PRIORITY, DiffSummaryPill } from "./diff-summary-pill";
import { ReviewPanel } from "./review-panel";

/**
 * Registers the review surface and the D6 diff-summary pill at feature-module
 * scope (overview amendment A1), so importing the review feature is sufficient
 * and no shell file — including `apps/desktop/src/main.tsx` — is edited.
 */
export function registerReviewSlots(): void {
  registerInspectorSlot("review", ReviewPanel);
  registerComposerContextSlot(
    "diff-summary",
    DiffSummaryPill,
    DIFF_SUMMARY_PRIORITY,
  );
}

registerReviewSlots();
