import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiffFile, DiffFileDetail, DiffSummary } from "@tethys/bindings";
import {
  clearRegistriesForTesting,
  getAllComposerContextSlots,
  getAllInspectorSlots,
} from "@tethys/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ReviewClient, ReviewClientProvider } from "./client-context";
import { registerReviewSlots } from "./register";
import { ReviewPanel } from "./review-panel";

function diffFile(path: string, partial: Partial<DiffFile> = {}): DiffFile {
  return {
    path,
    old_path: null,
    status: "Modified",
    additions: 3,
    deletions: 1,
    binary: false,
    collapsed: false,
    ...partial,
  };
}

function summary(files: DiffFile[]): DiffSummary {
  return {
    source: { HeadWorktree: { thread_id: "t1" } },
    files,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
  };
}

function fileDetail(path: string): DiffFileDetail {
  return {
    path,
    binary: false,
    collapsed: false,
    additions: 1,
    deletions: 1,
    hunks: [
      {
        old_start: 1,
        old_lines: 1,
        new_start: 1,
        new_lines: 1,
        lines: [
          { kind: "Deletion", text: "let x = 1;" },
          { kind: "Addition", text: "let x = 2;" },
        ],
      },
    ],
  };
}

function fakeClient(overrides: Partial<ReviewClient["git"]> = {}): {
  client: ReviewClient;
  git: ReviewClient["git"];
} {
  const git: ReviewClient["git"] = {
    diffSummary: vi.fn().mockResolvedValue(summary([diffFile("src/a.ts")])),
    diffFile: vi.fn((_source, path: string) =>
      Promise.resolve(fileDetail(path)),
    ),
    stage: vi.fn().mockResolvedValue(undefined),
    unstage: vi.fn().mockResolvedValue(undefined),
    discard: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue({ oid: "abc", summary: "done" }),
    checkpointRestore: vi.fn().mockResolvedValue({
      restored_worktree_tree: "w",
      restored_index_tree: "i",
      undo: {
        worktree_ref: "r",
        index_ref: "r",
        worktree_tree: "w",
        index_tree: "i",
      },
    }),
    ...overrides,
  };
  return {
    git,
    client: {
      git,
      commands: {
        expand: vi
          .fn()
          .mockResolvedValue({ text: "Draft: add review UI", references: [] }),
      },
    },
  };
}

function renderPanel(
  client: ReviewClient,
  capabilityFixture:
    | "git-remote"
    | "git-local"
    | "git-no-restore"
    | "no-git" = "git-remote",
) {
  return render(
    <ReviewClientProvider client={client}>
      <ReviewPanel sessionId="t1" capabilityFixture={capabilityFixture} />
    </ReviewClientProvider>,
  );
}

describe("ReviewPanel (M1.9 U7)", () => {
  beforeEach(() => {
    clearRegistriesForTesting();
  });

  it("renders the no-git explanation and nothing else", () => {
    const { client } = fakeClient();
    renderPanel(client, "no-git");
    expect(screen.getByText("no git · no revert")).toBeTruthy();
    expect(screen.queryByTestId("review-panel")).toBeNull();
    expect(screen.queryByTestId("commit-box")).toBeNull();
    expect(screen.queryByTestId("file-header")).toBeNull();
  });

  it("git-no-restore: review and commit render, but no revert trigger", async () => {
    const { client } = fakeClient();
    renderPanel(client, "git-no-restore");
    await waitFor(() => expect(screen.getByTestId("file-header")).toBeTruthy());
    expect(screen.getByTestId("commit-box")).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Restore worktree to before this turn",
      }),
    ).toBeNull();
  });

  it("stages a whole path, not a hunk ref", async () => {
    const { client, git } = fakeClient();
    renderPanel(client);
    await waitFor(() => expect(screen.getByTestId("file-header")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Stage" }));
    expect(git.stage).toHaveBeenCalledWith("t1", ["src/a.ts"]);
  });

  it("discards a single hunk with its HunkRef", async () => {
    const { client, git } = fakeClient();
    renderPanel(client);
    await waitFor(() => expect(screen.getByTestId("file-header")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /src\/a\.ts/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Discard hunk 1" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard hunk 1" }));
    expect(git.discard).toHaveBeenCalledWith("t1", expect.anything(), [
      { path: "src/a.ts", hunk_index: 0 },
    ]);
  });

  it("drafts with the agent and commits the edited message", async () => {
    const { client, git } = fakeClient();
    renderPanel(client);
    await waitFor(() => expect(screen.getByTestId("commit-box")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Draft with agent" }));
    const textarea = (await screen.findByLabelText(
      "Commit message",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("Draft: add review UI"));
    fireEvent.change(textarea, { target: { value: "Final message" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve & Commit/ }));
    await waitFor(() =>
      expect(git.commit).toHaveBeenCalledWith("t1", "Final message"),
    );
  });

  it("shows the restore trigger only when restore is available", async () => {
    const { client, git } = fakeClient();
    renderPanel(client, "git-remote");
    await waitFor(() => expect(screen.getByTestId("commit-box")).toBeTruthy());
    fireEvent.click(
      screen.getByRole("button", {
        name: "Restore worktree to before this turn",
      }),
    );
    expect(git.checkpointRestore).toHaveBeenCalledWith(
      { Checkpoint: { thread_id: "t1", turn: 1, phase: "Start" } },
      "Force",
    );
  });

  it("never shows a previous file's detail while another loads", async () => {
    let resolveB: (detail: DiffFileDetail) => void = () => {};
    const pendingB = new Promise<DiffFileDetail>((resolve) => {
      resolveB = resolve;
    });
    const { client } = fakeClient({
      diffSummary: vi
        .fn()
        .mockResolvedValue(
          summary([diffFile("src/a.ts"), diffFile("src/b.ts")]),
        ),
      diffFile: vi.fn((_source, path: string) =>
        path === "src/b.ts" ? pendingB : Promise.resolve(fileDetail(path)),
      ),
    });
    renderPanel(client);
    await waitFor(() =>
      expect(screen.getAllByTestId("file-header")).toHaveLength(2),
    );
    fireEvent.click(screen.getByRole("button", { name: /src\/a\.ts/ }));
    await waitFor(() =>
      expect(screen.getByTestId("diff-viewer").getAttribute("aria-label")).toBe(
        "Diff for src/a.ts",
      ),
    );
    // While B is still loading, A's detail must not linger under B's header.
    fireEvent.click(screen.getByRole("button", { name: /src\/b\.ts/ }));
    await waitFor(() => expect(screen.queryByTestId("diff-viewer")).toBeNull());
    resolveB(fileDetail("src/b.ts"));
    await waitFor(() =>
      expect(screen.getByTestId("diff-viewer").getAttribute("aria-label")).toBe(
        "Diff for src/b.ts",
      ),
    );
  });

  it("renders no forge action in any fixture", async () => {
    const { client } = fakeClient();
    renderPanel(client);
    await waitFor(() => expect(screen.getByTestId("commit-box")).toBeTruthy());
    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent ?? "").not.toMatch(/push|pull request|merge/i);
    }
  });

  it("registers the review slot through the inspector registry", () => {
    registerReviewSlots();
    expect(getAllInspectorSlots().map(([id]) => id)).toContain("review");
    expect(getAllComposerContextSlots().map(([id]) => id)).toContain(
      "diff-summary",
    );
  });
});
