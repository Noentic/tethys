//! `mcp-add-server-form` (pen `CTA6f`). The Add MCP server dialog: name,
//! transport, the transport's endpoint, and environment rows. Submitting calls
//! `registry_set` for the page's scope — the only writer of server definitions.

import type {
  RegistryEntry,
  RegistryValue,
  TransportKind,
} from "@tethys/bindings";
import { Button, Input, ModalDialog, Select } from "@tethys/ui";
import { useState } from "react";

export interface McpAddServerFormProps {
  open: boolean;
  /** Context line: provider, scope and config file name. */
  context?: string;
  onClose: () => void;
  onSave: (name: string, entry: RegistryEntry) => Promise<void>;
}

interface EnvRow {
  key: string;
  value: string;
}

export function McpAddServerForm({
  open,
  context,
  onClose,
  onSave,
}: McpAddServerFormProps) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<TransportKind>("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setTransport("stdio");
    setCommand("");
    setUrl("");
    setEnv([]);
    setError(null);
  };

  const submit = async () => {
    if (name.trim() === "") {
      setError("A server needs a name.");
      return;
    }
    const values: Record<string, RegistryValue> = {};
    for (const row of env) {
      if (row.key.trim() !== "") values[row.key.trim()] = row.value;
    }
    const entry: RegistryEntry = {
      type: transport,
      ...(transport === "stdio"
        ? { command: command.trim() === "" ? null : command.trim() }
        : { url: url.trim() === "" ? null : url.trim() }),
      ...(env.length > 0 ? { env: values } : {}),
    };
    setBusy(true);
    try {
      await onSave(name.trim(), entry);
      reset();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Add MCP server"
      description={context}
      maxWidth="max-w-[420px]"
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-1">
          <span className="text-label-sm text-(--tethys-text-muted)">Name</span>
          <Input
            aria-label="Server name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-label-sm text-(--tethys-text-muted)">
            Transport
          </span>
          <Select
            aria-label="Transport"
            value={transport}
            onChange={(event) =>
              setTransport(event.target.value as TransportKind)
            }
          >
            <option value="stdio">stdio</option>
            <option value="http">http</option>
            <option value="sse">sse</option>
          </Select>
        </div>

        {transport === "stdio" ? (
          <div className="flex flex-col gap-1">
            <span className="text-label-sm text-(--tethys-text-muted)">
              Command
            </span>
            <Input
              aria-label="Command"
              placeholder="npx -y @modelcontextprotocol/server-everything"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-label-sm text-(--tethys-text-muted)">
              URL
            </span>
            <Input
              aria-label="URL"
              placeholder="https://example.test/mcp"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
        )}

        <div className="flex flex-col gap-sm">
          <span className="text-label-sm text-(--tethys-text-muted)">
            Environment
          </span>
          {env.map((row, index) => (
            <div
              key={`env-${String(index)}`}
              className="flex items-center gap-2"
            >
              <Input
                aria-label={`Environment name ${String(index + 1)}`}
                placeholder="NAME"
                value={row.key}
                onChange={(event) =>
                  setEnv((prev) =>
                    prev.map((item, at) =>
                      at === index
                        ? { ...item, key: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Input
                aria-label={`Environment value ${String(index + 1)}`}
                placeholder="value"
                value={row.value}
                onChange={(event) =>
                  setEnv((prev) =>
                    prev.map((item, at) =>
                      at === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setEnv((prev) => prev.filter((_, at) => at !== index))
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setEnv((prev) => [...prev, { key: "", value: "" }])}
          >
            Add variable
          </Button>
        </div>

        {error && (
          <p
            role="alert"
            className="text-label-sm text-(--tethys-status-danger)"
          >
            {error}
          </p>
        )}
      </div>
    </ModalDialog>
  );
}
