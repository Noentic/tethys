//! Incremental CommonMark/GFM parser behind `@tethys/markdown`.
//!
//! Streaming flushes re-parse only the trailing incomplete block: completed
//! blocks are cached by a cheap content hash, so the cached HTML string is
//! reused verbatim. `markdown-it` tolerates unterminated fences by design.
//!
//! Output here is **raw HTML** (the parser must be safe to run in a Web Worker,
//! where `DOMPurify` is unavailable). Sanitization happens on the main thread in
//! `createMarkdownRenderer`, the one boundary every consumer crosses.

import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
});

const CODE_BLOCK_COLLAPSE_LINES = 200;

/**
 * A fenced block is a `code-block` from its opening fence, so nothing reflows
 * when the closing fence arrives (DESIGN.md `code-block`). Copy and `Show all`
 * are delegated by the inserting renderer through the `data-` hooks.
 */
md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const info = token.info.trim();
  const language = info.split(/\s+/)[0] ?? "";
  const code = md.utils.escapeHtml(token.content);
  const lineCount = token.content.replace(/\n$/, "").split("\n").length;
  const collapse = lineCount > CODE_BLOCK_COLLAPSE_LINES;
  return [
    `<div class="code-block" data-code-block data-language="${md.utils.escapeHtml(language)}" data-lines="${lineCount}">`,
    '<div class="code-block-header">',
    `<span class="code-block-language">${md.utils.escapeHtml(language || "text")}</span>`,
    '<button type="button" data-copy-code>Copy</button>',
    "</div>",
    `<pre><code class="language-${md.utils.escapeHtml(language)}">${code}</code></pre>`,
    collapse
      ? `<button type="button" data-show-all>Show all ${lineCount} lines</button>`
      : "",
    "</div>",
  ].join("");
};

const blockCache = new Map<string, string>();
let cacheHits = 0;
let cacheMisses = 0;

/** FNV-1a, 32-bit; cheap and stable enough for a content-keyed cache. */
function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(36);
}

/** Renders one completed block through the cache; reuses the cached string. */
export function renderBlock(block: string): string {
  const key = hash(block);
  const cached = blockCache.get(key);
  if (cached !== undefined) {
    cacheHits += 1;
    return cached;
  }
  cacheMisses += 1;
  const html = md.render(block);
  blockCache.set(key, html);
  return html;
}

/**
 * Renders a possibly-unterminated streaming source. Every block but the last
 * is complete (blank-line terminated) and cached; only the trailing block is
 * re-parsed on each flush.
 */
export function renderIncremental(source: string): string {
  const blocks = source.split(/\n{2,}/);
  if (blocks.length === 0) {
    return "";
  }
  const trailing = blocks[blocks.length - 1];
  const completed = blocks.slice(0, -1).map(renderBlock);
  // The trailing block is always re-parsed (it is the open one), but an
  // already-complete trailing block still hits the cache through `renderBlock`.
  const tail = renderBlock(trailing);
  return completed.join("") + tail;
}

export function markdownCacheStats(): { hits: number; misses: number } {
  return { hits: cacheHits, misses: cacheMisses };
}

export function resetMarkdownCache(): void {
  blockCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}
