import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiffFile, DiffSummary } from "@tethys/bindings";
import { InspectorControlProvider } from "@tethys/ui";
import { describe, expect, it, vi } from "vitest";
import { type ReviewClient, ReviewClientProvider } from "./client-context";
import { DIFF_SUMMARY_PRIORITY, DiffSummaryPill } from "./diff-summary-pill";

function diffFile(path: string): DiffFile {
  return {
    path,
    old_path: null,
    status: "Modified",
    additions: 10,
    deletions: 3,
    binary: false,
    collapsed: false,
  };
}

function summary(files: DiffFile[]): DiffSummary {
  return {
    source: { HeadWorktree: { thread_id: "t1" } },
    files,
    additions: 40,
    deletions: 12,
  };
}

function clientWith(next: DiffSummary): ReviewClient {
  return {
    git: {
      diffSummary: vi.fn().mockResolvedValue(next),
      diffFile: vi.fn(),
      stage: vi.fn(),
      unstage: vi.fn(),
      discard: vi.fn(),
      commit: vi.fn(),
      checkpointRestore: vi.fn(),
    },
  } as unknown as ReviewClient;
}

function renderPill(
  client: ReviewClient,
  capabilityFixture: "git-remote" | "no-git" = "git-remote",
  open = vi.fn(),
) {
  render(
    <ReviewClientProvider client={client}>
      <InspectorControlProvider value={{ open }}>
        <DiffSummaryPill sessionId="t1" capabilityFixture={capabilityFixture} />
      </InspectorControlProvider>
    </ReviewClientProvider>,
  );
  return open;
}

describe("DiffSummaryPill (M1.9 U8)", () => {
  it("shows the changed-file count and +a −b only", async () => {
    const client = clientWith(
      summary([diffFile("a.ts"), diffFile("b.ts"), diffFile("c.ts")]),
    );
    renderPill(client);
    const pill = await screen.findByTestId("diff-summary-pill");
    expect(pill.textContent).toContain("3 files");
    expect(pill.textContent).toContain("+40");
    expect(pill.textContent).toContain("−12");
    expect(pill.textContent ?? "").not.toMatch(/staged|hunk/i);
  });

  it("does not render with no diff", async () => {
    const client = clientWith(summary([]));
    renderPill(client);
    await waitFor(() =>
      expect(screen.queryByTestId("diff-summary-pill")).toBeNull(),
    );
  });

  it("does not render in a no-git workspace", async () => {
    const client = clientWith(summary([diffFile("a.ts")]));
    renderPill(client, "no-git");
    await waitFor(() =>
      expect(screen.queryByTestId("diff-summary-pill")).toBeNull(),
    );
  });

  it("opens the Inspector exactly once on click", async () => {
    const client = clientWith(summary([diffFile("a.ts")]));
    const open = renderPill(client);
    const pill = await screen.findByTestId("diff-summary-pill");
    fireEvent.click(pill);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("folds between usage-bar and the isolation pill", () => {
    expect(DIFF_SUMMARY_PRIORITY).toBeLessThan(90);
    expect(DIFF_SUMMARY_PRIORITY).toBeGreaterThan(20);
  });

  it("closes the §4 commit-visibility decision in the spec", () => {
    const spec = readFileSync(
      resolve(__dirname, "../../../../docs/pages-views-spec.md"),
      "utf8",
    );
    expect(spec).not.toContain("Needs a decision before M1.9");
    expect(spec).toContain(
      "Decided — commit lives in the branch bar (supersedes option a, 23 Sep 2026).",
    );
    expect(spec).toContain("the diff moves to a resizable `Changes` tab");
  });
});
