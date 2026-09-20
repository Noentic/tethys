//! `process-row` (DESIGN.md): one sampled process in a thread's tree.

import type { ProcessSample } from "@tethys/bindings";

export function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(1)} MiB`;
}

export function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

export interface ProcessRowProps {
  sample: ProcessSample;
  destructive?: boolean;
  className?: string;
}

export function ProcessRow({
  sample,
  destructive = false,
  className,
}: ProcessRowProps): React.ReactElement {
  return (
    <tr
      data-testid="process-row"
      data-leader={sample.leader}
      data-destructive={destructive || undefined}
      className={`h-9 border-b border-(--tethys-hairline) text-mono-micro ${
        destructive
          ? "text-(--tethys-status-danger)"
          : "text-(--tethys-text-secondary)"
      } ${className ?? ""}`}
    >
      <td className="px-3 py-1.5 font-mono">
        {sample.pid}
        {sample.leader ? " · leader" : ""}
      </td>
      <td className="px-3 py-1.5 font-mono">{(sample.cpu ?? 0).toFixed(1)}%</td>
      <td className="px-3 py-1.5 font-mono">{formatBytes(sample.rss ?? 0)}</td>
      <td className="px-3 py-1.5 font-mono">
        {formatUptime(sample.uptime_secs)}
      </td>
      <td className="px-3 py-1.5 font-mono">{sample.state}</td>
    </tr>
  );
}
