//! Registers the composer's action-bar slots at feature-module scope (A1), so
//! importing the composer feature is sufficient and no shell file is edited.

import { registerActionBarSlot } from "@tethys/ui";
import { MODE_PILL_PRIORITY, ModePill } from "./mode-pill";
import { QUEUE_COUNT_PRIORITY, QueueCountSlot } from "./queue-count-slot";

export function registerComposerSlots(): void {
  // The shell (M1.6c) renders `queue-count` natively from the `queueCount`
  // prop at DESIGN's priority; registering the component keeps the slot
  // addressable by id while the native path stays the live one.
  registerActionBarSlot("queue-count", QueueCountSlot, QUEUE_COUNT_PRIORITY);
  // `mode` is the shell's declared registry seam (ACTION_BAR_PRIORITY.mode).
  registerActionBarSlot("mode", ModePill, MODE_PILL_PRIORITY);
}

registerComposerSlots();
