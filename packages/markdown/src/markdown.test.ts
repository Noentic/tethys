import { beforeEach, describe, expect, it } from "vitest";
import {
  createMarkdownRenderer,
  directTransport,
  markdownCacheStats,
  renderBlock,
  renderIncremental,
  resetMarkdownCache,
  sanitizeHtml,
} from "./index";

describe("@tethys/markdown incremental renderer (M1.7 U6)", () => {
  beforeEach(() => {
    resetMarkdownCache();
  });

  it("renders an unterminated code fence as a code block", async () => {
    const renderer = createMarkdownRenderer({ transport: directTransport });
    const html = await renderer.render("m1", "```rust\nfn ma");
    expect(html).toContain("<code");
    expect(html).not.toContain("```");
  });

  it("reuses a completed block's cached HTML across flushes", () => {
    const first = renderBlock("# A");
    const second = renderBlock("# A");
    expect(second).toBe(first);
    expect(markdownCacheStats().hits).toBe(1);

    renderIncremental("# A\n\npara");
    const afterFirst = markdownCacheStats();
    renderIncremental("# A\n\nparagraph");
    const afterSecond = markdownCacheStats();
    // The `# A` block was served from cache on the second flush.
    expect(afterSecond.hits).toBeGreaterThan(afterFirst.hits);
  });

  it("renders GFM tables and strikethrough", () => {
    const table = renderIncremental("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(table).toContain("<table>");
    const strike = renderIncremental("~~gone~~");
    expect(strike).toContain("<s>");
  });

  it("sanitizes agent output at the renderer boundary", async () => {
    const renderer = createMarkdownRenderer({ transport: directTransport });
    const html = await renderer.render("m1", "<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    // The sanitizer strips event handlers even from raw HTML fragments.
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).not.toContain(
      "onerror",
    );
  });

  it("keeps the direct transport synchronous enough for a sub-second suite", () => {
    const start = performance.now();
    for (let index = 0; index < 200; index += 1) {
      renderIncremental(`# Heading ${index}\n\nbody ${index}`);
    }
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
