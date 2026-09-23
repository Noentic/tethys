import { render, screen, waitFor } from "@testing-library/react";
import type { DiffSummary } from "@tethys/bindings";
import {
  getOrCreateSessionStore,
  type SessionEntry,
  type ToolCallEntry,
  type TurnMessageEntry,
} from "@tethys/state";
import { describe, expect, it } from "vitest";
import {
  type ReviewClient,
  ReviewClientProvider,
} from "../review/client-context";
import { InspectorSummary } from "./inspector-summary";

const SESSION = "s-summary";

function userMessage(timestamp: number): TurnMessageEntry {
  return {
    id: "m1",
    kind: "turn_message",
    role: "User",
    content: "Fix the expiry bug",
    timestamp,
  };
}

function toolCall(partial: Partial<ToolCallEntry>): ToolCallEntry {
  return {
    id: "t1",
    kind: "tool_call",
    toolCallId: "t1",
    title: "Edit file",
    status: "Completed",
    locations: [],
    timestamp: 0,
    ...partial,
  };
}

function seed(entries: SessionEntry[]): void {
  const store = getOrCreateSessionStore(SESSION);
  store.setState((prev) => ({ ...prev, entries, liveEntries: entries }));
}

const summaryFixture: DiffSummary = {
  source: { HeadWorktree: { thread_id: SESSION } },
  files: [
    {
      path: "src/jwt.rs",
      old_path: null,
      status: "Modified",
      additions: 42,
      deletions: 12,
      binary: false,
      collapsed: false,
    },
  ],
  additions: 42,
  deletions: 12,
};

function fakeClient(diffSummary: DiffSummary | null): ReviewClient {
  return {
    git: {
      diffSummary: async () => {
        if (!diffSummary) {
          throw new Error("no git");
        }
        return diffSummary;
      },
      diffFile: async () => {
        throw new Error("unused");
      },
      stage: async () => {},
      unstage: async () => {},
      discard: async () => {},
      commit: async () => ({
        oid: "abc",
        summary: "done",
        ahead_of_base: 1,
      }),
      checkpointRestore: async () => ({
        restored_worktree_tree: "w",
        restored_index_tree: "i",
        undo: {
          worktree_ref: "r",
          index_ref: "r",
          worktree_tree: "w",
          index_tree: "i",
        },
      }),
    },
  };
}

function renderBand(diffSummary: DiffSummary | null = summaryFixture) {
  return render(
    <ReviewClientProvider client={fakeClient(diffSummary)}>
      {/* The review gate is exercised where it is resolved; this band's own
          tests pin the capability so the diff stat is deterministic. */}
      <InspectorSummary sessionId={SESSION} capabilityFixture="git-remote" />
    </ReviewClientProvider>,
  );
}

describe("Inspector rollup band (d0-rc9)", () => {
  it("splits the diff stat into two colours, never one", async () => {
    seed([userMessage(0)]);
    renderBand();

    await waitFor(() =>
      expect(screen.getByTestId("summary-diff-lines")).toBeDefined(),
    );
    const added = screen.getByText("+42");
    const removed = screen.getByText("−12");
    expect(added.className).toContain("text-diff-added");
    expect(removed.className).toContain("text-diff-removed");
  });

  it("counts commands and durations from the session's own entries", async () => {
    seed([
      userMessage(0),
      toolCall({
        id: "t1",
        toolCallId: "t1",
        toolKind: "execute",
        timestamp: 30_000,
      }),
      toolCall({
        id: "t2",
        toolCallId: "t2",
        toolKind: "edit",
        locations: [{ path: "src/jwt.rs", line: 42 }],
        timestamp: 124_000,
      }),
    ]);
    renderBand();

    expect(screen.getByTestId("summary-commands").textContent).toBe("1 cmd");
    expect(screen.getByTestId("summary-duration").textContent).toBe("2m 04s");
  });

  it("omits the diff metric entirely where the workspace has no git (P9)", async () => {
    seed([userMessage(0), toolCall({ toolKind: "execute", timestamp: 5_000 })]);
    renderBand(null);

    await waitFor(() =>
      expect(screen.getByTestId("summary-commands")).toBeDefined(),
    );
    expect(screen.queryByTestId("summary-diff-lines")).toBeNull();
    // Files still reports from the tool calls rather than going blank.
    expect(screen.getByTestId("summary-files").textContent).toBe("0 files");
  });

  it("renders nothing for a session with no reportable activity", () => {
    seed([]);
    const { container } = renderBand(null);
    expect(
      container.querySelector('[data-testid="inspector-summary"]'),
    ).toBeNull();
  });
});
