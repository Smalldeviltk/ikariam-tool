/**
 * The control surface: an entry in the game's left menu (or a fixed button on
 * a page without one), and a draggable window holding everything else.
 *
 * WHAT THIS REPLACES
 * The original — and the port until now — appended a fixed `<div>` pinned at
 * `top:45px; left:635px` with twelve buttons in a single row and every style
 * written inline. It covered the game at some window sizes, could not be moved,
 * grouped nothing, and showed no state beyond two button labels.
 *
 * Now: the launcher opens a window whose controls are grouped by feature, and
 * whose footer carries live status. The window remembers where it was left,
 * and whether it was left open.
 *
 * The buttons themselves are unchanged — same `data-ika-action` names, same
 * handlers. This is a layout change, not a behaviour change.
 */

import { addStyle, escapeHtml, qs } from "@core/dom";
import { SEL } from "@core/ikariam/selectors";
import {
  isNotificationEnabled,
  notificationRefusal,
  setNotificationEnabled,
  type NotificationKind,
} from "@core/notifications";
import {
  createWindow,
  setWindowFooter,
  showToast,
  type GameWindow,
} from "@core/ui/window";
import {
  CRITICAL_HOURS,
  formatHours,
  townsNeedingWine,
  wineStatus,
  type TownWineStatus,
} from "../features/wine-warning";
import { getActionPoints, getFreeShips } from "../game-state";
import { BUTTON, NOTIFICATIONS, PANEL, WINE_WARNING } from "../messages";
import { getState } from "../state";
import { action } from "./actions";
import { QUEUE_LIST_ID, refreshQueueView } from "./queue-view";
import { buildStyles } from "./styles";

export const WINDOW_ID = "ikaSendResourcesWindow";
export const LAUNCHER_CLASS = "ika-send-menu";
export const WINE_WARNING_ID = "ikaWineWarning";

/** Marks a notification checkbox; its value is the kind it switches. */
export const NOTIFICATION_SWITCH_ATTR = "data-ika-notification";

/** The menu entry's icon: the game's own transport picture. */
const MENU_ENTRY_ICON = "cdn/all/both/minimized/transport.png";

let panelWindow: GameWindow | null = null;

/** One titled block of buttons. */
function group(title: string, body: string): string {
  return `<div class="ika-group"><div class="ika-group-title">${title}</div>${body}</div>`;
}

function windowContent(): string {
  return (
    group(
      PANEL.groups.wine,
      `<button class="button" id="btnStartScriptAutoWine" ${action("wine.autoRun")}>${BUTTON.start}</button>` +
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
    group(
      PANEL.groups.notifications,
      notificationSwitch(
        "wineLow",
        NOTIFICATIONS.wineLowSwitch,
        NOTIFICATIONS.wineLowSwitchTitle(CRITICAL_HOURS),
      ) +
        notificationSwitch(
          "taskDropped",
          NOTIFICATIONS.taskDroppedSwitch,
          NOTIFICATIONS.taskDroppedSwitchTitle,
        ),
    ) +
    `<div id="logger"><textarea rows="4" cols="60" id="txtLogger" style="font-size:9px; display:none"></textarea></div>`
  );
}

/** A checkbox switching one kind of desktop notification. */
function notificationSwitch(
  kind: NotificationKind,
  label: string,
  title: string,
): string {
  const checked = isNotificationEnabled(kind) ? " checked" : "";
  return (
    `<label class="ika-notification-switch" title="${escapeHtml(title)}">` +
    `<input type="checkbox" ${NOTIFICATION_SWITCH_ATTR}="${kind}"${checked}> ` +
    `${escapeHtml(label)}</label>`
  );
}

/**
 * Ticking a box switches its kind on, which first asks the browser for
 * permission; a refusal unticks it again and says why. Heard on `change`,
 * not through the click dispatcher: that one cancels the click, and a
 * cancelled click puts the tick back.
 */
function watchNotificationSwitches(root: HTMLElement): void {
  root.addEventListener("change", (event) => {
    const box = event.target as HTMLInputElement;
    const kind = box.getAttribute(NOTIFICATION_SWITCH_ATTR);
    if (!kind) return;
    const wanted = box.checked;
    void setNotificationEnabled(kind as NotificationKind, wanted).then((on) => {
      box.checked = on;
      if (wanted && !on) showToast(notificationRefusal());
    });
  });
}

/**
 * Put a way in on the page: an entry in the game's left city menu
 * (`.menu_slots`), like Empire Overview's, or a small fixed button on a page
 * without that menu.
 *
 * The entry carries NO `expandable` class, and that is what keeps the game
 * working. An entry with it broke the header: after a manual shipment the
 * resource and idle-ship counts stayed stale. The game's `updateGlobalData`
 * updates this menu (`updateCurrentCityLeftMenu` -> `cityMenu.update`) before
 * it redraws the header, and a foreign `expandable` entry stops it there.
 * Measured on the live page (03/10) with Empire Overview's entry present: a
 * second `expandable` entry broke the header whether placed before or after
 * Empire Overview's `slot99`, and whatever its `slotNN`; an entry shaped like
 * IkaEasy V4's (`slot<index>`, no `expandable` — its `addToLeftMenu`) did not.
 *
 * Without `expandable` the game's slide-out on hover does not apply, so the
 * stylesheet does it instead, as IkaEasy's does (`buildStyles`).
 */
/**
 * The menu entry's slide-out on hover, taken from IkaEasy V4
 * (`css/ikaeasy.css`, `li.ikaeasy_slot`): only the icon shows until the
 * pointer is over it, as with the game's own entries.
 */
function menuEntryStyles(): string {
  const entry = `#container #leftMenu .slot_menu li.${LAUNCHER_CLASS}`;
  return `
${entry} { width: 199px; transform: translateX(-146px); transition: 0.25s all linear; cursor: pointer; }
${entry}:hover { transform: translateX(0) !important; z-index: 120000 !important; }
.direction_rtl ${entry} { transform: translateX(146px); }
.direction_rtl ${entry}:hover { transform: translateX(0) !important; }
`;
}

function buildLauncher(onClick: () => void): void {
  const menu = qs(SEL.menuSlots);
  if (menu) {
    const entry = document.createElement("li");
    entry.className = `slot${menu.children.length} ${LAUNCHER_CLASS}`;
    entry.innerHTML =
      `<div class="image" style="background-image:url(${MENU_ENTRY_ICON});` +
      `background-position:0 0;background-size:33px auto"></div>` +
      `<div class="name"><span class="namebox">${escapeHtml(PANEL.launcher)}</span></div>`;
    entry.addEventListener("click", onClick);
    menu.appendChild(entry);
    return;
  }

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
  addStyle(menuEntryStyles());

  panelWindow = createWindow({
    id: WINDOW_ID,
    title: PANEL.title,
    store: getState().account,
    rememberOpen: true,
    openByDefault: true,
  });
  panelWindow.content.innerHTML = windowContent();
  watchNotificationSwitches(panelWindow.content);

  refreshQueueView();
  buildLauncher(togglePanel);

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

/**
 * Show or hide the window — what the menu entry (or the fallback button)
 * does. No hotkey: Space belongs to the Empire Overview board.
 *
 * Opening redraws the queue at once: its ten-row cap can only be measured
 * on screen, and a queue that grew while the window was closed otherwise
 * showed uncapped until the next status tick.
 */
export function togglePanel(): void {
  panelWindow?.toggle();
  if (panelWindow?.isOpen()) refreshQueueView();
}
