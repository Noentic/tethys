import { createClient } from "@tethys/client";
import {
  type ElicitationEntry,
  type InboxItem,
  type PermissionRequestEntry,
  selectInboxItems,
  sessionsRegistryStore,
} from "@tethys/state";
import { cn } from "@tethys/ui";
import { useSyncExternalStore } from "react";
import { InspectorClientProvider } from "../client-context";
import { ElicitationCard } from "./elicitation-card";
import { PermissionRequestCard } from "./permission-request-card";

const client = createClient();

function permissionEntry(item: InboxItem): PermissionRequestEntry {
  return {
    id: `perm-${item.reqId}`,
    kind: "permission_request",
    timestamp: 0,
    request: item.permission ?? {
      reqId: item.reqId,
      title: item.title,
      description: item.description,
      options: [],
    },
  };
}

function elicitationEntry(item: InboxItem): ElicitationEntry {
  return {
    id: `elicit-${item.reqId}`,
    kind: "elicitation",
    reqId: item.reqId,
    timestamp: 0,
    request: item.elicitation?.request ?? {
      req_id: item.reqId,
      title: item.title,
      description: item.description,
      url: null,
      fields: [],
    },
  };
}

/**
 * The real approval-drawer body (UI-03). It renders `selectInboxItems` — the
 * same projection the inline cards read — so the drawer and the transcript
 * share one source of truth.
 */
export function InboxDrawer({
  onOpenSession,
  className,
}: {
  sessions?: Array<{ sessionId: string; title: string; status: string }>;
  onOpenSession: (sessionId: string) => void;
  className?: string;
}) {
  const registry = useSyncExternalStore(
    (onStoreChange) => {
      const subscription = sessionsRegistryStore.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => sessionsRegistryStore.state,
  );
  const items = selectInboxItems(Object.values(registry.sessions));

  if (items.length === 0) {
    return (
      <div
        data-testid="inbox-empty"
        className={cn(
          "py-2xl text-center text-body-sm text-(--tethys-text-muted)",
          className,
        )}
      >
        Nothing is waiting on you.
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-md", className)}>
      {items.map((item) => (
        <div
          key={`${item.sessionId}-${item.reqId}`}
          className="flex flex-col gap-sm"
        >
          <button
            type="button"
            onClick={() => onOpenSession(item.sessionId)}
            className="self-start text-label-sm text-(--tethys-text-secondary) underline"
          >
            {item.sessionTitle}
          </button>
          <InspectorClientProvider client={client} threadId={item.sessionId}>
            {item.permission && (
              <PermissionRequestCard entry={permissionEntry(item)} />
            )}
            {item.elicitation && (
              <ElicitationCard entry={elicitationEntry(item)} />
            )}
          </InspectorClientProvider>
        </div>
      ))}
    </div>
  );
}
