import type { PermissionRequestItem, ToolCallEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { pendingEditFor } from "./permission-request-card";

const request = (path: string): PermissionRequestItem => ({
  reqId: "r1",
  title: "Edit file",
  description: null,
  subject: { File: { path } },
  options: [],
});

const call = (patch: Partial<ToolCallEntry>): ToolCallEntry => ({
  id: "t1",
  kind: "tool_call",
  toolCallId: "t1",
  title: "Edit",
  status: "Pending",
  toolKind: "edit",
  locations: [],
  timestamp: 0,
  ...patch,
});

describe("pendingEditFor", () => {
  it("finds the waiting edit on the requested file", () => {
    const waiting = call({
      input: JSON.stringify({ file_path: "/repo/src/a.ts" }),
    });
    expect(pendingEditFor(request("/repo/src/a.ts"), [waiting])).toBe(waiting);
  });

  it("ignores a finished call and a call on another file", () => {
    const done = call({
      status: "Completed",
      input: JSON.stringify({ file_path: "/repo/src/a.ts" }),
    });
    const other = call({
      id: "t2",
      input: JSON.stringify({ file_path: "/repo/src/b.ts" }),
    });
    expect(pendingEditFor(request("/repo/src/a.ts"), [done, other])).toBeNull();
  });
});
