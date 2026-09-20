import { render } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import {
  ActionIconButton,
  ApprovalInboxPill,
  Button,
  IconButton,
  Input,
  ProtocolPill,
  SchemaFieldGroup,
  SegmentedControl,
  SessionGroupHeader,
  SessionListRow,
  Splitter,
  StatusDot,
  StepperInput,
  StopControl,
  TabStrip,
  Textarea,
  ToggleSwitch,
  WorkspaceSourceBadge,
} from "./index";

async function runAxe(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // In jsdom environment, color-contrast can have false positives without full layout engine
      "color-contrast": { enabled: false },
    },
  });
  return results.violations;
}

describe("A11y automated axe-core gates (D6 / U2 / U8)", () => {
  it("SchemaFieldGroup, ProtocolPill and StopControl have zero a11y violations", async () => {
    const { container } = render(
      <div>
        <SchemaFieldGroup label="Server">
          <input aria-label="server url" />
        </SchemaFieldGroup>
        <ProtocolPill>ACP v2</ProtocolPill>
        <StopControl phase="idle" />
        <StopControl phase="cancel_requested" />
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("StatusDot ring and disc shapes have zero a11y violations", async () => {
    const { container } = render(
      <div>
        <StatusDot status="awaiting_approval" />
        <StatusDot status="auth_required" />
        <StatusDot status="running" />
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("Button has zero a11y violations", async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Submit Action</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="destructive">Delete Item</Button>
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("Icon buttons have accessible names and zero a11y violations", async () => {
    const { container } = render(
      <div>
        <IconButton label="Open settings">⚙</IconButton>
        <ActionIconButton label="Send message" ready>
          ↑
        </ActionIconButton>
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("Form inputs (Input & Textarea) have accessible labels and zero violations", async () => {
    const { container } = render(
      <div>
        <label htmlFor="search-input">Search files</label>
        <Input id="search-input" placeholder="Search..." />

        <label htmlFor="prompt-input">Prompt</label>
        <Textarea id="prompt-input" placeholder="Enter prompt..." />
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("ToggleSwitch and StepperInput have valid roles and zero violations", async () => {
    const { container } = render(
      <div>
        <label htmlFor="notifications-switch">Enable notifications</label>
        <ToggleSwitch
          id="notifications-switch"
          checked={true}
          label="Enable notifications"
        />
        <StepperInput value={300} label="Ping interval in seconds" />
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("SegmentedControl and TabStrip have valid grouping roles and zero violations", async () => {
    const { container } = render(
      <div>
        <SegmentedControl
          value="local"
          onChange={() => {}}
          options={[
            { value: "local", label: "Local" },
            { value: "remote", label: "Remote" },
          ]}
        />
        <TabStrip
          activeTabId="tab-1"
          onSelectTab={() => {}}
          tabs={[
            { id: "workspaces", title: "Workspaces", pinned: true },
            { id: "tab-1", title: "Session 1" },
          ]}
        />
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("ApprovalInboxPill, Splitter, and StatusDot have valid roles and zero violations", async () => {
    const { container } = render(
      <div>
        <ApprovalInboxPill count={3} />
        <Splitter valueNow={280} aria-label="Resize panel" />
        <StatusDot status="running" />
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("SessionListRow and SessionGroupHeader have zero violations", async () => {
    const { container } = render(
      <section aria-label="Sessions">
        <SessionGroupHeader title="Workspace 1" count={2} />
        <SessionListRow
          sessionId="s-1"
          title="Refactor auth"
          status="idle"
          turnCount={4}
        />
      </section>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });

  it("WorkspaceSourceBadge reports its source with zero violations", async () => {
    const { container } = render(
      <div>
        <WorkspaceSourceBadge
          vcs={{ kind: "git-remote", host: "github" }}
          remote
        />
        <WorkspaceSourceBadge vcs={{ kind: "none" }} />
      </div>,
    );
    const violations = await runAxe(container);
    expect(violations).toEqual([]);
  });
});
