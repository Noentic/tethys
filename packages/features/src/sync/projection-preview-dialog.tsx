//! Projection preview dialog (spec §5.4): read-only plan diff plus the
//! `providers` list naming which configured Providers depend on the target file.

import type { EntryState, ProjectionPlan } from "@tethys/bindings";
import { Badge, ModalDialog } from "@tethys/ui";

const ENTRY_TONE: Record<
  EntryState,
  "default" | "muted" | "warning" | "danger" | "success"
> = {
  pending: "muted",
  "in-sync": "success",
  drifted: "warning",
  conflict: "danger",
  unsupported: "muted",
};

export interface ProjectionPreviewDialogProps {
  open: boolean;
  plan: ProjectionPlan | null;
  onClose: () => void;
  onApply: () => void;
  applying?: boolean;
  conflictMessage?: string | null;
}

export function ProjectionPreviewDialog({
  open,
  plan,
  onClose,
  onApply,
  applying = false,
  conflictMessage,
}: ProjectionPreviewDialogProps) {
  const providers = plan?.providers ?? [];
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Preview vendor-file projection"
      description={plan?.path}
      maxWidth="max-w-[640px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring text-label-md text-(--tethys-text-secondary) hover:text-(--tethys-text-primary)"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applying || plan === null}
            className="focus-ring rounded-md bg-(--tethys-primary) px-3.5 py-1.5 text-body-sm font-medium text-(--tethys-on-primary) disabled:pointer-events-none disabled:opacity-40"
          >
            Apply
          </button>
        </>
      }
    >
      {conflictMessage && (
        <p
          role="alert"
          className="mb-md text-body-sm text-(--tethys-status-danger)"
        >
          {conflictMessage}
        </p>
      )}

      {plan === null ? (
        <p className="text-body-sm text-(--tethys-text-muted)">
          No plan to preview.
        </p>
      ) : (
        <div className="flex flex-col gap-md">
          <section className="flex flex-col gap-1">
            <h3 className="text-label-sm text-(--tethys-text-muted)">
              Providers using this file
            </h3>
            {providers.length === 0 ? (
              <p className="text-body-sm text-(--tethys-text-muted)">None</p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {providers.map((provider) => (
                  <li key={provider}>
                    <Badge variant="outline" size="sm">
                      {provider}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-1">
            <h3 className="text-label-sm text-(--tethys-text-muted)">
              Entries
            </h3>
            <ul className="flex flex-col gap-1">
              {plan.entries.map((entry) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between gap-sm"
                >
                  <span className="font-mono text-mono-code text-(--tethys-text-secondary)">
                    {entry.name}
                  </span>
                  <Badge variant={ENTRY_TONE[entry.state]} size="sm">
                    {entry.state}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-1">
            <h3 className="text-label-sm text-(--tethys-text-muted)">Diff</h3>
            <pre
              data-testid="projection-diff"
              className="max-h-72 overflow-auto rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-sunken) p-md font-mono text-mono-micro text-(--tethys-text-secondary)"
            >
              {plan.diff}
            </pre>
          </section>
        </div>
      )}
    </ModalDialog>
  );
}
