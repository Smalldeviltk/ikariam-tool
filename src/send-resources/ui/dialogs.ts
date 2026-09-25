/**
 * The three settings popups: send resources, auto wine, auto build.
 *
 * They still go through the game's own `ikariam.createPopup` so they match the
 * rest of the page visually.
 */

import { reportSelectorMiss } from "@core/bug-report";
import { escapeHtml, qs, qsa, removeElement } from "@core/dom";
import { formatInteger } from "@core/format";
import { getCurrentTownName, getIkariam } from "@core/ikariam/globals";
import { DIALOG_ID, SEL } from "@core/ikariam/selectors";
import { getTownList, getTownNameFromList } from "../navigation";
import {
  getTownQueue,
  listBuildingsInCurrentTown,
} from "../features/auto-build";
import {
  measuredStats,
  planWineRun,
  readWineBoard,
} from "../features/auto-wine";
import {
  BUILD_DIALOG,
  BUTTON,
  MISC,
  SEND_DIALOG,
  WINE_DIALOG,
  WINE_PREVIEW,
} from "../messages";
import { getState, loadReceivers, loadSenders } from "../state";
import { RESOURCE_OPTIONS } from "../types";
import { action } from "./actions";

function openPopup(title: string, html: string): void {
  const api = getIkariam();
  if (!api?.createPopup) {
    // Every settings dialog goes through here. Without a record this is a
    // completely silent failure: the user clicks Setting and nothing happens.
    reportSelectorMiss("window.ikariam.createPopup", { dialogTitle: title });
    alert(MISC.popupUnavailable);
    return;
  }
  api.createPopup(DIALOG_ID, title, html, "???", "class");
}

/** One `<th>` per label. Labels are trusted text: callers escape game data. */
function headerCells(labels: readonly string[]): string {
  return labels.map((label) => `<th>${label}</th>`).join("");
}

export function closeDialog(): void {
  removeElement(`#${DIALOG_ID}`);
}

/* ─────────────────────── Send resources dialog ─────────────────────────── */

function townOptions(): string {
  return getTownList()
    .map(
      (town) =>
        `<option value="${town.townNumber}">${escapeHtml(town.townName)}</option>`,
    )
    .join("");
}

export function renderResourceTable(): void {
  const rows = getState()
    .queue.listOfType("sendResource")
    .map(
      (task) => `<tr>
        <td>${escapeHtml(getTownNameFromList(task.data.origin))}</td>
        <td>${escapeHtml(getTownNameFromList(task.data.destination))}</td>
        <td>${task.data.resource}</td>
        <td>${task.data.amount}</td>
        <td>${escapeHtml(task.data.label ?? "")}</td>
      </tr>`,
    )
    .join("");

  const body = qs("#resourceTableBody");
  if (body) body.innerHTML = rows;
}

export function openSendResourcesDialog(): void {
  const towns = townOptions();
  const resources = RESOURCE_OPTIONS.map(
    (resource) =>
      `<option value="${resource.value}">${resource.label}</option>`,
  ).join("");

  openPopup(
    SEND_DIALOG.title,
    `<div><span>${SEND_DIALOG.from}</span><select id="transporterSendFromTown">${towns}</select></div><br/>
     <div><span>${SEND_DIALOG.destination}</span><select id="transporterSendDestination">${towns}</select></div><br/>
     <div><span>${SEND_DIALOG.resource}</span><select id="transporterSendResource">${resources}</select></div><br/>
     <div><span>${SEND_DIALOG.amount}</span><input id="transporterSendAmount" type="number"></div><br/>
     <button style="margin-right:5px" class="button" ${action("send.add")}>${BUTTON.add}</button>
     <button style="margin-right:5px" class="button" ${action("send.removeFirst")}>${SEND_DIALOG.removeFirst}</button>
     <button style="margin-right:5px" class="button" ${action("send.removeLast")}>${SEND_DIALOG.removeLast}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.close}</button><br/>
     <table id="resourceTable" class="fullTable" border="1" cellpadding="5">
       <thead>${headerCells(SEND_DIALOG.columns)}</thead>
       <tbody id="resourceTableBody"></tbody>
     </table>`,
  );
  renderResourceTable();
}

export interface SendFormValues {
  origin: string;
  destination: string;
  resource: string;
  amount: number;
}

/** Read the four fields of the send form. Returns `null` when incomplete. */
export function readSendForm(): SendFormValues | null {
  const origin = qs<HTMLSelectElement>("#transporterSendFromTown")?.value;
  const destination = qs<HTMLSelectElement>(
    "#transporterSendDestination",
  )?.value;
  const resource = qs<HTMLSelectElement>("#transporterSendResource")?.value;
  const amount = Number(qs<HTMLInputElement>("#transporterSendAmount")?.value);

  if (!origin || !destination || !resource || !Number.isFinite(amount)) {
    return null;
  }
  return { origin, destination, resource, amount };
}

/* ───────────────────────────── Auto wine dialog ────────────────────────── */

export function openAutoWineDialog(): void {
  const senders = loadSenders();
  const receivers = loadReceivers();
  const board = readWineBoard();

  const rows = getTownList()
    .map((town) => {
      const id = town.townNumber.toString();
      const checked = senders.includes(id) ? "checked" : "";
      const perHour =
        receivers.find((entry) => entry.townNumber === id)?.winePerHour ?? "0";
      // Same board-then-cache chain the planner uses, so what the dialog
      // shows is what Auto Wine will actually plan against.
      const measured = measuredStats(town.townName, board);
      const stock = measured ? Math.round(measured.stock) : null;
      const hours =
        measured && measured.consume > 0
          ? (measured.stock / measured.consume).toFixed(1) + "h"
          : "—";

      return `<tr class="txtWine">
        <td><input type="checkbox" ${checked} id="cbSender_${id}" name="${escapeHtml(town.townName)}" value="${id}"/></td>
        <td>${escapeHtml(town.townName)}</td>
        <td><input type="text" id="txtWine_${id}" value="${escapeHtml(perHour)}"/></td>
        <td style="text-align:right">${stock === null ? "—" : formatInteger(stock)}</td>
        <td style="text-align:right">${hours}</td>
      </tr>`;
    })
    .join("");

  openPopup(
    WINE_DIALOG.title,
    `<div><table id="autoWineTable" class="fullTable" border="1" cellpadding="5">
       <tr>${headerCells(WINE_DIALOG.columns)}</tr>
       ${rows}
     </table></div><br/>
     <p style="font-size:11px">${WINE_DIALOG.help}</p>
     <button style="margin-right:20px" class="button" ${action("wine.save")}>${BUTTON.save}</button>
     <button style="margin-right:20px" class="button" ${action("wine.load")}>${BUTTON.load}</button>
     <button style="margin-right:20px" class="button" ${action("wine.preview")}>${WINE_DIALOG.previewPlan}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.cancel}</button><br/><br/>
     <div id="winePlanPreview"></div>`,
  );
}

/** Popup asking which sender town to ship from, when several are ticked. */
export function openWineSourceDialog(): void {
  const senders = loadSenders();
  const buttons = getTownList()
    .filter((town) => senders.includes(town.townNumber.toString()))
    .map(
      (town) =>
        `<button style="margin-right:20px" class="button" ${action(
          "wine.start",
          {
            "ika-town": town.townNumber,
          },
        )}>${escapeHtml(town.townName)}</button>`,
    )
    .join("");

  openPopup(
    WINE_DIALOG.chooseSourceTitle,
    `${buttons}<button class="button" ${action("dialog.close")}>${BUTTON.cancel}</button><br/><br/>`,
  );
}

/**
 * Preview table: what each town receives and how long it then holds out.
 * Lets the user sanity-check the split before anything is queued.
 */
export function renderWinePlanPreview(fromTown: string): void {
  const target = qs("#winePlanPreview");
  if (!target) return;

  const plan = planWineRun(fromTown);
  if (plan.supply <= 0) {
    target.innerHTML = `<p style="color:red">${WINE_PREVIEW.noSpare}${
      plan.boardAvailable ? "" : WINE_PREVIEW.boardUnavailable
    }</p>`;
    return;
  }

  const rows = plan.allocations
    .map(
      (allocation) => `<tr>
        <td>${escapeHtml(allocation.townName)}</td>
        <td style="text-align:right">${formatInteger(allocation.stock)}</td>
        <td style="text-align:right">${formatInteger(allocation.consume)}</td>
        <td style="text-align:right"><b>${formatInteger(allocation.add)}</b></td>
        <td style="text-align:right">${allocation.finalHours.toFixed(1)}h${
          allocation.storageFull ? WINE_PREVIEW.storageFull : ""
        }</td>
      </tr>`,
    )
    .join("");

  // A town whose storage could not take its share ends below the target, so
  // "everyone" would be untrue as soon as one is capped.
  const storageFull = plan.allocations.filter((a) => a.storageFull);
  const hours = plan.targetHours.toFixed(1);
  const levelling =
    storageFull.length === 0
      ? WINE_PREVIEW.levelEveryone(hours)
      : WINE_PREVIEW.levelExcept(
          hours,
          storageFull.map((a) => escapeHtml(a.townName)).join(", "),
          storageFull.length,
        );

  target.innerHTML = `
    <p>${WINE_PREVIEW.summary(
      escapeHtml(getTownNameFromList(fromTown)),
      formatInteger(plan.used),
      formatInteger(plan.supply),
      formatInteger(plan.unused),
      levelling,
    )}</p>
    <table class="fullTable" border="1" cellpadding="4">
      <tr>${headerCells(WINE_PREVIEW.columns)}</tr>
      ${rows}
    </table>`;
}

/* ──────────────────────────── Auto build dialog ────────────────────────── */

function renderBuildingList(): string {
  return listBuildingsInCurrentTown()
    .map(
      (slot) =>
        `<span>${escapeHtml(slot.buildingName)}<button class="button" ${action(
          "build.add",
          {
            "ika-position": slot.positionId,
            "ika-building": slot.buildingName,
          },
        )}>+</button></span><br/>`,
    )
    .join("");
}

export function renderTownQueue(townName: string): string {
  const queue = getTownQueue(townName);
  if (queue.length === 0) return BUILD_DIALOG.emptyTown;

  return queue
    .map(
      (entry, index) =>
        `<span>${index + 1}.${escapeHtml(entry.buildingName)}<button class="button" ${action(
          "build.remove",
          {
            "ika-position": entry.positionId,
            "ika-building": entry.buildingName,
            "ika-town": townName,
          },
        )}>-</button></span><br/>`,
    )
    .join("");
}

export function openAutoBuildDialog(): void {
  const townNames = qsa<HTMLElement>(SEL.buildTabTownNames).map((span) =>
    span.innerHTML.trim(),
  );

  const headers = headerCells(townNames.map(escapeHtml));
  const cells = townNames
    .map(
      (name) =>
        `<td class="tdQueue" data-ika-town-cell="${escapeHtml(name)}">${renderTownQueue(name)}</td>`,
    )
    .join("");

  openPopup(
    getCurrentTownName(),
    `<table id="autoBuildTable" class="fullTable fixTable" border="1" cellpadding="5">
       <tr><th>${BUILD_DIALOG.buildingList}</th>${headers}</tr>
       <tr><td id="tdListBuilding">${renderBuildingList()}</td>${cells}</tr>
     </table><br/>
     <p style="font-size:11px">${BUILD_DIALOG.savedAsYouGo}</p>
     <button style="margin-right:20px" class="button" ${action("build.enqueue")}>${BUILD_DIALOG.runQueue}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.close}</button><br/><br/>`,
  );
}

/**
 * Redraw one town's queue cell.
 *
 * The original used `document.querySelector("[id='" + townName + "']")`, i.e.
 * the town name as an element id, so any name with a space or an odd character
 * broke the selector. Matching on a data attribute in JS instead means the town
 * name can be anything at all — note that `CSS.escape` would NOT be the right
 * tool here, since it escapes identifiers rather than attribute string values.
 */
export function refreshTownQueueCell(townName: string): void {
  const cell = qsa("[data-ika-town-cell]").find(
    (element) => element.dataset.ikaTownCell === townName,
  );
  if (cell) cell.innerHTML = renderTownQueue(townName);
}
