/**
 * The three settings popups: send resources, auto wine, auto build.
 *
 * They still go through the game's own `ikariam.createPopup` so they match the
 * rest of the page visually.
 */

import { reportSelectorMiss } from "@core/bug-report";
import { qs, qsa, removeElement } from "@core/dom";
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
import { getState, loadReceivers, loadSenders } from "../state";
import { RESOURCE_OPTIONS } from "../types";
import { action } from "./actions";

function openPopup(title: string, html: string): void {
  const api = getIkariam();
  if (!api?.createPopup) {
    // Every settings dialog goes through here. Without a record this is a
    // completely silent failure: the user clicks Setting and nothing happens.
    reportSelectorMiss("window.ikariam.createPopup", { dialogTitle: title });
    alert(
      "Could not open the settings dialog - the game's own popup API is not " +
        "available on this screen. Try again from the town view.",
    );
    return;
  }
  api.createPopup(DIALOG_ID, title, html, "???", "class");
}

export function closeDialog(): void {
  removeElement(`#${DIALOG_ID}`);
}

/* ─────────────────────── Send resources dialog ─────────────────────────── */

function townOptions(): string {
  return getTownList()
    .map(
      (town) => `<option value="${town.townNumber}">${town.townName}</option>`,
    )
    .join("");
}

export function renderResourceTable(): void {
  const rows = getState()
    .queue.listOfType("sendResource")
    .map(
      (task) => `<tr>
        <td>${getTownNameFromList(task.data.origin)}</td>
        <td>${getTownNameFromList(task.data.destination)}</td>
        <td>${task.data.resource}</td>
        <td>${task.data.amount}</td>
        <td>${task.data.label ?? ""}</td>
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
    "Mass transport resources",
    `<div><span>From: </span><select id="transporterSendFromTown">${towns}</select></div><br/>
     <div><span>Destination: </span><select id="transporterSendDestination">${towns}</select></div><br/>
     <div><span>Resource: </span><select id="transporterSendResource">${resources}</select></div><br/>
     <div><span>Amount: </span><input id="transporterSendAmount" type="number"></div><br/>
     <button style="margin-right:5px" class="button" ${action("send.add")}>Add</button>
     <button style="margin-right:5px" class="button" ${action("send.removeFirst")}>Remove First</button>
     <button style="margin-right:5px" class="button" ${action("send.removeLast")}>Remove Last</button>
     <button class="button" ${action("dialog.close")}>Close</button><br/>
     <table id="resourceTable" class="fullTable" border="1" cellpadding="5">
       <thead><th>Origin</th><th>Destination</th><th>Resource</th><th>Amount</th><th>Source</th></thead>
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
        <td><input type="checkbox" ${checked} id="cbSender_${id}" name="${town.townName}" value="${id}"/></td>
        <td>${town.townName}</td>
        <td><input type="text" id="txtWine_${id}" value="${perHour}"/></td>
        <td style="text-align:right">${stock === null ? "—" : stock.toLocaleString("en-US")}</td>
        <td style="text-align:right">${hours}</td>
      </tr>`;
    })
    .join("");

  openPopup(
    "Auto Wine",
    `<div><table id="autoWineTable" class="fullTable" border="1" cellpadding="5">
       <tr><th>Sender</th><th>Town Name</th><th>Wine/h</th><th>Stock</th><th>Lasts</th></tr>
       ${rows}
     </table></div><br/>
     <p style="font-size:11px"><b>Sender</b> and <b>Wine/h</b> are the two roles and they
     are mutually exclusive: tick a town to make it a source, or give it a Wine/h
     above 0 to make it a receiver. A ticked town is never a receiver.<br/>
     <b>Stock</b> and <b>Lasts</b> come from the Empire Overview board, or from the
     last time each town was visited. When they show "—" there is no measurement
     yet and Auto Wine uses the <b>Wine/h</b> you type here, assuming zero stock.</p>
     <button style="margin-right:20px" class="button" ${action("wine.save")}>Save</button>
     <button style="margin-right:20px" class="button" ${action("wine.load")}>Load</button>
     <button style="margin-right:20px" class="button" ${action("wine.preview")}>Preview plan</button>
     <button class="button" ${action("dialog.close")}>Cancel</button><br/><br/>
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
        )}>${town.townName}</button>`,
    )
    .join("");

  openPopup(
    "Choose the wine source town",
    `${buttons}<button class="button" ${action("dialog.close")}>Cancel</button><br/><br/>`,
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
    target.innerHTML = `<p style="color:red">The source town has no spare wine to send.${
      plan.boardAvailable
        ? ""
        : " (The Empire Overview board is not available, so its stock could not be read.)"
    }</p>`;
    return;
  }

  const rows = plan.allocations
    .map(
      (allocation) => `<tr>
        <td>${allocation.townName}</td>
        <td style="text-align:right">${Math.round(allocation.stock).toLocaleString("en-US")}</td>
        <td style="text-align:right">${Math.round(allocation.consume).toLocaleString("en-US")}</td>
        <td style="text-align:right"><b>${allocation.add.toLocaleString("en-US")}</b></td>
        <td style="text-align:right">${allocation.finalHours.toFixed(1)}h</td>
      </tr>`,
    )
    .join("");

  target.innerHTML = `
    <p><b>Source:</b> ${getTownNameFromList(fromTown)} —
       shipping ${plan.used.toLocaleString("en-US")} wine
       (spare ${plan.supply.toLocaleString("en-US")}, ${plan.unused.toLocaleString("en-US")} left over),
       levelling everyone to <b>~${plan.targetHours.toFixed(1)}h</b>.</p>
    <table class="fullTable" border="1" cellpadding="4">
      <tr><th>Town</th><th>Stock</th><th>Consume/h</th><th>Send</th><th>Lasts after</th></tr>
      ${rows}
    </table>`;
}

/* ──────────────────────────── Auto build dialog ────────────────────────── */

function renderBuildingList(): string {
  return listBuildingsInCurrentTown()
    .map(
      (slot) =>
        `<span>${slot.buildingName}<button class="button" ${action(
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
  if (queue.length === 0) return "-empty-";

  return queue
    .map(
      (entry, index) =>
        `<span>${index + 1}.${entry.buildingName}<button class="button" ${action(
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

  const headers = townNames.map((name) => `<th>${name}</th>`).join("");
  const cells = townNames
    .map(
      (name) =>
        `<td class="tdQueue" data-ika-town-cell="${name}">${renderTownQueue(name)}</td>`,
    )
    .join("");

  openPopup(
    getCurrentTownName(),
    `<table id="autoBuildTable" class="fullTable fixTable" border="1" cellpadding="5">
       <tr><th>List Building</th>${headers}</tr>
       <tr><td id="tdListBuilding">${renderBuildingList()}</td>${cells}</tr>
     </table><br/>
     <p style="font-size:11px">Changes are saved as you add or remove entries.</p>
     <button style="margin-right:20px" class="button" ${action("build.enqueue")}>Run queue</button>
     <button class="button" ${action("dialog.close")}>Close</button><br/><br/>`,
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
