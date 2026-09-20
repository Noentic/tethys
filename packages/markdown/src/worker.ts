//! Production Web Worker entry. Bundlers load this by URL from
//! `createWorkerTransport`; it is never imported on the main thread.

import { renderIncremental } from "./parser";

interface RenderRequest {
  id: number;
  source: string;
}

interface RenderResponse {
  id: number;
  html: string;
}

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, source } = event.data;
  const response: RenderResponse = { id, html: renderIncremental(source) };
  (self as unknown as Worker).postMessage(response);
};
