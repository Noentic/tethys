//! Skill import wizard (spec §5.3; SYN-06). Three sources map to
//! `SkillImportSource`: a folder, a `.skill`/zip archive, or a pinned GitHub
//! tarball. The GitHub field takes a repo/URL spec, not a browse.

import type { Scope, SkillImportSource, SkillInfo } from "@tethys/bindings";
import type { SkillsClient } from "@tethys/state";
import { Button, Input, ModalDialog, Select } from "@tethys/ui";
import { useState } from "react";

type SourceKind = "folder" | "archive" | "git-hub";

const SOURCE_LABEL: Record<SourceKind, string> = {
  folder: "Folder",
  archive: ".skill archive",
  "git-hub": "GitHub",
};

export interface SkillImportWizardProps {
  open: boolean;
  client: SkillsClient;
  workspaceId: string;
  onClose: () => void;
  onImported?: (skill: SkillInfo) => void;
}

export function SkillImportWizard({
  open,
  client,
  workspaceId,
  onClose,
  onImported,
}: SkillImportWizardProps) {
  const [kind, setKind] = useState<SourceKind>("folder");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<Scope>("workspace");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const source = sourceFor(kind, value);
      const skill = await client.skills.import(workspaceId, scope, source);
      onImported?.(skill);
      onClose();
      setValue("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Import skill"
      description="Add a skill to the workspace or global canonical home."
      footer={
        <>
          <Select
            aria-label="Import scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
          >
            <option value="workspace">Workspace</option>
            <option value="global">Global</option>
          </Select>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring text-label-md text-(--tethys-text-secondary) hover:text-(--tethys-text-primary)"
          >
            Cancel
          </button>
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            disabled={value.trim().length === 0}
            onClick={() => void submit()}
          >
            Import
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex items-center gap-sm">
          {(Object.keys(SOURCE_LABEL) as SourceKind[]).map((sourceKind) => (
            <Button
              key={sourceKind}
              size="sm"
              variant={sourceKind === kind ? "secondary" : "ghost"}
              onClick={() => {
                setKind(sourceKind);
                setValue("");
                setError(null);
              }}
            >
              {SOURCE_LABEL[sourceKind]}
            </Button>
          ))}
        </div>

        <Input
          aria-label="Import source"
          placeholder={placeholderFor(kind)}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />

        {kind === "git-hub" && (
          <p className="text-label-sm text-(--tethys-text-muted)">
            Downloads a pinned GitHub release as a tarball — not a browse and
            not a forge integration. Accepts `owner/repo[/subdir]@ref` or a full
            GitHub URL.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="text-body-sm text-(--tethys-status-danger)"
          >
            {error}
          </p>
        )}
      </div>
    </ModalDialog>
  );
}

function sourceFor(kind: SourceKind, value: string): SkillImportSource {
  if (kind === "folder") return { kind: "folder", path: value };
  if (kind === "archive") return { kind: "archive", path: value };
  return { kind: "git-hub", spec: value };
}

function placeholderFor(kind: SourceKind): string {
  if (kind === "folder") return "/path/to/skill-folder";
  if (kind === "archive") return "/path/to/skill.skill";
  return "owner/repo@v1 or https://github.com/owner/repo";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
