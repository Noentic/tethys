import type { DiffSource, DiffSummary } from "@tethys/bindings";
import { useEffect, useState } from "react";
import { useReviewClient } from "./client-context";

/**
 * D12 fixture-backed diff hook. The real source is `git.diff.summary`
 * (`client.git.diffSummary`); tests inject a fixture-returning client through
 * `ReviewClientProvider`. Returns `summary: null` while loading or when the
 * workspace has no diff.
 */
export function useDiffSummary(source: DiffSource | null): {
  summary: DiffSummary | null;
  loading: boolean;
} {
  const client = useReviewClient();
  const [summary, setSummary] = useState<DiffSummary | null>(null);

  useEffect(() => {
    if (source === null) {
      setSummary(null);
      return;
    }
    let active = true;
    void client.git
      .diffSummary(source)
      .then((next) => {
        if (active) setSummary(next);
      })
      .catch(() => {
        if (active) setSummary(null);
      });
    return () => {
      active = false;
    };
  }, [client, source]);

  return { summary, loading: source !== null && summary === null };
}

/** The default review anchor: HEAD to the live worktree. */
export function defaultDiffSource(threadId: string): DiffSource {
  return { HeadWorktree: { thread_id: threadId } };
}

/** A one-line argument summary for the draft command. */
export function summarizeDiff(summary: DiffSummary): string {
  const files = summary.files
    .map((file) => `${file.path} +${file.additions} −${file.deletions}`)
    .join("\n");
  return `${summary.files.length} file(s), +${summary.additions} −${summary.deletions}\n${files}`;
}
