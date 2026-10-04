/**
 * Application-specific diagnostics for the bug reporter.
 *
 * `core/bug-report.ts` knows nothing about queues, towns or selectors — it just
 * asks registered providers for context when something goes wrong. This is that
 * provider, plus a selector health check.
 *
 * The context recorded here is chosen from what actually turned out to matter
 * while debugging this codebase: which task was running, whether the game model
 * was readable, which view the page was on, and whether the selectors the
 * feature depends on were matching anything at all. "Nothing happened" is almost
 * always one of those four.
 */

import {
  buildBugReport,
  clearBugs,
  getBugs,
  registerContextProvider,
  summariseBugs,
} from "@core/bug-report";
import { qs, qsa } from "@core/dom";
import { errorMessage } from "@core/format";
import { getCurrentTownName, pageWindow } from "@core/ikariam/globals";
import { quickUpgradeTraces } from "@core/ikariam/http";
import { recentLogLines } from "@core/logger";
import { hasModel, modelCurrentCityName } from "@core/ikariam/model";
import { DIALOG_ID, SEL } from "@core/ikariam/selectors";
import { getState } from "./state";
import { LAUNCHER_CLASS, WINDOW_ID } from "./ui/panel";

/**
 * Selectors whose absence explains a whole class of "it did nothing".
 *
 * Deliberately a small set: this is probed on every bug, so it has to stay
 * cheap, and a long list of selectors that are legitimately absent on the
 * current screen would only add noise.
 */
const CRITICAL_SELECTORS: Record<string, string> = {
  cityBread: SEL.cityBread,
  townList: SEL.townListContainer,
  // Belongs to the Empire Overview script, not the game. Its absence is the
  // reason town switching used to be impossible with Send Resources alone.
  buildTabTownNames: SEL.buildTabTownNames,
  freeTransporters: SEL.globalMenu.freeTransporters,
};

/** How many of the critical selectors currently match. */
export function selectorHealth(): Record<string, number> {
  const health: Record<string, number> = {};
  for (const [name, selector] of Object.entries(CRITICAL_SELECTORS)) {
    try {
      health[name] = qsa(selector).length;
    } catch {
      health[name] = -1; // the selector itself is malformed
    }
  }
  return health;
}

/** Everything worth attaching to a bug record. */
function appContext(): Record<string, unknown> {
  const context: Record<string, unknown> = {
    town: getCurrentTownName() || null,
    modelTown: modelCurrentCityName(),
    hasModel: hasModel(),
    selectors: selectorHealth(),
    dialogOpen: !!qs(`#${DIALOG_ID}`),
  };

  // State may not exist yet — errors can fire before `initState`.
  try {
    const { accountName, queue } = getState();
    const head = queue.head();
    context.account = accountName;
    context.queueLength = queue.length;
    context.queueHead = head
      ? { type: head.type, id: head.id, data: head.data }
      : null;
  } catch {
    context.stateInitialised = false;
  }

  return context;
}

/** Characters kept of each captured piece of game markup or source. */
const MAX_CAPTURE_CHARS = 20_000;
/** Log lines a report carries, newest first. */
const MAX_REPORT_LOG_LINES = 200;
/** Visible controls listed from the shipment screen. */
const MAX_CAPTURED_CONTROLS = 200;
/** Characters kept of each control's text. */
const MAX_CONTROL_TEXT = 40;
/** What counts as a control on the shipment screen. */
const SHIPMENT_CONTROLS =
  "form, input, select, button, a.button, [id^=slider], [id*=submit]";
/**
 * This script's own controls — its window, its launcher, its settings
 * dialogs — left out of the capture: with the window open they were most of
 * the list (03/10), and none of them is the game's.
 */
const OWN_CONTROLS = `#${WINDOW_ID}, .${LAUNCHER_CLASS}, #${DIALOG_ID}`;

/**
 * The shipment screen as the game draws it today — what the shipment handler
 * fills in, so a report shows whether the game has changed it. Only on screen
 * after "Transport goods" was clicked; otherwise `present` is false.
 *
 * The form around the wine field, and every control of the game's that is
 * showing.
 */
function captureShipmentForm(): Record<string, unknown> {
  const wineField = qs<HTMLInputElement>(SEL.wineField);
  const controls = qsa<HTMLElement>(SHIPMENT_CONTROLS)
    .filter(
      (element) =>
        element.offsetParent !== null && !element.closest(OWN_CONTROLS),
    )
    .slice(0, MAX_CAPTURED_CONTROLS)
    .map((element) => {
      const field = element as HTMLInputElement;
      return {
        tag: element.tagName,
        id: element.id,
        name: element.getAttribute("name"),
        cls: String(element.className).slice(0, 80),
        type: field.type,
        value: field.value,
        text: (element.textContent ?? "").trim().slice(0, MAX_CONTROL_TEXT),
        form: field.form?.id,
      };
    });
  return {
    present: !!wineField,
    url: location.search,
    wineFieldForm:
      wineField?.form?.outerHTML.slice(0, MAX_CAPTURE_CHARS) ?? null,
    visibleControls: controls,
  };
}

/**
 * The game's `createPopup`. Its parameters were named from this capture
 * (03/10, `IkariamPageApi` in `core/ikariam/globals.ts`); kept, because the
 * game can change it again. Neither script wraps it, so the source read here
 * is the game's own.
 */
function captureCreatePopupSource(): string | null {
  const popup = (
    pageWindow as unknown as { ikariam?: { createPopup?: unknown } }
  ).ikariam?.createPopup;
  return typeof popup === "function"
    ? String(popup).slice(0, MAX_CAPTURE_CHARS)
    : null;
}

/**
 * Data read from the game itself, from the page as it is when Bug Report is
 * pressed. Each piece is caught on its own, so one that fails
 * cannot take the rest of the report with it.
 */
export function captureGameData(): Record<string, unknown> {
  const capture = (read: () => unknown) => {
    try {
      return read();
    } catch (e) {
      return { error: errorMessage(e) };
    }
  };
  return {
    shipmentForm: capture(captureShipmentForm),
    createPopupSource: capture(captureCreatePopupSource),
    // What the game answered the board's quick upgrades.
    quickUpgrades: capture(quickUpgradeTraces),
  };
}

export interface FullBugReport {
  /** The bug report plus `gameData` and the recent log, as JSON. */
  text: string;
  /** Whether the shipment form was on screen and is in `text`. */
  shipmentFormCaptured: boolean;
  /** Whether the game's `createPopup` source is in `text`. */
  createPopupCaptured: boolean;
  /** How many quick upgrades, with the game's answers, are in `text`. */
  quickUpgradesCaptured: number;
}

/**
 * The bug report, plus the game data above and the newest log lines — what
 * Bug Report saves — and which of the game data was actually there, so the
 * player can be told.
 *
 * The log is what a bug record cannot show: the order things happened in
 * across page loads (`Going to town …`, `Back to the town view: …`, reloads).
 * Two reports of a town switch that never landed (03/10) could not be
 * explained without it.
 */
export function exportFullBugReport(): FullBugReport {
  const gameData = captureGameData();
  const shipmentForm = gameData.shipmentForm as { present?: unknown };
  const log = recentLogLines(MAX_REPORT_LOG_LINES);
  return {
    text: JSON.stringify({ ...buildBugReport(), gameData, log }, null, 2),
    shipmentFormCaptured: shipmentForm?.present === true,
    createPopupCaptured: typeof gameData.createPopupSource === "string",
    quickUpgradesCaptured: Array.isArray(gameData.quickUpgrades)
      ? gameData.quickUpgrades.length
      : 0,
  };
}

let installed = false;

/**
 * Register the context provider and expose the console helpers.
 *
 * The console commands mirror `tools/collect-dom-report.js` so there is one
 * habit to learn: do the thing, then copy the result out.
 */
export function installDiagnostics(): void {
  if (installed) return;
  installed = true;

  registerContextProvider(appContext);

  const anyWindow = window as unknown as Record<string, unknown>;
  anyWindow.ikaBugs = () => {
    console.log(summariseBugs());
    return getBugs();
  };
  anyWindow.ikaBugReport = () => {
    const json = exportFullBugReport().text;
    try {
      // DevTools' console helper; undefined anywhere else.
      const copyToClipboard = anyWindow.copy as
        ((text: string) => void) | undefined;
      copyToClipboard?.(json);
    } catch {
      /* clipboard only exists in the DevTools console */
    }
    return json;
  };
  anyWindow.ikaClearBugs = () => {
    clearBugs();
    console.log("[ika] bug reports cleared");
  };
}

export { clearBugs, getBugs, summariseBugs };
