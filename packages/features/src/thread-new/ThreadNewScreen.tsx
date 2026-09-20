//! `/thread/new` screen — thin composition over `PromptCard` + start-session.
//! The route mounts this and nothing else (M1.10 U10).

import type { AgentCommand } from "@tethys/bindings";
import { createClient, type TethysClient } from "@tethys/client";
import type { ProviderConnection, TrustedWorkspace } from "@tethys/state";
import { PromptCard } from "./prompt-card";
import { type Navigate, startSession } from "./start-session";

const defaultClient = createClient();

export interface ThreadNewScreenProps {
  client?: TethysClient;
  providers?: ProviderConnection[];
  workspaces?: TrustedWorkspace[];
  initialWorkspace?: TrustedWorkspace | null;
  agentCommands?: AgentCommand[];
  navigate: Navigate;
  className?: string;
}

export function ThreadNewScreen({
  client = defaultClient,
  providers,
  workspaces,
  initialWorkspace = null,
  agentCommands = [],
  navigate,
  className,
}: ThreadNewScreenProps) {
  return (
    <div
      className={
        className ??
        "flex h-full w-full flex-col items-center justify-center px-12 pb-[12vh]"
      }
    >
      <h1 className="mb-xl text-center text-display-lg text-(--tethys-text-primary) select-none">
        What are we building today?
      </h1>
      <PromptCard
        client={client}
        providers={providers}
        workspaces={workspaces}
        initialWorkspace={initialWorkspace}
        agentCommands={agentCommands}
        onStart={(input) => startSession(client, input, navigate)}
      />
    </div>
  );
}
