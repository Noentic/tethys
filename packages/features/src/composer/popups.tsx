//! Composer popup data sources (`CMP-01`, `CMP-02`, `CMP-04`; M1.10 U3).
//!
//! `/` merges Tethys commands (expanded to plaintext via `commands.expand`)
//! with the Provider's own commands, namespaced `/agent:<name>` and headed with
//! the Provider's name. `@` queries `search.files`. `$` reads a candidate list
//! until M1.11 wires the skills surface.

import type {
  AgentCommand,
  AgentCommandControl,
  CommandInfo,
  DiffSource,
  DiffSummary,
  ExpandedCommand,
  SearchItem,
  SkillInfo,
} from "@tethys/bindings";
import type {
  ComposerControl,
  ComposerItem,
  ComposerItemSource,
} from "@tethys/composer";

/** The narrow client slice the popups need; `TethysClient` satisfies it. */
export interface ComposerClient {
  commands: {
    list(workspaceId?: string): Promise<CommandInfo[]>;
    expand(
      command: string,
      argsText?: string,
      workspaceId?: string,
    ): Promise<ExpandedCommand>;
  };
  search: {
    files(
      workspaceId: string,
      query: string,
      limit?: number,
    ): Promise<SearchItem[]>;
  };
  skills?: {
    list(workspaceId: string): Promise<SkillInfo[]>;
  };
  git?: {
    diffSummary(source: DiffSource): Promise<DiffSummary>;
  };
}

const TETHYS_CONTROLS = [
  ["model", "Choose the model and effort", "model"],
  ["permissions", "Change approval settings", "permissions"],
  ["config", "Open thread configuration", "config"],
  ["resume", "Resume a previous thread", "resume"],
  ["clear", "Clear the composer", "clear"],
] as const;

const HANDLED_AGENT_CONTROLS: Record<
  AgentCommandControl,
  { control: ComposerControl; detail: string }
> = {
  model: { control: "model", detail: "Handled by Tethys → Model menu" },
  permissions: {
    control: "permissions",
    detail: "Handled by Tethys → Approvals",
  },
  config: {
    control: "config",
    detail: "Handled by Tethys → Thread configuration",
  },
  resume: { control: "resume", detail: "Handled by Tethys → Resume" },
  clear: { control: "clear", detail: "Handled by Tethys → Clear composer" },
};

function matches(query: string, ...fields: string[]): boolean {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(needle));
}

const commandCache = new Map<string, Promise<ComposerItem[]>>();
const skillCache = new Map<string, Promise<SkillInfo[]>>();

async function expandCommands(
  client: ComposerClient,
  workspaceId: string | undefined,
): Promise<ComposerItem[]> {
  let commands: CommandInfo[];
  try {
    commands = await client.commands.list(workspaceId);
  } catch {
    return [];
  }
  return Promise.all(
    commands.map(async (command) => {
      let token = `/${command.name}`;
      try {
        const expanded = await client.commands.expand(
          command.name,
          "",
          workspaceId,
        );
        token = expanded.text;
      } catch {
        // A command that cannot expand still inserts as its literal token.
      }
      return {
        id: `command:${command.name}`,
        group: "Your commands",
        label: `/${command.name}`,
        keywords: [command.name, command.scope],
        chip: { kind: "command", name: command.name, token },
      } satisfies ComposerItem;
    }),
  );
}

function loadCommands(
  client: ComposerClient,
  workspaceId: string | undefined,
): Promise<ComposerItem[]> {
  const key = workspaceId ?? "";
  const cached = commandCache.get(key);
  if (cached) return cached;
  const pending = expandCommands(client, workspaceId);
  commandCache.set(key, pending);
  return pending;
}

/** Clears the per-workspace command cache (tests / workspace switch). */
export function resetComposerCaches(): void {
  commandCache.clear();
  skillCache.clear();
}

/** The Provider's advertised commands as `/agent:<name>` items. */
export function agentCommandItems(
  commands: AgentCommand[],
  providerName: string,
  reservedNames: ReadonlySet<string> = new Set(),
): ComposerItem[] {
  const counts = new Map<string, number>();
  for (const command of commands) {
    counts.set(command.name, (counts.get(command.name) ?? 0) + 1);
  }
  return commands.map((command) => {
    const handled = command.tethys_control
      ? HANDLED_AGENT_CONTROLS[command.tethys_control]
      : undefined;
    const label = handled
      ? `/${command.name}`
      : reservedNames.has(command.name) || (counts.get(command.name) ?? 0) > 1
        ? `/agent:${command.name}`
        : `/${command.name}`;
    return {
      id: `agent:${command.name}`,
      group: `✦ ${providerName}`,
      label,
      detail:
        handled?.detail ?? command.input ?? command.description ?? undefined,
      keywords: [command.name],
      control: handled?.control,
      chip: {
        kind: "agent-command",
        name: command.name,
        token: label,
      },
    };
  });
}

/**
 * `/` source: Tethys commands plus — on a live thread only — the Provider's
 * own commands under a Provider-named group.
 */
export function commandSource(
  client: ComposerClient,
  workspaceId: string | undefined,
  agentCommands: AgentCommand[] = [],
  providerName = "Agent",
): ComposerItemSource {
  return async (query) => {
    const [commands] = await Promise.all([loadCommands(client, workspaceId)]);
    const reservedNames = new Set([
      ...commands.map((command) => command.chip.name),
      ...TETHYS_CONTROLS.map(([name]) => name),
    ]);
    const controls: ComposerItem[] = TETHYS_CONTROLS.map(
      ([name, reason, control]) => ({
        id: `tethys:${name}`,
        group: "Tethys",
        label: `/${name}`,
        detail: reason,
        keywords: [name],
        control,
        chip: { kind: "command", name, token: `/${name}` },
      }),
    );
    const agents = agentCommandItems(
      agentCommands,
      providerName,
      reservedNames,
    );
    const userCommands = commands.map((command) => ({
      ...command,
      group: "Your commands",
    }));
    return [...controls, ...agents, ...userCommands].filter((item) =>
      matches(query, item.label, ...(item.keywords ?? [])),
    );
  };
}

function loadSkills(
  client: ComposerClient,
  workspaceId: string | undefined,
): Promise<SkillInfo[]> {
  if (!workspaceId || !client.skills) return Promise.resolve([]);
  const cached = skillCache.get(workspaceId);
  if (cached) return cached;
  const pending = client.skills.list(workspaceId).catch(() => {
    skillCache.delete(workspaceId);
    return [];
  });
  skillCache.set(workspaceId, pending);
  return pending;
}

/** `$` source: enabled, trusted skills from the workspace catalog. */
export function skillSource(
  client: ComposerClient,
  workspaceId: string | undefined,
): ComposerItemSource {
  return async (query) =>
    (await loadSkills(client, workspaceId))
      .filter(
        (skill) => skill.enabled && (!skill.requires_trust || skill.trusted),
      )
      .filter((candidate) => matches(query, candidate.name))
      .map((skill) => ({
        id: `skill:${skill.scope}:${skill.name}`,
        group: "Skills",
        label: `$${skill.name}`,
        keywords: [skill.name],
        chip: {
          kind: "skill",
          name: skill.name,
          token: `$${skill.name}`,
          path: skill.path,
          injectionMethod: "referenced",
        },
      }));
}

/** `@` source: `search.files`; chips reference the path, never contents. */
export function pathSource(
  client: ComposerClient,
  workspaceId: string | undefined,
): ComposerItemSource {
  return async (query) => {
    if (!workspaceId) return [];
    try {
      const results = await client.search.files(workspaceId, query, 20);
      return results.map((item) => ({
        id: `path:${item.relative_path}`,
        label: `@${item.relative_path}`,
        detail: item.is_dir ? "folder" : undefined,
        keywords: [item.relative_path],
        chip: {
          kind: "path",
          name: item.relative_path,
          token: `@${item.relative_path}`,
          path: item.relative_path,
          isDir: item.is_dir,
        },
      }));
    } catch {
      return [];
    }
  };
}
