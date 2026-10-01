/**
 * The three settings popups: send resources, auto wine, auto build.
 *
 * They still go through the game's own `ikariam.createPopup` so they match the
 * rest of the page visually.
 */

import { reportSelectorMiss } from "@core/bug-report";
import { addStyle, escapeHtml, qs, qsa, removeElement } from "@core/dom";
import { formatInteger } from "@core/format";
import { getCurrentTownName, getIkariam } from "@core/ikariam/globals";
import { DIALOG_ID, SEL } from "@core/ikariam/selectors";
import { showToast } from "@core/ui/window";
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
import { action, moveButtons } from "./actions";

function openPopup(title: string, html: string): void {
  const api = getIkariam();
  if (!api?.createPopup) {
    // Every settings dialog goes through here. Without a record this is a
    // completely silent failure: the user clicks Setting and nothing happens.
    reportSelectorMiss("window.ikariam.createPopup", { dialogTitle: title });
    showToast(MISC.popupUnavailable);
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
  const shipments = getState().queue.listOfType("sendResource");
  const rows = shipments
    .map(
      (task, index) => `<tr>
        <td>${escapeHtml(getTownNameFromList(task.data.origin))}</td>
        <td>${escapeHtml(getTownNameFromList(task.data.destination))}</td>
        <td>${task.data.resource}</td>
        <td>${task.data.amount}</td>
        <td>${escapeHtml(task.data.label ?? "")}</td>
        <td>${moveButtons(
          { up: "send.moveUp", down: "send.moveDown" },
          { "ika-task": task.id },
          { isFirst: index === 0, isLast: index === shipments.length - 1 },
        )}</td>
      </tr>`,
    )
    .join("");

  const body = qs("#resourceTableBody");
  if (body) body.innerHTML = rows;
}

/** Id of the amount field for one resource in the send dialog. */
function amountFieldId(resource: string): string {
  return `transporterSendAmount_${resource}`;
}

const SEND_AMOUNTS_STYLE_ID = "ika-send-amounts-style";

/** Labels in one column, right-aligned amounts in the next. */
function sendAmountsStyles(): string {
  return `
.ika-send-amounts {
  width: 260px;
  padding: 10px 12px;
  background: #f5ead0;
  border: 1px solid #c8b98f;
  border-radius: 6px;
  box-sizing: border-box;
}
.ika-send-amounts-title {
  font-size: 12px;
  font-weight: bold;
  color: #5b4a2d;
  margin-bottom: 6px;
}
.ika-send-amounts-row {
  display: grid;
  grid-template-columns: 65px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}
.ika-send-amounts-row:last-child {
  margin-bottom: 0;
}
.ika-send-amounts-row label {
  font-size: 12px;
  color: #4b4030;
}
.ika-send-amounts-row input {
  width: 100%;
  height: 24px;
  padding: 2px 6px;
  box-sizing: border-box;
  border: 1px solid #aaa;
  border-radius: 3px;
  background: #fff;
  color: #333;
  font-size: 12px;
  text-align: right;
  outline: none;
}
.ika-send-amounts-row input:focus {
  border-color: #8b6f3d;
  box-shadow: 0 0 0 2px rgba(139, 111, 61, 0.15);
}`;
}

function installSendAmountsStyles(): void {
  if (document.getElementById(SEND_AMOUNTS_STYLE_ID)) return;
  addStyle(sendAmountsStyles()).id = SEND_AMOUNTS_STYLE_ID;
}

export function openSendResourcesDialog(): void {
  const towns = townOptions();
  // One amount field per resource, instead of a resource dropdown and a
  // single amount: a shipment of several resources is one Add, not one per
  // resource.
  const amounts = RESOURCE_OPTIONS.map((resource) => {
    const id = amountFieldId(resource.value);
    return `<div class="ika-send-amounts-row">
        <label for="${id}">${resource.label}</label>
        <input id="${id}" type="number" min="1" step="1" inputmode="numeric">
      </div>`;
  }).join("");

  installSendAmountsStyles();
  openPopup(
    SEND_DIALOG.title,
    `<div><span>${SEND_DIALOG.from}</span><select id="transporterSendFromTown">${towns}</select></div><br/>
     <div><span>${SEND_DIALOG.destination}</span><select id="transporterSendDestination">${towns}</select></div><br/>
     <div class="ika-send-amounts">
       <div class="ika-send-amounts-title">${SEND_DIALOG.amount}</div>
       ${amounts}
     </div><br/>
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
  /** One entry per resource whose field was filled in, in dialog order. */
  amounts: { resource: string; amount: number }[];
  /** Filled-in fields that are not a whole number, by label. */
  invalid: string[];
}

/** Read the send form. Returns `null` when a town is not chosen. */
export function readSendForm(): SendFormValues | null {
  const origin = qs<HTMLSelectElement>("#transporterSendFromTown")?.value;
  const destination = qs<HTMLSelectElement>(
    "#transporterSendDestination",
  )?.value;
  if (!origin || !destination) return null;

  const amounts: SendFormValues["amounts"] = [];
  const invalid: string[] = [];
  for (const resource of RESOURCE_OPTIONS) {
    const text =
      qs<HTMLInputElement>(`#${amountFieldId(resource.value)}`)?.value.trim() ??
      "";
    // Digits only: "1e3", "2.5", "-4" and "+4" all pass `Number()`.
    if (text !== "" && !/^\d+$/.test(text)) {
      invalid.push(resource.label);
      continue;
    }
    // An empty field, or 0, means "none of this one".
    const amount = Number(text);
    if (amount > 0) amounts.push({ resource: resource.value, amount });
  }
  return { origin, destination, amounts, invalid };
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

/**
 * Popup asking which sender town to ship from, when several are ticked.
 * `onChosen` is the action each town's button runs.
 */
export function openWineSourceDialog(onChosen: string): void {
  const senders = loadSenders();
  const buttons = getTownList()
    .filter((town) => senders.includes(town.townNumber.toString()))
    .map(
      (town) =>
        `<button style="margin-right:20px" class="button" ${action(onChosen, {
          "ika-town": town.townNumber,
        })}>${escapeHtml(town.townName)}</button>`,
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
    .map((entry, index) => {
      const data = {
        "ika-position": entry.positionId,
        "ika-building": entry.buildingName,
        "ika-town": townName,
      };
      return (
        `<span>${index + 1}.${escapeHtml(entry.buildingName)}` +
        `<button class="button" ${action("build.remove", data)}>-</button>` +
        moveButtons({ up: "build.moveUp", down: "build.moveDown" }, data, {
          isFirst: index === 0,
          isLast: index === queue.length - 1,
        }) +
        `</span><br/>`
      );
    })
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
     <button style="margin-right:20px" class="button" ${action("build.save")}>${BUTTON.save}</button>
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
