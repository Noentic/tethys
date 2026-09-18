import {
  Check,
  ChevronDown,
  FolderClosed,
  GitBranch,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
} from "@nebutra/icons";
import { Badge, Button, Popover, ToggleSwitch } from "@tethys/ui";
import { useState } from "react";

interface SkillItem {
  id: string;
  name: string;
  category: string;
  author: string;
  origin: "workspace" | "global";
  description: string;
  synced: boolean;
  trusted: boolean;
}

const INITIAL_SKILLS: SkillItem[] = [
  {
    id: "find-docs",
    name: "find-docs",
    category: "Documentation",
    author: "local .agents/skills",
    origin: "workspace",
    description:
      "Real-time documentation lookup via ctx7 / Context7 for libraries, SDKs, and CLI tools.",
    synced: true,
    trusted: true,
  },
  {
    id: "audit-code",
    name: "audit-code",
    category: "Code Review",
    author: "local .agents/skills",
    origin: "workspace",
    description:
      "Whole-codebase audit for complexity, security vulnerabilities, and over-engineering.",
    synced: true,
    trusted: true,
  },
  {
    id: "rust-best-practices",
    name: "rust-best-practices",
    category: "Rust",
    author: "local .agents/skills",
    origin: "workspace",
    description:
      "Idiomatic Rust guidelines, zero-cost abstractions, borrow checker rules, and Result handling.",
    synced: true,
    trusted: true,
  },
  {
    id: "tauri-v2",
    name: "tauri-v2",
    category: "Desktop",
    author: "local .agents/skills",
    origin: "workspace",
    description:
      "Tauri v2 cross-platform commands, Specta codegen bindings, capabilities, and IPC.",
    synced: true,
    trusted: true,
  },
  {
    id: "ponytail",
    name: "ponytail",
    category: "Architecture",
    author: "global config/plugins",
    origin: "global",
    description:
      "Minimalist pragmatic implementation engine channeling senior dev YAGNI.",
    synced: true,
    trusted: false,
  },
];

export function SettingsSkillsView() {
  const [activeTab, setActiveTab] = useState<
    "skills" | "connectors" | "plugins"
  >("skills");
  const [scopeFilter, setScopeFilter] = useState<"yours" | "discover">("yours");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [addMenuOpen, setAddMenuOpen] = useState<boolean>(false);
  const [skills, setSkills] = useState<SkillItem[]>(INITIAL_SKILLS);

  const toggleTrust = (id: string, trusted: boolean) => {
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, trusted } : s)));
  };

  const filteredSkills = skills.filter((s) => {
    if (scopeFilter === "yours" && s.origin !== "workspace") return false;
    if (
      searchQuery &&
      !s.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !s.category.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <h1 className="text-2xl font-bold tracking-tight text-(--tethys-text-primary)">
        Skills & Commands
      </h1>

      {/* Tabs and Toolbar Row (§5.3) */}
      <div className="flex items-center justify-between border-b border-(--tethys-hairline) pb-3">
        <div className="flex items-center gap-6">
          <div className="flex gap-4 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("skills")}
              className={`pb-1 transition-colors ${
                activeTab === "skills"
                  ? "border-b-2 border-(--tethys-accent-focus) text-(--tethys-text-primary) font-semibold"
                  : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
              }`}
            >
              Skills
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("connectors")}
              className={`pb-1 transition-colors ${
                activeTab === "connectors"
                  ? "border-b-2 border-(--tethys-accent-focus) text-(--tethys-text-primary) font-semibold"
                  : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
              }`}
            >
              Connectors
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("plugins")}
              className={`pb-1 transition-colors ${
                activeTab === "plugins"
                  ? "border-b-2 border-(--tethys-accent-focus) text-(--tethys-text-primary) font-semibold"
                  : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
              }`}
            >
              Plugins
            </button>
          </div>

          {/* Yours / Discover Pill Filter */}
          <div className="flex rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setScopeFilter("yours")}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                scopeFilter === "yours"
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) shadow-sm"
                  : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
              }`}
            >
              Workspace (.agents)
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("discover")}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                scopeFilter === "discover"
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) shadow-sm"
                  : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
              }`}
            >
              Global / Installed
            </button>
          </div>
        </div>

        {/* Search & Add Menu */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <MagnifyingGlass className="absolute left-3 size-3.5 text-(--tethys-text-muted)" />
            <input
              type="text"
              aria-label="Search skills"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-48 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-panel) pl-8 pr-3 text-xs text-(--tethys-text-primary) placeholder:text-(--tethys-text-muted) focus:border-(--tethys-hairline-strong) focus:outline-none transition-colors"
            />
          </div>

          <div className="relative">
            <Button
              size="sm"
              onClick={() => setAddMenuOpen((prev) => !prev)}
              className="flex items-center gap-1 text-xs bg-(--tethys-accent-primary) text-white"
            >
              <Plus className="size-3.5" />
              <span>Add</span>
              <ChevronDown className="size-3" />
            </Button>

            <Popover
              open={addMenuOpen}
              onClose={() => setAddMenuOpen(false)}
              className="right-0 mt-1"
            >
              <div className="flex w-52 flex-col p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setAddMenuOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-(--tethys-surface-hover) text-(--tethys-text-primary)"
                >
                  <FolderClosed className="size-4 text-(--tethys-text-muted)" />
                  <span>Import from folder…</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddMenuOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-(--tethys-surface-hover) text-(--tethys-text-primary)"
                >
                  <GitBranch className="size-4 text-(--tethys-text-muted)" />
                  <span>Import from GitHub repo…</span>
                </button>
              </div>
            </Popover>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      <div className="flex items-center justify-between rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated)/40 px-4 py-2.5 text-xs text-(--tethys-text-secondary)">
        <div className="flex items-center gap-2">
          <Check className="size-4 text-emerald-500" />
          <span>
            Two-way sync active: local files in{" "}
            <code className="font-mono text-[11px] bg-(--tethys-surface-panel) px-1 rounded">
              .agents/skills
            </code>{" "}
            are projected directly to connected ACP providers.
          </span>
        </div>
      </div>

      {/* Skill List (§5.3) */}
      <div className="flex flex-col gap-3">
        {filteredSkills.map((skill) => (
          <div
            key={skill.id}
            className="flex items-center justify-between rounded-xl border border-(--tethys-hairline) bg-(--tethys-surface-panel) p-4 transition-all hover:border-(--tethys-hairline-strong)"
          >
            <div className="flex flex-col gap-1 min-w-0 pr-4">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-sm text-(--tethys-text-primary)">
                  {skill.name}
                </span>
                <Badge variant="muted" className="text-[10px] px-1.5 py-0">
                  {skill.category}
                </Badge>
                <span className="text-[10px] text-(--tethys-text-muted)">
                  {skill.author}
                </span>
              </div>
              <p className="text-xs text-(--tethys-text-secondary) leading-relaxed">
                {skill.description}
              </p>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className={`size-4 ${
                    skill.trusted
                      ? "text-emerald-500"
                      : "text-(--tethys-text-muted)"
                  }`}
                />
                <span className="text-xs text-(--tethys-text-muted)">
                  {skill.trusted ? "Auto-run trusted" : "Prompt on run"}
                </span>
              </div>
              <ToggleSwitch
                id={`trust-${skill.id}`}
                label={`Trust ${skill.name}`}
                checked={skill.trusted}
                onCheckedChange={(trusted) => toggleTrust(skill.id, trusted)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
