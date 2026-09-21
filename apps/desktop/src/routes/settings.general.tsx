import { ToolCallDensityRow, TrustedFolders } from "@tethys/features";
import { PageHeader, Select, ToggleSwitch } from "@tethys/ui";
import type React from "react";
import {
  setNotificationsEnabled,
  useNotificationPreference,
} from "../shell/notification-preference";
import {
  CODE_FONTS,
  setCodeFont,
  setColorScheme,
  setUiFont,
  UI_FONTS,
  useResolvedTheme,
  useThemePreference,
} from "../shell/theme-preference";

/** One pen `HL2ay` form row: label (+ help) at the reading width, control right. */
function SettingRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-xl py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-sm text-(--tethys-text-primary)">
          {label}
        </span>
        {help && (
          <span className="max-w-[476px] text-label-sm font-normal text-(--tethys-text-muted)">
            {help}
          </span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsGeneralView() {
  const preference = useThemePreference();
  const resolved = useResolvedTheme();
  const notifications = useNotificationPreference();

  return (
    <div className="flex flex-col gap-2xl">
      <PageHeader breadcrumb="Settings / General" title="General" />

      <div className="flex max-w-[720px] flex-col divide-y divide-(--tethys-hairline)">
        <SettingRow label="Color scheme">
          <Select
            aria-label="Color scheme"
            className="w-[220px]"
            value={preference.scheme}
            onChange={(event) =>
              setColorScheme(event.target.value as "system" | "dark" | "light")
            }
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </Select>
        </SettingRow>

        <SettingRow
          label="Theme"
          help="The shipped pair; the manifest hot-swaps with no reload."
        >
          <Select
            aria-label="Theme"
            className="w-[220px]"
            value={resolved}
            onChange={(event) =>
              setColorScheme(event.target.value as "dark" | "light")
            }
          >
            <option value="dark">Default Dark</option>
            <option value="light">Default Light</option>
          </Select>
        </SettingRow>

        <SettingRow label="UI font">
          <Select
            aria-label="UI font"
            className="w-[220px]"
            value={preference.uiFont}
            onChange={(event) => setUiFont(event.target.value)}
          >
            {Object.keys(UI_FONTS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow label="Code font">
          <Select
            aria-label="Code font"
            className="w-[220px]"
            value={preference.codeFont}
            onChange={(event) => setCodeFont(event.target.value)}
          >
            {Object.keys(CODE_FONTS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </SettingRow>

        <SettingRow
          label="System notifications"
          help="Desktop alerts for approvals and agent completion."
        >
          <ToggleSwitch
            id="notification-switch"
            label="System notifications"
            checked={notifications.enabled}
            onCheckedChange={setNotificationsEnabled}
          />
        </SettingRow>

        <SettingRow
          label="Tool call density"
          help="Summary groups consecutive calls. Full shows every call. A failed call or one awaiting permission is open under either."
        >
          <ToolCallDensityRow />
        </SettingRow>
      </div>

      <section className="flex max-w-[720px] flex-col gap-3">
        <h2 className="text-heading-md text-(--tethys-text-primary)">
          Trusted folders
        </h2>
        <TrustedFolders />
      </section>
    </div>
  );
}
