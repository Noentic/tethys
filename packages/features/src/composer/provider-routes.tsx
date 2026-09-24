import type {
  ProviderControl,
  ProviderControlResult,
  ProviderExtensionCapabilities,
  ProviderHeader,
  ProviderRoute,
} from "@tethys/bindings";
import { Button, Input } from "@tethys/ui";
import { useCallback, useEffect, useRef, useState } from "react";

export type SendControl = (
  control: ProviderControl,
) => Promise<ProviderControlResult>;

type HeaderDraft = ProviderHeader & { id: number };

export function ProviderRoutes({
  capabilities,
  send,
  busy,
  setBusy,
}: {
  capabilities: ProviderExtensionCapabilities | null | undefined;
  send: SendControl;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}): React.ReactElement | null {
  const enabled = capabilities?.provider_routing === true;
  const [providers, setProviders] = useState<ProviderRoute[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiType, setApiType] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [headers, setHeaders] = useState<HeaderDraft[]>([]);
  const nextHeaderId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await send({ kind: "list-providers" });
      if (result.kind !== "providers") {
        throw new Error("The ACP server returned an invalid provider list");
      }
      setProviders(result.providers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [enabled, send]);

  useEffect(() => {
    setProviders(null);
    void refresh();
  }, [refresh]);

  const beginEdit = (provider: ProviderRoute) => {
    setEditingProvider(provider.provider_id);
    setApiType(provider.current?.api_type ?? provider.supported[0] ?? "");
    setBaseUrl(provider.current?.base_url ?? "");
    setHeaders([]);
  };

  const save = async (providerId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await send({
        kind: "set-provider",
        provider_id: providerId,
        api_type: apiType,
        base_url: baseUrl.trim(),
        headers: headers
          .filter((header) => header.name.trim() !== "" || header.value !== "")
          .map(({ name, value }) => ({ name, value })),
      });
      if (result.kind !== "provider-updated") {
        throw new Error("The ACP server did not confirm the provider update");
      }
      setEditingProvider(null);
      setHeaders([]);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (providerId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await send({
        kind: "disable-provider",
        provider_id: providerId,
      });
      if (result.kind !== "provider-disabled") {
        throw new Error(
          "The ACP server did not confirm the provider was disabled",
        );
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  return (
    <section
      aria-label="ACP provider routing"
      className="border-t border-(--tethys-hairline) pt-sm"
    >
      <header className="mb-xs text-label-sm text-(--tethys-text-primary)">
        Agent provider routing
      </header>
      <p className="mb-sm text-body-sm text-(--tethys-text-muted)">
        These upstream routes belong to the connected agent. They are separate
        from Tethys provider setup.
      </p>
      {loading && providers === null && (
        <p className="text-body-sm text-(--tethys-text-muted)">
          Loading routes…
        </p>
      )}
      {providers?.map((provider) => (
        <div
          key={provider.provider_id}
          className="mb-sm rounded-sm border border-(--tethys-hairline) p-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <div>
              <div className="text-label-sm text-(--tethys-text-primary)">
                {provider.provider_id}
              </div>
              <div className="text-body-sm text-(--tethys-text-muted)">
                {provider.current
                  ? `${provider.current.api_type} · ${provider.current.base_url}`
                  : "Disabled"}
                {provider.required ? " · required" : ""}
              </div>
            </div>
            <div className="flex gap-xs">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => beginEdit(provider)}
              >
                Configure
              </Button>
              {provider.current && !provider.required && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void disable(provider.provider_id)}
                >
                  Disable
                </Button>
              )}
            </div>
          </div>
          {editingProvider === provider.provider_id && (
            <div className="mt-sm flex flex-col gap-sm">
              <label className="flex flex-col gap-1 text-label-sm text-(--tethys-text-secondary)">
                API protocol
                <select
                  aria-label={`${provider.provider_id} API protocol`}
                  value={apiType}
                  onChange={(event) => setApiType(event.target.value)}
                  className="h-8 rounded-sm border border-(--tethys-border-control) bg-(--tethys-surface-panel) px-2 text-body-sm"
                >
                  {provider.supported.map((protocol) => (
                    <option key={protocol} value={protocol}>
                      {protocol}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                aria-label={`${provider.provider_id} base URL`}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
              />
              <div className="flex flex-col gap-xs">
                <span className="text-label-sm text-(--tethys-text-secondary)">
                  Headers
                </span>
                <p className="text-body-sm text-(--tethys-text-muted)">
                  ACP does not return existing header values. Setting this route
                  replaces its full configuration, so re-enter any required
                  headers.
                </p>
                {headers.map((header, index) => (
                  <div key={header.id} className="flex gap-xs">
                    <Input
                      aria-label={`Header ${index + 1} name`}
                      value={header.name}
                      onChange={(event) =>
                        setHeaders((items) =>
                          items.map((item) =>
                            item.id === header.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Header name"
                    />
                    <Input
                      type="password"
                      aria-label={`Header ${index + 1} value`}
                      value={header.value}
                      onChange={(event) =>
                        setHeaders((items) =>
                          items.map((item) =>
                            item.id === header.id
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Secret value"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove header ${index + 1}`}
                      onClick={() =>
                        setHeaders((items) =>
                          items.filter((item) => item.id !== header.id),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setHeaders((items) => [
                      ...items,
                      { id: nextHeaderId.current++, name: "", value: "" },
                    ])
                  }
                >
                  Add header
                </Button>
              </div>
              <div className="flex justify-end gap-xs">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingProvider(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || !apiType || !baseUrl.trim()}
                  onClick={() => void save(provider.provider_id)}
                >
                  Save route
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        disabled={loading}
        onClick={() => void refresh()}
      >
        Refresh routes
      </Button>
      {error && (
        <p role="alert" className="text-body-sm text-(--tethys-status-danger)">
          {error}
        </p>
      )}
    </section>
  );
}
