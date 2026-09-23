import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiffSource, DiffSummary } from "@tethys/bindings";
import { InspectorControlProvider } from "@tethys/ui";
import { describe, expect, it, vi } from "vitest";
import {
  type ReviewClient,
  ReviewClientProvider,
} from "../review/client-context";
import { TurnReceipt } from "./turn-receipt";

describe("TurnReceipt", () => {
  it("reverts its own turn and offers the matching undo", async () => {
    const summary: DiffSummary = {
      source: { TurnStartEnd: { thread_id: "thread-1", turn: 3 } },
      files: [
        {
          path: "src/a.ts",
          old_path: null,
          status: "Modified",
          additions: 2,
          deletions: 1,
          binary: false,
          collapsed: false,
        },
      ],
      additions: 2,
      deletions: 1,
    };
    const git: ReviewClient["git"] = {
      diffSummary: vi.fn((_source: DiffSource) => Promise.resolve(summary)),
      diffFile: vi.fn(),
      stage: vi.fn().mockResolvedValue(undefined),
      unstage: vi.fn().mockResolvedValue(undefined),
      discard: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn(),
      checkpointRestore: vi.fn().mockResolvedValue({
        restored_worktree_tree: "restored-worktree",
        restored_index_tree: "restored-index",
        undo: {
          worktree_ref: "undo-ref",
          index_ref: "undo-ref",
          worktree_tree: "undo-worktree",
          index_tree: "undo-index",
        },
      }),
    };
    const client: ReviewClient = { git };
    const openChanges = vi.fn();

    render(
      <ReviewClientProvider client={client}>
        <InspectorControlProvider value={{ open: vi.fn(), openChanges }}>
          <TurnReceipt sessionId="thread-1" turn={3} canRestore canReview />
        </InspectorControlProvider>
      </ReviewClientProvider>,
    );

    expect(await screen.findByText("Changed 1 file")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View changes" }));
    expect(openChanges).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: "Revert turn" }));
    await waitFor(() =>
      expect(git.checkpointRestore).toHaveBeenNthCalledWith(
        1,
        { Checkpoint: { thread_id: "thread-1", turn: 3, phase: "Start" } },
        "Force",
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(git.checkpointRestore).toHaveBeenNthCalledWith(
        2,
        {
          Trees: {
            thread_id: "thread-1",
            worktree_tree: "undo-worktree",
            index_tree: "undo-index",
          },
        },
        "Force",
      ),
    );
  });
});
