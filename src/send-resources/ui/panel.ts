/**
 * The control surface: a fixed launcher button, and a draggable window
 * holding everything else.
 *
 * WHAT THIS REPLACES
 * The original — and the port until now — appended a fixed `<div>` pinned at
 * `top:45px; left:635px` with twelve buttons in a single row and every style
 * written inline. It covered the game at some window sizes, could not be moved,
 * grouped nothing, and showed no state beyond two button labels.
 *
 * Now: a launcher button opens a window whose controls are grouped by
 * feature, and whose footer carries live status. The window remembers where
 * it was left.
 *
 * The buttons themselves are unchanged — same `data-ika-action` names, same
 * handlers. This is a layout change, not a behaviour change.
 */

import { addStyle, escapeHtml, qs } from "@core/dom";
import {
  createWindow,
  setWindowFooter,
  type GameWindow,
} from "@core/ui/window";
import {
  formatHours,
  townsNeedingWine,
  wineStatus,
  type TownWineStatus,
} from "../features/wine-warning";
import { getActionPoints, getFreeShips } from "../game-state";
import { BUTTON, PANEL, WINE_WARNING } from "../messages";
import { getState } from "../state";
import { action } from "./actions";
import { QUEUE_LIST_ID, refreshQueueView } from "./queue-view";
import { buildStyles } from "./styles";

export const WINDOW_ID = "ikaSendResourcesWindow";
export const LAUNCHER_CLASS = "ika-send-menu";
export const WINE_WARNING_ID = "ikaWineWarning";

let panelWindow: GameWindow | null = null;

/** One titled block of buttons. */
function group(title: string, body: string): string {
  return `<div class="ika-group"><div class="ika-group-title">${title}</div>${body}</div>`;
}

function windowContent(): string {
  return (
    group(
      PANEL.groups.wine,
      `<button class="button" id="btnStartScriptAutoWine" ${action("wine.chooseSource")}>${BUTTON.start}</button>` +
        `<button class="button" ${action("wine.settings")}>${BUTTON.settings}</button>` +
        `<div id="${WINE_WARNING_ID}"></div>`,
    ) +
    group(
      PANEL.groups.transport,
      `<button class="button" id="btnStartScript" ${action("queue.toggle")}>${BUTTON.startTimer}</button>` +
        `<button class="button" ${action("send.settings")}>${BUTTON.settings}</button>` +
        `<button class="button" id="calibratePerShipCapacity" ${action("ship.calibrate")}>${PANEL.calibrateCargo}</button>`,
    ) +
    group(
      PANEL.groups.build,
      `<button class="button" ${action("build.startNow")}>${BUTTON.start}</button>` +
        `<button class="button" id="btnStartAutoBuild" ${action("build.toggleTimer")}>${BUTTON.startTimer}</button>` +
        `<button class="button" ${action("build.settings")}>${BUTTON.settings}</button>` +
        `<button class="button" id="btnStartScanBuilding" ${action("build.scan")}>${PANEL.scan}</button>`,
    ) +
    group(PANEL.groups.queue, `<div id="${QUEUE_LIST_ID}"></div>`) +
    group(
      PANEL.groups.account,
      `<button class="button" ${action("account.update")}>${PANEL.updateAccount}</button>` +
        `<div id="summaryAccountList"></div>`,
    ) +
    group(
      PANEL.groups.data,
      `<button class="button" id="btnExportData" ${action("data.export")}>${PANEL.exportData}</button>` +
        `<button class="button" id="btnImportData" ${action("data.import")}>${PANEL.importData}</button>` +
        `<button class="button" id="btnBugReport" ${action("bug.report")}>${PANEL.bugReport}</button>` +
        `<button class="button" ${action("log.clear")}>${PANEL.clearLog}</button>` +
        // Temporary: saves the building shown in the game's help dialog.
        `<button class="button" ${action("buildingHelp.save")}>${PANEL.crawlBuildingHelp}</button>`,
    ) +
    `<div id="logger"><textarea rows="4" cols="60" id="txtLogger" style="font-size:9px; display:none"></textarea></div>`
  );
}

/**
 * Put a way in on the page: a small fixed button.
 *
 * It used to go into the game's own left city menu (`.menu_slots`), next to
 * Empire Overview's entry. That broke the game. With this script on, a manual
 * shipment left the header showing the old resource and idle-ship counts;
 * removing just that menu entry from the page, and nothing else, made the
 * header refresh again. The game's `updateGlobalData` updates that menu
 * (`updateCurrentCityLeftMenu` -> `cityMenu.update`) before it redraws the
 * header, and an entry it did not draw itself stops it — a `slotNN` class like
 * the game's own entries was tried and was not enough. So nothing is added to
 * the game's menu at all.
 */
function buildLauncher(onClick: () => void): void {
  const launcher = document.createElement("button");
  launcher.className = `button ${LAUNCHER_CLASS}`;
  launcher.textContent = PANEL.launcher;
  launcher.style.cssText =
    "position:fixed; z-index:1000; left:8px; bottom:8px; cursor:pointer;";
  launcher.addEventListener("click", onClick);
  document.body.appendChild(launcher);
}

export function buildPanel(): void {
  if (qs(`#${WINDOW_ID}`)) return;

  addStyle(buildStyles());

  panelWindow = createWindow({
    id: WINDOW_ID,
    title: PANEL.title,
    store: getState().account,
  });
  panelWindow.content.innerHTML = windowContent();

  refreshQueueView();
  buildLauncher(() => panelWindow?.toggle());

  // The original raised the footer's z-index so the panel is not covered.
  const footer = qs("#footer");
  if (footer) footer.style.zIndex = "2";
}

export function setQueueButtonLabel(running: boolean): void {
  const button = qs("#btnStartScript");
  if (button) button.textContent = timerLabel(running);
}

export function setAutoBuildButtonLabel(running: boolean): void {
  const button = qs("#btnStartAutoBuild");
  if (button) button.textContent = timerLabel(running);
}

function timerLabel(running: boolean): string {
  return running ? BUTTON.stopTimer : BUTTON.startTimer;
}

/**
 * How long each town's wine lasts, for the towns where that is worth saying.
 *
 * The figures come from `measuredStats`, which reads the Empire Overview board
 * when it is open and the town cache otherwise. Neither is guaranteed to hold
 * anything: a fresh profile that has not opened the board and not walked its
 * towns knows nothing at all. That case says so rather than reporting every
 * town as comfortable, which is the same sentence for "all fine" and "no idea".
 */
export function renderWineWarning(): string {
  const towns = wineStatus();
  const measured = towns.filter((town) => town.hoursLeft !== null);

  if (measured.length === 0) {
    return `<div class="ika-wine-unknown">${WINE_WARNING.unknown}</div>`;
  }

  const needing = townsNeedingWine(towns);

  if (needing.length === 0) {
    return `<div class="ika-wine-ok">${WINE_WARNING.allComfortable(measured.length)}</div>`;
  }

  const line = (town: TownWineStatus) =>
    `<li class="ika-wine-${town.severity}">` +
    `${WINE_WARNING.townLine(escapeHtml(town.townName), formatHours(town.hoursLeft))}</li>`;

  return `<ul class="ika-wine-list">${needing.map(line).join("")}</ul>`;
}

/** Redraw it in place. Safe to call before the panel is built. */
export function refreshWineWarning(): void {
  const host = qs(`#${WINE_WARNING_ID}`);
  if (host) host.innerHTML = renderWineWarning();
}

/**
 * The live status line.
 *
 * The old panel had a `<p>` that only ever said what was transferring. The
 * footer now also carries the queue depth, which is the thing that was
 * genuinely unknowable before: there was no way to see how many orders were
 * still pending.
 *
 * And the idle ships and action points, the two things a shipment waits on
 * (`handleSendResource` returns `retry` while either is used up), so a queue
 * that is not moving shows why. Read from the game's header, as the handler
 * reads them.
 */
export function setTransferInfo(text: string): void {
  if (!panelWindow) return;
  // Only worth redrawing while someone is looking at it.
  if (panelWindow.isOpen()) {
    refreshQueueView();
    refreshWineWarning();
  }
  const pending = getState().queue.length;
  const status = pending > 0 ? PANEL.footerWithQueue(text, pending) : text;
  const { merchants, freighters } = getFreeShips();
  setWindowFooter(
    panelWindow,
    PANEL.footerWithCounters(status, merchants, freighters, getActionPoints()),
  );
}

/** Show or hide the window. The Space hotkey calls this. */
export function togglePanel(): void {
  panelWindow?.toggle();
}

export function toggleZoom(): void {
  panelWindow?.root.classList.toggle("zoom");
}
