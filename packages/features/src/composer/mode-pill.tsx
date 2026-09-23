//! Mode pill (spec §4, DESIGN.md `mode-pill`) — the one home of the ACP `mode` category.
//! Every other option lives in the composer chips or the full config panel.

import type { ConfigOption, PermissionMode } from "@tethys/bindings";
import type { RefObject } from "react";
import { ModeSelector } from "../thread-new/mode-selector";

export const MODE_PILL_PRIORITY = 40;

export interface ModePillData {
  options?: ConfigOption[];
  onChange?: (value: string) => void;
  permissionMode?: PermissionMode;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  worktreeEnabled?: boolean;
  providerName?: string;
  workspaceName?: string;
  onMakeDefault?: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export function ModePill({ data }: { data?: unknown }) {
  const pillData = data as ModePillData | undefined;
  return (
    <ModeSelector
      options={pillData?.options ?? []}
      onChange={(value) => pillData?.onChange?.(value)}
      permissionMode={pillData?.permissionMode}
      onPermissionModeChange={pillData?.onPermissionModeChange}
      worktreeEnabled={pillData?.worktreeEnabled}
      providerName={pillData?.providerName}
      workspaceName={pillData?.workspaceName}
      onMakeDefault={pillData?.onMakeDefault}
      triggerRef={pillData?.triggerRef}
    />
  );
}
