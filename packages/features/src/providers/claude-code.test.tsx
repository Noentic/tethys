import { render, screen } from "@testing-library/react";
import type { GenericEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { ClaudeProviderExtensionEntry } from "./claude-code";

function failureEntry(severity: "warning" | "error"): GenericEntry {
  return {
    id: "failure-1",
    kind: "provider_extension",
    timestamp: 0,
    data: {
      provider_id: "claude-acp",
      method: "_meta.jetbrains.air.sessionFailure",
      params: JSON.stringify({
        id: "failure-1",
        revision: 1,
        category: "limit",
        severity,
        title: "Provider limit reached",
        details: "Start a fresh session to continue.",
        actions: ["new_session"],
      }),
    },
  };
}

describe("Claude ACP session failure renderer", () => {
  it("renders warnings as status notices and retains recovery metadata", () => {
    render(<ClaudeProviderExtensionEntry entry={failureEntry("warning")} />);
    expect(screen.getByRole("status").textContent).toContain(
      "Provider limit reached",
    );
    expect(screen.getByText(/new_session/)).toBeTruthy();
  });

  it("renders errors as alerts", () => {
    render(<ClaudeProviderExtensionEntry entry={failureEntry("error")} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Start a fresh session",
    );
  });
});
