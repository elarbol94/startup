import "server-only";

import { Agent } from "undici";

/**
 * Node's fetch gives up when response headers take longer than five minutes
 * (undici's headersTimeout) and reports only "fetch failed". OpenAI answers a
 * long diarized transcription later than that, so its requests use limits
 * above their own AbortSignal deadline, which stays the one that applies.
 */
const SLOW_LIMIT_MS = 20 * 60_000;
const slowResponses = new Agent({ headersTimeout: SLOW_LIMIT_MS, bodyTimeout: SLOW_LIMIT_MS });

export function slowFetch(url: string, init: RequestInit) {
  return fetch(url, { ...init, dispatcher: slowResponses } as RequestInit);
}
