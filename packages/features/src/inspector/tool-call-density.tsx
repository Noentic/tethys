//! Persisted tool-call density preference (M1.7 U15): `Summary` groups runs,
//! `Full` renders every call as its own accordion with no groups.

import { SegmentedControl } from "@tethys/ui";
import { useSyncExternalStore } from "react";

export type ToolCallDensity = "summary" | "full";

const STORAGE_KEY = "tethys.tool-call-density";
const listeners = new Set<() => void>();

function readStored(): ToolCallDensity {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "full"
      ? "full"
      : "summary";
  } catch {
    return "summary";
  }
}

let current: ToolCallDensity = readStored();

export function getToolCallDensity(): ToolCallDensity {
  return current;
}

export function setToolCallDensity(density: ToolCallDensity): void {
  current = density;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, density);
  } catch {
    // Storage unavailable (tests, privacy mode): the in-memory value holds.
  }
  for (const listener of listeners) {
    listener();
  }
}

export function useToolCallDensity(): ToolCallDensity {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}

/** Settings / General `Tool call density` control. */
export function ToolCallDensityRow({ className }: { className?: string }) {
  const density = useToolCallDensity();
  return (
    <fieldset aria-label="Tool call density" className={className}>
      <SegmentedControl
        size="sm"
        options={[
          { value: "summary", label: "Summary" },
          { value: "full", label: "Full" },
        ]}
        value={density}
        onChange={(value) => setToolCallDensity(value as ToolCallDensity)}
      />
    </fieldset>
  );
}
