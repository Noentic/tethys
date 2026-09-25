//! What a tool call did, read from its payloads for the transcript card
//! (DESIGN.md `tool-accordion`, Interaction Patterns P20). Agents name the same
//! fields differently (`file_path` / `filePath` / `path`, `old_string` /
//! `oldString` / `oldText`), so every reader here tries the known spellings
//! and falls back to the call's own title; nothing is invented. Pure, so each
//! reading is tested on data.

import type { DiffFileDetail, ToolSurface } from "@tethys/bindings";
import { detailFromPatch, detailFromTexts } from "@tethys/diff";
import type { PlanStep, ToolCallEntry } from "@tethys/state";

type Json = Record<string, unknown>;

function parseObject(raw: string | null | undefined): Json | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Json)
      : null;
  } catch {
    return null;
  }
}

function stringField(record: Json | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function numberField(record: Json | null, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function nested(record: Json | null, key: string): Json | null {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

const PATH_KEYS = ["file_path", "filePath", "path", "filename", "file"];
const BEFORE_KEYS = ["old_string", "oldString", "oldText", "old_str", "before"];
const AFTER_KEYS = ["new_string", "newString", "newText", "new_str", "after"];
const CONTENT_KEYS = ["content", "contents", "text"];
const COMMAND_KEYS = ["command", "cmd", "script"];
const QUERY_KEYS = ["pattern", "query", "regex", "search", "glob"];
const URL_KEYS = ["url", "uri", "href"];
const OUTPUT_KEYS = ["output", "stdout", "result", "content", "text"];

/** The file the call is about: its input, else its first location. */
export function toolPath(entry: ToolCallEntry): string | null {
  return (
    stringField(parseObject(entry.input), PATH_KEYS) ??
    entry.locations[0]?.path ??
    entry.diffs?.[0]?.path ??
    null
  );
}

/** The shell command an `execute` call ran. */
export function toolCommand(entry: ToolCallEntry): string | null {
  const input = parseObject(entry.input);
  const command = input?.command;
  if (Array.isArray(command)) {
    const parts = command.filter((part) => typeof part === "string");
    // `["bash", "-lc", "…"]` is a wrapper around the command that matters.
    return parts.length === 3 && parts[1]?.startsWith("-")
      ? (parts[2] ?? null)
      : parts.join(" ") || null;
  }
  return stringField(input, COMMAND_KEYS);
}

export function toolQuery(entry: ToolCallEntry): string | null {
  return stringField(parseObject(entry.input), QUERY_KEYS);
}

export function toolUrl(entry: ToolCallEntry): string | null {
  return stringField(parseObject(entry.input), URL_KEYS);
}

/**
 * Where the JSON value at the start of `text` ends, or -1 when `text` does not
 * start with an object, array, or string. A call's output is its raw output
 * followed by the text content it streamed, so the two are split here.
 */
function leadingJsonEnd(text: string): number {
  const first = text[0];
  if (first !== "{" && first !== "[" && first !== '"') return -1;
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') {
        inString = false;
        if (depth === 0) return index + 1;
      }
    } else if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/** Opencode wraps a read in `<path>…</path><type>…</type><content>…</content>`. */
function unwrapFileEnvelope(text: string): string {
  const match = /<content>\n?([\s\S]*?)(?:\n?<\/content>|$)/.exec(text);
  return match && /^\s*<path>/.test(text) ? (match[1] ?? text) : text;
}

/** The raw output's JSON object, ignoring any text streamed after it. */
function outputEnvelope(entry: ToolCallEntry): Json | null {
  const output = (entry.output ?? "").trim();
  const end = leadingJsonEnd(output);
  return end < 0 ? null : parseObject(output.slice(0, end));
}

/**
 * The call's result as text. Agents report a raw JSON envelope
 * (`{"output": "…", "metadata": {…}}` or a bare JSON string) and may stream the
 * same result again as text content after it; the readable text is what the
 * body shows, and the envelope stays behind `Raw`.
 */
export function toolOutputText(entry: ToolCallEntry): string {
  const output = (entry.output ?? "").trim();
  const end = leadingJsonEnd(output);
  if (end < 0) return unwrapFileEnvelope(output);
  const streamed = output.slice(end).trim();
  if (streamed) return unwrapFileEnvelope(streamed);
  let value: unknown;
  try {
    value = JSON.parse(output.slice(0, end));
  } catch {
    return output;
  }
  if (typeof value === "string") return unwrapFileEnvelope(value);
  const text =
    value && typeof value === "object" && !Array.isArray(value)
      ? stringField(value as Json, OUTPUT_KEYS)
      : null;
  return text === null ? output : unwrapFileEnvelope(text);
}

/** The exit code a shell call reported, when it reported one. */
export function toolExitCode(entry: ToolCallEntry): number | null {
  const envelope = outputEnvelope(entry);
  return (
    numberField(envelope, ["exit_code", "exitCode", "exit"]) ??
    numberField(nested(envelope, "metadata"), ["exit_code", "exitCode", "exit"])
  );
}

/**
 * Every file change the call describes, in the order a reader trusts them:
 * the Provider's own ACP diff content, then a patch in its output (OpenCode's
 * `metadata.diff`), then the before/after text in its input.
 */
export function toolDiffs(entry: ToolCallEntry): DiffFileDetail[] {
  const fromContent = (entry.diffs ?? [])
    .map((diff) => detailFromPatch(diff.path, diff.patch))
    .filter((detail): detail is DiffFileDetail => detail !== null);
  if (fromContent.length > 0) return fromContent;

  const path = toolPath(entry) ?? "file";
  const envelope = outputEnvelope(entry);
  const reported =
    stringField(nested(envelope, "metadata"), ["diff", "patch"]) ??
    stringField(envelope, ["diff", "patch"]);
  const fromOutput = reported ? detailFromPatch(path, reported) : null;
  if (fromOutput) return [fromOutput];

  const input = parseObject(entry.input);
  const before = stringField(input, BEFORE_KEYS);
  const after = stringField(input, AFTER_KEYS);
  if (before !== null && after !== null) {
    const detail = detailFromTexts(path, before, after);
    return detail ? [detail] : [];
  }
  // A write with only the new content is a file that did not exist before.
  const written = stringField(input, CONTENT_KEYS);
  if (written !== null && surfaceOf(entry) === "edit") {
    const detail = detailFromTexts(path, "", written);
    return detail ? [detail] : [];
  }
  return [];
}

/**
 * The Tethys surface a call renders as. A Provider adapter names it when ACP's
 * kind cannot (a todo write, a question, a web search); otherwise it follows
 * from the kind and where the call came from.
 */
export function surfaceOf(entry: ToolCallEntry): ToolSurface {
  if (entry.surface) return entry.surface;
  if (entry.origin?.kind === "mcp") return "mcp";
  if (entry.origin?.kind === "subagent") return "subagent";
  switch (entry.toolKind) {
    case "read":
      return "read";
    case "edit":
    case "delete":
    case "move":
      return "edit";
    case "execute":
      return "shell";
    case "search":
      return "search";
    case "fetch":
      return "web_fetch";
    case "think":
      return "think";
    default:
      return "other";
  }
}

export interface ToolHeadline {
  /** The act, tense matching the call: `Editing` while it runs, `Edited` once done. */
  verb: string | null;
  /** What it acted on: a path, a command, a query. */
  subject: string;
  /** Render the subject as code (a path or command) rather than prose. */
  mono: boolean;
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
}

/** `host/path` without the scheme, query, or trailing slash. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** The MCP tool's own name, without Claude's `mcp__<server>__` prefix. */
function mcpToolName(entry: ToolCallEntry): string {
  const name =
    stringField(nested(parseObject(entry.metadata), "claudeCode"), [
      "toolName",
    ]) ?? entry.title;
  const parts = name.split("__");
  return parts.length >= 3 && parts[0] === "mcp"
    ? parts.slice(2).join("__")
    : name;
}

/** The first question a question tool asked, from its input. */
export function toolQuestions(entry: ToolCallEntry): string[] {
  const questions = parseObject(entry.input)?.questions;
  if (!Array.isArray(questions)) return [];
  return questions
    .map((question) =>
      typeof question === "string"
        ? question
        : stringField(question as Json, ["question", "header", "title"]),
    )
    .filter((question): question is string => Boolean(question));
}

const TODO_STATUS: Record<string, PlanStep["status"]> = {
  pending: "Pending",
  in_progress: "InProgress",
  completed: "Completed",
};

/** The list a todo tool wrote, from its input (`todos: [{content, status}]`). */
export function toolTodos(entry: ToolCallEntry): PlanStep[] {
  const todos = parseObject(entry.input)?.todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((todo) => {
    const record = todo && typeof todo === "object" ? (todo as Json) : null;
    const content = stringField(record, ["content", "text", "title"]);
    const status = TODO_STATUS[stringField(record, ["status"]) ?? ""];
    return content && status
      ? [{ content, status, priority: "Medium" as const }]
      : [];
  });
}

/**
 * A call's arguments as `[name, value]` pairs for a key/value view: strings as
 * they are, anything else as compact JSON.
 */
export function toolArguments(entry: ToolCallEntry): [string, string][] {
  const input = parseObject(entry.input);
  if (!input) return [];
  return Object.entries(input).map(([name, value]) => [
    name,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

type Tense = [running: string, done: string];

/**
 * The text of each surface: its verb, what it names as its object, and how a
 * run of such calls is counted. Exhaustive, so a new surface cannot ship
 * without saying how it reads.
 */
const SURFACE_TEXT: Record<
  ToolSurface,
  {
    verbs: Tense | null;
    subject: (entry: ToolCallEntry) => Omit<ToolHeadline, "verb"> | null;
    count: (count: number) => string;
  }
> = {
  read: {
    verbs: ["Reading", "Read"],
    subject: (entry) => {
      const path = toolPath(entry);
      if (!path) return null;
      const line = entry.locations[0]?.line;
      return {
        subject: line ? `${basename(path)}:${line}` : basename(path),
        mono: true,
      };
    },
    count: (count) => `Read ${count} file${count === 1 ? "" : "s"}`,
  },
  edit: {
    verbs: ["Editing", "Edited"],
    subject: (entry) => {
      const path = toolPath(entry);
      return path ? { subject: basename(path), mono: true } : null;
    },
    count: (count) => `${count} edit${count === 1 ? "" : "s"}`,
  },
  shell: {
    verbs: ["Running", "Ran"],
    subject: (entry) => {
      const command = toolCommand(entry);
      return command ? { subject: command, mono: true } : null;
    },
    count: (count) => `ran ${count} command${count === 1 ? "" : "s"}`,
  },
  search: {
    verbs: ["Searching", "Searched"],
    subject: (entry) => {
      const query = toolQuery(entry);
      return query ? { subject: query, mono: true } : null;
    },
    count: (count) => `${count} search${count === 1 ? "" : "es"}`,
  },
  web_fetch: {
    verbs: ["Fetching", "Fetched"],
    subject: (entry) => {
      const url = toolUrl(entry);
      return url ? { subject: shortUrl(url), mono: true } : null;
    },
    count: (count) => `${count} fetch${count === 1 ? "" : "es"}`,
  },
  web_search: {
    verbs: ["Searching the web for", "Searched the web for"],
    subject: (entry) => {
      const query = toolQuery(entry);
      return query ? { subject: `“${query}”`, mono: false } : null;
    },
    count: (count) => `${count} web search${count === 1 ? "" : "es"}`,
  },
  mcp: {
    verbs: null,
    subject: (entry) => {
      const server = entry.origin?.kind === "mcp" ? entry.origin.server : null;
      const tool = mcpToolName(entry);
      return { subject: server ? `${server} · ${tool}` : tool, mono: true };
    },
    count: (count) => `${count} MCP call${count === 1 ? "" : "s"}`,
  },
  todo: {
    verbs: ["Updating", "Updated"],
    subject: () => ({ subject: "todos", mono: false }),
    count: (count) => `${count} todo update${count === 1 ? "" : "s"}`,
  },
  question: {
    verbs: ["Asking", "Asked"],
    subject: (entry) => {
      const [first] = toolQuestions(entry);
      return first ? { subject: first, mono: false } : null;
    },
    count: (count) => `${count} question${count === 1 ? "" : "s"}`,
  },
  think: {
    verbs: null,
    subject: () => null,
    count: (count) => `${count} thought${count === 1 ? "" : "s"}`,
  },
  subagent: {
    verbs: null,
    subject: () => null,
    count: (count) => `${count} subagent${count === 1 ? "" : "s"}`,
  },
  other: {
    verbs: null,
    subject: () => null,
    count: (count) => `${count} tool call${count === 1 ? "" : "s"}`,
  },
};

const EDIT_VERBS: Partial<Record<string, Tense>> = {
  delete: ["Deleting", "Deleted"],
  move: ["Moving", "Moved"],
};

/**
 * The one line that names a call: verb plus object for the surfaces whose
 * object is readable from the payload, else the Provider's own title.
 */
export function toolHeadline(entry: ToolCallEntry): ToolHeadline {
  const surface = surfaceOf(entry);
  const text = SURFACE_TEXT[surface];
  const named = text.subject(entry);
  if (!named) return { verb: null, subject: entry.title, mono: false };
  const done = entry.status !== "Pending" && entry.status !== "Executing";
  const verbs =
    (surface === "edit" && EDIT_VERBS[entry.toolKind ?? ""]) || text.verbs;
  return { verb: verbs ? verbs[done ? 1 : 0] : null, ...named };
}

/** How a run of `count` calls on one surface reads in a group header. */
export function surfaceCount(surface: ToolSurface, count: number): string {
  return SURFACE_TEXT[surface].count(count);
}

/** Pretty JSON for a raw payload, or the text as it came when it is not JSON. */
export function prettyPayload(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
