import { GridSquare, Plus, SettingsGear } from "@nebutra/icons";
import { IconButton, StatusDot } from "@tethys/ui";

export interface ActivityRailProps {
  activeView: "workspaces" | "thread-new" | "thread" | "settings";
  onNavigate: (view: "workspaces" | "thread-new" | "settings") => void;
  daemonHealthy?: boolean;
}

export function ActivityRail({
  activeView,
  onNavigate,
  daemonHealthy = true,
}: ActivityRailProps) {
  return (
    <aside
      aria-label="Activity Rail"
      className="flex h-full w-12 flex-col items-center justify-between border-r border-(--tethys-hairline) bg-(--tethys-surface-rail) py-3 select-none shrink-0 z-20"
    >
      {/* Top cluster */}
      <div className="flex flex-col items-center gap-2">
        <IconButton
          size="rail"
          label="Projects (Ctrl+1)"
          onClick={() => onNavigate("workspaces")}
          className={
            activeView === "workspaces"
              ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) font-semibold"
              : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
          }
        >
          <GridSquare className="h-5 w-5" />
        </IconButton>

        <IconButton
          size="rail"
          label="New Thread (Ctrl+T)"
          onClick={() => onNavigate("thread-new")}
          className={
            activeView === "thread-new"
              ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) font-semibold"
              : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
          }
        >
          <Plus className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Bottom cluster */}
      <div className="flex flex-col items-center gap-3">
        <IconButton
          size="rail"
          label="Settings (Ctrl+,)"
          onClick={() => onNavigate("settings")}
          className={
            activeView === "settings"
              ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
              : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
          }
        >
          <SettingsGear className="h-5 w-5" />
        </IconButton>

        <div
          className="flex items-center justify-center p-1"
          title={daemonHealthy ? "Daemon healthy" : "Daemon offline"}
        >
          <StatusDot status={daemonHealthy ? "healthy" : "error"} />
        </div>
      </div>
    </aside>
  );
}
