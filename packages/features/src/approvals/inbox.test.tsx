import { render, screen } from "@testing-library/react";
import type { TurnEventBody } from "@tethys/bindings";
import {
  clearAllSessionStoresForTesting,
  createInitialSessionState,
  createSessionStore,
  sessionReducer,
} from "@tethys/state";
import {
  clearRegistriesForTesting,
  getAllComposerContextSlots,
  getApprovalDrawerBody,
} from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { InboxDrawer } from "./InboxDrawer";
import { pendingApprovalNotification, shouldNotify } from "./notifications";
import { PermissionModePill } from "./permission-mode-pill";
import { registerApprovalSlots } from "./register-slots";

function seedPending(sessionId: string, title: string) {
  const state = sessionReducer(
    createInitialSessionState(sessionId, "p", "ws"),
    {
      type: "PermissionRequested",
      body: {
        req_id: `perm-${sessionId}`,
        title,
        description: null,
        subject: null,
        options: [],
      },
    } as TurnEventBody,
  );
  return createSessionStore(state);
}

describe("Permission-mode pill, inbox and notifications (M1.8 U11)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearRegistriesForTesting();
    registerApprovalSlots();
  });

  it("registers the pill under permission-mode and the drawer body", () => {
    const ids = getAllComposerContextSlots().map(([id]) => id);
    expect(ids).toContain("permission-mode");
    expect(getApprovalDrawerBody()).toBe(InboxDrawer);
    expect(PermissionModePill).toBeTruthy();
  });

  it("renders the empty inbox state", () => {
    render(<InboxDrawer onOpenSession={() => {}} />);
    expect(screen.getByTestId("inbox-empty")).toBeTruthy();
  });

  it("lists pending items and drops them once resolved", () => {
    const store = seedPending("s-1", "Run tests");
    const { rerender } = render(<InboxDrawer onOpenSession={() => {}} />);
    expect(screen.getByText("Run tests")).toBeTruthy();

    store.setState((state) =>
      sessionReducer(state, {
        type: "PermissionResolved",
        body: {
          req_id: "perm-s-1",
          outcome: "Approved",
          decided_by: "User",
          option_id: "allow",
        },
      } as TurnEventBody),
    );
    rerender(<InboxDrawer onOpenSession={() => {}} />);
    expect(screen.queryByText("Run tests")).toBeNull();
  });

  it("notifies only for growth while the window is unfocused", () => {
    expect(shouldNotify(0, 1, false)).toBe(true);
    expect(shouldNotify(0, 1, true)).toBe(false);
    expect(shouldNotify(1, 1, false)).toBe(false);
    expect(pendingApprovalNotification(0, 1)).toBeNull();
    expect(pendingApprovalNotification(1, 1)?.title).toBe("Approval needed");
    expect(pendingApprovalNotification(2, 2)?.title).toBe("2 approvals needed");
  });
});
