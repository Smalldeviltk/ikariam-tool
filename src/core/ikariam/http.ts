/**
 * Ask the game's own endpoints for data, instead of driving its interface.
 *
 * WHY THIS EXISTS
 * Everything in these scripts used to get its data by navigating: click a town
 * in a dropdown, poll the breadcrumb until it changes, read the DOM. That is
 * slow, it moves the player's view around, and it fails in ways that are
 * invisible from outside the page: a view swapped out mid-read, a breadcrumb
 * that changed before the buildings did, a poll that never ends.
 *
 * The game already exposes the same data over a plain request. IkaEasy V4 uses
 * exactly this (`js/helper/httpClient.js:21`, `js/data/city.js:52`), and a
 * probe against the live game (`ikaTestAjaxFetch` in
 * `tools/collect-dom-report.js`) confirmed the shape before a line of this was
 * written. The plan's section on how IkaEasy loads data
 * (`docs/improvement-plan.md`) has the capture.
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

import { sleep } from "../async";
import { errorMessage } from "../format";
import { pageWindow } from "./globals";

/** Minimum gap between two requests. */
const DEFAULT_MIN_GAP_MS = 300;

/**
 * Give up on a request that has not answered by then. The same 15 s as
 * `waitFor`'s default, but named apart: this bounds one HTTP request, that
 * bounds a DOM poll.
 */
const REQUEST_TIMEOUT_MS = 15_000;

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
 * `document` is the one thing both bundles genuinely share. Send Resources
 * runs in the page (`@grant none`); Empire Overview runs in the userscript
 * manager's sandbox (`@grant unsafeWindow` and GM_* functions), which still
 * sees the page's own DOM; the extension injects both into the page world.
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
    options.timeoutMs ?? REQUEST_TIMEOUT_MS,
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

/** `provideFeedback` type the game sends when an action succeeded. */
export const SUCCESS_FEEDBACK_TYPE = 10;

/** The game's verdict on an action: its `provideFeedback` entry. */
export interface ResponseFeedback {
  type: number;
  /** The game's own words, as plain text; null when it gave none. */
  text: string | null;
}

/** Plain text of a fragment of the game's HTML. */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The `provideFeedback` entry of a response, or null when it has none:
 * `["provideFeedback", [{ type, text, ... }]]`, the shape the board already
 * reads after a shipment and after the game's own upgrade button.
 */
export function responseFeedback(
  entries: readonly unknown[],
): ResponseFeedback | null {
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry[0] !== "provideFeedback") continue;
    const first = Array.isArray(entry[1]) ? entry[1][0] : null;
    if (!first || typeof first !== "object") continue;
    const { type, text } = first as { type?: unknown; text?: unknown };
    return {
      type: Number(type),
      text: typeof text === "string" && text.trim() ? htmlToText(text) : null,
    };
  }
  return null;
}

/**
 * The upgrade button in a building view's response, or null. Searched for
 * anywhere in the response, as IkaEasy V4's `buildingUpgrade.js` does,
 * rather than at one fixed place in it.
 */
function findUpgradeButton(value: unknown): Element | null {
  if (typeof value === "string") {
    if (!value.includes("js_buildingUpgradeButton")) return null;
    const doc = new DOMParser().parseFromString(value, "text/html");
    return doc.querySelector("#js_buildingUpgradeButton");
  }
  if (!value || typeof value !== "object") return null;
  for (const child of Object.values(value)) {
    const button = findUpgradeButton(child);
    if (button) return button;
  }
  return null;
}

/**
 * The link of the upgrade button in a building view's response, or null
 * when the view has no live button (`href="#"` when the game will not
 * upgrade now).
 */
export function findUpgradeLink(value: unknown): string | null {
  const href = findUpgradeButton(value)?.getAttribute("href");
  return href && href !== "#" ? href : null;
}

/** What a quick upgrade came to. */
export interface UpgradeOutcome {
  started: boolean;
  /** Why not, in the game's words, when it said. */
  reason: string | null;
}

/**
 * The last few quick upgrades, newest last, with what the game answered.
 * Bug Report saves them: the answers to these two requests were never
 * captured on the live game before this was written, so the first runs are
 * how the parsing above gets checked.
 */
export const QUICK_UPGRADE_TRACE_KEY = "ikaQuickUpgradeTrace";
const QUICK_UPGRADE_TRACE_LIMIT = 5;
/** Per response; a building view is mostly its HTML. */
const TRACE_RESPONSE_CHARS = 20_000;

export interface QuickUpgradeTrace {
  at: string;
  cityId: string;
  buildingView: string;
  position: string;
  /** The first response, as JSON, cut at `TRACE_RESPONSE_CHARS`. */
  viewResponse: string | null;
  /** The upgrade button as the game sent it, whatever its link. */
  upgradeButton: string | null;
  upgradeLink: string | null;
  /** The second response, as JSON, cut at `TRACE_RESPONSE_CHARS`. */
  upgradeResponse: string | null;
  outcome: UpgradeOutcome | null;
  error: string | null;
}

export function quickUpgradeTraces(): QuickUpgradeTrace[] {
  try {
    const raw = localStorage.getItem(QUICK_UPGRADE_TRACE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function recordQuickUpgrade(trace: QuickUpgradeTrace): void {
  try {
    const list = [...quickUpgradeTraces(), trace].slice(
      -QUICK_UPGRADE_TRACE_LIMIT,
    );
    localStorage.setItem(QUICK_UPGRADE_TRACE_KEY, JSON.stringify(list));
  } catch {
    // A full storage must not fail the upgrade itself.
  }
}

/** What a trace holds in place of a session token. */
export const TOKEN_PLACEHOLDER = "<actionRequest>";

/**
 * A trace with every session token taken out. Bug Report saves the traces to
 * a file the player shares, and the token must not travel with it (the
 * crawler strips it for the same reason). Every token this run saw is
 * replaced wherever it appears — a JSON field, a link, a hidden form field —
 * and so is any value still written as `"actionRequest":"…"` or
 * `actionRequest=…`, in case the game sent one this run never read.
 */
function redactTokens(text: string, tokens: ReadonlySet<string>): string {
  let redacted = text;
  for (const token of tokens) {
    if (token) redacted = redacted.split(token).join(TOKEN_PLACEHOLDER);
  }
  return redacted
    .replace(/("actionRequest"\s*:\s*")[^"]*/g, `$1${TOKEN_PLACEHOLDER}`)
    .replace(/(actionRequest=)[^&"'\s\\]*/g, `$1${TOKEN_PLACEHOLDER}`);
}

function traceResponse(
  entries: unknown[],
  tokens: ReadonlySet<string>,
): string {
  // Taken out before cutting, so a token cannot survive split at the cut.
  return redactTokens(JSON.stringify(entries), tokens).slice(
    0,
    TRACE_RESPONSE_CHARS,
  );
}

/**
 * Start the next level of one building, without leaving the page.
 *
 * Two requests: the building's own view, then the link of the upgrade
 * button in it. The link is the game's, not one put together here: the
 * button now carries `function=upgradeBuilding`, where IkaEasy's older code
 * built `action=UpgradeExistingBuilding` by hand. Both responses reach the
 * board like any other (`onResponse`), but neither shows the building being
 * upgraded — the order's answer carries no town buildings — so the board
 * loads the town again itself once the upgrade has started. Each run is
 * recorded for Bug Report, whatever it came to, without the session token.
 */
export async function upgradeBuildingNow(
  cityId: number | string,
  buildingView: string,
  position: number | string,
  options?: RequestOptions,
): Promise<UpgradeOutcome> {
  const trace: QuickUpgradeTrace = {
    at: new Date().toISOString(),
    cityId: String(cityId),
    buildingView,
    position: String(position),
    viewResponse: null,
    upgradeButton: null,
    upgradeLink: null,
    upgradeResponse: null,
    outcome: null,
    error: null,
  };
  // Every token this run sends or is sent, to take out of the trace.
  const tokens = new Set<string>();
  const noteToken = () => {
    const token = actionRequestToken();
    if (token) tokens.add(token);
  };
  try {
    noteToken();
    const view = await ikariamRequest(
      {
        view: buildingView,
        cityId,
        position,
        backgroundView: "city",
        currentCityId: cityId,
      },
      options,
    );
    noteToken();
    const link = findUpgradeLink(view);
    const linkToken = link
      ? new URLSearchParams(link.slice(link.indexOf("?") + 1)).get(
          "actionRequest",
        )
      : null;
    if (linkToken) tokens.add(linkToken);
    trace.viewResponse = traceResponse(view, tokens);
    const button = findUpgradeButton(view)?.outerHTML;
    trace.upgradeButton = button ? redactTokens(button, tokens) : null;
    trace.upgradeLink = link ? redactTokens(link, tokens) : null;
    if (!link) {
      trace.outcome = {
        started: false,
        reason: responseFeedback(view)?.text ?? null,
      };
      return trace.outcome;
    }

    const params: Record<string, string> = {};
    new URLSearchParams(link.slice(link.indexOf("?") + 1)).forEach(
      (value, key) => {
        params[key] = value;
      },
    );
    // The link's own actionRequest and ajax are replaced by the request.
    const answer = await ikariamRequest(params, options);
    noteToken();
    trace.upgradeResponse = traceResponse(answer, tokens);
    const feedback = responseFeedback(answer);
    const started = feedback?.type === SUCCESS_FEEDBACK_TYPE;
    trace.outcome = {
      started,
      reason: started ? null : (feedback?.text ?? null),
    };
    return trace.outcome;
  } catch (e) {
    trace.error = redactTokens(errorMessage(e), tokens);
    throw e;
  } finally {
    recordQuickUpgrade(trace);
  }
}

/**
 * Sent on `document` when a refresh of every town starts and when it ends,
 * for the Empire Overview board's sync indicator. The same
 * channel as the responses above, for the same reason: the two scripts
 * share no module, only the page.
 */
export const SYNC_STARTED_EVENT = "ika:syncStarted";
export const SYNC_FINISHED_EVENT = "ika:syncFinished";

/** Tell the page a refresh of every town has started, or ended. */
export function announceSync(running: boolean): void {
  document.dispatchEvent(
    new CustomEvent(running ? SYNC_STARTED_EVENT : SYNC_FINISHED_EVENT),
  );
}

/**
 * Be told when a refresh of every town starts (`true`) and ends (`false`),
 * whichever script runs it. Returns a function that unregisters.
 */
export function onSyncChange(handler: (running: boolean) => void): () => void {
  const started = () => handler(true);
  const finished = () => handler(false);
  document.addEventListener(SYNC_STARTED_EVENT, started);
  document.addEventListener(SYNC_FINISHED_EVENT, finished);
  return () => {
    document.removeEventListener(SYNC_STARTED_EVENT, started);
    document.removeEventListener(SYNC_FINISHED_EVENT, finished);
  };
}
