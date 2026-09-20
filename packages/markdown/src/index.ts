//! One async markdown API (D9): worker-backed in production, direct-call in
//! tests, so `jsdom` suites never spawn a worker.
//!
//! Sanitization is the single boundary here, on the main thread, because
//! `DOMPurify` cannot run in a Web Worker (SEC-05).

import DOMPurify from "dompurify";
import { renderIncremental } from "./parser";

/** Allow-list sanitizer for agent-authored HTML. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** The boundary `render` crosses; a Worker in production, a direct call in tests. */
export interface MarkdownTransport {
  /** Returns **raw** HTML; `createMarkdownRenderer` sanitizes it. */
  render(id: string, source: string): Promise<string>;
}

/** In-process transport for deterministic, sub-second tests. */
export const directTransport: MarkdownTransport = {
  render: (_id, source) => Promise.resolve(renderIncremental(source)),
};

export interface MarkdownRenderer {
  render(id: string, source: string): Promise<string>;
}

export function createMarkdownRenderer(options: {
  transport: MarkdownTransport;
}): MarkdownRenderer {
  return {
    render: async (id, source) =>
      sanitizeHtml(await options.transport.render(id, source)),
  };
}

/** Production transport: one module Worker, one in-flight request per id. */
export function createWorkerTransport(): MarkdownTransport {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (html: string) => void; reject: (error: unknown) => void }
  >();
  worker.onmessage = (event: MessageEvent<{ id: number; html: string }>) => {
    const request = pending.get(event.data.id);
    pending.delete(event.data.id);
    request?.resolve(event.data.html);
  };
  worker.onerror = (error) => {
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  };
  return {
    render: (_id, source) =>
      new Promise<string>((resolve, reject) => {
        nextId += 1;
        pending.set(nextId, { resolve, reject });
        worker.postMessage({ id: nextId, source });
      }),
  };
}

export {
  markdownCacheStats,
  renderBlock,
  renderIncremental,
  resetMarkdownCache,
} from "./parser";
