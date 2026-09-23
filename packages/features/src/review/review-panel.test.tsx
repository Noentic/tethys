import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  DiffFile,
  DiffFileDetail,
  DiffSummary,
  WorktreeInfo,
} from "@tethys/bindings";
import { COMPOSER_INSERT_CHIP_EVENT } from "@tethys/composer";
import {
  clearAllSessionStoresForTesting,
  getOrCreateSessionStore,
} from "@tethys/state";
import {
  clearRegistriesForTesting,
  getAllComposerContextSlots,
  getAllInspectorSlots,
} from "@tethys/ui";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type ReviewClient, ReviewClientProvider } from "./client-context";
import { registerReviewSlots } from "./register";
import { ReviewPanel } from "./review-panel";

const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);
const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.testid === "diff-scroll" ? 400 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.testid === "diff-scroll" ? 800 : 0;
    },
  });
});
afterAll(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetHeight",
      originalOffsetHeight,
    );
  }
  if (originalOffsetWidth) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetWidth",
      originalOffsetWidth,
    );
  }
});

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
    commit: vi.fn().mockResolvedValue({
      oid: "abc",
      summary: "done",
      ahead_of_base: 1,
    }),
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
  getOrCreateSessionStore("t1").setState((state) => ({
    ...state,
    turnCount: 1,
  }));
  return render(
    <ReviewClientProvider client={client}>
      <ReviewPanel sessionId="t1" capabilityFixture={capabilityFixture} />
    </ReviewClientProvider>,
  );
}

describe("ReviewPanel (M1.9 U7)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
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

  it("renders review when worktree restore is unavailable", async () => {
    const { client } = fakeClient();
    renderPanel(client, "git-no-restore");
    await waitFor(() => expect(screen.getByTestId("file-header")).toBeTruthy());
    expect(screen.queryByTestId("commit-box")).toBeNull();
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

  it("keeps commit actions out of the Changes panel", async () => {
    const { client, git } = fakeClient();
    renderPanel(client);
    await waitFor(() => expect(screen.getByTestId("file-header")).toBeTruthy());
    expect(screen.queryByTestId("commit-box")).toBeNull();
    expect(screen.queryByRole("button", { name: /Commit/ })).toBeNull();
    expect(git.commit).not.toHaveBeenCalled();
  });

  it("uses checkpoint refs for thread scope and HEAD for uncommitted changes", async () => {
    const { client, git } = fakeClient();
    const worktree: WorktreeInfo = {
      thread_id: "t1",
      workspace_root: "/workspace",
      path: "/workspace/.worktrees/t1",
      branch: "tethys/t1",
      base: "main",
      head: "abc",
      main_checkout: false,
      warnings: [],
      setup: null,
    };
    git.worktreeList = vi.fn().mockResolvedValue([worktree]);
    renderPanel(client);

    fireEvent.click(
      await screen.findByRole("combobox", { name: "Diff scope: This turn" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Thread vs main" }),
    );
    await waitFor(() =>
      expect(git.diffSummary).toHaveBeenCalledWith({
        BaseLatestEnd: { thread_id: "t1", base: "main" },
      }),
    );

    fireEvent.click(
      screen.getByRole("combobox", { name: "Diff scope: Thread vs main" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Uncommitted" }));
    await waitFor(() =>
      expect(git.diffSummary).toHaveBeenCalledWith({
        HeadWorktree: { thread_id: "t1" },
      }),
    );
  });

  it("sends collected line comments as one composer chip", async () => {
    const { client } = fakeClient();
    const receiveChip = vi.fn();
    window.addEventListener(COMPOSER_INSERT_CHIP_EVENT, receiveChip);
    renderPanel(client);

    fireEvent.click(
      (
        await screen.findAllByRole("button", {
          name: "Comment on line 1",
        })
      )[0],
    );
    fireEvent.change(await screen.findByLabelText("Comment on src/a.ts:1"), {
      target: { value: "Check the retry path" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(screen.getByText("1 comment")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Send to agent" }));
    const event = receiveChip.mock.calls[0]?.[0] as CustomEvent | undefined;
    expect(event?.detail).toEqual({
      kind: "review",
      name: "1 comment",
      token: "Review comments:\n- src/a.ts:1 — Check the retry path",
    });
    expect(screen.queryByTestId("review-comments")).toBeNull();
    window.removeEventListener(COMPOSER_INSERT_CHIP_EVENT, receiveChip);
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
      expect(screen.getAllByTestId("file-header")).toHaveLength(1),
    );
    await waitFor(() =>
      expect(screen.getByTestId("diff-viewer").getAttribute("aria-label")).toBe(
        "Diff for src/a.ts",
      ),
    );
    // While B is still loading, A's detail must not linger under B's header.
    fireEvent.click(screen.getByRole("button", { name: /b\.ts/ }));
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
    await waitFor(() => expect(screen.getByTestId("file-header")).toBeTruthy());
    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent ?? "").not.toMatch(/push|pull request|merge/i);
    }
  });

  it("registers the review slot through the inspector registry", () => {
    registerReviewSlots();
    expect(getAllInspectorSlots().map(([id]) => id)).toContain("review");
    expect(getAllComposerContextSlots().map(([id]) => id)).not.toContain(
      "diff-summary",
    );
  });
});
