import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiffFile, DiffSource, DiffSummary } from "@tethys/bindings";
import { InspectorControlProvider } from "@tethys/ui";
import { describe, expect, it, vi } from "vitest";
import { BranchBar } from "./branch-bar";
import { type ReviewClient, ReviewClientProvider } from "./client-context";

function createClient() {
  const file: DiffFile = {
    path: "src/a.ts",
    old_path: null,
    status: "Modified",
    additions: 3,
    deletions: 1,
    binary: false,
    collapsed: false,
  };
  const summary: DiffSummary = {
    source: { HeadWorktree: { thread_id: "t1" } },
    files: [file],
    additions: 3,
    deletions: 1,
  };
  const git: ReviewClient["git"] = {
    diffSummary: vi.fn((_source: DiffSource) => Promise.resolve(summary)),
    diffFile: vi.fn(),
    stage: vi.fn().mockResolvedValue(undefined),
    unstage: vi.fn().mockResolvedValue(undefined),
    discard: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue({
      oid: "abc123456789",
      summary: "done",
      ahead_of_base: 2,
    }),
    checkpointRestore: vi.fn(),
  };
  const client: ReviewClient = {
    git,
    commands: {
      expand: vi.fn().mockResolvedValue({
        text: "Draft commit message",
        references: [],
      }),
    },
  };
  return { client, git };
}

describe("BranchBar", () => {
  it("opens Changes and commits from its popover", async () => {
    const { client, git } = createClient();
    const openChanges = vi.fn();
    render(
      <ReviewClientProvider client={client}>
        <InspectorControlProvider value={{ open: vi.fn(), openChanges }}>
          <BranchBar sessionId="t1" branchName="feat/review" />
        </InspectorControlProvider>
      </ReviewClientProvider>,
    );

    expect(await screen.findByText("+3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(openChanges).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Commit…" }));
    const textarea = (await screen.findByLabelText(
      "Commit message",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("Draft commit message"));
    expect(screen.getByText("1 changed file")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    await waitFor(() =>
      expect(git.commit).toHaveBeenCalledWith("t1", "Draft commit message"),
    );
    expect(screen.getByText("✓ abc1234 · 2 ahead of HEAD")).toBeTruthy();
  });

  it("shows the capability-free state without git actions", () => {
    render(<BranchBar sessionId="t1" noGit />);
    expect(screen.getByText("no git · no revert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Commit…" })).toBeNull();
  });
});
