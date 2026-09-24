//! What a tool call did, read from its payloads for the transcript card
//! (DESIGN.md `tool-accordion`, Interaction Patterns P20). Agents name the same
//! fields differently (`file_path` / `filePath` / `path`, `old_string` /
//! `oldString` / `oldText`), so every reader here tries the known spellings
//! and falls back to the call's own title; nothing is invented. Pure, so each
//! reading is tested on data.

import type { DiffFileDetail } from "@tethys/bindings";
import { detailFromPatch, detailFromTexts } from "@tethys/diff";
import type { ToolCallEntry } from "@tethys/state";

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
 * The call's result as text. Agents often report a JSON envelope
 * (`{"output": "…", "metadata": {…}}`); the text inside it is what a reader
 * wants, so it is unwrapped when the envelope has one.
 */
export function toolOutputText(entry: ToolCallEntry): string {
  const output = entry.output ?? "";
  const envelope = parseObject(output.trim().startsWith("{") ? output : null);
  return stringField(envelope, OUTPUT_KEYS) ?? output;
}

/** The exit code a shell call reported, when it reported one. */
export function toolExitCode(entry: ToolCallEntry): number | null {
  const envelope = parseObject(entry.output);
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
  const envelope = parseObject(entry.output);
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
  if (written !== null && entry.toolKind === "edit") {
    const detail = detailFromTexts(path, "", written);
    return detail ? [detail] : [];
  }
  return [];
}

export interface ToolHeadline {
  /** The act, tense matching the call: `Editing` while it runs, `Edited` once done. */
  verb: string | null;
  /** What it acted on: a path, a command, a query. */
  subject: string;
  /** Render the subject as code (a path or command) rather than prose. */
  mono: boolean;
}

const VERBS: Record<string, [string, string]> = {
  read: ["Reading", "Read"],
  edit: ["Editing", "Edited"],
  delete: ["Deleting", "Deleted"],
  move: ["Moving", "Moved"],
  search: ["Searching", "Searched"],
  execute: ["Running", "Ran"],
  fetch: ["Fetching", "Fetched"],
};

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || trimmed;
}

/**
 * The one line that names a call: verb plus object for the kinds whose object
 * is readable from the payload, else the Provider's own title.
 */
export function toolHeadline(entry: ToolCallEntry): ToolHeadline {
  const done = entry.status !== "Pending" && entry.status !== "Executing";
  const verbs = entry.toolKind ? VERBS[entry.toolKind] : undefined;
  const verb = verbs ? verbs[done ? 1 : 0] : null;
  const fallback = { verb: null, subject: entry.title, mono: false };
  switch (entry.toolKind) {
    case "execute": {
      const command = toolCommand(entry);
      return command ? { verb, subject: command, mono: true } : fallback;
    }
    case "search": {
      const query = toolQuery(entry);
      return query ? { verb, subject: query, mono: true } : fallback;
    }
    case "fetch": {
      const url = toolUrl(entry);
      return url ? { verb, subject: url, mono: true } : fallback;
    }
    case "read":
    case "edit":
    case "delete":
    case "move": {
      const path = toolPath(entry);
      if (!path) return fallback;
      const line = entry.locations[0]?.line;
      return {
        verb,
        subject:
          entry.toolKind === "read" && line
            ? `${basename(path)}:${line}`
            : basename(path),
        mono: true,
      };
    }
    default:
      return fallback;
  }
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
