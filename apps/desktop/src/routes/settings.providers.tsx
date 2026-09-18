import {
  ChevronDown,
  ChevronUp,
  FolderClosed,
  Key,
  RefreshClockwise,
} from "@nebutra/icons";
import { Badge, Button, StepperInput, ToggleSwitch } from "@tethys/ui";
import { useState } from "react";

interface ProviderItem {
  id: string;
  name: string;
  binary: string;
  executablePath: string;
  status: "healthy" | "auth_required" | "not_found";
  statusText: string;
  enabled: boolean;
  capabilities: string[];
  protocolVersion: string;
  authMethod?: "env_var" | "url_code" | "cli_passthrough";
}

const INITIAL_PROVIDERS: ProviderItem[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    binary: "claude",
    executablePath: "/usr/local/bin/claude",
    status: "healthy",
    statusText: "Healthy — ACP handshake verified",
    enabled: true,
    capabilities: ["session.resume", "mcp: stdio", "elicitation"],
    protocolVersion: "ACP v2",
    authMethod: "cli_passthrough",
  },
  {
    id: "opencode",
    name: "OpenCode",
    binary: "opencode",
    executablePath: "/usr/bin/opencode",
    status: "healthy",
    statusText: "Healthy — ACP handshake verified",
    enabled: true,
    capabilities: ["mcp: stdio"],
    protocolVersion: "ACP v2",
  },
  {
    id: "codex-cli",
    name: "Codex CLI",
    binary: "codex",
    executablePath: "",
    status: "not_found",
    statusText: "Not found — binary missing from PATH",
    enabled: false,
    capabilities: ["mcp: stdio"],
    protocolVersion: "ACP v2",
    authMethod: "cli_passthrough",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    binary: "gemini",
    executablePath: "/home/woshi/.local/bin/gemini",
    status: "auth_required",
    statusText: "Auth required — credentials expired or not configured",
    enabled: true,
    capabilities: ["session.resume", "mcp: stdio"],
    protocolVersion: "ACP v2",
    authMethod: "env_var",
  },
];

export function SettingsProvidersView() {
  const [interval, setInterval] = useState<number>(300);
  const [providers, setProviders] = useState<ProviderItem[]>(INITIAL_PROVIDERS);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(
    "claude-code",
  );

  const toggleProvider = (id: string, checked: boolean) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: checked } : p)),
    );
  };

  const updatePath = (id: string, path: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, executablePath: path } : p)),
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-1">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-(--tethys-text-muted)"
        >
          <span>Settings</span>
          <span>/</span>
          <span className="text-(--tethys-text-primary) font-medium">
            Providers
          </span>
        </nav>

        <div className="flex items-center justify-between pt-2">
          <h2 className="text-2xl font-bold tracking-tight text-(--tethys-text-primary)">
            Providers
          </h2>

          <div className="flex items-center gap-2 text-xs text-(--tethys-text-muted)">
            <span>Checked 1m ago</span>
            <button
              type="button"
              aria-label="Refresh providers status"
              className="p-1 rounded text-(--tethys-text-muted) hover:text-(--tethys-text-primary) transition-colors"
            >
              <RefreshClockwise className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Health Check Interval Setting (§5.2) */}
      <div className="flex items-center justify-between border-b border-(--tethys-hairline) pb-6">
        <div className="flex flex-col gap-1 max-w-lg">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-(--tethys-text-primary)">
            <span>Health check interval</span>
          </div>
          <p className="text-xs text-(--tethys-text-muted) leading-relaxed">
            Periodically poll configured ACP provider executables, versions,
            auth status, and model metadata. Set to 0 to poll manually.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StepperInput
            value={interval}
            min={0}
            max={3600}
            step={30}
            onChange={setInterval}
          />
          <span className="text-xs text-(--tethys-text-muted)">seconds</span>
        </div>
      </div>

      {/* Provider List Rows (§5.2) */}
      <div className="flex flex-col gap-4">
        {providers.map((p) => {
          const isExpanded = expandedProviderId === p.id;
          return (
            <div
              key={p.id}
              className="flex flex-col rounded-xl border border-(--tethys-hairline) bg-(--tethys-surface-panel) overflow-hidden"
            >
              {/* Row Header */}
              <div className="flex items-center justify-between p-4 bg-(--tethys-surface-elevated)/40">
                <div className="flex items-center gap-3">
                  <span
                    className={`size-2.5 rounded-full ${
                      p.status === "healthy"
                        ? "bg-emerald-500"
                        : p.status === "auth_required"
                          ? "bg-amber-400"
                          : "bg-red-500"
                    }`}
                  />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-(--tethys-text-primary)">
                        {p.name}
                      </span>
                      <Badge
                        variant="muted"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {p.protocolVersion}
                      </Badge>
                    </div>
                    <span className="text-xs text-(--tethys-text-muted)">
                      {p.statusText}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`Toggle details for ${p.name}`}
                    onClick={() =>
                      setExpandedProviderId(isExpanded ? null : p.id)
                    }
                    className="p-1 text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>
                  <ToggleSwitch
                    id={`provider-${p.id}`}
                    label={`Enable ${p.name}`}
                    checked={p.enabled}
                    onCheckedChange={(checked) => toggleProvider(p.id, checked)}
                  />
                </div>
              </div>

              {/* Accordion Content (§5.2) */}
              {isExpanded && (
                <div className="border-t border-(--tethys-hairline) p-4 flex flex-col gap-4 bg-(--tethys-surface-panel) text-xs">
                  {/* Executable Path Override */}
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`exec-path-${p.id}`}
                      className="font-medium text-(--tethys-text-secondary)"
                    >
                      Executable Path Override
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`exec-path-${p.id}`}
                        type="text"
                        value={p.executablePath}
                        placeholder={`Resolved via PATH (default: ${p.binary})`}
                        onChange={(e) => updatePath(p.id, e.target.value)}
                        className="flex-1 h-8 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-3 font-mono text-xs text-(--tethys-text-primary) outline-none focus:border-(--tethys-hairline-strong)"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-xs flex items-center gap-1.5"
                      >
                        <FolderClosed className="size-3.5" />
                        <span>Browse…</span>
                      </Button>
                    </div>
                  </div>

                  {/* Negotiated Capabilities & Auth (§5.2) */}
                  <div className="flex items-center justify-between pt-2 border-t border-(--tethys-hairline)/60">
                    <div className="flex items-center gap-2">
                      <span className="text-(--tethys-text-muted)">
                        Capabilities:
                      </span>
                      {p.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="rounded bg-(--tethys-surface-elevated) px-2 py-0.5 font-mono text-[10px] text-(--tethys-text-secondary) border border-(--tethys-hairline)"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>

                    {p.authMethod && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-xs flex items-center gap-1.5"
                      >
                        <Key className="size-3" />
                        <span>
                          {p.authMethod === "env_var"
                            ? "Configure API Key"
                            : "Launch Vendor Login"}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
