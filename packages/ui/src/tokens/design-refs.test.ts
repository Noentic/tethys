import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// DESIGN.md is a contract other files quote: every `{semantic.x}`,
// `{components.y.z}`, `{motion.m}` in it names a key defined in the same
// document. A reference that names nothing is how the contract came to promise
// `mode-pill`, `diff-summary-pill` and the `*-on-sunken` family without
// defining them, so this fails the build on the first dangling one.

const ROOTS = [
  "primitives",
  "themes",
  "semantic",
  "typography",
  "rounded",
  "spacing",
  "layout",
  "stacking",
  "motion",
  "components",
] as const;

type Node = Record<string, unknown>;

interface Reference {
  path: string;
  line: number;
  /** The `components.<name>` the reference sits in, when it sits in one. */
  inComponent?: string;
}

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../DESIGN.md"),
  "utf-8",
);

function frontMatterOf(source: string): { yaml: string; bodyStart: number } {
  const lines = source.split("\n");
  const close = lines.findIndex((line, i) => i > 0 && /^---\s*$/.test(line));
  return { yaml: lines.slice(1, close).join("\n"), bodyStart: close + 1 };
}

function isDefined(root: Node, path: string): boolean {
  let node: unknown = root;
  for (const segment of path.split(".")) {
    if (node === null || typeof node !== "object") return false;
    if (!(segment in (node as Node))) return false;
    node = (node as Node)[segment];
  }
  return true;
}

function findReferences(source: string): Reference[] {
  const refs: Reference[] = [];
  let component: string | undefined;
  let inFront = false;
  let inComponents = false;
  source.split("\n").forEach((text, i) => {
    if (i === 0 && /^---\s*$/.test(text)) inFront = true;
    else if (inFront && /^---\s*$/.test(text)) {
      inFront = false;
      inComponents = false;
      component = undefined;
    }
    if (inFront) {
      if (/^components:/.test(text)) inComponents = true;
      else if (/^[a-z]/.test(text)) inComponents = false;
      const header = text.match(/^ {2}([a-z0-9-]+):\s*$/);
      if (inComponents && header) component = header[1];
    }
    for (const m of text.matchAll(/\{([a-z][\w-]*(?:\.[\w-]+)+)\}/g)) {
      const [head] = m[1].split(".");
      if ((ROOTS as readonly string[]).includes(head)) {
        refs.push({
          path: m[1],
          line: i + 1,
          inComponent: inFront && inComponents ? component : undefined,
        });
      }
    }
  });
  return refs;
}

// A reference resolves when the key it names is defined; a trailing segment may
// also address a property of an inline description (`{motion.breathe.duration}`).
function unresolved(root: Node, refs: Reference[]): string[] {
  return refs
    .filter(({ path }) => !isDefined(root, path))
    .map(({ path, line }) => `DESIGN.md:${line}  {${path}}`);
}

function deprecatedComponents(root: Node): string[] {
  const components = (root.components ?? {}) as Record<string, Node>;
  return Object.entries(components)
    .filter(([, def]) => typeof def === "object" && "deprecated" in def)
    .map(([name]) => name);
}

function liveReferencesToDeprecated(root: Node, refs: Reference[]): string[] {
  const deprecated = new Set(deprecatedComponents(root));
  return refs
    .filter(({ path, inComponent }) => {
      const target = path.match(/^components\.([\w-]+)/)?.[1];
      return (
        target !== undefined &&
        deprecated.has(target) &&
        inComponent !== undefined &&
        !deprecated.has(inComponent)
      );
    })
    .map(
      ({ path, line, inComponent }) =>
        `DESIGN.md:${line}  ${inComponent} -> {${path}}`,
    );
}

const { yaml, bodyStart } = frontMatterOf(SOURCE);
const CONTRACT = parse(yaml) as Node;
const REFERENCES = findReferences(SOURCE);

describe("DESIGN.md references", () => {
  it("reads the front matter and finds a real number of references", () => {
    expect(bodyStart).toBeGreaterThan(100);
    expect(Object.keys(CONTRACT)).toEqual(
      expect.arrayContaining(["semantic", "components", "motion", "layout"]),
    );
    expect(REFERENCES.length).toBeGreaterThan(200);
  });

  it("resolves every {components.*}, {semantic.*}, {motion.*} and {layout.*} reference", () => {
    expect(unresolved(CONTRACT, REFERENCES)).toEqual([]);
  });

  it("lets a deprecated stub be defined but not referenced by a live component", () => {
    expect(deprecatedComponents(CONTRACT)).toEqual(
      expect.arrayContaining(["action-bar", "session-topology-canvas"]),
    );
    expect(liveReferencesToDeprecated(CONTRACT, REFERENCES)).toEqual([]);
  });

  describe("the checks themselves", () => {
    const root: Node = {
      semantic: { canvas: {} },
      components: {
        card: { border: "1px solid {semantic.canvas}" },
        "old-bar": { deprecated: "gone" },
        row: { anchor: "{components.old-bar}" },
      },
    };

    it("reports a typo'd reference with its line", () => {
      const refs = findReferences(
        "---\nx: 1\n---\nUse {semantic.canvaz} here\n",
      );
      expect(unresolved(root, refs)).toEqual([
        "DESIGN.md:4  {semantic.canvaz}",
      ]);
    });

    it("ignores braces that are not contract references", () => {
      const refs = findReferences("---\nx: 1\n---\nWaiting for {Provider}\n");
      expect(refs).toEqual([]);
    });

    it("reports a live component referencing a deprecated one, not a stub referencing itself", () => {
      const source = [
        "---",
        "components:",
        "  old-bar:",
        '    note: "{components.old-bar}"',
        "  row:",
        '    anchor: "{components.old-bar}"',
        "---",
      ].join("\n");
      expect(liveReferencesToDeprecated(root, findReferences(source))).toEqual([
        "DESIGN.md:6  row -> {components.old-bar}",
      ]);
    });
  });
});
