import type React from "react";
import { createContext, useContext } from "react";

export interface InspectorControl {
  /** Opens the Inspector: the overlay at narrow widths, or expands a docked panel. */
  open: () => void;
}

const noopControl: InspectorControl = { open: () => {} };

const InspectorControlContext = createContext<InspectorControl>(noopControl);

export function InspectorControlProvider({
  value,
  children,
}: {
  value: InspectorControl;
  children: React.ReactNode;
}) {
  return (
    <InspectorControlContext.Provider value={value}>
      {children}
    </InspectorControlContext.Provider>
  );
}

/**
 * Shell-provided control for slot components. Outside a provider `open()` is a
 * no-op, so isolated component tests need no provider.
 */
export function useInspectorControl(): InspectorControl {
  return useContext(InspectorControlContext);
}
