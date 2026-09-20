import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname);

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("thread/new route is a thin mount (D13)", () => {
  it("deletes the ACP_PROVIDERS / TRUSTED_WORKSPACES mocks", () => {
    const offenders = filesUnder(SRC).filter((path) => {
      if (!/\.(ts|tsx)$/.test(path) || path.endsWith(".test.tsx")) return false;
      const source = readFileSync(path, "utf8");
      return /ACP_PROVIDERS|TRUSTED_WORKSPACES/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("mounts the feature screen and no longer fabricates a session id", () => {
    const route = readFileSync(join(SRC, "thread.new.tsx"), "utf8");
    expect(route).toContain("ThreadNewScreen");
    expect(route).not.toContain("onStartSession");
    expect(route).not.toContain("sess-");

    const main = readFileSync(join(SRC, "..", "main.tsx"), "utf8");
    expect(main).not.toContain("sess-");
  });
});
