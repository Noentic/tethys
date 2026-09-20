/**
 * Main-thread facade for the Shiki highlight worker (M1.9 U3).
 *
 * One async API: production transport is a Web Worker; tests inject a direct
 * in-process transport so no worker is spawned under jsdom. Results are cached
 * by a content hash, and an unknown language or an unavailable worker resolves
 * to plain text (`[]`), never an error.
 */

import { languageForPath } from "./languages";
import { fnv1a, type HighlightLines, type HighlightResponse } from "./protocol";
import { highlightLines } from "./shiki";

export type HighlightTransport = (
  text: string,
  language: string,
) => Promise<HighlightLines>;

export interface DiffHighlighter {
  /** Token spans per line for `text`, or `[]` for plain text. */
  highlight(text: string, path: string): Promise<HighlightLines>;
  /** Number of cached entries (test/debug hook). */
  readonly cacheSize: number;
}

function createWorkerTransport(): HighlightTransport {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<
    number,
    (value: HighlightLines | PromiseLike<HighlightLines>) => void
  >();

  const ensureWorker = (): Worker | null => {
    if (typeof Worker === "undefined") {
      return null;
    }
    if (worker === null) {
      const created = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      created.onmessage = (event: MessageEvent<HighlightResponse>) => {
        const resolve = pending.get(event.data.id);
        if (resolve) {
          pending.delete(event.data.id);
          resolve(event.data.lines);
        }
      };
      // A worker that fails to load (unsupported webview, blocked asset) must
      // degrade to plain text, not leave every highlight request pending.
      created.onerror = () => {
        for (const resolve of pending.values()) {
          resolve([]);
        }
        pending.clear();
        created.terminate();
        if (worker === created) {
          worker = null;
        }
      };
      worker = created;
    }
    return worker;
  };

  return (text, language) =>
    new Promise<HighlightLines>((resolve) => {
      const activeWorker = ensureWorker();
      if (activeWorker === null) {
        resolve([]);
        return;
      }
      const id = nextId;
      nextId += 1;
      pending.set(id, resolve);
      activeWorker.postMessage({ id, text, language });
    });
}

/** Direct in-process transport: the production path minus the worker hop. */
export function createInProcessTransport(): HighlightTransport {
  return (text, language) => highlightLines(text, language);
}

export function createDiffHighlighter(options?: {
  transport?: HighlightTransport;
}): DiffHighlighter {
  const transport = options?.transport ?? createWorkerTransport();
  const cache = new Map<string, HighlightLines>();

  return {
    get cacheSize() {
      return cache.size;
    },
    async highlight(text, path) {
      const language = languageForPath(path);
      if (language === null) {
        return [];
      }
      const key = `${language}:${fnv1a(text)}`;
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const lines = await transport(text, language);
      cache.set(key, lines);
      return lines;
    },
  };
}
