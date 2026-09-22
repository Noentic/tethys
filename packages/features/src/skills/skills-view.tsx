//! Settings / Skills & Commands (pen `aKhyM` skills, `VEtJR` commands, `SFcXO`
//! aside). One page, two kinds: a Skill library from `skills.list` (SYN-06,
//! SYN-07) and the Tethys commands from `commands.list`. Trust is content-bound
//! and persisted; the YOLO exclusion is displayed, not enforced here.
//!
//! The pen's kind switch is Skills | Commands and its scope switch is what a new
//! addition is created under, so the list keeps both scopes visible, grouped.

import type {
  CommandScope,
  SkillInfo,
  SkillUpdateCheck,
  SkillUpdatePlan,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import {
  type CommandsClient,
  type SkillsClient,
  useMcpWorkspaceScope,
} from "@tethys/state";
import {
  Button,
  EmptyState,
  Input,
  ModalDialog,
  PageHeader,
  SegmentedControl,
} from "@tethys/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandsPane } from "./commands-pane";
import { SkillDetail } from "./skill-detail";
import { SkillImportWizard } from "./skill-import-wizard";
import { SkillRow } from "./skill-row";

const defaultClient = createClient();

const skillKey = (skill: SkillInfo) => `${skill.scope}:${skill.name}`;

export interface SkillsViewProps {
  client?: SkillsClient;
  /** Commands half of the page; defaults to the real client. */
  commandsClient?: CommandsClient;
  workspaceId?: string;
  /** Workspace name for the group labels; falls back to the scope store. */
  workspaceName?: string;
  className?: string;
}

type Kind = "skills" | "commands";

export function SkillsView({
  client = defaultClient,
  commandsClient,
  workspaceId: workspaceIdProp,
  workspaceName: workspaceNameProp,
  className,
}: SkillsViewProps) {
  const scope = useMcpWorkspaceScope();
  const workspaceId = workspaceIdProp ?? scope.workspaceId;
  const workspaceName =
    workspaceNameProp ??
    scope.workspaces.find((workspace) => workspace.id === workspaceId)?.name;

  const [kind, setKind] = useState<Kind>("skills");
  const [addScope, setAddScope] = useState<CommandScope>("workspace");
  const [search, setSearch] = useState("");
  const [addSignal, setAddSignal] = useState(0);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, SkillUpdateCheck>>({});
  const [plans, setPlans] = useState<Record<string, SkillUpdatePlan>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Skills belong to a workspace; without one there is nothing to ask for and
    // an empty id would come back as `workspace not found:`.
    if (workspaceId === "") {
      setSkills([]);
      return;
    }
    try {
      setSkills(await client.skills.list(workspaceId));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [client, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (updated: SkillInfo) => {
    setSkills((prev) =>
      prev.map((skill) =>
        skillKey(skill) === skillKey(updated) ? updated : skill,
      ),
    );
  };

  const guard = async (action: () => Promise<void>) => {
    try {
      setError(null);
      await action();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const toggleEnabled = (skill: SkillInfo, enabled: boolean) =>
    guard(async () => {
      replace(
        await client.skills.enable(
          workspaceId,
          skill.scope,
          skill.name,
          enabled,
        ),
      );
    });

  const toggleTrust = (skill: SkillInfo) =>
    guard(async () => {
      replace(await client.skills.trust(workspaceId, skill.scope, skill.name));
    });

  const checkUpdates = (skill: SkillInfo) =>
    guard(async () => {
      const check = await client.skills.update_check(
        workspaceId,
        skill.scope,
        skill.name,
      );
      setChecks((prev) => ({ ...prev, [skillKey(skill)]: check }));
    });

  const previewUpdate = (skill: SkillInfo) =>
    guard(async () => {
      const plan = await client.skills.update_plan(
        workspaceId,
        skill.scope,
        skill.name,
      );
      setPlans((prev) => ({ ...prev, [skillKey(skill)]: plan }));
      setPreviewKey(skillKey(skill));
    });

  const applyUpdate = (skill: SkillInfo) =>
    guard(async () => {
      const applied = await client.skills.update_apply(
        workspaceId,
        skill.scope,
        skill.name,
      );
      replace({
        ...skill,
        trusted: false,
        pinned_sha: applied.pinned_sha,
        content_hash: applied.content_hash,
      });
      setChecks((prev) => {
        const next = { ...prev };
        delete next[skillKey(skill)];
        return next;
      });
      setPreviewKey(null);
    });

  const query = search.trim().toLowerCase();
  const visibleSkills = useMemo(
    () =>
      skills.filter(
        (skill) =>
          query === "" ||
          skill.name.toLowerCase().includes(query) ||
          (skill.source.repo ?? skill.source.origin)
            .toLowerCase()
            .includes(query),
      ),
    [skills, query],
  );
  const groups = [
    { scope: "global" as const, label: "Global" },
    {
      scope: "workspace" as const,
      label: `Workspace${workspaceName ? ` · ${workspaceName}` : ""}`,
    },
  ];

  const selectedSkill =
    skills.find((skill) => skillKey(skill) === selected) ?? null;
  const previewSkill = skills.find((skill) => skillKey(skill) === previewKey);
  const previewPlan = previewKey ? plans[previewKey] : undefined;

  return (
    <div className={className ?? "flex flex-col gap-xl"}>
      <PageHeader
        breadcrumb="Settings / Skills & Commands"
        title="Skills & commands"
      />

      <div className="flex h-8 items-center gap-md">
        <SegmentedControl
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: "skills", label: "Skills" },
            { value: "commands", label: "Commands" },
          ]}
        />
        <SegmentedControl
          size="sm"
          value={addScope}
          onChange={setAddScope}
          options={[
            { value: "global", label: "Global" },
            { value: "workspace", label: "Workspace" },
          ]}
        />
        <div className="w-[260px] shrink-0">
          <Input
            type="text"
            aria-label="Search skills"
            placeholder={
              kind === "skills" ? "Search skills" : "Search commands"
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leadingIcon={<SearchGlyph />}
          />
        </div>
        <Button
          size="sm"
          variant="primary"
          className="ml-auto"
          disabled={kind === "skills" && workspaceId === ""}
          title={
            kind === "skills" && workspaceId === ""
              ? "Trust a folder before importing a skill"
              : undefined
          }
          onClick={() =>
            kind === "skills"
              ? setImportOpen(true)
              : setAddSignal((count) => count + 1)
          }
        >
          Add
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-body-sm text-(--tethys-status-danger)">
          {error}
        </p>
      )}

      {kind === "commands" ? (
        <div className="h-[802px]">
          <CommandsPane
            {...(commandsClient ? { client: commandsClient } : {})}
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            addScope={addScope}
            addSignal={addSignal}
            search={search}
          />
        </div>
      ) : (
        <div className="flex h-[802px] gap-2xl">
          <div
            data-testid="skill-list"
            className="flex w-[704px] shrink-0 flex-col overflow-auto"
          >
            {workspaceId === "" ? (
              <EmptyState
                title="No workspace yet"
                description="Trust a folder and the skills it ships appear here."
              />
            ) : skills.length === 0 ? (
              <EmptyState
                title="No skills yet"
                description="Import a folder, a .skill archive, or a pinned GitHub repo."
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setImportOpen(true)}
                  >
                    Add skill
                  </Button>
                }
              />
            ) : visibleSkills.length === 0 ? (
              <p className="px-3 py-3 text-body-sm text-(--tethys-text-muted)">
                No skills match that search.
              </p>
            ) : (
              groups.map((group) => {
                const rows = visibleSkills.filter(
                  (skill) => skill.scope === group.scope,
                );
                if (rows.length === 0) return null;
                return (
                  <div key={group.scope}>
                    <div
                      data-testid={`skill-group-${group.scope}`}
                      className="flex h-[26px] items-center px-3 text-label-sm text-(--tethys-text-muted)"
                    >
                      {group.label}
                    </div>
                    {rows.map((skill) => (
                      <SkillRow
                        key={skillKey(skill)}
                        skill={skill}
                        selected={selected === skillKey(skill)}
                        onSelect={() => setSelected(skillKey(skill))}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>

          <div className="w-[360px] shrink-0">
            <SkillDetail
              skill={selectedSkill}
              updateCheck={
                selectedSkill ? (checks[skillKey(selectedSkill)] ?? null) : null
              }
              onToggleEnabled={(enabled) =>
                selectedSkill && void toggleEnabled(selectedSkill, enabled)
              }
              onToggleTrust={() =>
                selectedSkill && void toggleTrust(selectedSkill)
              }
              onCheckUpdates={() =>
                selectedSkill && void checkUpdates(selectedSkill)
              }
              onPreviewUpdate={() =>
                selectedSkill && void previewUpdate(selectedSkill)
              }
            />
          </div>
        </div>
      )}

      <ModalDialog
        open={previewSkill !== undefined && previewPlan !== undefined}
        onClose={() => setPreviewKey(null)}
        title="Skill update preview"
        description={previewSkill?.name}
        maxWidth="max-w-[640px]"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPreviewKey(null)}
              className="focus-ring text-label-md text-(--tethys-text-secondary) hover:text-(--tethys-text-primary)"
            >
              Cancel
            </button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => previewSkill && void applyUpdate(previewSkill)}
            >
              Apply update
            </Button>
          </>
        }
      >
        {previewPlan && (
          <div className="flex flex-col gap-md">
            <div className="flex flex-wrap gap-1">
              {previewPlan.changed_files.map((file) => (
                <span
                  key={file}
                  className="rounded-xs bg-(--tethys-surface-hover) px-1.5 py-0.5 font-mono text-mono-micro text-(--tethys-text-muted)"
                >
                  {file}
                </span>
              ))}
            </div>
            <pre
              data-testid="skill-update-diff"
              className="max-h-72 overflow-auto rounded-sm border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) p-md font-mono text-mono-micro text-(--tethys-text-on-sunken-secondary)"
            >
              {previewPlan.diff}
            </pre>
            <p className="text-label-sm text-(--tethys-text-muted)">
              Applying an update clears trust until the new revision is
              reviewed.
            </p>
          </div>
        )}
      </ModalDialog>

      <SkillImportWizard
        open={importOpen}
        client={client}
        workspaceId={workspaceId}
        onClose={() => setImportOpen(false)}
        onImported={() => void load()}
      />
    </div>
  );
}

const SearchGlyph = () => (
  <span aria-hidden="true" className="text-(--tethys-text-muted)">
    ⌕
  </span>
);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
