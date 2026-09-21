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
  name: string;
  /** Asset URL rendered in an `<img>`; the repo has no svgr plugin. */
  icon: string;
  support: "ready" | "soon";
  /** Substrings that identify this provider in a profile's launch spec. */
  aliases: string[];
  setup: ProviderSetupStep[];
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    icon: claudeIcon,
    support: "ready",
    aliases: ["claude"],
    setup: [
      {
        label: "Install the CLI",
        command: "npm install -g @anthropic-ai/claude-code",
      },
      { label: "Sign in once", command: "claude" },
    ],
  },
  {
    id: "opencode",
    name: "opencode",
    icon: opencodeIcon,
    support: "ready",
    aliases: ["opencode"],
    setup: [
      { label: "Install the CLI", command: "npm i -g opencode-ai" },
      { label: "Sign in once", command: "opencode auth login" },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    icon: codexIcon,
    support: "ready",
    aliases: ["codex"],
    setup: [
      { label: "Install the CLI", command: "npm install -g @openai/codex" },
      { label: "Sign in once", command: "codex login" },
    ],
  },
  {
    id: "antigravity",
    name: "Antigravity",
    icon: antigravityIcon,
    support: "soon",
    aliases: ["antigravity", "agy"],
    setup: [],
  },
  {
    id: "kiro",
    name: "kiro",
    icon: kiroIcon,
    support: "soon",
    aliases: ["kiro"],
    setup: [],
  },
];

/** The catalog entry that owns a profile, or null for an unrecognised profile. */
export function catalogEntryForProfile<
  T extends { launch_spec: { program: string; args?: string[] } },
>(catalog: ProviderCatalogEntry[], profile: T): ProviderCatalogEntry | null {
  const haystack =
    `${profile.launch_spec.program} ${(profile.launch_spec.args ?? []).join(" ")}`.toLowerCase();
  return (
    catalog.find(
      (entry) =>
        entry.support === "ready" &&
        entry.aliases.some((alias) => haystack.includes(alias)),
    ) ?? null
  );
}
