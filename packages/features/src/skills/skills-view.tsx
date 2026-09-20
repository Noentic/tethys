//! Settings / Skills page (spec §5.3; SYN-06, SYN-07). `Yours` is the real
//! library from `skills.list`; `Discover` is an honest empty state (no MVP
//! remote catalog). Trust is content-bound and persisted; the YOLO exclusion is
//! displayed, not enforced here.

import type {
  SkillInfo,
  SkillUpdateCheck,
  SkillUpdatePlan,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import { type SkillsClient, useMcpWorkspaceScope } from "@tethys/state";
import {
  Badge,
  Button,
  EmptyState,
  ModalDialog,
  PageHeader,
  SegmentedControl,
  UnderlineTabs,
} from "@tethys/ui";
import { useCallback, useEffect, useState } from "react";
import { SkillImportWizard } from "./skill-import-wizard";
import { SkillRow } from "./skill-row";

const defaultClient = createClient();

const skillKey = (skill: SkillInfo) => `${skill.scope}:${skill.name}`;

export interface SkillsViewProps {
  client?: SkillsClient;
  workspaceId?: string;
  className?: string;
}

export function SkillsView({
  client = defaultClient,
  workspaceId: workspaceIdProp,
  className,
}: SkillsViewProps) {
  const scope = useMcpWorkspaceScope();
  const workspaceId = workspaceIdProp ?? scope.workspaceId;
  const [category, setCategory] = useState<"skills" | "connectors" | "plugins">(
    "skills",
  );
  const [segment, setSegment] = useState<"yours" | "discover">("yours");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, SkillUpdateCheck>>({});
  const [plans, setPlans] = useState<Record<string, SkillUpdatePlan>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSkills(await client.skills.list(workspaceId));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [client, workspaceId]);

  useEffect(() => {
    if (segment === "yours") void load();
  }, [load, segment]);

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

  const previewSkill = skills.find((skill) => skillKey(skill) === previewKey);
  const previewPlan = previewKey ? plans[previewKey] : undefined;

  return (
    <div className={className ?? "flex flex-col gap-xl"}>
      <PageHeader
        title="Skills & Commands"
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setImportOpen(true)}
          >
            Add
          </Button>
        }
      />

      <div className="flex items-center justify-between gap-lg border-b border-(--tethys-hairline) pb-md">
        <div className="flex items-center gap-xl">
          <UnderlineTabs
            label="Catalog"
            value={category}
            onChange={setCategory}
            tabs={[
              { value: "skills", label: "Skills" },
              { value: "connectors", label: "Connectors" },
              { value: "plugins", label: "Plugins" },
            ]}
          />
          <SegmentedControl
            size="sm"
            value={segment}
            onChange={setSegment}
            options={[
              { value: "yours", label: "Yours" },
              { value: "discover", label: "Discover" },
            ]}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-body-sm text-(--tethys-status-danger)">
          {error}
        </p>
      )}

      {segment === "discover" ? (
        <EmptyState
          title="No remote catalog in this release"
          description="Discover fetches a hosted catalog; it arrives in a later release."
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
      ) : (
        <div className="flex flex-col rounded-md border border-(--tethys-hairline)">
          {skills.map((skill) => (
            <SkillRow
              key={skillKey(skill)}
              skill={skill}
              updateCheck={checks[skillKey(skill)] ?? null}
              onToggleEnabled={(enabled) => void toggleEnabled(skill, enabled)}
              onToggleTrust={() => void toggleTrust(skill)}
              onCheckUpdates={() => void checkUpdates(skill)}
              onPreviewUpdate={() => void previewUpdate(skill)}
              onApplyUpdate={() => void applyUpdate(skill)}
            />
          ))}
        </div>
      )}

      <p className="text-label-sm text-(--tethys-text-muted)">
        Untrusted script skills are excluded from YOLO threads.
      </p>

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
                <Badge key={file} variant="muted" size="sm">
                  {file}
                </Badge>
              ))}
            </div>
            <pre
              data-testid="skill-update-diff"
              className="max-h-72 overflow-auto rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-sunken) p-md font-mono text-mono-micro text-(--tethys-text-secondary)"
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
