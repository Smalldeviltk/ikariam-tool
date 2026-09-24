/**
 * The control surface: a launcher in the game's own menu, and a draggable
 * window holding everything else.
 *
 * WHAT THIS REPLACES
 * The original — and the port until now — appended a fixed `<div>` pinned at
 * `top:45px; left:635px` with twelve buttons in a single row and every style
 * written inline. It covered the game at some window sizes, could not be moved,
 * grouped nothing, and showed no state beyond two button labels.
 *
 * Now: one entry in the game's left menu opens a window whose controls are
 * grouped by feature, and whose footer carries live status. The window
 * remembers where it was left. See `docs/improvement-plan.md` §3.
 *
 * The buttons themselves are unchanged — same `data-ika-action` names, same
 * handlers. This is a layout change, not a behaviour change.
 */

import { addStyle, qs } from "@core/dom";
import {
  createWindow,
  setWindowFooter,
  type GameWindow,
} from "@core/ui/window";
import {
  formatHours,
  wineStatus,
  type TownWineStatus,
} from "../features/wine-warning";
import { getState } from "../state";
import { action } from "./actions";
import { escapeHtml, QUEUE_LIST_ID, refreshQueueView } from "./queue-view";
import { buildStyles } from "./styles";

export const PANEL_ID = "customDiv";
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
      "Wine",
      `<button class="button" id="btnStartScriptAutoWine" ${action("wine.chooseSource")}>Start</button>` +
        `<button class="button" ${action("wine.settings")}>Settings</button>` +
        `<div id="${WINE_WARNING_ID}"></div>`,
    ) +
    group(
      "Transport",
      `<button class="button" id="btnStartScript" ${action("queue.toggle")}>Start Timer</button>` +
        `<button class="button" ${action("send.settings")}>Settings</button>` +
        `<button class="button" id="calibratePerShipCapacity" ${action("ship.calibrate")}>Calibrate Cargo</button>`,
    ) +
    group(
      "Build",
      `<button class="button" ${action("build.startNow")}>Start</button>` +
        `<button class="button" id="btnStartAutoBuild" ${action("build.toggleTimer")}>Start Timer</button>` +
        `<button class="button" ${action("build.settings")}>Settings</button>` +
        `<button class="button" id="btnStartScanBuilding" ${action("build.scan")}>Scan</button>`,
    ) +
    group("Queue", `<div id="${QUEUE_LIST_ID}"></div>`) +
    group(
      "Account",
      `<button class="button" ${action("account.update")}>Update Account</button>` +
        `<div id="summaryAccountList"></div>`,
    ) +
    group(
      "Data",
      `<button class="button" id="btnExportData" ${action("data.export")}>Export</button>` +
        `<button class="button" id="btnImportData" ${action("data.import")}>Import</button>` +
        `<button class="button" id="btnBugReport" ${action("bug.report")}>Bug Report</button>` +
        `<button class="button" ${action("log.clear")}>Clear Log</button>`,
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
  launcher.textContent = "Send Resources";
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
    title: "Send Resources",
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
  if (button) button.textContent = running ? "Stop Timer" : "Start Timer";
}

export function setAutoBuildButtonLabel(running: boolean): void {
  const button = qs("#btnStartAutoBuild");
  if (button) button.textContent = running ? "Stop Timer" : "Start Timer";
}

/**
 * The live status line.
 *
 * The old panel had a `<p>` that only ever said what was transferring. The
 * footer now also carries the queue depth, which is the thing that was
 * genuinely unknowable before: there was no way to see how many orders were
 * still pending.
 */
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
    return (
      `<div class="ika-wine-unknown">` +
      `No wine figures yet — open the Empire Overview board, or visit a town.` +
      `</div>`
    );
  }

  const needing = towns
    .filter((town) => town.severity !== "ok")
    .sort((a, b) => (a.hoursLeft ?? Infinity) - (b.hoursLeft ?? Infinity));

  if (needing.length === 0) {
    return `<div class="ika-wine-ok">Wine: ${measured.length} towns, all comfortable</div>`;
  }

  const line = (town: TownWineStatus) =>
    `<li class="ika-wine-${town.severity}">` +
    `${escapeHtml(town.townName)} — ${formatHours(town.hoursLeft)}</li>`;

  return `<ul class="ika-wine-list">${needing.map(line).join("")}</ul>`;
}

/** Redraw it in place. Safe to call before the panel is built. */
export function refreshWineWarning(): void {
  const host = qs(`#${WINE_WARNING_ID}`);
  if (host) host.innerHTML = renderWineWarning();
}

export function setTransferInfo(text: string): void {
  if (!panelWindow) return;
  // Only worth redrawing while someone is looking at it.
  if (panelWindow.isOpen()) {
    refreshQueueView();
    refreshWineWarning();
  }
  const pending = getState().queue.length;
  setWindowFooter(
    panelWindow,
    pending > 0 ? `${text}  —  ${pending} queued` : text,
  );
}

/** Show or hide the window. The Space hotkey calls this. */
export function togglePanel(): void {
  panelWindow?.toggle();
}

export function toggleZoom(): void {
  panelWindow?.root.classList.toggle("zoom");
}
