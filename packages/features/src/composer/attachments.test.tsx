import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttachmentPicker, canAcceptAttachment } from "./attachments";

describe("composer attachments", () => {
  it("refuses an image for a provider without image prompts", () => {
    expect(canAcceptAttachment(false, "image/png")).toBe(false);
    expect(canAcceptAttachment(true, "image/png")).toBe(true);
    expect(canAcceptAttachment(false, "text/plain")).toBe(true);
  });

  it("shows the capability notice on a refused image", async () => {
    const onAttach = vi.fn();
    render(
      <AttachmentPicker
        providerName="Codex CLI"
        imagePrompts={false}
        onAttach={onAttach}
      />,
    );
    const input = screen.getByLabelText("Attach files");
    const file = new File(["x"], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByTestId("provider-capability-notice")).toBeTruthy(),
    );
    expect(onAttach).not.toHaveBeenCalled();
  });
});
