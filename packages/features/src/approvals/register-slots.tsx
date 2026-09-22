import {
  getAllComposerContextSlots,
  registerApprovalDrawerBody,
} from "@tethys/ui";
import { InboxDrawer } from "./InboxDrawer";

/**
 * Registers the real approval inbox at feature-module scope. Provider ACP mode
 * is the only execution-mode control in the thread composer; Tethys keeps its
 * permission policy in the workspace/session state without duplicating it here.
 */
export function registerApprovalSlots(): void {
  registerApprovalDrawerBody(InboxDrawer);
}

registerApprovalSlots();

/** Re-exported so tests can assert the registration landed. */
export { getAllComposerContextSlots };
