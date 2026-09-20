//! Launch-spec editor (spec §5.2): executable, args, cwd, protocol and env.
//!
//! A plain fielded form reusing `schema-field-group` — **not** a schema-driven
//! form engine (D5 answer). Saving fires the executable-path health trigger.

import type {
  AcpProtocol,
  AgentProfileView,
  LaunchSpecInput,
} from "@tethys/bindings";
import { Button, Input, SchemaFieldGroup, Select } from "@tethys/ui";
import { useState } from "react";

export interface LaunchSpecEditorProps {
  profile: AgentProfileView;
  onSave?: (
    input: LaunchSpecInput,
    preferredProtocol: AcpProtocol | null,
  ) => void;
  className?: string;
}

export function LaunchSpecEditor({
  profile,
  onSave,
  className,
}: LaunchSpecEditorProps): React.ReactElement {
  const [program, setProgram] = useState(profile.launch_spec.program);
  const [args, setArgs] = useState((profile.launch_spec.args ?? []).join(" "));
  const [cwd, setCwd] = useState(profile.launch_spec.cwd ?? "");
  const [protocol, setProtocol] = useState<AcpProtocol | "">(
    profile.preferred_protocol ?? "",
  );
  const [env, setEnv] = useState(profile.launch_spec.env ?? []);

  return (
    <div className={className} data-testid="launch-spec-editor">
      <SchemaFieldGroup label="Launch spec">
        <label
          className="block text-label-md text-(--tethys-text-secondary)"
          htmlFor={`exec-${profile.id}`}
        >
          Executable
        </label>
        <Input
          id={`exec-${profile.id}`}
          className="mt-1 font-mono text-mono-code"
          value={program}
          onChange={(event) => setProgram(event.target.value)}
        />

        <label
          className="mt-3 block text-label-md text-(--tethys-text-secondary)"
          htmlFor={`args-${profile.id}`}
        >
          Arguments
        </label>
        <Input
          id={`args-${profile.id}`}
          className="mt-1 font-mono text-mono-code"
          placeholder="acp --flag"
          value={args}
          onChange={(event) => setArgs(event.target.value)}
        />

        <label
          className="mt-3 block text-label-md text-(--tethys-text-secondary)"
          htmlFor={`cwd-${profile.id}`}
        >
          Working directory
        </label>
        <Input
          id={`cwd-${profile.id}`}
          className="mt-1 font-mono text-mono-code"
          placeholder="Resolved at session start"
          value={cwd}
          onChange={(event) => setCwd(event.target.value)}
        />

        <label
          className="mt-3 block text-label-md text-(--tethys-text-secondary)"
          htmlFor={`protocol-${profile.id}`}
        >
          Protocol
        </label>
        <Select
          id={`protocol-${profile.id}`}
          className="mt-1"
          value={protocol}
          onChange={(event) =>
            setProtocol(event.target.value as AcpProtocol | "")
          }
        >
          <option value="">Probe automatically</option>
          <option value="V2">ACP v2</option>
          <option value="V1">ACP v1</option>
        </Select>
      </SchemaFieldGroup>

      <SchemaFieldGroup label="Environment">
        {env.map((entry, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
          <div key={index} className="flex items-center gap-2 py-1">
            <Input
              aria-label="Environment variable name"
              value={entry.key}
              onChange={(event) => {
                const key = event.target.value;
                setEnv((rows) =>
                  rows.map((row, i) => (i === index ? { ...row, key } : row)),
                );
              }}
            />
            <Input
              aria-label="Environment variable value"
              className="font-mono text-mono-code"
              value={entry.value}
              onChange={(event) => {
                const value = event.target.value;
                setEnv((rows) =>
                  rows.map((row, i) => (i === index ? { ...row, value } : row)),
                );
              }}
            />
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEnv((rows) => [...rows, { key: "", value: "" }])}
        >
          Add variable
        </Button>
      </SchemaFieldGroup>

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            onSave?.(
              {
                program,
                args: args.split(/\s+/).filter(Boolean),
                cwd: cwd.trim() ? cwd.trim() : null,
                env,
              },
              protocol === "" ? null : protocol,
            )
          }
        >
          Save launch spec
        </Button>
      </div>
    </div>
  );
}
