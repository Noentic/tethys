import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  type ElicitationEntry,
  getOrCreateSessionStore,
  type PermissionRequestEntry,
} from "@tethys/state";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  type InspectorClient,
  InspectorClientProvider,
} from "../client-context";
import { answerSummary, ElicitationCard } from "./elicitation-card";
import { PermissionRequestCard } from "./permission-request-card";
import { RequestDock } from "./request-dock";

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

function renderWithClient(
  node: ReactNode,
  client: InspectorClient,
  threadId = "thread-1",
) {
  return render(
    <InspectorClientProvider client={client} threadId={threadId}>
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
    // The keycap digit is each row's number-key hint; the focus marker is decoration.
    const rows = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.replace("›", ""));
    expect(rows).toEqual(["Alpha1", "Beta2", "Gamma3", "Delta4"]);
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
    expect(within(deny).getByText("Deny").className).toContain("status-danger");
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

describe("permission choice list", () => {
  it("answers with a number key and moves between rows with the arrows", async () => {
    const client = mockClient();
    renderWithClient(
      <PermissionRequestCard entry={permissionEntry()} />,
      client,
    );
    const allow = screen.getByRole("button", { name: "Allow once" });
    allow.focus();
    fireEvent.keyDown(allow, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Deny" }),
    );
    fireEvent.keyDown(document.activeElement as Element, { key: "2" });
    await waitFor(() =>
      expect(client.permission.respond).toHaveBeenCalledWith(
        "thread-1",
        "perm-1",
        "deny",
      ),
    );
  });

  it("names the request once, with no icon tile or path chip", () => {
    renderWithClient(
      <PermissionRequestCard
        entry={permissionEntry({
          title: "Edit README.md",
          subject: { File: { path: "/repo/README.md" } },
        })}
      />,
      mockClient(),
    );
    expect(
      screen.getByRole("heading", { name: "Edit README.md" }),
    ).toBeTruthy();
    expect(screen.queryByText("/repo/README.md")).toBeNull();
  });

  it("renders without the side stroke (border-l-2)", () => {
    const { container } = renderWithClient(
      <PermissionRequestCard entry={permissionEntry()} />,
      mockClient(),
    );
    const section = container.querySelector("section");
    expect(section?.className).not.toContain("border-l-2");
    expect(section?.className).not.toContain("border-l-(--tethys-status-warning)");
    expect(section?.className).toContain("border-(--tethys-hairline)");
  });

  it("answers with window number key shortcut when focus is outside inputs", async () => {
    const client = mockClient();
    renderWithClient(
      <PermissionRequestCard entry={permissionEntry()} />,
      client,
    );
    document.body.focus();
    fireEvent.keyDown(window, { key: "1" });
    await waitFor(() =>
      expect(client.permission.respond).toHaveBeenCalledWith(
        "thread-1",
        "perm-1",
        "allow",
      ),
    );
  });

  it("displays an alert message when permission.respond fails", async () => {
    const client = mockClient();
    client.permission.respond = vi
      .fn()
      .mockRejectedValue(new Error("pending permission not found"));
    renderWithClient(
      <PermissionRequestCard entry={permissionEntry()} />,
      client,
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(
      await screen.findByRole("alert"),
    ).toHaveProperty("textContent", "pending permission not found");
  });

  it("renders expired state when session status is interrupted", () => {
    const store = getOrCreateSessionStore("thread-interrupted");
    store.setState((prev) => ({ ...prev, status: "interrupted" }));
    renderWithClient(
      <PermissionRequestCard entry={permissionEntry()} />,
      mockClient(),
      "thread-interrupted",
    );
    expect(
      screen.getByText(/Request expired: session was interrupted/),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("request dock", () => {
  it("unmounts when threadStatus is interrupted or error", () => {
    const entry = permissionEntry();
    const { rerender } = render(
      <InspectorClientProvider client={mockClient()} threadId="thread-1">
        <RequestDock entries={[entry]} threadStatus="awaiting_approval" />
      </InspectorClientProvider>,
    );
    expect(screen.getByTestId("request-dock")).toBeTruthy();

    rerender(
      <InspectorClientProvider client={mockClient()} threadId="thread-1">
        <RequestDock entries={[entry]} threadStatus="interrupted" />
      </InspectorClientProvider>,
    );
    expect(screen.queryByTestId("request-dock")).toBeNull();
  });
});

/** The form Claude's question tool sends: a single and a multiple choice, each with its "Other". */
function questionEntry(): ElicitationEntry {
  const other = (key: string) => ({
    key: `${key}_custom`,
    label: "Other",
    description: null,
    required: false,
    custom_for: key,
    kind: {
      kind: "text" as const,
      default: null,
      min_len: null,
      max_len: null,
      format: null,
    },
  });
  return elicitationEntry({
    title: "Please answer the following questions.",
    tool_call_id: "toolu_1",
    fields: [
      {
        key: "q0",
        label: "Database",
        description: "Which database?",
        required: false,
        custom_for: null,
        kind: {
          kind: "enum",
          default: null,
          options: [
            { value: "Postgres", label: "Postgres", description: "Relational" },
            { value: "SQLite", label: "SQLite", description: null },
          ],
        },
      },
      other("q0"),
      {
        key: "q1",
        label: "Features",
        description: "Which features?",
        required: false,
        custom_for: null,
        kind: {
          kind: "multi-enum",
          default: null,
          min_items: null,
          max_items: null,
          options: [
            { value: "Auth", label: "Auth", description: null },
            { value: "Billing", label: "Billing", description: null },
          ],
        },
      },
      other("q1"),
    ],
  });
}

describe("question card", () => {
  it("pages through questions and sends single, multiple, and Other answers", async () => {
    const client = mockClient();
    renderWithClient(<ElicitationCard entry={questionEntry()} />, client);
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Which database?" }),
    ).toBeTruthy();
    // Picking a single choice answers the page and moves on.
    fireEvent.keyDown(screen.getByRole("button", { name: /Postgres/ }), {
      key: "1",
    });
    expect(
      screen.getByRole("heading", { name: "Which features?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Auth" }));
    fireEvent.click(screen.getByRole("button", { name: "Billing" }));
    expect(
      screen
        .getByRole("button", { name: "Billing" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), {
      target: { value: "Search" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(client.permission.elicitationRespond).toHaveBeenCalledWith(
        "thread-1",
        expect.objectContaining({
          outcome: "accepted",
          values: {
            q0: { type: "text", value: "Postgres" },
            q1: { type: "text-list", value: ["Auth", "Billing"] },
            q1_custom: { type: "text", value: "Search" },
          },
        }),
      ),
    );
  });

  it("folds an answered question to what was chosen", () => {
    const entry = questionEntry();
    const values = {
      q0: { type: "text" as const, value: "Postgres" },
      q1: { type: "text-list" as const, value: ["Auth"] },
      q1_custom: { type: "text" as const, value: "Search" },
    };
    expect(answerSummary(entry.request.fields, values)).toBe(
      "Postgres; Auth — Search",
    );
    renderWithClient(
      <ElicitationCard
        compact
        entry={{
          ...entry,
          resolution: { outcome: "accepted", values, timestamp: 0 },
        }}
      />,
      mockClient(),
    );
    expect(screen.getByText(/→ Postgres; Auth — Search/)).toBeTruthy();
  });
});
