import { registerEntryRenderer } from "@tethys/ui";
import { ElicitationCard } from "./elicitation-card";
import { PermissionRequestCard } from "./permission-request-card";

/**
 * Registers the two inline interaction cards through the entry-renderer
 * registry — one renderer per entry kind, so each stays a deep module with a
 * narrow prop and the backend guarantees an elicitation entry only exists for
 * a Provider that used elicitation.
 */
export function registerApprovalRenderers(): void {
  registerEntryRenderer("permission_request", PermissionRequestCard);
  registerEntryRenderer("elicitation", ElicitationCard);
}

registerApprovalRenderers();
