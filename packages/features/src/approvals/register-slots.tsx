import {
  getAllComposerContextSlots,
  registerApprovalDrawerBody,
  registerComposerContextSlot,
} from "@tethys/ui";
import { InboxDrawer } from "./InboxDrawer";
import { PermissionModePill } from "./permission-mode-pill";

/**
 * Registers the permission-mode pill and the real inbox as the approval-drawer
 * body at feature-module scope (overview amendment 1). M1.6c's render-time
 * precedence makes them win over the shell defaults whichever module imports
 * first, so no shell file is edited.
 *
 * The pill's priority is DESIGN's `permission-mode` (70), matching the shell's
 * fold constant.
 */
export function registerApprovalSlots(): void {
  registerComposerContextSlot("permission-mode", PermissionModePill, 70);
  registerApprovalDrawerBody(InboxDrawer);
}

registerApprovalSlots();

/** Re-exported so tests can assert the registration landed. */
export { getAllComposerContextSlots };
