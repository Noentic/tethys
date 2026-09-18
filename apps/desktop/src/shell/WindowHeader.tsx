import { MagnifyingGlass, Plus, SidebarLeft } from "@nebutra/icons";
import { ApprovalInboxPill, type TabItemData, TabStrip } from "@tethys/ui";

export interface WindowHeaderProps {
  tabs: TabItemData[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  approvalCount?: number;
  onOpenApprovalQueue?: () => void;
  onOpenPalette?: () => void;
  platformInset?: boolean;
  onToggleSidebar?: () => void;
  onNewThread?: () => void;
}

export function WindowHeader({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  approvalCount = 0,
  onOpenApprovalQueue,
  onOpenPalette,
  platformInset = false,
  onToggleSidebar,
  onNewThread,
}: WindowHeaderProps) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-10 w-full items-center border-b border-(--tethys-hairline) bg-(--tethys-surface-rail) select-none z-10 px-2 gap-2"
    >
      {/* Platform window controls inset (macOS traffic lights drag region) */}
      {platformInset && (
        <div className="w-[70px] shrink-0" data-tauri-drag-region />
      )}

      {/* Sidebar toggle button (matching reference) */}
      {onToggleSidebar && (
        <button
          type="button"
          aria-label="Toggle sessions sidebar"
          onClick={onToggleSidebar}
          className="flex size-7 items-center justify-center rounded-md text-(--tethys-text-muted) hover:text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover) transition-colors shrink-0"
        >
          <SidebarLeft className="size-4" />
        </button>
      )}

      {/* Tabs */}
      <div className="flex-1 min-w-0 h-full flex items-center gap-1">
        <TabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          className="w-auto border-b-0 bg-transparent px-0 flex-none"
        />
        {onNewThread && (
          <button
            type="button"
            aria-label="New thread"
            onClick={onNewThread}
            className="flex size-6 items-center justify-center rounded text-(--tethys-text-muted) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary) transition-colors shrink-0"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>

      {/* Right cluster: Approvals pill + Search omnibar trigger */}
      <div className="flex items-center gap-2 px-1 shrink-0">
        <ApprovalInboxPill
          count={approvalCount}
          onClick={onOpenApprovalQueue}
        />

        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-7 items-center gap-2 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2.5 text-xs text-(--tethys-text-muted) hover:text-(--tethys-text-primary) hover:border-(--tethys-hairline-strong) transition-colors outline-none"
        >
          <MagnifyingGlass className="size-3.5" />
          <span>Search...</span>
          <kbd className="font-mono text-[10px] text-(--tethys-text-muted) bg-(--tethys-surface-elevated) px-1 rounded border border-(--tethys-hairline)">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
}
