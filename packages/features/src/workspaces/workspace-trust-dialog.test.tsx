import { fireEvent, render, screen } from "@testing-library/react";
import type { TrustGrant } from "@tethys/bindings";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceTrustDialog } from "./workspace-trust-dialog";

describe("workspace-trust-dialog", () => {
  it("renders the local-git copy", () => {
    render(
      <WorkspaceTrustDialog
        open
        path="/home/dev/repo"
        vcs={{ kind: "git-local" }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("trust-copy-local-git")).toBeTruthy();
  });

  it("renders the local no-VCS copy with the init-git checkbox", () => {
    render(
      <WorkspaceTrustDialog
        open
        path="/home/dev/plain"
        vcs={{ kind: "none" }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("trust-copy-none")).toBeTruthy();
    expect(screen.getByLabelText("Initialize git now")).toBeTruthy();
  });

  it("renders the remote warning copy", () => {
    render(
      <WorkspaceTrustDialog
        open
        path="/home/dev/repo"
        vcs={{ kind: "git-remote", host: "github" }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("trust-copy-remote")).toBeTruthy();
  });

  it("marks the remote warning with a left rule, not a warning perimeter", () => {
    render(
      <WorkspaceTrustDialog
        open
        path="/home/dev/repo"
        vcs={{ kind: "git-remote", host: "github" }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const callout = screen.getByTestId("trust-copy-remote");
    expect(callout.className).toContain("border-l-(--tethys-status-warning)");
    expect(callout.className).not.toContain("border-warning-soft");
  });

  it("gates the primary on a resolved path", () => {
    const { rerender } = render(
      <WorkspaceTrustDialog
        open
        path={null}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: /Trust & Add Workspace/ })
        .hasAttribute("disabled"),
    ).toBe(true);

    rerender(
      <WorkspaceTrustDialog
        open
        path="/home/dev/repo"
        vcs={{ kind: "git-local" }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: /Trust & Add Workspace/ })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("confirms with the chosen mode, scope and init flag", () => {
    const onConfirm = vi.fn<(request: TrustGrant) => void>();
    render(
      <WorkspaceTrustDialog
        open
        path="/home/dev/plain"
        vcs={{ kind: "none" }}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByLabelText("YOLO"));
    fireEvent.click(screen.getByLabelText("Initialize git now"));
    fireEvent.click(screen.getByLabelText("Also trust subfolders (subtree)"));
    fireEvent.click(
      screen.getByRole("button", { name: /Trust & Add Workspace/ }),
    );

    expect(onConfirm).toHaveBeenCalledWith({
      path: "/home/dev/plain",
      permission_mode: "yolo",
      scope: "subtree",
      init_git: true,
    });
  });
});
