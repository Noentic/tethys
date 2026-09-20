import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  clearRegistriesForTesting,
  getAllActionBarSlots,
  getApprovalDrawerBody,
  getProviderSurface,
  registerActionBarSlot,
  registerApprovalDrawerBody,
  registerProviderSurface,
} from "./registry";

function Pill() {
  return null;
}

describe("Registry priority and provider surfaces (M1.6c U6 / U10 / U12)", () => {
  it("sorts registered action-bar slots by priority, undeclared last", () => {
    clearRegistriesForTesting();
    registerActionBarSlot("high", Pill, 10);
    registerActionBarSlot("low", Pill, 5);
    registerActionBarSlot("none", Pill);

    expect(getAllActionBarSlots().map(([id]) => id)).toEqual([
      "high",
      "low",
      "none",
    ]);
  });

  it("keeps the two-argument action-bar call working", () => {
    clearRegistriesForTesting();
    registerActionBarSlot("legacy", Pill);
    expect(getAllActionBarSlots()[0][1].component).toBe(Pill);
    expect(getAllActionBarSlots()[0][1].priority).toBeUndefined();
  });

  it("resolves a provider surface by its exact (provider, method) pair", () => {
    clearRegistriesForTesting();
    registerProviderSurface("kiro", "_kiro.dev/mcp/oauth_request", Pill);

    expect(getProviderSurface("kiro", "_kiro.dev/mcp/oauth_request")).toBe(
      Pill,
    );
    expect(
      getProviderSurface("claude-code", "_kiro.dev/mcp/oauth_request"),
    ).toBeUndefined();
  });

  it("falls through to nothing for an unregistered pair without throwing", () => {
    clearRegistriesForTesting();
    expect(getProviderSurface("opencode", "whatever")).toBeUndefined();
  });

  it("clears provider surfaces and the drawer body between tests", () => {
    clearRegistriesForTesting();
    registerProviderSurface("kiro", "m", Pill);
    registerApprovalDrawerBody(Pill);
    expect(getApprovalDrawerBody()).toBe(Pill);

    clearRegistriesForTesting();
    expect(getProviderSurface("kiro", "m")).toBeUndefined();
    expect(getApprovalDrawerBody()).toBeNull();
  });

  it("renders a fixture Provider's handler through its surface", () => {
    clearRegistriesForTesting();
    function ProviderSurface({
      providerId,
      params,
    }: {
      providerId: string;
      method: string;
      params: string;
      className?: string;
    }) {
      return (
        <div data-testid="provider-surface">
          {providerId}:{params}
        </div>
      );
    }
    registerProviderSurface(
      "kiro",
      "_kiro.dev/mcp/oauth_request",
      ProviderSurface,
    );

    const Surface = getProviderSurface("kiro", "_kiro.dev/mcp/oauth_request");
    expect(Surface).toBeDefined();
    if (!Surface) throw new Error("provider surface not resolved");
    render(
      <Surface
        providerId="kiro"
        method="_kiro.dev/mcp/oauth_request"
        params='{"code":"ABCD"}'
      />,
    );
    expect(screen.getByTestId("provider-surface").textContent).toBe(
      'kiro:{"code":"ABCD"}',
    );
  });
});
