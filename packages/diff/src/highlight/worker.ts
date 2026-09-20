/**
 * Highlight worker entry (M1.9 U3). Thin message handler over `highlightLines`.
 * The main thread only ever instantiates this file as a worker
 * (`new Worker(new URL("./worker.ts", import.meta.url))`); it is never imported
 * directly, so the `self` reference below never runs under jsdom.
 */

import type { HighlightRequest, HighlightResponse } from "./protocol";
import { highlightLines } from "./shiki";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HighlightRequest>) => void) | null;
  postMessage: (message: HighlightResponse) => void;
};

scope.onmessage = (event) => {
  const { id, text, language } = event.data;
  void highlightLines(text, language).then((lines) => {
    scope.postMessage({ id, lines });
  });
};
