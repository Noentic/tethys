import type { AgentLoginInput } from "@tethys/bindings";
import { Button, Input, ModalDialog } from "@tethys/ui";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

export interface EnvSecretRow {
  key: string;
  value: string;
}

interface CredentialFormProps {
  title: string;
  className?: string;
  methodPicker: ReactNode;
  error: string | null;
  onEscape: () => void;
  onCancel: () => void;
}

export function EnvironmentCredentialForm({
  title,
  className,
  methodPicker,
  error,
  onEscape,
  onCancel,
  onSubmit,
  onSuccess,
  onError,
}: CredentialFormProps & {
  onSubmit?: (rows: EnvSecretRow[]) => void | Promise<void>;
  onSuccess: () => void;
  onError: (message: string) => void;
}): ReactElement {
  const [rows, setRows] = useState<EnvSecretRow[]>([{ key: "", value: "" }]);
  const typedRows = rows.filter((row) => row.key.trim() !== "");
  const canSave =
    typedRows.length > 0 &&
    typedRows.every(
      (row) =>
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(row.key.trim()) && row.value !== "",
    );

  const submit = async () => {
    const values = rows
      .map((row) => ({ key: row.key.trim(), value: row.value }))
      .filter((row) => row.key !== "" && row.value !== "");
    setRows([{ key: "", value: "" }]);
    try {
      await onSubmit?.(values);
      onSuccess();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <ModalDialog
      open
      onClose={onEscape}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSave}>
            Save
          </Button>
        </>
      }
    >
      <div className={className} data-testid="login-surface-env-var">
        {methodPicker}
        {rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
          <div key={index} className="flex items-center gap-2 py-1">
            <Input
              aria-label="Environment variable name"
              value={row.key}
              placeholder="API_KEY"
              onChange={(event) => {
                const key = event.target.value;
                setRows((current) =>
                  current.map((entry, rowIndex) =>
                    rowIndex === index ? { ...entry, key } : entry,
                  ),
                );
              }}
            />
            <Input
              aria-label="Environment variable value"
              type="password"
              autoComplete="off"
              value={row.value}
              placeholder="value"
              onChange={(event) => {
                const value = event.target.value;
                setRows((current) =>
                  current.map((entry, rowIndex) =>
                    rowIndex === index ? { ...entry, value } : entry,
                  ),
                );
              }}
            />
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setRows((current) => [...current, { key: "", value: "" }])
          }
        >
          Add variable
        </Button>
        {error && (
          <p
            className="text-body-sm text-(--tethys-status-danger)"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </ModalDialog>
  );
}

export function ApiKeyCredentialForm({
  title,
  className,
  methodPicker,
  error,
  onEscape,
  onCancel,
  onSubmit,
  enabled,
}: CredentialFormProps & {
  onSubmit: (input?: AgentLoginInput) => Promise<void>;
  enabled: boolean;
}): ReactElement {
  const [apiKey, setApiKey] = useState("");

  return (
    <ModalDialog
      open
      onClose={onEscape}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => void onSubmit()}
            disabled={!enabled}
          >
            Use configured API key
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const value = apiKey;
              setApiKey("");
              void onSubmit({ kind: "api-key", api_key: value });
            }}
            disabled={!enabled || apiKey.trim().length === 0}
          >
            Sign in
          </Button>
        </>
      }
    >
      <div className={className} data-testid="login-surface-api-key">
        {methodPicker}
        <Input
          aria-label="API key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="API key"
        />
        {error && <p role="alert">{error}</p>}
      </div>
    </ModalDialog>
  );
}

export function GatewayCredentialForm({
  title,
  className,
  methodPicker,
  error,
  onEscape,
  onCancel,
  onSubmit,
  enabled,
}: CredentialFormProps & {
  onSubmit: (input: AgentLoginInput) => Promise<void>;
  enabled: boolean;
}): ReactElement {
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [providerName, setProviderName] = useState("");
  const [headers, setHeaders] = useState([{ key: "", value: "" }]);

  return (
    <ModalDialog
      open
      onClose={onEscape}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!enabled || gatewayUrl.trim().length === 0}
            onClick={() => {
              const input: AgentLoginInput = {
                kind: "gateway",
                base_url: gatewayUrl,
                provider_name: providerName.trim() || null,
                headers: Object.fromEntries(
                  headers
                    .filter((header) => header.key.trim() !== "")
                    .map((header) => [header.key.trim(), header.value]),
                ),
              };
              setGatewayUrl("");
              setProviderName("");
              setHeaders([{ key: "", value: "" }]);
              void onSubmit(input);
            }}
          >
            Connect gateway
          </Button>
        </>
      }
    >
      <div className={className} data-testid="login-surface-gateway">
        {methodPicker}
        <Input
          aria-label="Gateway URL"
          value={gatewayUrl}
          onChange={(event) => setGatewayUrl(event.target.value)}
          placeholder="https://gateway.example.com/v1"
        />
        <Input
          aria-label="Provider name"
          value={providerName}
          onChange={(event) => setProviderName(event.target.value)}
          placeholder="Provider name (optional)"
        />
        {headers.map((header, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
          <div key={index} className="flex items-center gap-2 py-1">
            <Input
              aria-label="Gateway header name"
              value={header.key}
              onChange={(event) => {
                const key = event.target.value;
                setHeaders((current) =>
                  current.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, key } : row,
                  ),
                );
              }}
            />
            <Input
              aria-label="Gateway header value"
              type="password"
              autoComplete="off"
              value={header.value}
              onChange={(event) => {
                const value = event.target.value;
                setHeaders((current) =>
                  current.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, value } : row,
                  ),
                );
              }}
            />
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setHeaders((current) => [...current, { key: "", value: "" }])
          }
        >
          Add header
        </Button>
        {error && <p role="alert">{error}</p>}
      </div>
    </ModalDialog>
  );
}
