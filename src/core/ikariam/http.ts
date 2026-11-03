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
 *
 * The one exception is the session token (`adoptToken`): an action of ours
 * moves it on the server, and the page's next request must carry the new one.
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
 * The newest `actionRequest` this copy of the module was answered with.
 *
 * The game's model is where the token is kept (`actionRequestToken`); this is
 * the fallback when the model cannot be read, and a tag in the diagnostics.
 * It is per copy: the two scripts each have one, and neither sees the
 * other's, which is why the token goes into the model as well.
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

/** The token in the game's own model — what the page's requests carry. */
export function pageModelToken(): string | null {
  const model = (pageWindow.ikariam as { model?: { actionRequest?: unknown } })
    ?.model;
  return typeof model?.actionRequest === "string" ? model.actionRequest : null;
}

/**
 * The token to send. `null` when the game has not loaded.
 *
 * The model's first: the page's own requests move it there, and so do both
 * scripts' (`adoptToken`). This copy's newest is only a fallback — after the
 * other script's action or the page's own, it is the old one, and the server
 * refuses an action sent with it.
 */
export function actionRequestToken(): string | null {
  return pageModelToken() ?? latestToken;
}

/**
 * Keep a token the server answered one of our requests with, and put it into
 * the game's model.
 *
 * An action moves the token on the server (measured: `UpgradeExistingBuilding`
 * and the notepad's save answer with a new one; a view answers with the same).
 * The page's next request carries the model's copy, and the server refuses an
 * old one: on 03/11, an "Upgrade now" on the board, then a town clicked on the
 * board, was answered "The last action was invalid" and the page stayed in
 * its town. The game puts every token it is answered with into the model
 * itself; this does the same for ours.
 */
function adoptToken(token: string): void {
  latestToken = token;
  const model = (pageWindow.ikariam as { model?: unknown } | undefined)?.model;
  if (model === null || typeof model !== "object") return;
  try {
    (model as { actionRequest?: unknown }).actionRequest = token;
  } catch {
    // A frozen or foreign model: the fallback above still has the token.
  }
}

/**
 * The newest token this module's own requests were answered with, or `null`
 * before the first one. Unlike `actionRequestToken`, never the model's.
 */
export function toolNewestToken(): string | null {
  return latestToken;
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
  const token = tokenInEntries(entries);
  if (token !== null) adoptToken(token);
}

/** The first `actionRequest` carried by a response array's entries. */
function tokenInEntries(entries: unknown[]): string | null {
  for (const entry of entries) {
    if (!Array.isArray(entry)) continue;
    const payload = entry[1] as { actionRequest?: unknown } | null | undefined;
    if (payload && typeof payload.actionRequest === "string") {
      return payload.actionRequest;
    }
  }
  return null;
}

/**
 * Wait out the gap since the previous request, then claim the slot.
 *
 * Spacing requests out is deliberate. This is game automation; a burst is
 * more conspicuous than clicking, and there is nothing to gain from it.
 */
async function waitForRequestSlot(options: RequestOptions): Promise<void> {
  const gap = options.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const since = Date.now() - lastRequestAt;
  if (lastRequestAt !== 0 && since < gap) await sleep(gap - since);
  lastRequestAt = Date.now();
}

/** Send one request and parse its body as JSON, within the timeout. */
async function fetchJson(
  url: string,
  init: RequestInit,
  options: RequestOptions,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );

  let text: string;
  try {
    const response = await fetch(url, {
      ...init,
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

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Ikariam returned ${text.length} bytes that are not JSON - ` +
        `session expired, or this is a login page`,
    );
  }
}

/** The token to send, or a throw when the game has not loaded. */
function requireToken(): string {
  const token = actionRequestToken();
  if (!token) {
    throw new Error("No actionRequest available - the game has not loaded");
  }
  return token;
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
  const token = requireToken();
  await waitForRequestSlot(options);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }
  query.set("actionRequest", token);
  query.set("ajax", "1");

  let parsed: unknown;
  try {
    parsed = await fetchJson("/index.php?" + query.toString(), {}, options);
  } catch (e) {
    recordToolRequest(params, token, null, errorMessage(e));
    throw e;
  }
  if (!Array.isArray(parsed)) {
    recordToolRequest(params, token, null, "not a response array");
    throw new Error("Ikariam returned JSON that is not a response array");
  }

  absorbToken(parsed);
  recordToolRequest(params, token, tokenInEntries(parsed), null);

  publishResponse(parsed);

  return parsed;
}

/**
 * One form POST to the game, returning the parsed response object.
 *
 * For the actions the game sends as a form rather than a link. Measured on
 * the notepad's save (29/10): the answer is an OBJECT,
 * `{"dataForJSCallback":[],"actionRequest":"<new token>"}`, not the usual
 * array, with the new token at its top level. `ikariamRequest` would throw on
 * it, and its token would be missed.
 *
 * Not announced through `onResponse`: subscribers expect the array shape.
 */
export async function postIkariamForm(
  query: Record<string, string>,
  form: Record<string, string>,
  options: RequestOptions = {},
): Promise<Record<string, unknown>> {
  const token = requireToken();
  await waitForRequestSlot(options);

  const body = new URLSearchParams(form);
  body.set("ajax", "1");
  body.set("actionRequest", token);

  let parsed: unknown;
  try {
    parsed = await fetchJson(
      "/index.php?" + new URLSearchParams(query).toString(),
      { method: "POST", body },
      options,
    );
  } catch (e) {
    recordToolRequest(query, token, null, errorMessage(e));
    throw e;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    recordToolRequest(query, token, null, "not a response object");
    throw new Error("Ikariam returned JSON that is not a response object");
  }
  const answer = parsed as Record<string, unknown>;
  if (typeof answer.actionRequest === "string") {
    adoptToken(answer.actionRequest);
  }
  recordToolRequest(
    query,
    token,
    typeof answer.actionRequest === "string" ? answer.actionRequest : null,
    null,
  );
  return answer;
}

/** Id of the text box of the game's notepad (`view=avatarNotes`). */
export const NOTES_BOX_ID = "js_notesMessages";

/**
 * The notepad's text inside a response, or `null` when no part of it holds
 * the notepad's box.
 *
 * Measured (29/10): the box is `#js_notesMessages`, and opening the notepad
 * sends `view=avatarNotes`. The response body itself was not captured, so
 * every string in it is searched for the box rather than one known entry.
 */
export function findNotesText(value: unknown): string | null {
  if (typeof value === "string") {
    if (!value.includes(NOTES_BOX_ID)) return null;
    const doc = new DOMParser().parseFromString(value, "text/html");
    const box = doc.getElementById(NOTES_BOX_ID);
    return box ? (box.textContent ?? "") : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNotesText(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    return findNotesText(Object.values(value));
  }
  return null;
}

/**
 * The text of the player's notepad.
 *
 * Throws when the response has no notepad in it: an empty string is a real
 * answer (an empty notepad), and mistaking a failed read for one would have
 * the queue sync delete every task another computer put there.
 */
export async function readAvatarNotes(
  options?: RequestOptions,
): Promise<string> {
  const entries = await ikariamRequest({ view: "avatarNotes" }, options);
  const text = findNotesText(entries);
  if (text === null) {
    throw new Error("The notepad response has no notepad text box");
  }
  return text;
}

/** Replace the text of the player's notepad. */
export async function saveAvatarNotes(
  text: string,
  options?: RequestOptions,
): Promise<void> {
  await postIkariamForm(
    { action: "Diplomacy", function: "saveAvatarNotes" },
    { notes: text },
    options,
  );
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
export function redactTokens(
  text: string,
  tokens: ReadonlySet<string>,
): string {
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
 * A short tag for a session token, so a trace can show whether two tokens are
 * the same without carrying either: a 32-bit FNV-1a hash in base 36. It cannot
 * be turned back into the token. `null` for no token.
 */
export function tokenTag(token: string | null | undefined): string | null {
  if (!token) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return "#" + hash.toString(36);
}

/** Read a JSON list from storage; anything unreadable is an empty list. */
function readTraceList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Append to a stored JSON list, keeping the newest `limit`. Never throws. */
function appendTraceList<T>(key: string, item: T, limit: number): void {
  try {
    const list = [...readTraceList<T>(key), item].slice(-limit);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // A full storage must not fail the request it records.
  }
}

/**
 * The last requests this module sent itself (Scan, the notepad), newest last,
 * one short line each: time, request, and tags of the token sent and the
 * token the answer carried — `08:03:08 view=townHall&cityId=297038 #a>#b`.
 * Kept for the town switches that sometimes do not land: the switch goes
 * through the game's form with the page's token, and these requests may have
 * moved the server on from it. Short on purpose; it lives in `localStorage`.
 */
export const TOOL_REQUEST_TRACE_KEY = "ikaToolRequestTrace";
const TOOL_REQUEST_TRACE_LIMIT = 10;
/** Cap on an error's words in a trace line. */
const TRACE_ERROR_CHARS = 60;

export function toolRequestTraces(): string[] {
  return readTraceList<string>(TOOL_REQUEST_TRACE_KEY);
}

const TRACED_PARAMS = ["view", "action", "function", "cityId"];

/** `HH:MM:SS` of now, in the browser's time zone, like the log. */
function clockTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

function recordToolRequest(
  params: Record<string, string | number>,
  sent: string,
  received: string | null,
  error: string | null,
): void {
  const request = TRACED_PARAMS.filter((name) => params[name] !== undefined)
    .map((name) => `${name}=${params[name]}`)
    .join("&");
  const outcome =
    error === null
      ? `${tokenTag(sent)}>${tokenTag(received) ?? "-"}`
      : `${tokenTag(sent)} failed: ` +
        redactTokens(error, new Set([sent])).slice(0, TRACE_ERROR_CHARS);
  appendTraceList<string>(
    TOOL_REQUEST_TRACE_KEY,
    `${clockTime()} ${request} ${outcome}`,
    TOOL_REQUEST_TRACE_LIMIT,
  );
}

/**
 * The last town switches that did not land, newest last — only the main
 * facts, kept small. The log keeps 200 lines and an Auto Build lap writes
 * several a minute, so the lines of a failure an hour old are gone by the
 * time Bug Report is pressed (02/11); these are not.
 */
export const TOWN_SWITCH_TRACE_KEY = "ikaTownSwitchTrace";
const TOWN_SWITCH_TRACE_LIMIT = 5;
/** How many of the tool's requests go with each switch trace. */
const SWITCH_TRACE_TOOL_REQUESTS = 5;

export interface TownSwitchTrace {
  at: string;
  /** What went wrong: an answer without reload, a timeout, a wrong landing. */
  kind: string;
  /** The town the switch was for. */
  target: string;
  /** The town the page was in when this was written. */
  pageTown: string | null;
  /** The server's answer in one line (entry names, reload, feedback). */
  answer: string | null;
  /** Tags: in the switch request, in the game's model, the tool's newest. */
  tokens: string;
  /** The tool's own requests just before. */
  toolRequests: string[];
}

export function townSwitchTraces(): TownSwitchTrace[] {
  return readTraceList<TownSwitchTrace>(TOWN_SWITCH_TRACE_KEY);
}

/**
 * Record a town switch that did not land. `answer` is the one-line summary
 * the log gets, already free of tokens; `sentToken` is raw and only tagged.
 */
export function recordTownSwitch(details: {
  kind: string;
  target: string;
  pageTown: string | null;
  answer: string | null;
  sentToken: string | null;
}): void {
  appendTraceList<TownSwitchTrace>(
    TOWN_SWITCH_TRACE_KEY,
    {
      at: new Date().toISOString(),
      kind: details.kind,
      target: details.target,
      pageTown: details.pageTown,
      answer: details.answer,
      tokens:
        `sent ${tokenTag(details.sentToken) ?? "-"}, ` +
        `page ${tokenTag(pageModelToken()) ?? "-"}, ` +
        `tool ${tokenTag(latestToken) ?? "-"}`,
      toolRequests: toolRequestTraces().slice(-SWITCH_TRACE_TOOL_REQUESTS),
    },
    TOWN_SWITCH_TRACE_LIMIT,
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
