import { render, screen } from "@testing-library/react";
import { registryEntryFixtures } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { ServerConfigCard } from "./server-config-card";

describe("ServerConfigCard (M1.11 U4)", () => {
  it("renders a secret as its keychain ref and never echoes a value", () => {
    const [, linear] = registryEntryFixtures;
    render(<ServerConfigCard view={linear} />);
    expect(screen.getByText("keychain:tethys/linear")).toBeTruthy();
    const dom = document.body.textContent ?? "";
    expect(dom).not.toMatch(/sk-|Bearer|secret-value/i);
  });

  it("renders a Plain value as its literal text", () => {
    const [context7] = registryEntryFixtures;
    render(<ServerConfigCard view={context7} />);
    expect(screen.getByText("debug")).toBeTruthy();
    expect(screen.getByText("keychain:tethys/context7")).toBeTruthy();
  });

  it("renders command and args for stdio and no URL", () => {
    const [context7] = registryEntryFixtures;
    render(<ServerConfigCard view={context7} />);
    expect(screen.getByText("npx")).toBeTruthy();
    expect(screen.getByText("-y @upstash/context7-mcp")).toBeTruthy();
    expect(screen.queryByText("URL")).toBeNull();
  });

  it("renders the URL for http and no command", () => {
    const [, linear] = registryEntryFixtures;
    render(<ServerConfigCard view={linear} />);
    expect(screen.getByText("https://mcp.linear.app/sse")).toBeTruthy();
    expect(screen.queryByText("Command")).toBeNull();
  });
});
