import type { DiffSource, DiffSummary } from "@tethys/bindings";
import type { SessionState } from "@tethys/state";
import { useEffect, useMemo, useState } from "react";
import { useSessionState } from "../inspector/use-session-state";
import { useReviewClient } from "./client-context";

/** Tool kinds that can change files on disk. */
const WRITING_KINDS = new Set(["edit", "delete", "move", "execute", "other"]);
const IN_FLIGHT = new Set(["running", "awaiting_approval"]);

/**
 * A key that changes whenever the worktree can have changed: a file-writing
 * tool call settled, or a turn stopped. Pure over session state, so a test can
 * assert it without a store.
 */
export function diffRevision(state: SessionState): string {
  let settledWrites = 0;
  for (const entry of state.entries) {
    if (
      entry.kind === "tool_call" &&
      "status" in entry &&
      (entry.status === "Completed" || entry.status === "Failed") &&
      WRITING_KINDS.has(
        ("toolKind" in entry ? entry.toolKind : null) ?? "other",
      )
    ) {
      settledWrites += 1;
    }
  }
  const inFlight = IN_FLIGHT.has(state.status) ? 1 : 0;
  return `${state.turnCount}:${settledWrites}:${inFlight}`;
}

/** `diffRevision` for one session, for passing to `useDiffSummary`. */
export function useDiffRevision(sessionId: string): string {
  const state = useSessionState(sessionId);
  return useMemo(() => diffRevision(state), [state]);
}

function sourceKey(source: DiffSource | null): string | null {
  return source === null ? null : JSON.stringify(source);
}

/**
 * D12 fixture-backed diff hook. The real source is `git.diff.summary`
 * (`client.git.diffSummary`); tests inject a fixture-returning client through
 * `ReviewClientProvider`. Refetches when `revision` changes and keeps the last
 * summary for the same source visible while it does, so a refresh never
 * blanks the surface. Returns `summary: null` before the first answer or when
 * the workspace has no diff.
 */
export function useDiffSummary(
  source: DiffSource | null,
  revision: string | number = 0,
): {
  summary: DiffSummary | null;
  loading: boolean;
} {
  const client = useReviewClient();
  const key = sourceKey(source);
  const [result, setResult] = useState<{
    key: string | null;
    summary: DiffSummary | null;
    loading: boolean;
  }>({ key: null, summary: null, loading: false });
  const current = result.key === key;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands in for `source`; `revision` is a refetch trigger
  useEffect(() => {
    if (source === null) {
      setResult({ key: null, summary: null, loading: false });
      return;
    }
    let active = true;
    setResult((previous) =>
      previous.key === key
        ? { ...previous, loading: true }
        : { key, summary: null, loading: true },
    );
    void client.git
      .diffSummary(source)
      .then((next) => {
        if (active) setResult({ key, summary: next, loading: false });
      })
      .catch(() => {
        if (active) setResult({ key, summary: null, loading: false });
      });
    return () => {
      active = false;
    };
  }, [client, key, revision]);

  return {
    summary: current ? result.summary : null,
    loading: source !== null && (!current || result.loading),
  };
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
