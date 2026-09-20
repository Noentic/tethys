import type { ElicitationResponse, EventEnvelope } from "@tethys/bindings";
import { createContext, type ReactNode, useContext } from "react";

/**
 * The narrow slice of the client the interaction cards need. `InspectorScreen`
 * provides it; the inline cards read it so no registry component has to receive
 * the client as a prop.
 */
export interface InspectorClient {
  permission: {
    respond(
      threadId: string,
      reqId: string,
      optionId?: string | null,
    ): Promise<void>;
    elicitationRespond(
      threadId: string,
      response: ElicitationResponse,
    ): Promise<void>;
  };
  events?: {
    subscribe(
      threadId: string,
      sinceSeq: number,
      onEvent: (event: EventEnvelope) => void,
    ): Promise<void>;
  };
}

export interface InspectorClientContextValue {
  client: InspectorClient;
  threadId: string;
}

const InspectorClientContext =
  createContext<InspectorClientContextValue | null>(null);

export function InspectorClientProvider({
  client,
  threadId,
  children,
}: InspectorClientContextValue & { children: ReactNode }) {
  return (
    <InspectorClientContext.Provider value={{ client, threadId }}>
      {children}
    </InspectorClientContext.Provider>
  );
}

export function useInspectorClient(): InspectorClientContextValue | null {
  return useContext(InspectorClientContext);
}
