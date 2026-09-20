import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextTerminalDelta, TerminalView, terminalOptions } from "./index";

describe("@tethys/terminal read-only surface (M1.7 U7)", () => {
  it("wires xterm with stdin disabled and exposes no input affordance", () => {
    expect(terminalOptions.disableStdin).toBe(true);
    const { container, queryByRole } = render(
      <TerminalView output={"$ ls\r\nsrc\r\n"} />,
    );
    expect(queryByRole("textbox")).toBeNull();
    expect(container.querySelector("input, textarea")).toBeNull();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
  });

  it("renders ANSI output without error", async () => {
    const { container } = render(
      <TerminalView output={"\u001b[31mred\u001b[0m plain"} />,
    );
    await waitFor(() => expect(container.textContent).toContain("plain"));
  });

  it("writes only the appended delta as output grows", () => {
    expect(nextTerminalDelta("hello", "hello world")).toBe(" world");
    expect(nextTerminalDelta("hello", "hello")).toBe("");
    // A shrinking buffer (a reset) is not a delta write.
    expect(nextTerminalDelta("hello world", "hello")).toBe("");
  });
});
