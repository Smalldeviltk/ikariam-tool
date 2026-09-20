/**
 * Ask the game's own endpoints for data, instead of driving its interface.
 *
 * WHY THIS EXISTS
 * Everything in these scripts used to get its data by navigating: click a town
 * in a dropdown, poll the breadcrumb until it changes, read the DOM. That is
 * slow, it moves the player's view around, and it fails in ways that are
 * invisible from outside the page — four separate defects fixed in one session
 * were all consequences of it.
 *
 * The game already exposes the same data over a plain request. IkaEasy V4 uses
 * exactly this (`js/helper/httpClient.js:21`, `js/data/city.js:52`), and a
 * probe against the live game (`ikaTestAjaxFetch` in
 * `tools/collect-dom-report.js`) confirmed the shape before a line of this was
 * written. See `docs/improvement-plan.md` §1.
 *
 * WHAT THE PROBE MEASURED, on s303-en
 *   - `GET /index.php?view=townHall&cityId=<id>&...&ajax=1` returns HTTP 200
 *     with a JSON array of 7 entries.
 *   - The first entry is `updateGlobalData`, and its `backgroundData` carries
 *     the `position` array — the building layout, which is the whole point.
 *   - 328 ms and 841 ms across two runs, against 2367 ms per town measured for
 *     the click-and-poll path.
 *   - ~70-73 kB per response.
 *   - `Content-Type` comes back as `text/html`, NOT `application/json`, even
 *     though the body is JSON. Never gate on the header.
 *   - The payload contains an `actionRequest`, and across two consecutive
 *     requests the model's copy did not change.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 * It does not apply responses to the game. It hands the parsed array to
 * whoever registered an interest and stops there. Driving the page is the
 * feature code's business, not the transport's.
 */

import { pageWindow } from "./globals";

/** Minimum gap between two requests. */
const DEFAULT_MIN_GAP_MS = 300;

/** Give up on a request that has not answered by then. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** One `[type, payload]` pair as the game sends them. */
export type ResponseEntry = unknown;

export interface RequestOptions {
  /** Overrides the default gap before this request. */
  minGapMs?: number;
  timeoutMs?: number;
}

/**
 * The newest `actionRequest` seen, which is not always the model's.
 *
 * The model is the source of truth at page load. But responses carry the token
 * too, and this module does not apply responses to the game — so if the server
 * ever does rotate it, the model's copy would go stale while ours stays
 * correct. Tracking it costs nothing and removes a whole failure mode where
 * requests are accepted, do nothing, and report no error.
 */
let latestToken: string | null = null;

let lastRequestAt = 0;

/**
 * The channel responses are announced on.
 *
 * A DOM event on `document`, NOT an array in this module — and that is the
 * whole point.
 *
 * THE TWO SCRIPTS DO NOT SHARE MODULES. Send Resources and Empire Overview are
 * separate bundles (two userscripts, two extension entry points), so each ships
 * its OWN copy of this file. Empire Overview subscribes here; Send Resources is
 * the only thing that calls `fetchTown`. With a module-level handler array the
 * subscriber and the caller sat in different copies and never met: a scan
 * fetched all nine towns and the board learned nothing, which is why the towns
 * had to be walked by hand afterwards.
 *
 * `document` is the one thing both bundles genuinely share — both run in the
 * page context (`@grant none` for the userscripts, a page-world injection for
 * the extension), so the event and its payload cross between them intact.
 */
const RESPONSE_EVENT = "ika:ajaxResponse";

/** Listeners this module added, so `clearResponseHandlers` can take them off. */
const listeners: Array<(event: Event) => void> = [];

/**
 * Be told about every response, including ones fetched by the OTHER script.
 * Empire Overview registers here so its database updates from a fetched town
 * exactly as it would from a clicked one.
 *
 * Returns a function that unregisters.
 */
export function onResponse(handler: (entries: unknown[]) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!Array.isArray(detail)) return;
    try {
      handler(detail);
    } catch {
      // Isolated here rather than left to the DOM. A browser reports a
      // throwing listener and carries on to the next one, but happy-dom stops
      // the whole dispatch — and this guarantee is the difference between one
      // broken subscriber and a scan that silently updates nothing.
    }
  };
  listeners.push(listener);
  document.addEventListener(RESPONSE_EVENT, listener);

  return () => {
    document.removeEventListener(RESPONSE_EVENT, listener);
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/** Drop every handler this copy of the module registered. For tests. */
export function clearResponseHandlers(): void {
  for (const listener of listeners) {
    document.removeEventListener(RESPONSE_EVENT, listener);
  }
  listeners.length = 0;
}

/**
 * Announce a response to whoever is listening, in either script.
 *
 * A listener that throws stops neither the others nor the request: each
 * subscriber is wrapped in its own try/catch when it registers.
 */
function publishResponse(entries: unknown[]): void {
  try {
    document.dispatchEvent(
      new CustomEvent(RESPONSE_EVENT, { detail: entries }),
    );
  } catch {
    // No document, or events are unavailable. The caller still gets its data.
  }
}

/** The token to send, newest first. `null` when the game has not loaded. */
export function actionRequestToken(): string | null {
  const model = (pageWindow.ikariam as { model?: { actionRequest?: unknown } })
    ?.model;
  const fromModel =
    typeof model?.actionRequest === "string" ? model.actionRequest : null;
  return latestToken ?? fromModel;
}

/** Forget the tracked token. For tests. */
export function resetHttpState(): void {
  latestToken = null;
  lastRequestAt = 0;
}

/**
 * Pick up a rotated token, if the response carried one.
 *
 * The probe found it under `updateGlobalData` -> `actionRequest`, alongside
 * `headerData` and `backgroundData`.
 */
function absorbToken(entries: unknown[]): void {
  for (const entry of entries) {
    if (!Array.isArray(entry)) continue;
    const payload = entry[1] as { actionRequest?: unknown } | null | undefined;
    if (payload && typeof payload.actionRequest === "string") {
      latestToken = payload.actionRequest;
      return;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One request to the game, returning the parsed response array.
 *
 * Throws when the game is not loaded, the request fails, or the body is not a
 * JSON array — a caller that gets a value back can rely on it being one.
 */
export async function ikariamRequest(
  params: Record<string, string | number>,
  options: RequestOptions = {},
): Promise<unknown[]> {
  const token = actionRequestToken();
  if (!token) {
    throw new Error("No actionRequest available - the game has not loaded");
  }

  // Spacing requests out is deliberate. This is game automation; a burst is
  // more conspicuous than clicking, and there is nothing to gain from it.
  const gap = options.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const since = Date.now() - lastRequestAt;
  if (lastRequestAt !== 0 && since < gap) await sleep(gap - since);
  lastRequestAt = Date.now();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }
  query.set("actionRequest", token);
  query.set("ajax", "1");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let text: string;
  try {
    const response = await fetch("/index.php?" + query.toString(), {
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ikariam request failed with HTTP ${response.status}`);
    }
    // Not checked against `Content-Type`: the game answers `text/html` while
    // sending JSON. Measured, not assumed.
    text = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Ikariam returned ${text.length} bytes that are not JSON - ` +
        `session expired, or this is a login page`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Ikariam returned JSON that is not a response array");
  }

  absorbToken(parsed);

  publishResponse(parsed);

  return parsed;
}

/**
 * Load one town's data.
 *
 * `position: 0` is the Town Hall, which is what IkaEasy asks for: it is the
 * view whose response carries the full background data for the town.
 */
export function fetchTown(
  cityId: number | string,
  options?: RequestOptions,
): Promise<unknown[]> {
  return ikariamRequest(
    {
      view: "townHall",
      cityId,
      position: 0,
      backgroundView: "city",
      currentCityId: cityId,
    },
    options,
  );
}
