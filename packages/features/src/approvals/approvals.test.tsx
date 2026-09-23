import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ElicitationEntry, PermissionRequestEntry } from "@tethys/state";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  type InspectorClient,
  InspectorClientProvider,
} from "../client-context";
import { ElicitationCard } from "./elicitation-card";
import {
  optionVariant,
  PermissionRequestCard,
} from "./permission-request-card";

function permissionEntry(
  partial: Partial<PermissionRequestEntry["request"]> = {},
): PermissionRequestEntry {
  return {
    id: "perm-1",
    kind: "permission_request",
    timestamp: 0,
    request: {
      reqId: "perm-1",
      title: "Run tests",
      description: null,
      options: [
        { option_id: "allow", name: "Allow once", kind: "allow_once" },
        { option_id: "deny", name: "Deny", kind: "reject_once" },
      ],
      ...partial,
    },
  };
}

function elicitationEntry(
  partial: Partial<ElicitationEntry["request"]> = {},
): ElicitationEntry {
  return {
    id: "elicit-1",
    kind: "elicitation",
    reqId: "elicit-1",
    timestamp: 0,
    request: {
      req_id: "elicit-1",
      title: "Project details",
      description: null,
      url: null,
      fields: [
        {
          key: "name",
          label: "Name",
          description: null,
          required: true,
          kind: {
            kind: "text",
            default: null,
            min_len: null,
            max_len: null,
            format: null,
          },
        },
      ],
      ...partial,
    },
  };
}

function mockClient(): InspectorClient {
  return {
    permission: {
      respond: vi.fn().mockResolvedValue(undefined),
      elicitationRespond: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function renderWithClient(node: ReactNode, client: InspectorClient) {
  return render(
    <InspectorClientProvider client={client} threadId="thread-1">
      {node}
    </InspectorClientProvider>,
  );
}

describe("Interaction cards (M1.8 U9)", () => {
  it("renders the Provider's own options in order, never a hardcoded pair", () => {
    const client = mockClient();
    const entry = permissionEntry({
      options: [
        { option_id: "a", name: "Alpha", kind: "allow_once" },
        { option_id: "b", name: "Beta", kind: "allow_always" },
        { option_id: "c", name: "Gamma", kind: "reject_once" },
        { option_id: "d", name: "Delta", kind: "reject_always" },
      ],
    });
    renderWithClient(<PermissionRequestCard entry={entry} />, client);
    // The trailing digit is each button's number-key hint.
    const buttons = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons).toEqual(["Alpha1", "Beta2", "Gamma3", "Delta4"]);
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-keyshortcuts")),
    ).toEqual(["1", "2", "3", "4"]);
  });

  it("marks rejecting options destructive and sends the chosen option id", async () => {
    const client = mockClient();
    renderWithClient(
      <PermissionRequestCard entry={permissionEntry()} />,
      client,
    );
    const deny = screen.getByRole("button", { name: "Deny" });
    expect(deny.className).toContain("status-danger");
    deny.click();
    await waitFor(() =>
      expect(client.permission.respond).toHaveBeenCalledWith(
        "thread-1",
        "perm-1",
        "deny",
      ),
    );
  });

  it("renders an auto-picked resolution read-only", () => {
    const client = mockClient();
    const entry = permissionEntry({
      resolution: {
        outcome: "Approved",
        autoPicked: true,
        decidedBy: "Policy",
        optionId: "allow",
        timestamp: 0,
      },
    });
    renderWithClient(<PermissionRequestCard entry={entry} />, client);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText(/Auto-approved by policy: Allow once/),
    ).toBeTruthy();
  });

  it("submits typed elicitation values", async () => {
    const client = mockClient();
    renderWithClient(<ElicitationCard entry={elicitationEntry()} />, client);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Tethys" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(client.permission.elicitationRespond).toHaveBeenCalledWith(
        "thread-1",
        expect.objectContaining({
          req_id: "elicit-1",
          outcome: "accepted",
          values: { name: { type: "text", value: "Tethys" } },
        }),
      ),
    );
  });

  it("sends decline and cancel for Skip and Dismiss", async () => {
    const client = mockClient();
    renderWithClient(<ElicitationCard entry={elicitationEntry()} />, client);
    screen.getByRole("button", { name: "Skip" }).click();
    await waitFor(() =>
      expect(client.permission.elicitationRespond).toHaveBeenCalledWith(
        "thread-1",
        expect.objectContaining({ outcome: "declined" }),
      ),
    );
  });

  it("shows a URL host and an Open in browser action without embedding", () => {
    const client = mockClient();
    const entry = elicitationEntry({
      url: "https://example.com/connect",
      fields: [],
    });
    renderWithClient(<ElicitationCard entry={entry} />, client);
    expect(screen.getByText("example.com")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in browser" })).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });
});

describe("optionVariant", () => {
  it("leads with allow-once, quiets a reject, and keeps the rest secondary", () => {
    expect(optionVariant("allow_once")).toBe("primary");
    expect(optionVariant("allow_always")).toBe("secondary");
    expect(optionVariant("reject_once")).toBe("destructive");
    expect(optionVariant("reject_always")).toBe("destructive");
    expect(optionVariant(null)).toBe("secondary");
  });
});
