import { renderHook, waitFor } from "@testing-library/react";
import type { DiffSource, DiffSummary } from "@tethys/bindings";
import { createInitialSessionState, type SessionState } from "@tethys/state";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { type ReviewClient, ReviewClientProvider } from "./client-context";
import { diffRevision, useDiffSummary } from "./use-review-diff";

const SOURCE: DiffSource = { HeadWorktree: { thread_id: "t1" } };

function summary(count: number): DiffSummary {
  return {
    source: SOURCE,
    files: Array.from({ length: count }, (_, index) => ({
      path: `f${index}.md`,
      old_path: null,
      status: "Modified",
      additions: 1,
      deletions: 1,
      binary: false,
      collapsed: false,
    })),
    additions: count,
    deletions: count,
  };
}

function wrapperFor(client: ReviewClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <ReviewClientProvider client={client}>{children}</ReviewClientProvider>
  );
}

describe("useDiffSummary", () => {
  it("refetches when the revision changes and keeps the last answer meanwhile", async () => {
    const diffSummary = vi
      .fn()
      .mockResolvedValueOnce(summary(0))
      .mockResolvedValueOnce(summary(1));
    const client = { git: { diffSummary } } as unknown as ReviewClient;
    const { result, rerender } = renderHook(
      ({ revision }) => useDiffSummary(SOURCE, revision),
      { initialProps: { revision: "a" }, wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.summary?.files).toHaveLength(0));

    rerender({ revision: "b" });
    expect(result.current.summary?.files).toHaveLength(0);
    await waitFor(() => expect(result.current.summary?.files).toHaveLength(1));
    expect(diffSummary).toHaveBeenCalledTimes(2);
  });
});

describe("diffRevision", () => {
  const base = createInitialSessionState("t1", "claude-acp", "w1");

  it("changes when a file-writing tool call settles", () => {
    const withEdit = {
      ...base,
      entries: [
        {
          id: "e1",
          kind: "tool_call",
          timestamp: 0,
          toolCallId: "c1",
          title: "Edit README.md",
          status: "Completed",
          toolKind: "edit",
          locations: [],
        },
      ],
    } as unknown as SessionState;
    expect(diffRevision(withEdit)).not.toBe(diffRevision(base));
  });

  it("ignores a read", () => {
    const withRead = {
      ...base,
      entries: [
        {
          id: "e1",
          kind: "tool_call",
          timestamp: 0,
          toolCallId: "c1",
          title: "Read README.md",
          status: "Completed",
          toolKind: "read",
          locations: [],
        },
      ],
    } as unknown as SessionState;
    expect(diffRevision(withRead)).toBe(diffRevision(base));
  });
});
