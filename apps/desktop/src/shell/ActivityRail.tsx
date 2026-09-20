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
      className="z-(--tethys-z-base) flex h-full w-rail shrink-0 flex-col items-center justify-between border-r border-(--tethys-hairline-structural) bg-(--tethys-surface-rail) py-3 select-none"
    >
      {/* Top cluster */}
      <div className="flex flex-col items-center gap-2">
        <IconButton
          size="rail"
          label="Projects (Ctrl+1)"
          onClick={() => onNavigate("workspaces")}
          className={
            activeView === "workspaces"
              ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) relative before:absolute before:top-2 before:bottom-2 before:-left-1.5 before:w-0.5 before:rounded-r-xs before:bg-(--tethys-accent-focus)"
              : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
          }
        >
          <GridSquare className="size-5" />
        </IconButton>

        <IconButton
          size="rail"
          label="New Thread (Ctrl+T)"
          onClick={() => onNavigate("thread-new")}
          className={
            activeView === "thread-new"
              ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) relative before:absolute before:top-2 before:bottom-2 before:-left-1.5 before:w-0.5 before:rounded-r-xs before:bg-(--tethys-accent-focus)"
              : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
          }
        >
          <Plus className="size-5" />
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
              ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) relative before:absolute before:top-2 before:bottom-2 before:-left-1.5 before:w-0.5 before:rounded-r-xs before:bg-(--tethys-accent-focus)"
              : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
          }
        >
          <SettingsGear className="size-5" />
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
