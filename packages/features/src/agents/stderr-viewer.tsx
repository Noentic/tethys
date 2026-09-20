//! stderr viewer (spec §5.2) — the captured ring buffer in a sunken well.

import { cn } from "@tethys/ui";

export interface StderrViewerProps {
  text: string;
  className?: string;
}

export function StderrViewer({
  text,
  className,
}: StderrViewerProps): React.ReactElement {
  if (text.trim().length === 0) {
    return (
      <div
        data-testid="stderr-viewer"
        className={cn(
          "rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-sunken) p-3 font-mono text-mono-micro text-(--tethys-text-muted)",
          className,
        )}
      >
        No stderr output.
      </div>
    );
  }

  return (
    <pre
      data-testid="stderr-viewer"
      className={cn(
        "max-h-64 overflow-auto rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-sunken) p-3 font-mono text-mono-micro whitespace-pre-wrap text-(--tethys-text-secondary)",
        className,
      )}
    >
      {text}
    </pre>
  );
}
