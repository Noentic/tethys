import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderCapabilityNotice } from "./capability-notice";
import {
  type ProviderArtifactEntry,
  ProviderArtifactRenderer,
} from "./provider-artifact";

function artifactEntry(
  artifact: Partial<ProviderArtifactEntry["artifact"]> = {},
): ProviderArtifactEntry {
  return {
    id: "a1",
    kind: "provider_artifact",
    timestamp: 0,
    providerId: "fixture-provider",
    artifact: {
      title: "Build report",
      kind: "text",
      text: "line one\nline two",
      ...artifact,
    },
  };
}

describe("provider-artifact scaffold (M1.7 U14)", () => {
  it("renders a collapsed text summary and expands in place", () => {
    render(<ProviderArtifactRenderer entry={artifactEntry()} />);
    const summary = screen.getByRole("button", { name: /Build report/ });
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(summary);
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/line one/)).toBeTruthy();
  });

  it("renders an image with alt text within stage measure", () => {
    render(
      <ProviderArtifactRenderer
        entry={artifactEntry({
          kind: "image",
          url: "data:image/png;base64,AAAA",
          alt: "A chart",
          dimensions: "320×200",
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Build report/ }));
    expect(screen.getByAltText("A chart")).toBeTruthy();
  });

  it("falls back to the title when an image has no alt text", () => {
    render(
      <ProviderArtifactRenderer
        entry={artifactEntry({
          kind: "image",
          url: "data:image/png;base64,AAAA",
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Build report/ }));
    expect(screen.getByAltText("Build report")).toBeTruthy();
  });

  it("renders a capability notice for an unsupported kind", () => {
    render(
      <ProviderArtifactRenderer entry={artifactEntry({ kind: "audio" })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Build report/ }));
    expect(screen.getByTestId("provider-capability-notice")).toBeTruthy();
  });

  it("renders the notice muted, never an error colour", () => {
    render(
      <ProviderCapabilityNotice
        provider="Kiro"
        capability="resume a session"
      />,
    );
    const notice = screen.getByTestId("provider-capability-notice");
    expect(notice.textContent).toContain("Kiro cannot resume a session.");
    expect(notice.className).not.toContain("danger");
  });
});
