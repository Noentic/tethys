import { registerInspectorSlot } from "@tethys/ui";
import { ReviewPanel } from "./review-panel";

/**
 * Registers the Changes surface at feature-module scope.
 */
export function registerReviewSlots(): void {
  registerInspectorSlot("review", ReviewPanel);
}

registerReviewSlots();
