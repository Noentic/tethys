import { fireEvent, render, screen } from "@testing-library/react";
import type { SessionEntry, TurnNoticeEntry } from "@tethys/state";
import { turnNoticeForStopReason } from "@tethys/state";
import { describe, expect, it, vi } from "vitest";
import { latestAnnouncement, TranscriptAnnouncer } from "./announcer";
import { JumpToLatest } from "./renderers/jump-to-latest";
import { TurnNoticeRenderer } from "./renderers/turn-notice";
import { WorkingIndicator } from "./renderers/working-indicator";
import { isAtTail } from "./use-tail-pin";

function notice(partial: Partial<TurnNoticeEntry> = {}): TurnNoticeEntry {
  return {
    id: "n1",
    kind: "turn_notice",
    noticeKind: "cancelled",
    message: "The turn was cancelled.",
    timestamp: 0,
    ...partial,
  };
}

describe("turn endings (M1.7 U17)", () => {
  it("maps every non-normal stop reason to a notice and normal ends to none", () => {
    expect(turnNoticeForStopReason("EndTurn")).toBeNull();
    expect(turnNoticeForStopReason("StopSequence")).toBeNull();
    expect(turnNoticeForStopReason("Error")).toBeNull();
    expect(turnNoticeForStopReason("Refusal")?.noticeKind).toBe("refusal");
    expect(turnNoticeForStopReason("MaxTokens")?.noticeKind).toBe("max_tokens");
    expect(turnNoticeForStopReason("MaxTurnRequests")?.noticeKind).toBe(
      "max_turn_requests",
    );
    expect(turnNoticeForStopReason("Cancelled")?.noticeKind).toBe("cancelled");
  });

  it("renders a refusal notice that says the prompt is excluded", () => {
    render(
      <TurnNoticeRenderer
        entry={notice({
          noticeKind: "refusal",
          message:
            "The prompt was refused and is excluded from the next prompt.",
        })}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("excluded");
  });

  it("offers Continue for max_tokens and Retry only when retryable", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <TurnNoticeRenderer
        entry={notice({ noticeKind: "max_tokens", message: "Limit" })}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onAction).toHaveBeenCalledWith("max_tokens", "continue");

    rerender(
      <TurnNoticeRenderer
        entry={notice({
          noticeKind: "error",
          message: "Boom",
          retryable: false,
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("announces error notices assertively", () => {
    render(
      <TranscriptAnnouncer
        announcement={latestAnnouncement([
          notice({ noticeKind: "error", message: "Boom" }),
        ])}
      />,
    );
    expect(
      screen.getByTestId("transcript-announcer").getAttribute("aria-live"),
    ).toBe("assertive");
  });

  it("expands a compaction summary when one is provided", () => {
    render(
      <TurnNoticeRenderer
        entry={notice({
          noticeKind: "compaction",
          message: "Context compacted.",
          summary: "Older context was summarized.",
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Context compacted" }));
    expect(screen.getByText("Older context was summarized.")).toBeTruthy();
  });

  it("shows the working indicator with elapsed and quiet text", () => {
    render(
      <WorkingIndicator
        startedAt={0}
        lastEventAt={0}
        now={14_000}
        quietThresholdMs={30_000}
      />,
    );
    expect(screen.getByTestId("working-indicator").textContent).toContain(
      "Working · 14s",
    );
    expect(screen.getByTestId("working-indicator").textContent).not.toContain(
      "No activity",
    );
  });

  it("appends the no-activity line after the threshold", () => {
    render(
      <WorkingIndicator
        startedAt={0}
        lastEventAt={0}
        now={95_000}
        quietThresholdMs={30_000}
      />,
    );
    expect(screen.getByTestId("working-indicator").textContent).toContain(
      "No activity for 1:35",
    );
  });
});

describe("tail pinning (M1.7 U17)", () => {
  it("isAtTail is true only within the threshold", () => {
    expect(isAtTail(900, 100, 1000)).toBe(true);
    expect(isAtTail(500, 100, 1000)).toBe(false);
  });

  it("shows the new count and a warning dot when a request is pending", () => {
    render(<JumpToLatest visible newCount={3} hasPending onJump={() => {}} />);
    expect(screen.getByTestId("jump-to-latest").textContent).toContain("3 new");
    expect(screen.getByTestId("jump-warning-dot")).toBeTruthy();
  });

  it("renders nothing while pinned", () => {
    render(<JumpToLatest visible={false} newCount={0} onJump={() => {}} />);
    expect(screen.queryByTestId("jump-to-latest")).toBeNull();
  });
});

describe("transcript announcer (M1.7 U17)", () => {
  it("announces nothing for a stream of chunks", () => {
    const entries: SessionEntry[] = Array.from({ length: 100 }, (_, index) => ({
      id: `m${index}`,
      kind: "turn_message",
      role: "Agent",
      content: "chunk",
      streaming: true,
      timestamp: index,
    }));
    expect(latestAnnouncement(entries)).toBeNull();
  });

  it("announces turn completion exactly once", () => {
    const entries: SessionEntry[] = [
      {
        id: "m1",
        kind: "turn_message",
        role: "Agent",
        content: "done",
        streaming: false,
        timestamp: 0,
      },
    ];
    expect(latestAnnouncement(entries)?.message).toBe("Turn complete");
  });
});
