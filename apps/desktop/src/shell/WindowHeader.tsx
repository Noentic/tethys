import { MagnifyingGlass, Plus, SidebarLeft } from "@nebutra/icons";
import {
  ApprovalInboxPill,
  IconButton,
  KeycapPill,
  type TabItemData,
  TabStrip,
} from "@tethys/ui";

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
      className="z-10 flex h-titlebar w-full items-center gap-sm border-b border-(--tethys-hairline-structural) bg-(--tethys-surface-rail) px-sm select-none"
    >
      {/* Platform window controls inset (macOS traffic lights drag region) */}
      {platformInset && (
        <div className="w-[70px] shrink-0" data-tauri-drag-region />
      )}

      {/* Sidebar toggle button (matching reference) */}
      {onToggleSidebar && (
        <IconButton
          size="compact"
          label="Toggle sessions sidebar"
          onClick={onToggleSidebar}
          className="shrink-0 text-(--tethys-text-muted)"
        >
          <SidebarLeft className="size-4" />
        </IconButton>
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
          <IconButton
            size="compact"
            label="New thread"
            onClick={onNewThread}
            className="shrink-0 text-(--tethys-text-muted)"
          >
            <Plus className="size-3.5" />
          </IconButton>
        )}
      </div>

      {/* Right cluster: Approvals pill + Search omnibar trigger */}
      <div className="flex shrink-0 items-center gap-sm px-1">
        <ApprovalInboxPill
          count={approvalCount}
          onClick={onOpenApprovalQueue}
        />

        <button
          type="button"
          onClick={onOpenPalette}
          className="focus-ring flex h-7 items-center gap-sm rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2.5 text-label-md text-(--tethys-text-muted) transition-colors hover:border-(--tethys-hairline-strong) hover:text-(--tethys-text-primary)"
        >
          <MagnifyingGlass className="size-3.5" />
          <span>Search...</span>
          <KeycapPill>⌘K</KeycapPill>
        </button>
      </div>
    </header>
  );
}
