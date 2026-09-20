import { useStore } from "@tanstack/react-store";
import {
  advanceCancellationState,
  CANCEL_FIXTURE_GRACE_MS,
  getOrCreateSessionStore,
  sessionsRegistryStore,
} from "@tethys/state";
import {
  Drawer,
  getApprovalDrawerBody,
  type InspectorControl,
  InspectorControlProvider,
} from "@tethys/ui";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Group,
  Panel,
  type PanelImperativeHandle,
  Separator,
  usePanelRef,
} from "react-resizable-panels";
import { ActionBar } from "./ActionBar";
import { ActivityRail } from "./ActivityRail";
import { ApprovalDrawerBody } from "./ApprovalDrawerBody";
import { CommandPalette } from "./CommandPalette";
import { InspectorPane } from "./InspectorPane";
import { setupGlobalKeyboardMap } from "./keyboard";
import { SessionsColumn } from "./SessionsColumn";
import { WindowHeader } from "./WindowHeader";

// DESIGN.md shell-splitter: a 1px structural line inside a wider transparent hit
// area. State only recolors — it never changes width, so hover cannot shift layout.
const SHELL_SEPARATOR_CLASS =
  "relative w-px shrink-0 cursor-col-resize bg-(--tethys-hairline-structural) outline-none transition-colors duration-150 select-none after:absolute after:inset-y-0 after:-inset-x-[2.5px] after:content-[''] data-[separator=hover]:bg-(--tethys-text-muted) data-[separator=active]:bg-(--tethys-accent-focus) data-[separator=focus]:bg-(--tethys-accent-focus)";

export interface TabData {
  id: string;
  title: string;
  route: string;
  closable: boolean;
  pinned?: boolean;
}

export interface AppShellProps {
  children?: React.ReactNode;
  activeRoute?: string;
  onNavigate?: (route: string) => void;
  platformInset?: boolean;
}

export function AppShell({
  children,
  activeRoute = "/thread/new",
  onNavigate,
  platformInset = false,
}: AppShellProps) {
  // Tabs management
  const [tabs, setTabs] = useState<TabData[]>(() => {
    if (activeRoute === "/workspaces") {
      return [
        {
          id: "workspaces",
          title: "Workspaces",
          route: "/workspaces",
          closable: false,
          pinned: true,
        },
      ];
    }
    return [
      {
        id: "workspaces",
        title: "Workspaces",
        route: "/workspaces",
        closable: false,
        pinned: true,
      },
      {
        id: "thread-new",
        title: "New Thread",
        route: "/thread/new",
        closable: true,
      },
    ];
  });
  const [activeTabId, setActiveTabId] = useState<string>(
    activeRoute === "/workspaces" ? "workspaces" : "thread-new",
  );

  // Palette & modal management
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [approvalDrawerOpen, setApprovalDrawerOpen] = useState<boolean>(false);
  const [inspectorOverlayOpen, setInspectorOverlayOpen] =
    useState<boolean>(false);
  const inspectorPanelRef =
    usePanelRef() as React.RefObject<PanelImperativeHandle | null>;
  const [sessionsSidebarOpen, setSessionsSidebarOpen] =
    useState<boolean>(false);

  // Responsive layout state
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(true);

  // Sessions store integration
  const sessionsMap = useStore(sessionsRegistryStore, (s) => s.sessions);
  const sessions = useMemo(() => Object.values(sessionsMap), [sessionsMap]);

  // Aggregate pending approval requests
  const approvalCount = useMemo(() => {
    let count = 0;
    for (const sess of sessions) {
      if (sess.status === "awaiting_approval") {
        count += 1;
      }
    }
    return count;
  }, [sessions]);

  // Replaceable default: a registered drawer body supersedes the placeholder.
  const DrawerBody = getApprovalDrawerBody() ?? ApprovalDrawerBody;

  // Track window resize and blur/focus
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);

    window.addEventListener("resize", handleResize);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Determine active view
  const activeView = useMemo<
    "workspaces" | "thread-new" | "thread" | "settings"
  >(() => {
    if (activeRoute.startsWith("/workspaces")) return "workspaces";
    if (activeRoute === "/thread/new") return "thread-new";
    if (activeRoute.startsWith("/thread/")) return "thread";
    if (activeRoute.startsWith("/settings")) return "settings";
    return "workspaces";
  }, [activeRoute]);

  // Active session ID (if on /thread/:id)
  const activeSessionId = useMemo(() => {
    if (activeRoute.startsWith("/thread/") && activeRoute !== "/thread/new") {
      return activeRoute.replace("/thread/", "");
    }
    return undefined;
  }, [activeRoute]);

  // Ensure tab exists when route changes
  useEffect(() => {
    if (activeRoute.startsWith("/thread/") && activeRoute !== "/thread/new") {
      const sessId = activeRoute.replace("/thread/", "");
      setTabs((prev) => {
        if (prev.some((t) => t.id === sessId)) {
          return prev;
        }
        const session = sessionsMap[sessId];
        const label = session ? session.title : `Session ${sessId.slice(0, 6)}`;
        return [
          ...prev,
          { id: sessId, title: label, route: activeRoute, closable: true },
        ];
      });
      setActiveTabId(sessId);
    } else if (activeRoute === "/workspaces") {
      setActiveTabId("workspaces");
    } else if (activeRoute === "/thread/new") {
      setTabs((prev) => {
        if (prev.some((t) => t.id === "thread-new")) {
          return prev;
        }
        return [
          ...prev,
          {
            id: "thread-new",
            title: "New Thread",
            route: "/thread/new",
            closable: true,
          },
        ];
      });
      setActiveTabId("thread-new");
    } else if (activeRoute.startsWith("/settings")) {
      setTabs((prev) => {
        if (prev.some((t) => t.id === "settings")) {
          return prev;
        }
        return [
          ...prev,
          {
            id: "settings",
            title: "Settings",
            route: "/settings/general",
            closable: true,
          },
        ];
      });
      setActiveTabId("settings");
    }
  }, [activeRoute, sessionsMap]);

  // Tab navigation
  const handleSelectTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (tab) {
        setActiveTabId(id);
        onNavigate?.(tab.route);
      }
    },
    [tabs, onNavigate],
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      // Pinned index 0 (/workspaces) cannot be closed
      if (id === "workspaces") return;

      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
        const nextTabs = prev.filter((t) => t.id !== id);

        if (activeTabId === id) {
          // Switch to the adjacent tab or workspaces
          const nextActive = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0];
          setActiveTabId(nextActive.id);
          onNavigate?.(nextActive.route);
        }

        return nextTabs;
      });
    },
    [activeTabId, onNavigate],
  );

  // Keyboard shortcut setup
  useEffect(() => {
    return setupGlobalKeyboardMap({
      onTogglePalette: () => setPaletteOpen((prev) => !prev),
      onToggleSidebar: () => setSessionsSidebarOpen((prev) => !prev),
      onFocusTab: (tabIndex: number) => {
        if (tabIndex >= 0 && tabIndex < tabs.length) {
          handleSelectTab(tabs[tabIndex].id);
        }
      },
      onNewThread: () => {
        onNavigate?.("/thread/new");
      },
      onCloseTab: () => {
        if (activeTabId !== "workspaces") {
          handleCloseTab(activeTabId);
        }
      },
      onOpenSettings: () => {
        onNavigate?.("/settings/general");
      },
    });
  }, [tabs, activeTabId, onNavigate, handleSelectTab, handleCloseTab]);

  const isCompactSessions = windowWidth < 800;
  const isOverlayInspector = windowWidth < 1100;
  const shouldShowSessions =
    sessionsSidebarOpen || (activeView === "thread" && !isCompactSessions);

  // Shell-provided control for slot components: overlay at narrow widths,
  // expand the collapsed docked panel above the overlay breakpoint.
  const inspectorControl: InspectorControl = {
    open: () => {
      if (isOverlayInspector) {
        setInspectorOverlayOpen(true);
      } else {
        inspectorPanelRef.current?.expand();
      }
    },
  };

  // Active session store for Action Bar
  const activeSessionStore = activeSessionId
    ? getOrCreateSessionStore(activeSessionId)
    : undefined;

  const currentSessionState = activeSessionId
    ? sessionsMap[activeSessionId]
    : undefined;

  const handleStopSession = () => {
    if (!activeSessionStore) return;
    // One press sends the cancel and enters the pending phase. The ladder is
    // no longer advanced by click: `grace_elapsed` / `terminating` arrive from
    // the backend, which owns the clock and the deadline (M1.12). Until then
    // the phase is fixture-driven.
    if (activeSessionStore.state.cancellationState !== "idle") return;
    const deadline = new Date(
      Date.now() + CANCEL_FIXTURE_GRACE_MS,
    ).toISOString();
    advanceCancellationState(activeSessionStore, "cancel_requested", deadline);
  };

  return (
    <InspectorControlProvider value={inspectorControl}>
      <div
        data-window-focused={isWindowFocused}
        className={`flex h-screen w-screen flex-col overflow-hidden bg-(--tethys-canvas) font-sans text-(--tethys-text-primary) antialiased select-none ${
          !isWindowFocused ? "opacity-95" : ""
        }`}
      >
        {/* 1. Window Header (40px) */}
        <WindowHeader
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          approvalCount={approvalCount}
          onOpenApprovalQueue={() => setApprovalDrawerOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          platformInset={platformInset}
          onToggleSidebar={() => setSessionsSidebarOpen((prev) => !prev)}
          onNewThread={() => onNavigate?.("/thread/new")}
        />

        {/* 2. Main Middle Workspace Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Activity Rail (48px) */}
          <ActivityRail
            activeView={activeView}
            onNavigate={(view) => {
              if (view === "workspaces") onNavigate?.("/workspaces");
              else if (view === "thread-new") onNavigate?.("/thread/new");
              else if (view === "settings") onNavigate?.("/settings/general");
            }}
            daemonHealthy={true}
          />

          {/* Resizable 3-Column Region */}
          <Group
            id="shell-main-group"
            orientation="horizontal"
            className="flex-1 overflow-hidden"
          >
            {/* Sessions Column (280px / Collapsible) - shown when toggled or on active thread */}
            {shouldShowSessions && (
              <>
                <Panel
                  id="shell-sessions"
                  defaultSize={isCompactSessions ? 48 : 280}
                  minSize={isCompactSessions ? 48 : 200}
                  maxSize={isCompactSessions ? 48 : 400}
                  collapsible={!isCompactSessions}
                  className="h-full"
                >
                  <SessionsColumn
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    collapsed={isCompactSessions}
                    onSelectSession={(sessId) =>
                      onNavigate?.(`/thread/${sessId}`)
                    }
                    onNewSession={() => onNavigate?.("/thread/new")}
                  />
                </Panel>

                <Separator className={SHELL_SEPARATOR_CLASS} />
              </>
            )}

            {/* Center Stage Panel */}
            <Panel
              id="shell-stage"
              minSize={560}
              className="flex-1 h-full flex flex-col overflow-hidden bg-(--tethys-canvas)"
            >
              <div className="flex-1 overflow-hidden flex flex-col">
                {children}
              </div>

              {/* Action Bar (56px) - only for active thread */}
              {activeView === "thread" && (
                <ActionBar
                  cancellationState={
                    currentSessionState?.cancellationState ?? "idle"
                  }
                  graceDeadline={currentSessionState?.graceDeadline ?? null}
                  providerName={currentSessionState?.providerId ?? "Provider"}
                  worktreeBranch={currentSessionState?.branchName}
                  onStop={handleStopSession}
                />
              )}
            </Panel>

            {/* Inspector Panel (360px) - In desktop mode */}
            {activeView === "thread" && !isOverlayInspector && (
              <>
                <Separator className={SHELL_SEPARATOR_CLASS} />
                <Panel
                  id="shell-inspector"
                  panelRef={inspectorPanelRef}
                  defaultSize={360}
                  minSize={240}
                  maxSize={500}
                  collapsible
                  className="h-full"
                >
                  <InspectorPane sessionId={activeSessionId} />
                </Panel>
              </>
            )}
          </Group>

          {/* Overlay Inspector for <1100px */}
          {activeView === "thread" &&
            isOverlayInspector &&
            inspectorOverlayOpen && (
              <InspectorPane
                sessionId={activeSessionId}
                isOverlay={true}
                onCloseOverlay={() => setInspectorOverlayOpen(false)}
              />
            )}
        </div>

        {/* 3. Command Palette Dialog */}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onSelectCommand={(cmd) => {
            if (cmd === "new-thread") onNavigate?.("/thread/new");
            else if (cmd === "go-workspaces") onNavigate?.("/workspaces");
            else if (cmd === "open-settings") onNavigate?.("/settings/general");
            else if (cmd === "toggle-theme") {
              const html = document.documentElement;
              const current = html.getAttribute("data-theme");
              html.setAttribute(
                "data-theme",
                current === "light" ? "dark" : "light",
              );
            }
          }}
        />

        {/* 4. Approval Queue Drawer */}
        <Drawer
          open={approvalDrawerOpen}
          onClose={() => setApprovalDrawerOpen(false)}
          title={`Pending Approvals (${approvalCount})`}
          side="right"
          width="w-(--layout-drawer-queue)"
        >
          <DrawerBody
            sessions={sessions}
            onOpenSession={(sessionId) => {
              setApprovalDrawerOpen(false);
              onNavigate?.(`/thread/${sessionId}`);
            }}
          />
        </Drawer>
      </div>
    </InspectorControlProvider>
  );
}
