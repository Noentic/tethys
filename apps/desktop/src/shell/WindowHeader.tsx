import { MagnifyingGlass } from "@nebutra/icons";
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
}: WindowHeaderProps) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-10 w-full items-center border-b border-[var(--tethys-hairline)] bg-[var(--tethys-surface-rail)] select-none z-10"
    >
      {/* Platform window controls inset (macOS traffic lights drag region) */}
      {platformInset && (
        <div className="w-[70px] shrink-0" data-tauri-drag-region />
      )}

      {/* Tabs */}
      <div className="flex-1 min-w-0 h-full flex items-center">
        <TabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />
      </div>

      {/* Right cluster: Approvals pill + Search omnibar trigger */}
      <div className="flex items-center gap-2 px-3 shrink-0">
        <ApprovalInboxPill
          count={approvalCount}
          onClick={onOpenApprovalQueue}
        />

        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-6 items-center gap-1.5 rounded border border-[var(--tethys-hairline)] bg-[var(--tethys-surface-hover)] px-2 text-[11px] text-[var(--tethys-text-muted)] hover:text-[var(--tethys-text-primary)] transition-colors outline-none"
        >
          <MagnifyingGlass className="h-3.5 w-3.5" />
          <span>Search...</span>
          <kbd className="ml-1 font-mono text-[10px] opacity-70">⌘K</kbd>
        </button>
      </div>
    </header>
  );
}
