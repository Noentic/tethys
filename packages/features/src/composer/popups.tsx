//! Composer popup data sources (`CMP-01`, `CMP-02`, `CMP-04`; M1.10 U3).
//!
//! `/` merges Tethys commands (expanded to plaintext via `commands.expand`)
//! with the Provider's own commands, namespaced `/agent:<name>` and headed with
//! the Provider's name. `@` queries `search.files`. `$` reads a candidate list
//! until M1.11 wires the skills surface.

import type {
  AgentCommand,
  CommandInfo,
  ExpandedCommand,
  SearchItem,
} from "@tethys/bindings";
import type { ComposerItem, ComposerItemSource } from "@tethys/composer";

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
}

/** One candidate skill name (M1.11 replaces this fixture). */
export interface SkillCandidate {
  name: string;
  path: string;
}

export const skillCandidates: SkillCandidate[] = [
  { name: "commit", path: "~/.tethys/skills/commit" },
  { name: "review", path: "~/.tethys/skills/review" },
  { name: "release-notes", path: "~/.tethys/skills/release-notes" },
];

function matches(query: string, ...fields: string[]): boolean {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(needle));
}

const commandCache = new Map<string, Promise<ComposerItem[]>>();

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
        group: "Tethys commands",
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
}

/** The Provider's advertised commands as `/agent:<name>` items. */
export function agentCommandItems(
  commands: AgentCommand[],
  providerName: string,
): ComposerItem[] {
  return commands.map((command) => ({
    id: `agent:${command.name}`,
    group: `${providerName} commands`,
    label: `/agent:${command.name}`,
    detail: command.description ?? undefined,
    keywords: [command.name],
    chip: {
      kind: "agent-command",
      name: command.name,
      token: `/agent:${command.name}`,
    },
  }));
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
    const agents = agentCommandItems(agentCommands, providerName);
    return [...commands, ...agents].filter((item) =>
      matches(query, item.label, ...(item.keywords ?? [])),
    );
  };
}

/** `$` source: candidate skills; chips reference, never inline (CMP-03). */
export function skillSource(
  candidates: SkillCandidate[] = skillCandidates,
): ComposerItemSource {
  return (query) =>
    candidates
      .filter((candidate) => matches(query, candidate.name))
      .map((candidate) => ({
        id: `skill:${candidate.name}`,
        label: `$${candidate.name}`,
        keywords: [candidate.name],
        chip: {
          kind: "skill",
          name: candidate.name,
          token: `$${candidate.name}`,
          path: candidate.path,
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
