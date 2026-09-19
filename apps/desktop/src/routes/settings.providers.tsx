import {
  ChevronDown,
  ChevronUp,
  FolderClosed,
  Key,
  RefreshClockwise,
} from "@nebutra/icons";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  PageHeader,
  StatusDot,
  StepperInput,
  ToggleSwitch,
} from "@tethys/ui";
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
    <div className="flex flex-col gap-2xl">
      <PageHeader
        title="Providers"
        actions={
          <>
            <span className="text-label-md font-normal text-(--tethys-text-muted)">
              Checked 1m ago
            </span>
            <IconButton
              size="compact"
              label="Refresh providers status"
              className="text-(--tethys-text-muted)"
            >
              <RefreshClockwise className="size-3.5" />
            </IconButton>
          </>
        }
      />

      {/* Health Check Interval Setting (§5.2) */}
      <Card className="flex items-center justify-between gap-xl px-lg py-md">
        <div className="flex max-w-128 flex-col gap-1">
          <span className="text-body-sm text-(--tethys-text-primary)">
            Health check interval
          </span>
          <p className="text-label-md font-normal text-(--tethys-text-muted)">
            Periodically poll configured ACP provider executables, versions,
            auth status, and model metadata. Set to 0 to poll manually.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-sm">
          <StepperInput
            value={interval}
            min={0}
            max={3600}
            step={30}
            onChange={setInterval}
          />
          <span className="text-label-md font-normal text-(--tethys-text-muted)">
            seconds
          </span>
        </div>
      </Card>

      {/* Provider List Rows (§5.2) */}
      <div className="flex flex-col gap-md">
        {providers.map((p) => {
          const isExpanded = expandedProviderId === p.id;
          return (
            <Card key={p.id} className="overflow-hidden">
              {/* Row Header */}
              <div className="flex items-center justify-between gap-lg px-lg py-md">
                <div className="flex min-w-0 items-center gap-md">
                  <StatusDot status={p.status} />
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-sm">
                      <span className="text-heading-md text-(--tethys-text-primary)">
                        {p.name}
                      </span>
                      <Badge variant="muted" size="sm">
                        {p.protocolVersion}
                      </Badge>
                    </div>
                    <span className="truncate text-label-md font-normal text-(--tethys-text-muted)">
                      {p.statusText}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-md">
                  <IconButton
                    size="compact"
                    label={`Toggle details for ${p.name}`}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedProviderId(isExpanded ? null : p.id)
                    }
                    className="text-(--tethys-text-muted)"
                  >
                    {isExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </IconButton>
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
                <div className="flex flex-col gap-lg border-t border-(--tethys-hairline) bg-(--tethys-surface-nested) p-lg">
                  {/* Executable Path Override */}
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`exec-path-${p.id}`}
                      className="text-label-md text-(--tethys-text-secondary)"
                    >
                      Executable Path Override
                    </label>
                    <div className="flex gap-sm">
                      <Input
                        id={`exec-path-${p.id}`}
                        type="text"
                        value={p.executablePath}
                        placeholder={`Resolved via PATH (default: ${p.binary})`}
                        onChange={(e) => updatePath(p.id, e.target.value)}
                        className="font-mono text-mono-code"
                      />
                      <Button size="sm" variant="secondary" className="h-8">
                        <FolderClosed className="size-3.5" />
                        <span>Browse…</span>
                      </Button>
                    </div>
                  </div>

                  {/* Negotiated Capabilities & Auth (§5.2) */}
                  <div className="flex items-center justify-between gap-lg border-t border-(--tethys-hairline) pt-md">
                    <div className="flex flex-wrap items-center gap-sm">
                      <span className="text-label-md font-normal text-(--tethys-text-muted)">
                        Capabilities
                      </span>
                      {p.capabilities.map((cap) => (
                        <Badge key={cap} variant="outline">
                          {cap}
                        </Badge>
                      ))}
                    </div>

                    {p.authMethod && (
                      <Button size="sm" variant="secondary">
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
            </Card>
          );
        })}
      </div>
    </div>
  );
}
