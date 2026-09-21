import type { ElicitationResponse, EventEnvelope } from "@tethys/bindings";
import { createContext, type ReactNode, useContext } from "react";
import type { DockedComposerClient } from "./composer/docked-prompt-card";

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
  /**
   * What the docked composer calls: prompt, queue, cancel, config, and the
   * `/` and `@` sources. `TethysClient` has all of it. A client without it (a
   * preview, a test) simply has no composer.
   */
  thread?: DockedComposerClient["thread"];
  commands?: DockedComposerClient["commands"];
  search?: DockedComposerClient["search"];
}

/** Whether the client carries everything the docked composer needs. */
export function canDockComposer(
  client: InspectorClient,
): client is InspectorClient & DockedComposerClient {
  return (
    client.thread !== undefined &&
    client.commands !== undefined &&
    client.search !== undefined
  );
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
