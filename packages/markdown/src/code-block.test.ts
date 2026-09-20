import { beforeEach, describe, expect, it } from "vitest";
import { renderIncremental, resetMarkdownCache } from "./index";

describe("@tethys/markdown code-block (M1.7 U18)", () => {
  beforeEach(() => {
    resetMarkdownCache();
  });

  it("wraps a fenced block with a language label and a Copy control", () => {
    const html = renderIncremental("```rust\nfn main() {}\n```");
    expect(html).toContain("data-code-block");
    expect(html).toContain('data-language="rust"');
    expect(html).toContain("code-block-language");
    expect(html).toContain("data-copy-code");
    expect(html).toContain("<pre><code");
  });

  it("renders an unterminated fence as a code-block immediately", () => {
    const html = renderIncremental("```rust\nfn ma");
    expect(html).toContain("data-code-block");
    expect(html).not.toContain("```");
  });

  it("collapses a long block behind Show all N lines", () => {
    const lines = Array.from({ length: 201 }, (_, i) => `line ${i}`).join("\n");
    const html = renderIncremental(`\`\`\`text\n${lines}\n\`\`\``);
    expect(html).toContain("Show all 201 lines");
  });

  it("does not add the collapse control to a short block", () => {
    const html = renderIncremental("```text\none\ntwo\n```");
    expect(html).not.toContain("data-show-all");
  });
});
