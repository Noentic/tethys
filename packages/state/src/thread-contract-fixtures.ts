import type {
  ConfigOption,
  StopReason,
  ToolCallPatch,
  ToolKind,
  ToolLocation,
  ToolOrigin,
  UsageSnapshot,
} from "@tethys/bindings";

/**
 * M1.6c U13 fixtures for the thread-view contract additions. `origin` and
 * `parent_tool_call_id` are declared here but populated by no shipping code:
 * the Wave 2.5 Provider adapters fill them, and an entry with no `origin`
 * renders as a built-in call.
 */
export const toolKindFixtures: ToolKind[] = [
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
];

export const toolOriginFixtures: ToolOrigin[] = [
  { kind: "builtin" },
  { kind: "mcp", server: "filesystem" },
  { kind: "skill", name: "pdf" },
  { kind: "subagent" },
];

export const toolLocationFixtures: ToolLocation[] = [
  { path: "src/main.rs", line: 42 },
  { path: "src/lib.rs", line: null },
];

export const toolCallPatchFixture: ToolCallPatch = {
  title: "Read file",
  kind: "read",
  status: "Completed",
  input: null,
  output: null,
  origin: { kind: "mcp", server: "filesystem" },
  parent_tool_call_id: null,
  locations: toolLocationFixtures,
};

export const configOptionFixtures: ConfigOption[] = [
  {
    id: "thought_level",
    name: "Effort",
    description: null,
    current_value: "medium",
    values: ["low", "medium"],
    category: "thought_level",
    kind: "select",
    value_options: [
      { id: "low", name: "Low", description: "Fastest" },
      { id: "medium", name: "Medium", description: null },
    ],
  },
  {
    id: "model",
    name: "Model",
    description: null,
    current_value: "sonnet",
    values: ["sonnet", "opus"],
    category: "model",
    kind: "select",
    value_options: [
      { id: "sonnet", name: "Sonnet", description: null },
      { id: "opus", name: "Opus", description: null },
    ],
  },
  {
    id: "auto_apply",
    name: "Auto apply",
    description: null,
    current_value: "false",
    values: ["true", "false"],
    category: null,
    kind: "boolean",
    value_options: [],
  },
];

export const usageSnapshotFixture: UsageSnapshot = {
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 1_200,
  cost: 0.42,
  context_size: 200_000,
  cost_currency: "USD",
};

export const stopReasonFixtures: StopReason[] = [
  "EndTurn",
  "MaxTokens",
  "MaxTurnRequests",
  "StopSequence",
  "Refusal",
  "Cancelled",
  "Error",
  { Other: "custom" },
];
