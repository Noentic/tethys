//! The five known providers, in product order (pen `z23yYi`).
//!
//! This catalog, not the remote ACP registry, decides the Providers page's list
//! and its order: the registry is fetched from the network and only carries the
//! entries that happen to publish there. The catalog also carries what the
//! registry cannot — the support status (`soon` for an integration that ships
//! later) and the setup steps the not-detected state renders.
//!
//! A `soon` entry is inert: it renders the `Soon` chip and no toggle, and it is
//! never matched against profiles, so a stray profile cannot make it look
//! connectable.

import antigravityIcon from "./provider-icons/antigravity.svg";
import claudeIcon from "./provider-icons/claude.svg";
import codexIcon from "./provider-icons/codex.svg";
import kiroIcon from "./provider-icons/kiro.svg";
import opencodeIcon from "./provider-icons/opencode.svg";

export interface ProviderSetupStep {
  label: string;
  command: string;
}

export interface ProviderCatalogEntry {
  id: string;
  /** ACP Registry identity; launch command names are not provider identity. */
  registryId: string;
  name: string;
  /** Asset URL rendered in an `<img>`; the repo has no svgr plugin. */
  icon: string;
  support: "ready" | "soon";
  setup: ProviderSetupStep[];
  setupNote?: string;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "claude-code",
    registryId: "claude-acp",
    name: "Claude Code",
    icon: claudeIcon,
    support: "ready",
    setup: [
      { label: "Install the ACP adapter", command: "Tethys ACP Registry" },
    ],
    setupNote:
      "The Claude CLI alone is not an ACP server. Tethys installs the separate Claude ACP adapter; a global Claude CLI install is not required for this path.",
  },
  {
    id: "codex",
    registryId: "codex-acp",
    name: "Codex",
    icon: codexIcon,
    support: "ready",
    setup: [
      { label: "Install the ACP adapter", command: "Tethys ACP Registry" },
    ],
    setupNote:
      "An installed codex CLI is not itself an ACP server. Tethys can reuse codex-acp from PATH; otherwise the adapter package is required and includes its own @openai/codex dependency, which may install a second runtime copy. Tethys does not install @openai/codex globally.",
  },
  {
    id: "opencode",
    registryId: "opencode",
    name: "OpenCode",
    icon: opencodeIcon,
    support: "ready",
    setup: [
      {
        label: "Install OpenCode or use the existing CLI",
        command: "opencode acp",
      },
    ],
    setupNote:
      "OpenCode exposes ACP through its own CLI. Tethys can launch an installed OpenCode binary with the `acp` command.",
  },
  {
    id: "antigravity",
    registryId: "antigravity-acp",
    name: "Antigravity",
    icon: antigravityIcon,
    support: "soon",
    setup: [],
  },
  {
    id: "kiro",
    registryId: "kiro",
    name: "kiro",
    icon: kiroIcon,
    support: "soon",
    setup: [],
  },
];

/**
 * The catalog entry for a provider id, or undefined for a provider the catalog
 * doesn't know (a registry-only profile). Live profiles carry the registry id
 * (`claude-acp`), fixtures carry the catalog id (`claude-code`); both resolve.
 */
export function providerEntry(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find(
    (entry) => entry.id === id || entry.registryId === id,
  );
}

/** The catalog icon for a provider id; see `providerEntry`. */
export function providerIcon(id: string): string | undefined {
  return providerEntry(id)?.icon;
}

/** The catalog entry that owns a profile, or null for an unrecognised profile. */
export function catalogEntryForProfile<
  T extends {
    registry_ref: { id: string } | null;
    integration_id?: string | null;
  },
>(catalog: ProviderCatalogEntry[], profile: T): ProviderCatalogEntry | null {
  return (
    catalog.find(
      (entry) =>
        entry.support === "ready" &&
        entry.registryId ===
          (profile.integration_id ?? profile.registry_ref?.id),
    ) ?? null
  );
}
