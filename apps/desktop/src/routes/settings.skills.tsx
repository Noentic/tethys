import {
  Check,
  ChevronDown,
  FolderClosed,
  GitBranch,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
} from "@nebutra/icons";
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  Popover,
  SegmentedControl,
  ToggleSwitch,
  UnderlineTabs,
} from "@tethys/ui";
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
    <div className="flex flex-col gap-xl">
      <PageHeader title="Skills & Commands" />

      {/* Tabs and Toolbar Row (§5.3) */}
      <div className="flex items-center justify-between gap-lg border-b border-(--tethys-hairline) pb-md">
        <div className="flex items-center gap-xl">
          <UnderlineTabs
            label="Catalog"
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { value: "skills", label: "Skills" },
              { value: "connectors", label: "Connectors" },
              { value: "plugins", label: "Plugins" },
            ]}
          />

          {/* Yours / Discover segmented sub-filter */}
          <SegmentedControl
            size="sm"
            value={scopeFilter}
            onChange={setScopeFilter}
            options={[
              { value: "yours", label: "Workspace (.agents)" },
              { value: "discover", label: "Global / Installed" },
            ]}
          />
        </div>

        {/* Search & Add Menu */}
        <div className="flex items-center gap-md">
          <div className="w-56">
            <Input
              type="text"
              aria-label="Search skills"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leadingIcon={<MagnifyingGlass className="size-3.5" />}
            />
          </div>

          <div className="relative">
            <Button
              size="sm"
              variant="primary"
              onClick={() => setAddMenuOpen((prev) => !prev)}
              className="h-8"
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
              <div className="flex w-56 flex-col">
                <Button
                  variant="ghost"
                  onClick={() => setAddMenuOpen(false)}
                  className="h-9 w-full justify-start font-normal"
                >
                  <FolderClosed className="size-4 text-(--tethys-text-muted)" />
                  <span>Import from folder…</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setAddMenuOpen(false)}
                  className="h-9 w-full justify-start font-normal"
                >
                  <GitBranch className="size-4 text-(--tethys-text-muted)" />
                  <span>Import from GitHub repo…</span>
                </Button>
              </div>
            </Popover>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      <Card className="flex items-center gap-sm bg-(--tethys-surface-nested) px-lg py-md text-body-sm text-(--tethys-text-secondary)">
        <Check className="size-4 shrink-0 text-(--tethys-status-success)" />
        <span>
          Two-way sync active: local files in{" "}
          <code className="rounded-xs bg-(--tethys-surface-panel) px-1 font-mono text-mono-code">
            .agents/skills
          </code>{" "}
          are projected directly to connected ACP providers.
        </span>
      </Card>

      {/* Skill List (§5.3) */}
      <div className="flex flex-col gap-md">
        {filteredSkills.map((skill) => (
          <Card
            key={skill.id}
            className="flex items-center justify-between gap-lg p-lg transition-colors hover:border-(--tethys-hairline-strong)"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-sm">
                <span className="font-mono text-body-sm font-medium text-(--tethys-text-primary)">
                  {skill.name}
                </span>
                <Badge variant="muted" size="sm">
                  {skill.category}
                </Badge>
                <span className="text-label-sm text-(--tethys-text-muted)">
                  {skill.author}
                </span>
              </div>
              <p className="text-body-sm text-(--tethys-text-secondary)">
                {skill.description}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-lg">
              <div className="flex items-center gap-sm">
                <ShieldCheck
                  className={`size-4 ${
                    skill.trusted
                      ? "text-(--tethys-status-success)"
                      : "text-(--tethys-text-muted)"
                  }`}
                />
                <span className="text-label-md font-normal text-(--tethys-text-muted)">
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
          </Card>
        ))}
      </div>
    </div>
  );
}
