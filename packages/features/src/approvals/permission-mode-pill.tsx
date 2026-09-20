import type { PermissionMode } from "@tethys/bindings";
import { createClient } from "@tethys/client";
import { getSessionStore, PERMISSION_MODE_LABELS } from "@tethys/state";
import { SegmentedControl } from "@tethys/ui";
import { useMemo, useSyncExternalStore } from "react";

const client = createClient();

/**
 * The permission-mode pill (PRM-01). Registered through the action-bar slot
 * registry under the id `permission-mode`, which supersedes the shell's default
 * `Mode:` badge. Reads `PERMISSION_MODE_LABELS` so a schema rename is a compile
 * error, and writes `thread.set_permission_mode`.
 */
export function PermissionModePill({
  sessionId,
  className,
}: {
  sessionId?: string;
  className?: string;
}) {
  const store = sessionId ? getSessionStore(sessionId) : undefined;

  const mode = useSyncExternalStore(
    (onStoreChange) => {
      if (!store) {
        return () => {};
      }
      const subscription = store.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => store?.state.permissionMode ?? "supervised",
  );

  const options = useMemo(
    () =>
      (Object.keys(PERMISSION_MODE_LABELS) as PermissionMode[]).map(
        (value) => ({
          value,
          label: PERMISSION_MODE_LABELS[value],
        }),
      ),
    [],
  );

  const onChange = (next: PermissionMode) => {
    store?.setState((prev) => ({ ...prev, permissionMode: next }));
    if (sessionId) {
      void client.thread.setPermissionMode(sessionId, next).catch(() => {
        // The optimistic mode stays; a failed write is reconciled on reload.
      });
    }
  };

  return (
    <fieldset aria-label="Permission mode" className={className}>
      <SegmentedControl
        size="sm"
        options={options}
        value={mode}
        onChange={onChange}
      />
    </fieldset>
  );
}
