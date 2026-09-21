import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  Listbox,
  ModalDialog,
  ProtocolPill,
  registerEntryRenderer,
  SchemaFieldGroup,
  SegmentedControl,
  SessionGroupHeader,
  SessionListRow,
  Splitter,
  StateBadge,
  StatusDot,
  StepperInput,
  StopControl,
  TabStrip,
  Textarea,
  ToggleSwitch,
  UnknownEntryRenderer,
  WorkspaceSourceBadge,
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

  it("TabStrip roving tabindex moves focus with arrows and Home/End", () => {
    let active = "b";
    const tabs = [
      { id: "a", title: "A", pinned: true },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ];
    const view = (activeTabId: string) => (
      <TabStrip
        activeTabId={activeTabId}
        onSelectTab={(id) => {
          active = id;
        }}
        tabs={tabs}
      />
    );

    const { rerender } = render(view("b"));
    expect(
      screen.getByRole("tab", { name: "B" }).getAttribute("tabindex"),
    ).toBe("0");

    fireEvent.keyDown(screen.getByRole("tab", { name: "B" }), {
      key: "ArrowRight",
    });
    expect(active).toBe("c");
    rerender(view(active));
    const tabC = screen.getByRole("tab", { name: "C" });
    expect(tabC.getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(tabC);

    fireEvent.keyDown(tabC, { key: "Home" });
    expect(active).toBe("a");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "A" }));

    fireEvent.keyDown(screen.getByRole("tab", { name: "A" }), {
      key: "ArrowLeft",
    });
    expect(active).toBe("c");
  });

  it("Listbox uses roving tabindex and skips disabled options", () => {
    const items = [
      { id: "one", value: "one", label: "One" },
      { id: "two", value: "two", label: "Two", disabled: true },
      { id: "three", value: "three", label: "Three" },
    ];
    render(<Listbox items={items} selectedId="one" onSelect={() => {}} />);

    const one = screen.getByRole("option", { name: "One" });
    expect(one.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(one, { key: "ArrowDown" });
    const three = screen.getByRole("option", { name: "Three" });
    expect(document.activeElement).toBe(three);

    fireEvent.keyDown(three, { key: "Home" });
    expect(document.activeElement).toBe(one);
  });
});

describe("WorkspaceSourceBadge (M1.6b)", () => {
  it("renders the DESIGN label for each source state", () => {
    const cases = [
      [{ kind: "git-remote", host: "github" }, "Git · GitHub"],
      [{ kind: "git-remote", host: "gitlab" }, "Git · GitLab"],
      [{ kind: "git-local" }, "Git · local"],
      [{ kind: "none" }, "Folder · no VCS"],
    ] as const;

    for (const [vcs, label] of cases) {
      const { unmount } = render(<WorkspaceSourceBadge vcs={vcs} />);
      expect(screen.getByText(label)).toBeDefined();
      unmount();
    }
  });

  it("falls back to a remote label for an unknown host", () => {
    render(
      <WorkspaceSourceBadge vcs={{ kind: "git-remote", host: "other" }} />,
    );
    expect(screen.getByText("Git · remote")).toBeDefined();
  });

  it("appends the Remote tag only when the flag is set", () => {
    const { rerender } = render(
      <WorkspaceSourceBadge vcs={{ kind: "git-local" }} remote />,
    );
    expect(screen.getByText("Remote")).toBeDefined();

    rerender(<WorkspaceSourceBadge vcs={{ kind: "git-local" }} />);
    expect(screen.queryByText("Remote")).toBeNull();
  });
});

describe("StatusDot shape and Button reduced motion (M1.6c U5)", () => {
  it("renders awaiting_approval as a ring and auth_required as a filled disc", () => {
    const { rerender } = render(<StatusDot status="awaiting_approval" />);
    const ring = screen.getByRole("status");
    expect(ring.getAttribute("aria-label")).toBe("Awaiting approval");
    expect(ring.style.backgroundColor).toBe("transparent");
    expect(ring.style.border).toContain(
      "2px solid var(--tethys-status-warning)",
    );

    rerender(<StatusDot status="auth_required" />);
    const disc = screen.getByRole("status");
    expect(disc.style.backgroundColor).toBe("var(--tethys-status-warning)");
    expect(disc.style.border).toBe("");
  });

  it("renders the inline ring at 1.5px and the same outer size as the disc", () => {
    const { rerender } = render(<StatusDot status="awaiting" inline />);
    const ring = screen.getByRole("status");
    expect(ring.style.border).toContain("1.5px solid");
    expect(ring.className).toContain("h-1.5");

    rerender(<StatusDot status="idle" inline />);
    expect(screen.getByRole("status").className).toContain("h-1.5");
  });

  it("keeps running, awaiting and auth_required distinguishable by shape and label", () => {
    const { rerender } = render(<StatusDot status="running" />);
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Running",
    );

    rerender(<StatusDot status="awaiting" />);
    const awaiting = screen.getByRole("status");
    expect(awaiting.style.backgroundColor).toBe("transparent");
    expect(awaiting.getAttribute("aria-label")).toBe("Awaiting approval");

    rerender(<StatusDot status="auth_required" />);
    const auth = screen.getByRole("status");
    expect(auth.style.backgroundColor).toBe("var(--tethys-status-warning)");
  });

  it("normalizes the generated PascalCase AwaitingApproval spelling to the ring", () => {
    render(<StatusDot status="AwaitingApproval" />);
    const dot = screen.getByRole("status");
    expect(dot.getAttribute("aria-label")).toBe("Awaiting approval");
    expect(dot.style.backgroundColor).toBe("transparent");
  });

  it("falls back to the neutral idle disc for an unknown status", () => {
    render(<StatusDot status="something_unmapped" />);
    const dot = screen.getByRole("status");
    expect(dot.getAttribute("aria-label")).toBe("Idle");
    expect(dot.style.backgroundColor).toBe("var(--tethys-agent-idle)");
  });

  it("breathes only the living states, and slows the halo while awaiting (d0-rc9)", () => {
    const { rerender } = render(<StatusDot status="running" />);
    expect(screen.getByTestId("status-halo").className).toContain(
      "animate-breathe",
    );
    expect(screen.getByTestId("status-halo").className).not.toContain(
      "animate-breathe-awaiting",
    );

    rerender(<StatusDot status="awaiting" />);
    expect(screen.getByTestId("status-halo").className).toContain(
      "animate-breathe-awaiting",
    );

    // A stopped or errored agent must not keep pulsing: it reads as still working.
    for (const stopped of ["error", "interrupted", "suspended", "archived"]) {
      rerender(<StatusDot status={stopped} />);
      expect(screen.queryByTestId("status-halo")).toBeNull();
    }
  });

  it("keeps the marker crisp while the halo animates", () => {
    render(<StatusDot status="running" />);
    const marker = screen.getByRole("status");
    expect(marker.className).not.toContain("animate-breathe");
    expect(marker.style.backgroundColor).toBe("var(--tethys-agent-active)");
  });

  it("suspends the Button spinner under reduced motion", () => {
    render(<Button loading>Saving</Button>);
    const spinner = document.querySelector("svg");
    expect(spinner?.getAttribute("class")).toContain(
      "motion-safe:animate-spin",
    );
  });
});

describe("StopControl phases (M1.6c U4)", () => {
  it("idle reads Stop and calls onStop exactly once", () => {
    const onStop = vi.fn();
    render(<StopControl phase="idle" onStop={onStop} />);
    const control = screen.getByRole("button", { name: "Stop" });
    expect(control.hasAttribute("disabled")).toBe(false);
    fireEvent.click(control);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("cancel_requested is busy, non-interactive, not destructive, and depletes to 0", async () => {
    const deadline = new Date(Date.now() + 5000).toISOString();
    render(<StopControl phase="cancel_requested" graceDeadline={deadline} />);
    const control = screen.getByRole("button", { name: /Cancelling/ });
    expect(control.getAttribute("aria-busy")).toBe("true");
    expect(control.hasAttribute("disabled")).toBe(true);
    expect(control.className).not.toContain("text-(--tethys-status-danger)");

    const fill = screen.getByTestId("stop-fill");
    expect(fill.style.transitionProperty).toBe("width");
    expect(fill.style.transitionTimingFunction).toBe("linear");
    expect(Number.parseInt(fill.style.transitionDuration, 10)).toBeGreaterThan(
      0,
    );
    await waitFor(() => expect(fill.style.width).toBe("0%"));
  });

  it("grace_elapsed is destructive and interactive again", () => {
    const onStop = vi.fn();
    render(<StopControl phase="grace_elapsed" onStop={onStop} />);
    const control = screen.getByRole("button", { name: /Force kill/ });
    expect(control.className).toContain("text-(--tethys-status-danger)");
    expect(control.hasAttribute("disabled")).toBe(false);
    fireEvent.click(control);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("terminating is busy and non-interactive", () => {
    render(<StopControl phase="terminating" />);
    const control = screen.getByRole("button", { name: /Terminating/ });
    expect(control.getAttribute("aria-busy")).toBe("true");
    expect(control.hasAttribute("disabled")).toBe(true);
  });

  it("announces once per phase change and not on a same-phase re-render", () => {
    const { rerender } = render(<StopControl phase="cancel_requested" />);
    expect(screen.getAllByText("Cancelling")).toHaveLength(1);

    rerender(<StopControl phase="cancel_requested" />);
    expect(screen.getAllByText("Cancelling")).toHaveLength(1);

    rerender(<StopControl phase="grace_elapsed" />);
    expect(screen.getAllByText("Force kill available")).toHaveLength(1);

    rerender(<StopControl phase="terminating" />);
    expect(screen.getAllByText("Terminating")).toHaveLength(1);
  });
});

describe("SchemaFieldGroup and ProtocolPill (M1.6c U8)", () => {
  it("SchemaFieldGroup associates its label with the group", () => {
    render(
      <SchemaFieldGroup label="Server">
        <input aria-label="server url" />
      </SchemaFieldGroup>,
    );
    const group = screen.getByRole("group");
    const labelId = group.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)?.textContent).toBe(
      "Server",
    );
  });

  it("SchemaFieldGroup renders no heading when given no label", () => {
    render(
      <SchemaFieldGroup>
        <input aria-label="server url" />
      </SchemaFieldGroup>,
    );
    expect(screen.queryByText("Server")).toBeNull();
    expect(
      screen.getByRole("group").getAttribute("aria-labelledby"),
    ).toBeNull();
  });

  it("ProtocolPill renders free text and two pills keep their own text", () => {
    render(
      <div>
        <ProtocolPill>ACP v2</ProtocolPill>
        <ProtocolPill>Early Access</ProtocolPill>
      </div>,
    );
    expect(screen.getByText("ACP v2")).toBeDefined();
    expect(screen.getByText("Early Access")).toBeDefined();
  });
});

describe("StateBadge (d0-rc9)", () => {
  it("carries the state colour on both the marker and the label, per state", () => {
    const { rerender } = render(<StateBadge status="awaiting_approval" />);
    expect(screen.getByTestId("state-badge").textContent).toContain(
      "Awaiting approval",
    );
    expect(screen.getByText("Awaiting approval").style.color).toBe(
      "var(--tethys-status-warning)",
    );

    rerender(<StateBadge status="running" />);
    expect(screen.getByText("Running").style.color).toBe(
      "var(--tethys-agent-active)",
    );

    rerender(<StateBadge status="error" />);
    expect(screen.getByText("Error").style.color).toBe(
      "var(--tethys-status-danger)",
    );

    rerender(<StateBadge status="idle" />);
    expect(screen.getByText("Idle").style.color).toBe(
      "var(--tethys-agent-idle)",
    );
  });

  it("names the state in words so the badge survives the dot being ignored", () => {
    render(<StateBadge status="AwaitingApproval" />);
    expect(screen.getByTestId("state-badge").textContent).toBe(
      "Awaiting approval",
    );
  });

  it("accepts a label override without changing the colour source", () => {
    render(<StateBadge status="running" label="Streaming" />);
    expect(screen.getByText("Streaming").style.color).toBe(
      "var(--tethys-agent-active)",
    );
  });
});
