import { useStore } from "@tanstack/react-store";
import { createClient } from "@tethys/client";
import {
  isTurnComplete,
  pendingApprovalNotification,
  sendOsNotification,
  shouldNotify,
  turnCompletionNotification,
} from "@tethys/features";
import {
  queryClient,
  queryKeys,
  sessionsRegistryStore,
  useThreadsQuery,
} from "@tethys/state";
import {
  Drawer,
  getApprovalDrawerBody,
  type InspectorControl,
  InspectorControlProvider,
} from "@tethys/ui";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Group,
  Panel,
  type PanelImperativeHandle,
  Separator,
  usePanelRef,
} from "react-resizable-panels";
import { ActivityRail } from "./ActivityRail";
import { ApprovalDrawerBody } from "./ApprovalDrawerBody";
import { CommandPalette, type PaletteAction } from "./CommandPalette";
import { InspectorPane } from "./InspectorPane";
import { setupGlobalKeyboardMap } from "./keyboard";
import { notificationsEnabled } from "./notification-preference";
import { SessionsColumn } from "./SessionsColumn";
import {
  computeShellLayout,
  INSPECTOR_COLLAPSED_WIDTH,
  INSPECTOR_WIDTH,
  STAGE_MIN_WIDTH,
} from "./shell-layout";
import {
  getThemePreference,
  resolveScheme,
  setColorScheme,
} from "./theme-preference";
import { WindowHeader } from "./WindowHeader";

const client = createClient();

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
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(false);
  const inspectorPanelRef =
    usePanelRef() as React.RefObject<PanelImperativeHandle | null>;

  // One handler per palette action; the `Record` makes a row without a
  // handler a type error rather than a dead click.
  const runPaletteAction = useCallback(
    (action: PaletteAction) => {
      const actions: Record<PaletteAction, () => void> = {
        "new-thread": () => onNavigate?.("/thread/new"),
        "go-workspaces": () => onNavigate?.("/workspaces"),
        "open-settings": () => onNavigate?.("/settings/general"),
        "toggle-theme": () => {
          const resolved = resolveScheme(getThemePreference().scheme);
          setColorScheme(resolved === "light" ? "dark" : "light");
        },
        "manual-health-check": () => {
          void client.agent
            .recheck()
            .then(() =>
              queryClient.invalidateQueries({ queryKey: queryKeys.providers }),
            );
        },
      };
      actions[action]();
    },
    [onNavigate],
  );

  const toggleInspector = useCallback(() => {
    const panel = inspectorPanelRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
      setInspectorCollapsed(false);
    } else {
      panel.collapse();
      setInspectorCollapsed(true);
    }
  }, [inspectorPanelRef]);
  const [sessionsSidebarOpen, setSessionsSidebarOpen] =
    useState<boolean>(false);

  // Responsive layout state
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(true);

  // Sessions store integration
  useThreadsQuery();
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

  // OS notifications: approval growth while blurred, and a turn settling. Both
  // respect the Settings toggles; the plugin import is lazy and Tauri-only.
  const previousApprovals = useRef(approvalCount);
  const previousStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    const enabled = notificationsEnabled();
    const approvalsBefore = previousApprovals.current;
    if (
      enabled &&
      shouldNotify(approvalsBefore, approvalCount, isWindowFocused)
    ) {
      const notification = pendingApprovalNotification(
        approvalCount - approvalsBefore,
        approvalCount,
      );
      if (notification) void sendOsNotification(notification);
    }
    previousApprovals.current = approvalCount;

    const next: Record<string, string> = {};
    for (const session of sessions) {
      const before = previousStatuses.current[session.sessionId];
      if (enabled && isTurnComplete(before, session.status)) {
        void sendOsNotification(turnCompletionNotification(session.title));
      }
      next[session.sessionId] = session.status;
    }
    previousStatuses.current = next;
  }, [approvalCount, sessions, isWindowFocused]);

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
      onToggleInspector: toggleInspector,
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
  }, [
    tabs,
    activeTabId,
    onNavigate,
    handleSelectTab,
    handleCloseTab,
    toggleInspector,
  ]);

  // Rail | Stage | Inspector. Sessions is never docked: it is a drawer that
  // takes no width from the Stage, so the docked layout always clears
  // STAGE_MIN_WIDTH (shell-layout.ts).
  const layout = computeShellLayout({
    windowWidth,
    hasInspector: activeView === "thread",
    inspectorCollapsed,
    sessionsOpen: sessionsSidebarOpen,
  });
  const isOverlayInspector = layout.inspector === "overlay";

  // Shell-provided control for slot components: overlay at narrow widths,
  // expand the collapsed docked panel above the overlay breakpoint.
  const inspectorControl: InspectorControl = {
    open: () => {
      if (isOverlayInspector) {
        setInspectorOverlayOpen(true);
      } else {
        inspectorPanelRef.current?.expand();
        setInspectorCollapsed(false);
      }
    },
  };

  const currentSessionState = activeSessionId
    ? sessionsMap[activeSessionId]
    : undefined;

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

          {/* Stage + docked Inspector */}
          <Group
            id="shell-main-group"
            orientation="horizontal"
            className="flex-1 overflow-hidden"
          >
            {/* Center Stage Panel */}
            <Panel
              id="shell-stage"
              minSize={STAGE_MIN_WIDTH}
              className="flex-1 h-full flex flex-col overflow-hidden bg-(--tethys-canvas)"
            >
              <div className="flex-1 overflow-hidden flex flex-col">
                {children}
              </div>
            </Panel>

            {/* Inspector Panel (360px), docked from the overlay breakpoint up */}
            {activeView === "thread" && !isOverlayInspector && (
              <>
                <Separator className={SHELL_SEPARATOR_CLASS} />
                <Panel
                  id="shell-inspector"
                  panelRef={inspectorPanelRef}
                  defaultSize={INSPECTOR_WIDTH}
                  minSize={240}
                  maxSize={500}
                  collapsedSize={INSPECTOR_COLLAPSED_WIDTH}
                  collapsible
                  className="h-full"
                >
                  <InspectorPane
                    sessionId={activeSessionId}
                    status={currentSessionState?.status}
                    collapsed={inspectorCollapsed}
                    onToggleCollapse={toggleInspector}
                  />
                </Panel>
              </>
            )}
          </Group>
        </div>

        {/* Overlay Inspector below the breakpoint: a drawer over the Stage that
            takes no width from it, with scrim, focus trap and Esc. */}
        <Drawer
          open={isOverlayInspector && inspectorOverlayOpen}
          onClose={() => setInspectorOverlayOpen(false)}
          bare
          label="Thread Inspector"
          side="right"
          width="w-(--layout-shell-inspector)"
        >
          <InspectorPane
            sessionId={activeSessionId}
            status={currentSessionState?.status}
            isOverlay
            onCloseOverlay={() => setInspectorOverlayOpen(false)}
          />
        </Drawer>

        {/* Sessions: an on-demand drawer, never a docked region. */}
        <Drawer
          open={sessionsSidebarOpen}
          onClose={() => setSessionsSidebarOpen(false)}
          bare
          label="Sessions"
          side="left"
          width="w-(--layout-shell-threads)"
        >
          <SessionsColumn
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={(sessId) => {
              setSessionsSidebarOpen(false);
              onNavigate?.(`/thread/${sessId}`);
            }}
            onNewSession={() => {
              setSessionsSidebarOpen(false);
              onNavigate?.("/thread/new");
            }}
          />
        </Drawer>

        {/* 3. Command Palette Dialog */}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onSelectCommand={runPaletteAction}
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
