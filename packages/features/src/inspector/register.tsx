import type { TurnMessageEntry } from "@tethys/state";
import { registerEntryRenderer, registerInspectorSlot } from "@tethys/ui";
import { ProviderArtifactRenderer } from "../providers/provider-artifact";
import { ActivityLedger } from "./activity-ledger";
import { PlanPanel } from "./renderers/plan-panel";
import { TerminalEntryRenderer } from "./renderers/terminal-entry";
import { ThoughtBlockRenderer } from "./renderers/thought-block";
import { ToolAccordionRenderer } from "./renderers/tool-accordion";
import { TurnMessageRenderer } from "./renderers/turn-message";
import { TurnNoticeRenderer } from "./renderers/turn-notice";

function TurnMessageRendererEntry({
  entry,
  className,
}: {
  entry: TurnMessageEntry;
  className?: string;
}) {
  if (entry.role === "Thought") {
    return <ThoughtBlockRenderer entry={entry} className={className} />;
  }
  return <TurnMessageRenderer entry={entry} className={className} />;
}

/**
 * Composition seam: registers every transcript renderer at module scope, so
 * importing `InspectorScreen` is sufficient and no shell file is edited.
 *
 * The plan and the activity ledger are presented in the Inspector
 * (`registerInspectorSlot`), so their stage entries render nothing rather than
 * falling to `UnknownEntryRenderer`.
 */
export function registerInspectorRenderers(): void {
  registerEntryRenderer("turn_message", TurnMessageRendererEntry);
  registerEntryRenderer("tool_call", ToolAccordionRenderer);
  registerEntryRenderer("terminal", TerminalEntryRenderer);
  registerEntryRenderer("turn_notice", TurnNoticeRenderer);
  registerEntryRenderer("provider_artifact", ProviderArtifactRenderer);
  registerEntryRenderer("plan", () => null);
  registerInspectorSlot("plan", PlanPanel);
  registerInspectorSlot("activity-ledger", ActivityLedger);
}

registerInspectorRenderers();
