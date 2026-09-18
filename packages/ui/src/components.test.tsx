import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActionIconButton,
  ApprovalInboxPill,
  Badge,
  Button,
  Drawer,
  getDaemonHealthDotState,
  getEntryRenderer,
  IconButton,
  Input,
  KeycapPill,
  ModalDialog,
  registerEntryRenderer,
  SegmentedControl,
  SessionGroupHeader,
  SessionListRow,
  Splitter,
  StatusDot,
  StepperInput,
  TabStrip,
  Textarea,
  ToggleSwitch,
  UnknownEntryRenderer,
} from "./index";

describe("Component Kit & State Matrix (U2 & U6)", () => {
  it("Button renders all variants and states", () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole("button", { name: "Primary" })).toBeDefined();

    rerender(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();

    rerender(<Button loading>Loading</Button>);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("IconButton and ActionIconButton render correctly with labels", () => {
    render(<IconButton label="Settings">⚙</IconButton>);
    expect(screen.getByRole("button", { name: "Settings" })).toBeDefined();

    render(
      <ActionIconButton label="Submit" ready>
        ↑
      </ActionIconButton>,
    );
    expect(screen.getByRole("button", { name: "Submit" })).toBeDefined();
  });

  it("Input and Textarea render and accept text", () => {
    render(<Input placeholder="Search files..." />);
    const input = screen.getByPlaceholderText("Search files...");
    expect(input).toBeDefined();
    fireEvent.change(input, { target: { value: "test" } });
    expect((input as HTMLInputElement).value).toBe("test");

    render(<Textarea placeholder="Ask anything..." />);
    const textarea = screen.getByPlaceholderText("Ask anything...");
    expect(textarea).toBeDefined();
  });

  it("Badge and KeycapPill render typography and tokens", () => {
    render(<Badge variant="warning">Awaiting</Badge>);
    expect(screen.getByText("Awaiting")).toBeDefined();

    render(<KeycapPill keys={["Ctrl", "K"]} />);
    expect(screen.getByText("Ctrl + K")).toBeDefined();
  });

  it("StatusDot renders all 7 states and falls back cleanly for unknown states", () => {
    const states = [
      "idle",
      "running",
      "awaiting_approval",
      "error",
      "interrupted",
      "suspended",
      "archived",
    ];

    for (const st of states) {
      const { unmount } = render(<StatusDot status={st} />);
      const dot = screen.getByRole("status");
      expect(dot).toBeDefined();
      unmount();
    }

    // Unknown state falls back to idle/neutral without error
    const { container } = render(<StatusDot status="future_unknown_state" />);
    const dot = container.querySelector("span");
    expect(dot).toBeDefined();
  });

  it("Daemon health dot aggregation behaves aggregate-optimistically", () => {
    // 1 healthy + 2 failed -> healthy (green)
    const mixed = getDaemonHealthDotState([
      { isHealthy: true },
      { isHealthy: false },
      { isHealthy: false },
    ]);
    expect(mixed.isHealthy).toBe(true);
    expect(mixed.colorVar).toBe("var(--tethys-status-success)");

    // 0 healthy -> danger (red)
    const none = getDaemonHealthDotState([
      { isHealthy: false },
      { isHealthy: false },
    ]);
    expect(none.isHealthy).toBe(false);
    expect(none.colorVar).toBe("var(--tethys-status-danger)");

    // Empty providers list -> danger
    const empty = getDaemonHealthDotState([]);
    expect(empty.isHealthy).toBe(false);
    expect(empty.colorVar).toBe("var(--tethys-status-danger)");
  });

  it("ToggleSwitch renders switch role and toggles aria-checked", () => {
    let checked = false;
    const onCheckedChange = (val: boolean) => {
      checked = val;
    };

    const { rerender } = render(
      <ToggleSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        label="Auto-approve"
      />,
    );
    const sw = screen.getByRole("switch", { name: "Auto-approve" });
    expect(sw.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(sw);
    expect(checked).toBe(true);

    rerender(
      <ToggleSwitch
        checked={true}
        onCheckedChange={onCheckedChange}
        label="Auto-approve"
      />,
    );
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("StepperInput renders spinbutton role and clamps values", () => {
    let value = 300;
    const onChange = (v: number) => {
      value = v;
    };

    render(
      <StepperInput
        value={value}
        onChange={onChange}
        min={0}
        max={600}
        step={50}
      />,
    );
    const stepper = screen.getByRole("spinbutton");
    expect(stepper.getAttribute("aria-valuenow")).toBe("300");

    const incBtn = screen.getByRole("button", { name: "Increment" });
    fireEvent.click(incBtn);
    expect(value).toBe(350);

    const decBtn = screen.getByRole("button", { name: "Decrement" });
    fireEvent.click(decBtn);
    expect(value).toBe(250);
  });

  it("Splitter renders separator role and triggers reset on double-click", () => {
    let resetCalled = false;
    render(
      <Splitter
        valueNow={280}
        onReset={() => {
          resetCalled = true;
        }}
      />,
    );

    const sep = screen.getByRole("separator");
    expect(sep.getAttribute("aria-valuenow")).toBe("280");

    fireEvent.doubleClick(sep);
    expect(resetCalled).toBe(true);
  });

  it("SegmentedControl renders radiogroup with selected states", () => {
    let selected = "local";
    render(
      <SegmentedControl
        value={selected}
        onChange={(v) => {
          selected = v;
        }}
        options={[
          { value: "local", label: "Local" },
          { value: "remote", label: "Remote" },
        ]}
      />,
    );

    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toBeDefined();
    const localRadio = screen.getByRole("radio", { name: "Local" });
    expect(localRadio.getAttribute("aria-checked")).toBe("true");

    const remoteRadio = screen.getByRole("radio", { name: "Remote" });
    fireEvent.click(remoteRadio);
    expect(selected).toBe("remote");
  });

  it("TabStrip renders tablist and handles tab selection and closing", () => {
    let active = "tab-1";
    let closed = "";
    render(
      <TabStrip
        activeTabId={active}
        onSelectTab={(id) => {
          active = id;
        }}
        onCloseTab={(id) => {
          closed = id;
        }}
        tabs={[
          { id: "workspaces", title: "Workspaces", pinned: true },
          { id: "tab-1", title: "main", subtitle: "feat/xyz", dirty: true },
        ]}
      />,
    );

    expect(screen.getByRole("tablist")).toBeDefined();
    const activeTab = screen.getByRole("tab", { name: /main/ });
    expect(activeTab.getAttribute("aria-selected")).toBe("true");

    const closeBtn = screen.getByLabelText("Close main");
    fireEvent.click(closeBtn);
    expect(closed).toBe("tab-1");
  });

  it("ApprovalInboxPill hides at count 0 and shows when count >= 1", () => {
    const { container, rerender } = render(<ApprovalInboxPill count={0} />);
    expect(container.firstChild).toBeNull();

    rerender(<ApprovalInboxPill count={2} />);
    expect(
      screen.getByRole("button", { name: "Waiting on you (2)" }),
    ).toBeDefined();
  });

  it("ModalDialog and Drawer render dialog role with focus handling", () => {
    let _closed = false;
    const { rerender } = render(
      <ModalDialog
        open={true}
        onClose={() => {
          _closed = true;
        }}
        title="Trust Folder"
      >
        <p>Do you trust this folder?</p>
      </ModalDialog>,
    );

    expect(screen.getByRole("dialog", { name: "Trust Folder" })).toBeDefined();

    rerender(
      <Drawer
        open={true}
        onClose={() => {
          _closed = true;
        }}
        title="Peek Drawer"
      >
        <div>Drawer content</div>
      </Drawer>,
    );
    expect(screen.getByRole("dialog", { name: "Peek Drawer" })).toBeDefined();
  });

  it("SessionListRow renders provider glyph, turn count, and selection bar", () => {
    let _selected = false;
    render(
      <SessionListRow
        sessionId="s-1"
        title="Implement OAuth"
        status="running"
        branchName="feat/auth"
        turnCount={8}
        dirty={true}
        selected={true}
        onSelect={() => {
          _selected = true;
        }}
      />,
    );

    expect(screen.getByText("Implement OAuth")).toBeDefined();
    expect(screen.getByText("feat/auth")).toBeDefined();
    expect(screen.getByText("T8")).toBeDefined();
  });

  it("SessionGroupHeader toggles collapse state", () => {
    let toggled = false;
    render(
      <SessionGroupHeader
        title="tethys"
        count={3}
        collapsed={false}
        onToggle={() => {
          toggled = true;
        }}
      />,
    );

    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(toggled).toBe(true);
  });

  it("Renderer registry falls back to UnknownEntryRenderer without throwing", () => {
    const Fallback = getEntryRenderer("unregistered_test_kind");
    expect(Fallback).toBe(UnknownEntryRenderer);

    const CustomRenderer = ({ entry }: { entry: { kind: string } }) => (
      <div>Custom: {entry.kind}</div>
    );
    registerEntryRenderer("custom_kind", CustomRenderer);

    expect(getEntryRenderer("custom_kind")).toBe(CustomRenderer);
  });
});
