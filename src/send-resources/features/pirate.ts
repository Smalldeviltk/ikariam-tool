/**
 * Pirate — send the crew of one town's Pirate Fortress on a capture run, over
 * and over, while the game is open.
 *
 * The capture goes out as the request the fortress's own Capture button sends
 * (measured on s303, 05/11): `action=PiracyScreen&function=capture&
 * buildingLevel=<level>&view=pirateFortress&cityId=<id>&position=<slot>`.
 * Nothing on screen changes and no town is switched. The answer is the
 * fortress view; its `updateTemplateData.load_js.params` — a JSON string —
 * says whether a mission is under way and for how long:
 * `hasOngoingMission: true, ongoingMissionTimeRemaining: 150` right after a
 * level-1 capture, `hasOngoingMission: false` once the crew is back.
 *
 * A capture counts as done when the answer shows a mission under way, whoever
 * started it and whatever its kind — a capture by hand, a raid, or this
 * script's own request answered after a reload all mean the same: wait. The
 * next one goes out when that mission is over plus `PIRATE_MARGIN_MS`.
 *
 * The game sometimes asks for a security word instead (at random, the
 * player says): the answer's fortress view holds a captcha form in place of
 * the capture table (`answerAsksForCaptcha`). Trying again cannot get past
 * it, so Pirate sends a desktop notice at once, stops, and opens the
 * fortress on screen; the player types the word in, presses Capture there,
 * and presses Start Pirate again. Until then the task queue and the
 * keep-alive reload wait (`isPirateCaptchaPending`), or the next task would
 * replace the form. Nothing here reads or answers the word.
 *
 * Anything else is a failure: an answer without a mission, or a request that
 * failed. It is tried again every `PIRATE_RETRY_MS`; after
 * `PIRATE_GIVE_UP_MS` of failures, Pirate sends the notice and stops. What
 * the failed answers held is kept (`pirateCaptureTraces`), cut down, for
 * Crawl and Bug Report.
 *
 * The schedule lives in the account store, so it carries on across the page
 * loads that town switches and the keep-alive cause.
 */

import { errorMessage, parseGameNumber } from "@core/format";
import { pageWindow } from "@core/ikariam/globals";
import {
  actionRequestToken,
  ikariamRequest,
  redactTokens,
  responseFeedback,
  toolNewestToken,
} from "@core/ikariam/http";
import { logInfo } from "@core/logger";
import { notify } from "@core/notifications";
import { empireKeyPrefix } from "@core/storage";
import { TabLock } from "@core/task-queue";
import { showToast } from "@core/ui/window";
import { PIRATE } from "../messages";
import { getTownList, isTownSwitchInFlight, townCityId } from "../navigation";
import { getState } from "../state";

/** The town and capture level Settings chose. */
export interface PirateSettings {
  cityId: string;
  /** The fortress's slot in the town. */
  position: number;
  /** The capture's `buildingLevel`: 1, 3, 5, … 17. */
  level: number;
}

export const PIRATE_SETTINGS_KEY = "ikaPirateSettings";
/** Whether Pirate runs, when it sends next, and since when it fails. */
export const PIRATE_RUN_KEY = "ikaPirateRun";
/** The last few failed captures' answers, cut down and without tokens. */
export const PIRATE_CAPTURE_TRACE_KEY = "ikaPirateCaptureTrace";

/** Waited past the end of a mission before the next capture. */
export const PIRATE_MARGIN_MS = 10_000;
/** Between two tries while captures fail. */
export const PIRATE_RETRY_MS = 10_000;
/** Failing this long sends the notice and stops Pirate. */
export const PIRATE_GIVE_UP_MS = 30_000;
/** Waited while a town switch of the queue is landing (see `tick`). */
const PIRATE_SWITCH_HOLD_MS = 5_000;
/** The fortress's slot, measured on s303 (05/11), when the board has none. */
export const PIRATE_FORTRESS_POSITION = 17;
/** The capture level used until Settings picks one. */
export const PIRATE_DEFAULT_LEVEL = 1;

const TRACE_LIMIT = 3;
/** Per part of a trace; the whole answer is ~130 KB of mostly HTML. */
const TRACE_PART_CHARS = 2_000;

interface PirateRun {
  running: boolean;
  /** Epoch ms of the next capture. */
  nextAt: number;
  /** Epoch ms of the first failure in a row; null while captures work. */
  failingSince: number | null;
  /**
   * The game asked for the security word: the task queue waits, so the
   * fortress opened for the player stays on screen, until Start Pirate.
   */
  captchaPending?: boolean;
}

/** One row of the fortress's capture table, from the game's own params. */
export interface CaptureLevel {
  buildingLevel: number;
  durationSeconds: number;
  name: string;
  gold: number;
  capturePoints: number;
}

/** What the fortress view says, read from `load_js.params`. */
export interface FortressView {
  /** The fortress's level, which decides the capture levels open to it. */
  fortressLevel: number | null;
  levels: CaptureLevel[];
  /** A raid or capture under way, or null when the crew is home. */
  ongoingMission: {
    type: string | null;
    secondsLeft: number;
    level: number | null;
  } | null;
  capturePoints: number | null;
}

/** The parsed `load_js.params` of the fortress view, or null. */
function fortressParams(
  entries: readonly unknown[],
): Record<string, unknown> | null {
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry[0] !== "updateTemplateData") continue;
    const params = (entry[1] as { load_js?: { params?: unknown } } | null)
      ?.load_js?.params;
    if (typeof params !== "string") continue;
    try {
      const parsed: unknown = JSON.parse(params);
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { view?: unknown }).view === "pirateFortress"
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not the fortress's params.
    }
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return value !== undefined && value !== null && Number.isFinite(number)
    ? number
    : null;
}

/**
 * The fortress view in a response, or null when the response holds none —
 * a town without a fortress, or an answer that is something else (a
 * captcha, perhaps).
 */
export function readFortressView(
  entries: readonly unknown[],
): FortressView | null {
  const params = fortressParams(entries);
  if (!params) return null;
  const levels = Array.isArray(params.pirateCaptureLevels)
    ? params.pirateCaptureLevels.flatMap((row: unknown) => {
        const level = row as Record<string, unknown> | null;
        const buildingLevel = numberOrNull(level?.buildingLevel);
        const durationSeconds = numberOrNull(level?.duration);
        if (buildingLevel === null || durationSeconds === null) return [];
        return [
          {
            buildingLevel,
            durationSeconds,
            name: typeof level?.name === "string" ? level.name : "",
            gold: numberOrNull(level?.gold) ?? 0,
            capturePoints: numberOrNull(level?.capturePoints) ?? 0,
          },
        ];
      })
    : [];
  return {
    fortressLevel: numberOrNull(params.buildingLevel),
    levels,
    ongoingMission:
      params.hasOngoingMission === true
        ? {
            type:
              typeof params.ongoingMissionType === "string"
                ? params.ongoingMissionType
                : null,
            secondsLeft: Math.max(
              0,
              numberOrNull(params.ongoingMissionTimeRemaining) ?? 0,
            ),
            level: numberOrNull(params.ongoingMissionLevel),
          }
        : null,
    capturePoints: readHeaderCapturePoints(entries),
  };
}

/**
 * The capture points in the fortress view's header — `.pirateHeader
 * li.capturePoints .value`, as the game prints them ("1,035") — or null when
 * the answer has no such header. The header is there with the captcha form
 * too (seen in the HTML the player pasted, 05/11).
 */
export function readHeaderCapturePoints(
  entries: readonly unknown[],
): number | null {
  const view = entryOf(entries, "changeView");
  const html = Array.isArray(view) ? view[1] : null;
  if (typeof html !== "string" || !html.includes("pirateHeader")) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return parseGameNumber(
    doc.querySelector(".pirateHeader li.capturePoints .value")?.textContent,
  );
}

/** The capture levels a fortress of `fortressLevel` may send. */
export function openCaptureLevels(view: FortressView): CaptureLevel[] {
  const level = view.fortressLevel ?? 0;
  return view.levels.filter((row) => row.buildingLevel <= level);
}

/* ───────────────────────── Towns with a fortress ───────────────────────── */

export interface FortressTown {
  cityId: string;
  position: number;
  /** As the board last saw it; 0 when it did not say. */
  level: number;
}

/**
 * Towns with a Pirate Fortress, as the Empire Overview board saved them
 * (`***<account>***cities`, each city's `_buildings[]` with `_name`,
 * `_position`, `_level`). Empty when the board saved nothing.
 */
export function storedFortressTowns(accountName: string): FortressTown[] {
  let cities: unknown;
  try {
    cities = JSON.parse(
      localStorage.getItem(empireKeyPrefix(accountName) + "cities") ?? "null",
    );
  } catch {
    return [];
  }
  if (!cities || typeof cities !== "object") return [];
  const towns: FortressTown[] = [];
  for (const [cityId, city] of Object.entries(cities)) {
    const buildings = (city as { _buildings?: unknown } | null)?._buildings;
    if (!Array.isArray(buildings)) continue;
    const fortress = buildings.find(
      (building) =>
        (building as { _name?: unknown } | null)?._name === "pirateFortress",
    ) as { _position?: unknown; _level?: unknown } | undefined;
    if (!fortress) continue;
    towns.push({
      cityId,
      position: numberOrNull(fortress._position) ?? PIRATE_FORTRESS_POSITION,
      level: numberOrNull(fortress._level) ?? 0,
    });
  }
  return towns;
}

/** The town's name for a city id, from the town list; the id when unknown. */
export function townNameOfCity(cityId: string): string {
  const town = getTownList().find(
    (entry) => townCityId(entry.townNumber) === cityId,
  );
  return town?.townName.trim() ?? cityId;
}

/* ─────────────────────────────── Settings ──────────────────────────────── */

export function loadPirateSettings(): PirateSettings | null {
  const saved = getState().account.getJSON<PirateSettings | null>(
    PIRATE_SETTINGS_KEY,
    null,
  );
  return saved && typeof saved.cityId === "string" ? saved : null;
}

export function savePirateSettings(settings: PirateSettings): void {
  getState().account.setJSON(PIRATE_SETTINGS_KEY, settings);
}

/**
 * The saved settings, or the first town the board knows has a fortress at
 * capture level 1; null when there is neither.
 */
export function pirateSettingsOrDefault(): PirateSettings | null {
  const saved = loadPirateSettings();
  if (saved) return saved;
  const [first] = storedFortressTowns(getState().accountName);
  return first
    ? {
        cityId: first.cityId,
        position: first.position,
        level: PIRATE_DEFAULT_LEVEL,
      }
    : null;
}

/** The fortress's slot in a town: the board's, else the measured one. */
export function fortressPosition(cityId: string): number {
  return (
    storedFortressTowns(getState().accountName).find(
      (town) => town.cityId === cityId,
    )?.position ?? PIRATE_FORTRESS_POSITION
  );
}

/* ─────────────────────────────── Requests ──────────────────────────────── */

/** The fortress view of a town, or null when the answer holds none. */
export async function fetchFortressView(
  cityId: string,
  position: number,
): Promise<FortressView | null> {
  const entries = await ikariamRequest({
    view: "pirateFortress",
    cityId,
    position,
    activeTab: "tabBootyQuest",
    backgroundView: "city",
    currentCityId: cityId,
    templateView: "pirateFortress",
  });
  recordCapturePoints(readHeaderCapturePoints(entries));
  const view = readFortressView(entries);
  return view;
}

/** The account's capture points as a fortress view last showed them. */
export const PIRATE_CAPTURE_POINTS_KEY = "ikaPirateCapturePoints";

export interface PirateCapturePoints {
  points: number;
  /** Epoch ms of the answer that showed them. */
  at: number;
}

export function lastCapturePoints(): PirateCapturePoints | null {
  const saved = getState().account.getJSON<PirateCapturePoints | null>(
    PIRATE_CAPTURE_POINTS_KEY,
    null,
  );
  return saved && typeof saved.points === "number" ? saved : null;
}

/**
 * Keep the capture points a fortress view's header showed, for the panel.
 * The answer to a capture shows them as they were before it: measured on
 * s303 (05/11), the idle view and the answer to the next capture both read
 * 345 — the points come in when a run ends, not when it starts.
 */
function recordCapturePoints(points: number | null): void {
  if (points === null) return;
  getState().account.setJSON(PIRATE_CAPTURE_POINTS_KEY, {
    points,
    at: Date.now(),
  });
  onStateChange?.();
}

/** What one capture request came to. */
export type CaptureOutcome =
  | { kind: "underWay"; secondsLeft: number; missionType: string | null }
  | { kind: "captcha" }
  | { kind: "failed"; reason: string };

/**
 * Whether the answer asks for the security word. Measured 05/11 on the
 * fortress view itself: the capture table is replaced by a form holding
 * `<input type="hidden" name="captchaNeeded" value="1">`, the picture
 * (`#js_captchaImage`, a PNG as a `data:` URI) and the field `#captcha`.
 * Every string in the answer that names it is read as HTML.
 */
export function answerAsksForCaptcha(value: unknown): boolean {
  if (typeof value === "string") {
    if (!value.includes("captchaNeeded")) return false;
    const doc = new DOMParser().parseFromString(value, "text/html");
    return doc.querySelector('input[name="captchaNeeded"][value="1"]') !== null;
  }
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(answerAsksForCaptcha);
}

export interface PirateCaptureTrace {
  at: string;
  cityId: string;
  level: number;
  reason: string;
  /** The answer's entry names, in order. */
  entries: string[] | null;
  feedback: string | null;
  popupData: string | null;
  /** The capture box of the answer's view, HTML cut short. */
  captureBox: string | null;
}

export function pirateCaptureTraces(): PirateCaptureTrace[] {
  return getState().account.getJSON<PirateCaptureTrace[]>(
    PIRATE_CAPTURE_TRACE_KEY,
    [],
  );
}

/**
 * Every session token a trace could hold: the answer's own, the page's and
 * the tool's newest. Named one by one, because a token in a form field
 * (`name="actionRequest" value="…"`) has no pattern to find it by.
 */
function knownTokens(entries: readonly unknown[] | null): Set<string> {
  const tokens = new Set<string>();
  const answered = entries
    ? (entryOf(entries, "updateGlobalData") as { actionRequest?: unknown })
        ?.actionRequest
    : null;
  for (const token of [answered, actionRequestToken(), toolNewestToken()]) {
    if (typeof token === "string" && token) tokens.add(token);
  }
  return tokens;
}

/** Text cut to a trace part, with every session token taken out. */
function tracePart(text: string, tokens: ReadonlySet<string>): string {
  return redactTokens(text, tokens)
    .replace(EMBEDDED_IMAGE, "data:image;base64,<image>")
    .slice(0, TRACE_PART_CHARS);
}

/** A picture inlined as a `data:` URI — the captcha's is ~10 KB of it. */
const EMBEDDED_IMAGE = /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/g;

function entryOf(entries: readonly unknown[], name: string): unknown {
  const entry = entries.find(
    (candidate) => Array.isArray(candidate) && candidate[0] === name,
  );
  return Array.isArray(entry) ? entry[1] : undefined;
}

/** The capture box in the answer's `changeView` HTML, or null. */
function captureBoxHtml(entries: readonly unknown[]): string | null {
  const view = entryOf(entries, "changeView");
  const html = Array.isArray(view) ? view[1] : null;
  if (typeof html !== "string") return null;
  const start = html.indexOf('id="pirateCaptureBox"');
  return start < 0 ? null : html.slice(start).replace(/\s+/g, " ");
}

function recordFailedCapture(
  settings: PirateSettings,
  reason: string,
  entries: readonly unknown[] | null,
): void {
  const tokens = knownTokens(entries);
  const feedback = entries ? responseFeedback(entries) : null;
  const popup = entries ? entryOf(entries, "popupData") : undefined;
  const box = entries ? captureBoxHtml(entries) : null;
  const trace: PirateCaptureTrace = {
    at: new Date().toISOString(),
    cityId: settings.cityId,
    level: settings.level,
    reason: tracePart(reason, tokens),
    entries: entries
      ? entries.map((entry) =>
          Array.isArray(entry) ? String(entry[0]) : typeof entry,
        )
      : null,
    feedback: feedback
      ? tracePart(`type ${feedback.type}: ${feedback.text ?? ""}`, tokens)
      : null,
    popupData:
      popup === undefined || popup === null
        ? null
        : tracePart(JSON.stringify(popup), tokens),
    captureBox: box === null ? null : tracePart(box, tokens),
  };
  try {
    getState().account.setJSON(
      PIRATE_CAPTURE_TRACE_KEY,
      [...pirateCaptureTraces(), trace].slice(-TRACE_LIMIT),
    );
  } catch {
    // A full storage must not stop Pirate.
  }
}

/** Send one capture and read what the game made of it. */
export async function sendCapture(
  settings: PirateSettings,
): Promise<CaptureOutcome> {
  let entries: unknown[];
  try {
    entries = await ikariamRequest({
      action: "PiracyScreen",
      function: "capture",
      buildingLevel: settings.level,
      view: "pirateFortress",
      cityId: settings.cityId,
      position: settings.position,
      activeTab: "tabBootyQuest",
      backgroundView: "city",
      currentCityId: settings.cityId,
      templateView: "pirateFortress",
    });
  } catch (e) {
    const reason = errorMessage(e);
    recordFailedCapture(settings, reason, null);
    return { kind: "failed", reason };
  }
  recordCapturePoints(readHeaderCapturePoints(entries));
  const view = readFortressView(entries);
  const mission = view?.ongoingMission;
  if (mission) {
    return {
      kind: "underWay",
      secondsLeft: mission.secondsLeft,
      missionType: mission.type,
    };
  }
  if (answerAsksForCaptcha(entries)) {
    recordFailedCapture(settings, PIRATE.captchaReason, entries);
    return { kind: "captcha" };
  }
  const feedback = responseFeedback(entries);
  const reason = feedback?.text ?? PIRATE.noMissionStarted;
  recordFailedCapture(settings, reason, entries);
  return { kind: "failed", reason };
}

/* ─────────────────────────────── Schedule ──────────────────────────────── */

const STOPPED: PirateRun = { running: false, nextAt: 0, failingSince: null };

function readRun(): PirateRun {
  return getState().account.getJSON<PirateRun>(PIRATE_RUN_KEY, STOPPED);
}

function writeRun(run: PirateRun): void {
  getState().account.setJSON(PIRATE_RUN_KEY, run);
}

export function isPirateRunning(): boolean {
  return readRun().running;
}

/**
 * Whether Pirate stopped for the security word and Start Pirate has not been
 * pressed since: the task queue and the keep-alive reload wait meanwhile.
 * Kept in the account store, so a page load does not end the wait.
 */
export function isPirateCaptchaPending(): boolean {
  return readRun().captchaPending === true;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let lock: TabLock | null = null;
let onStateChange: (() => void) | null = null;
let captureInFlight = false;
let holdCheck: () => boolean = () => false;

/**
 * What else must not be under way when a capture goes out: the app passes
 * whether the task runner is in the middle of a task. A task opens a
 * building or a shipment form whose button carries the session token of
 * that moment, and a capture, being an action, moves the token.
 */
export function setPirateHoldCheck(check: () => boolean): void {
  holdCheck = check;
}

/** Whether a capture request is out, for the runner to wait on. */
export function isPirateCaptureInFlight(): boolean {
  return captureInFlight;
}

/**
 * Called whenever Pirate starts or stops, or reads the capture points, to
 * redraw its part of the panel.
 */
export function setPirateStateListener(listener: (() => void) | null): void {
  onStateChange = listener;
}

/**
 * The tab that sends the captures: one per account, so two open tabs do not
 * both capture. Granted at once where the browser has no lock API.
 */
function pirateLock(): TabLock {
  lock ??= new TabLock(
    `ika-pirate:${getState().accountName}`,
    undefined,
    (held) => {
      if (held) arm();
    },
  );
  return lock;
}

/** Set the timer for the next capture, when Pirate runs and this tab may. */
function arm(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  const run = readRun();
  if (!run.running || !pirateLock().isHeld) return;
  timer = setTimeout(() => void tick(), Math.max(0, run.nextAt - Date.now()));
}

/** One scheduled moment: send a capture, then decide when the next one is. */
async function tick(): Promise<void> {
  timer = null;
  const run = readRun();
  if (!run.running) return;
  const settings = pirateSettingsOrDefault();
  if (!settings) {
    stopPirate();
    return;
  }

  // A queue's town switch is landing, or a task is between opening a view
  // and clicking its button. A capture is an action, so it moves the session
  // token, and a switch or a click sent with the old token is refused as an
  // invalid action. Wait; this is not a failure.
  if (isTownSwitchInFlight() || holdCheck()) {
    writeRun({ ...run, nextAt: Date.now() + PIRATE_SWITCH_HOLD_MS });
    arm();
    return;
  }

  captureInFlight = true;
  let outcome: CaptureOutcome;
  try {
    outcome = await sendCapture(settings);
  } finally {
    captureInFlight = false;
  }
  // Stopped while the request was out.
  if (!readRun().running) return;
  const now = Date.now();

  if (outcome.kind === "underWay") {
    logInfo(
      `Pirate: ${outcome.missionType ?? "a mission"} under way from ` +
        `${townNameOfCity(settings.cityId)}, ${outcome.secondsLeft}s left; ` +
        `next capture (level ${settings.level}) in ` +
        `${outcome.secondsLeft + PIRATE_MARGIN_MS / 1000}s`,
    );
    writeRun({
      running: true,
      nextAt: now + outcome.secondsLeft * 1000 + PIRATE_MARGIN_MS,
      failingSince: null,
    });
    arm();
    return;
  }

  if (outcome.kind === "captcha") {
    // Trying again cannot get past it: say so now, stop, and put the form
    // in front of the player.
    const town = townNameOfCity(settings.cityId);
    logInfo(`Pirate: the game asks for the security word in ${town}; stopped`);
    notify({
      kind: "pirateCaptureFailed",
      key: `pirate:${getState().accountName}:captcha:${now}`,
      title: PIRATE.captchaNoticeTitle(town),
      body: PIRATE.captchaNoticeBody,
      happenedAt: now,
    });
    stopPirate({ captchaPending: true });
    showToast(PIRATE.captchaToast(town));
    openFortressWhenIdle(settings);
    return;
  }

  const failingSince = run.failingSince ?? now;
  logInfo(`Pirate: capture not started — ${outcome.reason}`);
  if (now - failingSince >= PIRATE_GIVE_UP_MS) {
    const town = townNameOfCity(settings.cityId);
    // Keyed by the failure's start: the same key is never shown twice, and
    // each stall is its own.
    notify({
      kind: "pirateCaptureFailed",
      key: `pirate:${getState().accountName}:${failingSince}`,
      title: PIRATE.failedNoticeTitle(town),
      body: PIRATE.failedNoticeBody(outcome.reason),
      happenedAt: now,
    });
    logInfo(
      `Pirate: no capture for ${Math.round((now - failingSince) / 1000)}s; ` +
        "stopped",
    );
    stopPirate();
    showToast(PIRATE.failedToast(outcome.reason));
    return;
  }
  writeRun({ running: true, nextAt: now + PIRATE_RETRY_MS, failingSince });
  arm();
}

/** Between two looks at whether the queue let go, before opening the fortress. */
const OPEN_FORTRESS_POLL_MS = 2_000;
/** Longest wait for the queue before opening the fortress is given up. */
const OPEN_FORTRESS_WAIT_MS = 60_000;

/**
 * Open the town's Pirate Fortress on screen with the game's own call, as a
 * click on the building does, so the security-word form is there to fill
 * in. Not while the queue is in a task or a town switch is landing: the
 * view would land in the middle of it. Given up after a minute of waiting.
 */
function openFortressWhenIdle(settings: PirateSettings, waited = 0): void {
  if (isTownSwitchInFlight() || holdCheck()) {
    if (waited >= OPEN_FORTRESS_WAIT_MS) {
      logInfo("Pirate: the queue stayed busy; Pirate Fortress not opened");
      return;
    }
    setTimeout(
      () => openFortressWhenIdle(settings, waited + OPEN_FORTRESS_POLL_MS),
      OPEN_FORTRESS_POLL_MS,
    );
    return;
  }
  const ajaxHandlerCall = (
    pageWindow as { ajaxHandlerCall?: (url: string) => void }
  ).ajaxHandlerCall;
  if (typeof ajaxHandlerCall !== "function") {
    logInfo("Pirate: the game's ajaxHandlerCall is not on this page");
    return;
  }
  ajaxHandlerCall(
    `?view=pirateFortress&activeTab=tabBootyQuest&cityId=${settings.cityId}` +
      `&position=${settings.position}`,
  );
}

/** Start sending captures now, from the saved or default settings. */
export function startPirate(): boolean {
  if (!pirateSettingsOrDefault()) return false;
  writeRun({ running: true, nextAt: Date.now(), failingSince: null });
  pirateLock().acquire();
  arm();
  onStateChange?.();
  return true;
}

/**
 * Stop sending captures. With `captchaPending`, the task queue is held too,
 * until Start Pirate.
 */
export function stopPirate(options: { captchaPending?: boolean } = {}): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  writeRun(
    options.captchaPending ? { ...STOPPED, captchaPending: true } : STOPPED,
  );
  lock?.release();
  onStateChange?.();
}

/** On page load: carry on with a run saved by an earlier page. */
export function resumePirate(): void {
  if (!readRun().running) return;
  pirateLock().acquire();
  arm();
}

/** Forget the timer, the lock and the hooks; for tests. */
export function resetPirateForTests(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  lock?.release();
  lock = null;
  onStateChange = null;
  captureInFlight = false;
  holdCheck = () => false;
}
