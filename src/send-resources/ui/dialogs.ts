/**
 * The three settings popups: send resources, auto wine, auto build.
 *
 * They still go through the game's own `ikariam.createPopup` so they match the
 * rest of the page visually.
 */

import { reportSelectorMiss } from "@core/bug-report";
import { ensureStyle, escapeHtml, qs, qsa, removeElement } from "@core/dom";
import {
  errorMessage,
  formatInteger,
  formatTimeLengthToStr,
} from "@core/format";
import { getCurrentTownName, getIkariam } from "@core/ikariam/globals";
import { DIALOG_ID } from "@core/ikariam/selectors";
import { showToast } from "@core/ui/window";
import { readStoredStock } from "../game-state";
import {
  getTownList,
  getTownNameFromList,
  getTownNumberByName,
  townCityId,
} from "../navigation";
import {
  type BuildingSlot,
  buildingSlotsOf,
  fetchTownSlots,
  getTownQueue,
  plannedLevels,
  readTownSlots,
  removeCompletedUpgrades,
} from "../features/auto-build";
import type { SlotState } from "../features/build-queue-validation";
import {
  measuredStats,
  planWineRun,
  readWineBoard,
} from "../features/auto-wine";
import {
  fetchFortressView,
  fortressPosition,
  openCaptureLevels,
  pirateSettingsOrDefault,
  storedFortressTowns,
} from "../features/pirate";
import {
  BUILD_DIALOG,
  BUTTON,
  CRAWL_DIALOG,
  ELEMENT_CRAWL,
  DURATION,
  MISC,
  PAGE_CRAWL,
  PIRATE,
  SEND_DIALOG,
  WINE_DIALOG,
  WINE_PREVIEW,
} from "../messages";
import { CRAWL_BOX_CLASS } from "../diagnostics";
import { getState, loadReceivers, loadSenders } from "../state";
import { RESOURCE_OPTIONS, resourceLabel } from "../types";
import { action, moveButtons } from "./actions";

/**
 * The box around the Transport Settings table, to the right of the form. It
 * is no taller than the form and scrolls the rest.
 */
export const RESOURCE_TABLE_SCROLL_ID = "resourceTableScroll";

/** The Transport Settings form: towns, amounts and buttons, left of the table. */
const SEND_FORM_COLUMN_ID = "transporterSendForm";

function openPopup(title: string, html: string): void {
  const api = getIkariam();
  if (!api?.createPopup) {
    // Every settings dialog goes through here. Without a record this is a
    // completely silent failure: the user clicks Setting and nothing happens.
    reportSelectorMiss("window.ikariam.createPopup", { dialogTitle: title });
    showToast(MISC.popupUnavailable);
    return;
  }
  // A plain popup (no TYPE_* constant), with no extra class. The original
  // passed "???" and "class" here: the first matched neither type, the second
  // added a class named "class" that nothing styles.
  api.createPopup(DIALOG_ID, title, html, null, null);
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
        <td>${escapeHtml(resourceLabel(task.data.resource))}</td>
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
  // What is left at the source changes with every row added or removed.
  renderSendStock();
  matchTableToFormHeight();
}

/**
 * Cap the table's box at the form's height, so the dialog is as tall as the
 * form and a long queue scrolls instead of growing it.
 *
 * Measured rather than written into the sheet: the form's height comes from
 * the game's fonts and buttons. A form with no height (not laid out yet)
 * leaves the box as it was.
 */
function matchTableToFormHeight(): void {
  const scroll = qs(`#${RESOURCE_TABLE_SCROLL_ID}`);
  const form = qs(`#${SEND_FORM_COLUMN_ID}`);
  if (!scroll || !form) return;
  const height = form.getBoundingClientRect().height;
  if (height <= 0) return;
  scroll.style.maxHeight = `${Math.ceil(height)}px`;
}

/** Id of the amount field for one resource in the send dialog. */
function amountFieldId(resource: string): string {
  return `transporterSendAmount_${resource}`;
}

const SEND_AMOUNTS_STYLE_ID = "ika-send-amounts-style";

/**
 * The Amount block's width range. It grows with the stock beside each field,
 * `1,234 (1,834-500-100)`, up to twice its narrowest; past that the sum is
 * cut with "...". The stock left comes first, so it always shows in full.
 */
const SEND_AMOUNTS_MIN_WIDTH_PX = 260;
const SEND_AMOUNTS_MAX_WIDTH_PX = 2 * SEND_AMOUNTS_MIN_WIDTH_PX;

/**
 * The form on the left, the queued shipments on the right; labels in one
 * column, right-aligned amounts in the next.
 *
 * `clear: both` because something at the top of the popup floats, 480px
 * wide (the popup's own width), with the popup's content starting level with
 * it. A flex row starts beside a float rather than under it: measured in the
 * game, it started at the popup's right edge, 359px wide, with the form
 * spilling out and the table squeezed to 0px. Text in plain blocks, as the
 * form had when it stood alone, drops under the float by itself.
 */
function sendAmountsStyles(): string {
  return `
.ika-send-layout {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  clear: both;
}
.ika-send-layout > #${SEND_FORM_COLUMN_ID} {
  flex: none;
}
.ika-send-layout > #${RESOURCE_TABLE_SCROLL_ID} {
  overflow-y: auto;
}
.ika-send-amounts {
  min-width: ${SEND_AMOUNTS_MIN_WIDTH_PX}px;
  max-width: ${SEND_AMOUNTS_MAX_WIDTH_PX}px;
  width: max-content;
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
  /* minmax(0, ...): the stock column may be narrower than its text, so the
     block stops at its max-width and the text ends in "..." instead. */
  grid-template-columns: 65px 150px minmax(0, 1fr);
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
.ika-send-stock {
  font-size: 12px;
  color: #4b4030;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ika-send-amounts-row input:focus {
  border-color: #8b6f3d;
  box-shadow: 0 0 0 2px rgba(139, 111, 61, 0.15);
}`;
}

function installSendAmountsStyles(): void {
  ensureStyle(SEND_AMOUNTS_STYLE_ID, sendAmountsStyles);
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
        <span class="ika-send-stock" id="${stockFieldId(resource.value)}" title="${SEND_DIALOG.stockTitle}"></span>
      </div>`;
  }).join("");

  installSendAmountsStyles();
  openPopup(
    SEND_DIALOG.title,
    `<div class="ika-send-layout">
     <div id="${SEND_FORM_COLUMN_ID}">
     <div><span>${SEND_DIALOG.from}</span><select id="transporterSendFromTown">${towns}</select></div><br/>
     <div><span>${SEND_DIALOG.destination}</span><select id="transporterSendDestination">${towns}</select></div><br/>
     <div class="ika-send-amounts">
       <div class="ika-send-amounts-title">${SEND_DIALOG.amount}</div>
       ${amounts}
     </div><br/>
     <button style="margin-right:5px" class="button" ${action("send.add")}>${BUTTON.add}</button>
     <button style="margin-right:5px" class="button" ${action("send.removeFirst")}>${SEND_DIALOG.removeFirst}</button>
     <button style="margin-right:5px" class="button" ${action("send.removeLast")}>${SEND_DIALOG.removeLast}</button>
     <button style="margin-right:5px" class="button" ${action("send.clearAll")}>${SEND_DIALOG.clearAll}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.close}</button>
     </div>
     <div id="${RESOURCE_TABLE_SCROLL_ID}">
     <table id="resourceTable" class="fullTable" border="1" cellpadding="5">
       <thead>${headerCells(SEND_DIALOG.columns)}</thead>
       <tbody id="resourceTableBody"></tbody>
     </table>
     </div>
     </div>`,
  );
  qs("#transporterSendFromTown")?.addEventListener("change", renderSendStock);
  renderResourceTable();
}

/** Id of the stock shown beside one resource's amount field. */
function stockFieldId(resource: string): string {
  return `transporterSendStock_${resource}`;
}

/**
 * Beside each amount: the source town's stock as saved at the last Scan
 * (`readStoredStock`), less what the queue already ships of it from that
 * town — `1,234 (1,834-500-100)`, or the stock alone when nothing is queued.
 * Every queued shipment counts, Auto Wine's too: they all leave from there.
 */
export function renderSendStock(): void {
  const origin = qs<HTMLSelectElement>("#transporterSendFromTown")?.value;
  if (origin === undefined) return;
  const { accountName, queue } = getState();
  const cityId = townCityId(origin);
  const fromOrigin = queue
    .listOfType("sendResource")
    .filter((task) => task.data.origin === origin);

  for (const resource of RESOURCE_OPTIONS) {
    const cell = qs(`#${stockFieldId(resource.value)}`);
    if (!cell) continue;
    const stock =
      cityId === null
        ? null
        : readStoredStock(accountName, cityId, resource.value);
    if (stock === null) {
      cell.textContent = SEND_DIALOG.stockUnknown;
      continue;
    }
    const queued = fromOrigin
      .filter((task) => task.data.resource === resource.value)
      .map((task) => task.data.amount);
    const left = stock - queued.reduce((sum, amount) => sum + amount, 0);
    cell.textContent =
      queued.length === 0
        ? formatInteger(stock)
        : SEND_DIALOG.stockLeft(
            formatInteger(left),
            [stock, ...queued].map(formatInteger),
          );
  }
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
          ? DURATION.hoursToTenths(measured.stock / measured.consume)
          : DURATION.unknown;

      return `<tr class="txtWine">
        <td><input type="checkbox" ${checked} id="cbSender_${id}" name="${escapeHtml(town.townName)}" value="${id}"/></td>
        <td>${escapeHtml(town.townName)}</td>
        <td><input type="text" id="txtWine_${id}" value="${escapeHtml(perHour)}"/></td>
        <td style="text-align:right">${stock === null ? DURATION.unknown : formatInteger(stock)}</td>
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
     <button style="margin-right:20px" class="button" title="${WINE_DIALOG.importTransportTitle}" ${action("wine.import")}>${WINE_DIALOG.importTransport}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.cancel}</button><br/><br/>
     <div id="winePlanPreview"></div>`,
  );
}

/* ───────────────────────────── Pirate dialog ───────────────────────────── */

export const PIRATE_TOWN_SELECT_ID = "ikaPirateTown";
export const PIRATE_LEVEL_SELECT_ID = "ikaPirateLevel";
const PIRATE_LEVEL_NOTE_ID = "ikaPirateLevelNote";
export const PIRATE_HELP_ID = "ikaPirateHelp";
export const PIRATE_DIALOG_BODY_ID = "ikaPirateDialogBody";
/**
 * The Settings popup's width. The game's popup grows to its content, and the
 * help text, left to itself, stretched it across the screen; at a fixed
 * width the text wraps instead.
 */
export const PIRATE_DIALOG_WIDTH_PX = 400;

/**
 * Pirate Settings: the town whose fortress captures, and the capture level.
 * The levels come from that town's own fortress view, so only those its
 * fortress level allows are offered; changing the town reads them again.
 */
export function openPirateDialog(): void {
  const current = pirateSettingsOrDefault();
  const fortressTowns = new Set(
    storedFortressTowns(getState().accountName).map((town) => town.cityId),
  );
  const options = getTownList()
    .map((town) => {
      const cityId = townCityId(town.townNumber);
      if (cityId === null) return "";
      const selected = cityId === current?.cityId ? " selected" : "";
      const mark = fortressTowns.has(cityId) ? PIRATE.hasFortress : "";
      return `<option value="${cityId}"${selected}>${escapeHtml(town.townName)}${mark}</option>`;
    })
    .join("");

  openPopup(
    PIRATE.dialogTitle,
    `<div id="${PIRATE_DIALOG_BODY_ID}" style="width:${PIRATE_DIALOG_WIDTH_PX}px">
     <p>${PIRATE.town}<select id="${PIRATE_TOWN_SELECT_ID}">${options}</select></p>
     <p>${PIRATE.level}<select id="${PIRATE_LEVEL_SELECT_ID}"></select>
       <span id="${PIRATE_LEVEL_NOTE_ID}"></span></p>
     <p id="${PIRATE_HELP_ID}" style="font-size:11px">${PIRATE.help}</p>
     <button style="margin-right:20px" class="button" ${action("pirate.save")}>${BUTTON.save}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.cancel}</button>
     </div>`,
  );

  const townSelect = qs<HTMLSelectElement>(`#${PIRATE_TOWN_SELECT_ID}`);
  if (!townSelect) return;
  townSelect.addEventListener("change", () => {
    void fillPirateLevels(townSelect.value, null);
  });
  if (townSelect.value) {
    void fillPirateLevels(townSelect.value, current?.level ?? null);
  }
}

/** Read the town's fortress and offer the capture levels it allows. */
export async function fillPirateLevels(
  cityId: string,
  chosenLevel: number | null,
): Promise<void> {
  const levelSelect = qs<HTMLSelectElement>(`#${PIRATE_LEVEL_SELECT_ID}`);
  const note = qs(`#${PIRATE_LEVEL_NOTE_ID}`);
  if (!levelSelect || !note) return;
  levelSelect.innerHTML = "";
  note.textContent = PIRATE.loadingLevels;
  let levels;
  try {
    const view = await fetchFortressView(cityId, fortressPosition(cityId));
    levels = view ? openCaptureLevels(view) : [];
  } catch (e) {
    note.textContent = PIRATE.levelsFailed(errorMessage(e));
    return;
  }
  // The town was changed again while this one was read.
  if (qs<HTMLSelectElement>(`#${PIRATE_TOWN_SELECT_ID}`)?.value !== cityId) {
    return;
  }
  if (levels.length === 0) {
    note.textContent = PIRATE.noFortressHere;
    return;
  }
  note.textContent = "";
  const wanted = levels.some((row) => row.buildingLevel === chosenLevel)
    ? chosenLevel
    : levels[0].buildingLevel;
  levelSelect.innerHTML = levels
    .map(
      (row) =>
        `<option value="${row.buildingLevel}"${row.buildingLevel === wanted ? " selected" : ""}>` +
        escapeHtml(
          PIRATE.levelOption(
            row.buildingLevel,
            row.name,
            formatTimeLengthToStr(row.durationSeconds * 1000),
          ),
        ) +
        `</option>`,
    )
    .join("");
}

/** The town and level the Pirate dialog holds, or null without a level. */
export function readPirateDialog(): { cityId: string; level: number } | null {
  const cityId = qs<HTMLSelectElement>(`#${PIRATE_TOWN_SELECT_ID}`)?.value;
  const level = Number(
    qs<HTMLSelectElement>(`#${PIRATE_LEVEL_SELECT_ID}`)?.value,
  );
  return cityId && Number.isInteger(level) && level > 0
    ? { cityId, level }
    : null;
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
        <td style="text-align:right">${DURATION.hoursToTenths(allocation.finalHours)}${
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

export const BUILD_TOWN_SELECT_ID = "autoBuildTown";
const BUILD_TABLE_HOLDER_ID = "autoBuildTableHolder";

/**
 * The buildings the dialog lists right now, and whose they are; null while
 * the list shows a note instead. Kept so a + or - can redraw the planned
 * levels without asking the game for the town again.
 */
let listedBuildings: {
  townName: string;
  slots: readonly BuildingSlot[];
} | null = null;

/**
 * A building's line: name, planned level, + then -, on one row in that order.
 * A flex row lays its children out left to right whatever a stylesheet says
 * about floats (the dialog's own, in `styles.ts`, floats its buttons right,
 * which put - left of +), and never wraps; being a block, each line starts on
 * its own row without a `<br/>`.
 *
 * The + carries `margin-left:auto` (`BUILDING_BUTTONS_STYLE`), so + and -
 * sit together at the right edge of the column, the name at the left.
 *
 * `float:none` because the dialog's sheet floats every line of the table
 * (`styles.ts`). Floated lines with no `<br/>` between them were all counted
 * on one row when the column's width was worked out: measured in the game,
 * 24 lines made it 3,518px wide and pushed the queue column out of view.
 */
const BUILDING_LINE_STYLE =
  "display:flex;align-items:center;gap:4px;white-space:nowrap;float:none";

/** On the + of a building's line: takes the free space, so + and - go right. */
const BUILDING_BUTTONS_STYLE = "margin-left:auto";

/**
 * One line per building, each with a + that saves one more level to
 * `townName` and a - that takes the highest saved one off (greyed out when
 * nothing is saved). A building with upgrades saved shows, in red, the level
 * it will reach: `Tavern 15 (17)`.
 */
function renderBuildingList(
  slots: readonly BuildingSlot[],
  townName: string,
): string {
  const planned = plannedLevels(townName);
  return slots
    .map((slot) => {
      const level = planned.get(slot.positionId);
      const plannedLabel =
        level === undefined ? "" : ` <span style="color:red">(${level})</span>`;
      const plus = `<button class="button" style="${BUILDING_BUTTONS_STYLE}" ${action(
        "build.add",
        {
          "ika-position": slot.positionId,
          "ika-building": slot.buildingName,
          "ika-town": townName,
        },
      )}>+</button>`;
      const minus = `<button class="button"${level === undefined ? " disabled" : ""} ${action(
        "build.decrease",
        { "ika-position": slot.positionId, "ika-town": townName },
      )}>-</button>`;
      return `<span style="${BUILDING_LINE_STYLE}">${escapeHtml(slot.buildingName)}${plannedLabel}${plus}${minus}</span>`;
    })
    .join("");
}

/**
 * The list for a town's slots, remembered for the redraw after a + or -.
 *
 * The saved levels the slots have already reached come off the town's list
 * first, so the queue drawn beside it, and the planned levels, start from
 * what is really left to build. Call it before the queue cell is rendered.
 */
function listBuildings(slots: readonly SlotState[], townName: string): string {
  removeCompletedUpgrades(townName, slots);
  const listed = buildingSlotsOf(slots);
  listedBuildings = { townName, slots: listed };
  return renderBuildingList(listed, townName);
}

/**
 * The picked town's table: its buildings on the left, its saved queue on the
 * right. `buildingList` is already HTML: the list, or a line saying why
 * there is none yet.
 */
function renderBuildTable(townName: string, buildingList: string): string {
  return `<table id="autoBuildTable" class="fullTable fixTable" border="1" cellpadding="5">
       <tr><th>${BUILD_DIALOG.buildingList}</th><th>${escapeHtml(townName)}</th></tr>
       <tr><td id="tdListBuilding">${buildingList}</td><td class="tdQueue" data-ika-town-cell="${escapeHtml(townName)}">${renderTownQueue(townName)}</td></tr>
     </table>`;
}

function setBuildTable(townName: string, buildingList: string): void {
  const holder = qs(`#${BUILD_TABLE_HOLDER_ID}`);
  if (holder) holder.innerHTML = renderBuildTable(townName, buildingList);
}

/** A line in place of the building list. */
function buildingListNote(text: string): string {
  listedBuildings = null;
  return `<i>${escapeHtml(text)}</i>`;
}

/**
 * Show the town picked in the dropdown (an index into the game's town list).
 *
 * The town on screen is read from the page, as before. Any other town is
 * asked for with a request, because switching to it reloads the page and
 * would close the dialog. Its saved queue shows straight away; its buildings
 * once the game answers, unless another town has been picked by then.
 */
async function showBuildTown(townNumber: string): Promise<void> {
  const townName = getTownNameFromList(townNumber);
  if (townName === getCurrentTownName()) {
    setBuildTable(townName, listBuildings(readTownSlots(), townName));
    return;
  }

  const cityId = townCityId(townNumber);
  if (cityId === null) {
    setBuildTable(townName, buildingListNote(BUILD_DIALOG.noTownId));
    return;
  }
  setBuildTable(townName, buildingListNote(BUILD_DIALOG.loadingBuildings));

  let slots: SlotState[] | null;
  let failure: string | null = null;
  try {
    slots = await fetchTownSlots(cityId);
  } catch (e) {
    slots = null;
    failure = errorMessage(e);
  }
  // Another town was picked while this one was read.
  if (qs<HTMLSelectElement>(`#${BUILD_TOWN_SELECT_ID}`)?.value !== townNumber) {
    return;
  }
  setBuildTable(
    townName,
    slots !== null
      ? listBuildings(slots, townName)
      : buildingListNote(
          failure === null
            ? BUILD_DIALOG.noBuildings
            : BUILD_DIALOG.buildingsFailed(failure),
        ),
  );
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

/**
 * Auto Build Settings: a town dropdown, like Transport Settings, and the
 * picked town's buildings and saved queue. It opens on the town on screen.
 */
export function openAutoBuildDialog(): void {
  const currentTown = getCurrentTownName();
  const currentNumber = getTownNumberByName(currentTown);
  const options = getTownList()
    .map(
      (town) =>
        `<option value="${town.townNumber}"${town.townNumber === currentNumber ? " selected" : ""}>` +
        `${escapeHtml(town.townName)}</option>`,
    )
    .join("");

  openPopup(
    currentTown,
    `<div><span>${BUILD_DIALOG.town}</span><select id="${BUILD_TOWN_SELECT_ID}">${options}</select></div><br/>
     <div id="${BUILD_TABLE_HOLDER_ID}">${renderBuildTable(
       currentTown,
       listBuildings(readTownSlots(), currentTown),
     )}</div><br/>
     <p style="font-size:11px">${BUILD_DIALOG.savedAsYouGo}</p>
     <button style="margin-right:20px" class="button" ${action("build.save")}>${BUTTON.save}</button>
     <button style="margin-right:20px" class="button" ${action("build.clearTown")}>${BUILD_DIALOG.clearTown}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.close}</button><br/><br/>`,
  );

  const townSelect = qs<HTMLSelectElement>(`#${BUILD_TOWN_SELECT_ID}`);
  townSelect?.addEventListener("change", () => {
    void showBuildTown(townSelect.value);
  });
}

/**
 * The town picked in Auto Build Settings' dropdown, as the player chose for
 * Clear All. Null when the dialog is not open.
 *
 * The dropdown, not the table: the two differ only when the town on screen
 * is missing from the dropdown, where the dialog shows that town while the
 * dropdown shows its first entry, and it is the dropdown's town that goes.
 */
export function pickedBuildTown(): string | null {
  const select = qs<HTMLSelectElement>(`#${BUILD_TOWN_SELECT_ID}`);
  if (!select) return null;
  return getTownNameFromList(select.value) || null;
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
  if (!cell) return;
  cell.innerHTML = renderTownQueue(townName);
  // The planned levels beside the buildings follow the queue.
  const list = qs("#tdListBuilding");
  if (list && listedBuildings?.townName === townName) {
    list.innerHTML = renderBuildingList(listedBuildings.slots, townName);
  }
}

/* ─────────────────────────── Crawl dialog ──────────────────────────────── */

/** The radio group's name: one group, so only one crawl can be picked. */
const CRAWL_KIND_NAME = "ikaCrawlKind";

/** What the Crawl dialog can save, one per press: a key of `CRAWL_DIALOG.kinds`. */
export type CrawlKind = keyof typeof CRAWL_DIALOG.kinds;

/** Every crawl, in the order the dialog lists them. */
const CRAWL_KINDS = Object.keys(CRAWL_DIALOG.kinds) as CrawlKind[];

/** The id of a crawl's radio button. */
export function crawlRadioId(kind: CrawlKind): string {
  return `ikaCrawl_${kind}`;
}

/**
 * One radio button per thing Crawl can save, none picked at first. A single
 * choice rather than checkboxes: two crawls started by one press ran side by
 * side, the wine one scanning every town while the other read the page.
 */
export function openCrawlDialog(): void {
  const radios = CRAWL_KINDS.map(
    (kind) =>
      `<label style="display:block; margin-bottom:6px">` +
      `<input type="radio" name="${CRAWL_KIND_NAME}" id="${crawlRadioId(kind)}" value="${kind}"/> ` +
      `${CRAWL_DIALOG.kinds[kind]}</label>`,
  ).join("");
  openPopup(
    CRAWL_DIALOG.title,
    `<div>${radios}</div><br/>
     <button style="margin-right:20px" class="button" ${action("crawl.run")}>${CRAWL_DIALOG.run}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.close}</button><br/><br/>`,
  );
}

/** The Crawl by id box: the tool's own, apart from the game's popup. */
const ELEMENT_CRAWL_BOX_ID = "ikaElementCrawl";
const ELEMENT_CRAWL_INPUT_ID = "ikaElementCrawlTarget";
const ELEMENT_CRAWL_MODE_NAME = "ikaElementCrawlMode";

/**
 * The Crawl by id box's stacking order: above the game's popup it stands
 * beside (the popup measured `z-index: 20000` in the game) and the tool's
 * window (1000), below the toasts (100000), so a crawl's toast is not hidden
 * behind the box that started it.
 */
const ELEMENT_CRAWL_BOX_Z_INDEX = 30000;

type ElementCrawlMode = keyof typeof ELEMENT_CRAWL.modes;

/**
 * Crawl by id: a box for an element id, a CSS selector or JS code, and
 * whether to save the element's HTML and CSS or what the code returns.
 *
 * Not the game's popup: every settings dialog of the tool is drawn in that
 * one popup, so opening this there would close the very dialog it is meant
 * to look at. This box stays open beside it until its Close is pressed.
 */
export function openElementCrawlBox(): void {
  if (qs(`#${ELEMENT_CRAWL_BOX_ID}`)) return;
  const modes = (Object.keys(ELEMENT_CRAWL.modes) as ElementCrawlMode[])
    .map(
      (mode, index) =>
        `<label style="display:block; margin:4px 0">` +
        `<input type="radio" name="${ELEMENT_CRAWL_MODE_NAME}" value="${mode}"${index === 0 ? " checked" : ""}/> ` +
        `${ELEMENT_CRAWL.modes[mode]}</label>`,
    )
    .join("");
  openCrawlBox(
    ELEMENT_CRAWL_BOX_ID,
    `<div style="font-weight:bold; margin-bottom:6px">${ELEMENT_CRAWL.title}</div>` +
      `<label for="${ELEMENT_CRAWL_INPUT_ID}">${ELEMENT_CRAWL.target}</label>` +
      `<textarea id="${ELEMENT_CRAWL_INPUT_ID}" rows="4" placeholder="${escapeHtml(ELEMENT_CRAWL.placeholder)}" ` +
      `style="display:block; width:100%; box-sizing:border-box; margin:4px 0; font-family:monospace"></textarea>` +
      modes +
      `<p style="font-size:11px; margin:6px 0">${ELEMENT_CRAWL.hint}</p>` +
      `<button style="margin-right:10px" class="button" ${action("crawl.element.run")}>${ELEMENT_CRAWL.run}</button>` +
      `<button class="button" ${action("crawl.element.close")}>${BUTTON.close}</button>`,
  );
}

export function closeElementCrawlBox(): void {
  removeElement(`#${ELEMENT_CRAWL_BOX_ID}`);
}

/**
 * A crawl box of the tool's own: fixed at the top right, above the game's
 * popup, marked so a page crawl leaves it out.
 */
function openCrawlBox(id: string, innerHtml: string): void {
  const box = document.createElement("div");
  box.id = id;
  box.className = CRAWL_BOX_CLASS;
  box.setAttribute(
    "style",
    `position:fixed; top:80px; right:20px; z-index:${ELEMENT_CRAWL_BOX_Z_INDEX}; width:380px; ` +
      "padding:10px 12px; background:#fdf7dd; border:1px solid #7e4a21; " +
      "border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.3); " +
      "font-size:12px; color:#542c0f; text-align:left",
  );
  box.innerHTML = innerHtml;
  document.body.appendChild(box);
}

/** The Crawl page box. */
const PAGE_CRAWL_BOX_ID = "ikaPageCrawl";

/**
 * Crawl page: a box with one button, beside the game's screens. Not the
 * game's popup, which the Crawl dialog itself uses: a screen drawn there
 * (abandoning a colony, an attack form) could be gone by the time the
 * dialog's button is pressed. The player opens the screen, then presses
 * Crawl here.
 */
export function openPageCrawlBox(): void {
  if (qs(`#${PAGE_CRAWL_BOX_ID}`)) return;
  openCrawlBox(
    PAGE_CRAWL_BOX_ID,
    `<div style="font-weight:bold; margin-bottom:6px">${PAGE_CRAWL.title}</div>` +
      `<p style="font-size:11px; margin:6px 0">${PAGE_CRAWL.hint}</p>` +
      `<button style="margin-right:10px" class="button" ${action("crawl.page.run")}>${PAGE_CRAWL.run}</button>` +
      `<button class="button" ${action("crawl.page.close")}>${BUTTON.close}</button>`,
  );
}

export function closePageCrawlBox(): void {
  removeElement(`#${PAGE_CRAWL_BOX_ID}`);
}

/** What the Crawl by id box holds: the text typed, and the mode picked. */
export function readElementCrawlForm(): {
  target: string;
  mode: ElementCrawlMode;
} | null {
  const input = qs<HTMLTextAreaElement>(`#${ELEMENT_CRAWL_INPUT_ID}`);
  if (!input) return null;
  const picked = qs<HTMLInputElement>(
    `input[name="${ELEMENT_CRAWL_MODE_NAME}"]:checked`,
  )?.value;
  const mode: ElementCrawlMode = picked === "js" ? "js" : "html";
  return { target: input.value.trim(), mode };
}

/** The crawl picked in the dialog, or `null` when none is. */
export function readCrawlChoice(): CrawlKind | null {
  const picked = qs<HTMLInputElement>(
    `input[name="${CRAWL_KIND_NAME}"]:checked`,
  );
  return CRAWL_KINDS.find((kind) => kind === picked?.value) ?? null;
}
