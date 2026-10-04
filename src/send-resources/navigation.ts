/**
 * In-game navigation: reading the town list, switching towns, opening the port.
 *
 * This is the most-used module and the one the original duplicated most:
 * `gotoTown`, `townClick` and `townClickWine` were all the same recursive shape.
 */

import { clickIfPresent, qs, qsa, waitForElement } from "@core/dom";
import { waitFor } from "@core/async";
import { getCurrentTownName, pageWindow } from "@core/ikariam/globals";
import { modelCityName } from "@core/ikariam/model";
import { SEL } from "@core/ikariam/selectors";
import { logInfo } from "@core/logger";
import { showToast } from "@core/ui/window";
import { MISC } from "./messages";
import type { TownEntry } from "./types";

/** How long to wait for a town switch before giving up. */
const TOWN_SWITCH_TIMEOUT_MS = 15_000;

/** The town `<li>` nodes. Re-read every time because the DOM is swapped on reload. */
function townNodes(): ChildNode[] {
  const container = qs(SEL.townListContainer);
  return container ? Array.from(container.childNodes) : [];
}

export function getTownCount(): number {
  return townNodes().length;
}

/**
 * The `<a>` inside a town's dropdown entry.
 *
 * Real markup: `<li selectvalue="78038" class="ownCity"><a title="W-Athens"> W-Athens</a></li>`
 * — note the LEADING SPACE inside the anchor, which is why every name read from
 * here is trimmed.
 */
function townAnchor(townNumber: number | string): HTMLElement | null {
  // Indexed through `childNodes`, not `children`: a dropdown index is what
  // every stored task and setting records, and it has always counted nodes.
  // Anything that is not an element (a text node) simply has no anchor.
  const node = townNodes()[Number(townNumber)];
  if (!(node instanceof HTMLElement)) return null;
  const anchor = node.querySelector("a") ?? node.firstElementChild;
  return anchor instanceof HTMLElement ? anchor : null;
}

/**
 * City id of a dropdown entry, from its `selectvalue`. `null` when there is none.
 *
 * Measured: `<li selectvalue="297034">` is the town whose model entry is
 * `city_297034`, so this is the bridge from a dropdown index to the model.
 */
function townCityId(townNumber: number | string): string | null {
  const node = townNodes()[Number(townNumber)];
  if (!(node instanceof HTMLElement)) return null;
  const cityId = node.getAttribute("selectvalue");
  return cityId && /^\d+$/.test(cityId) ? cityId : null;
}

/**
 * Town name for a dropdown index, always trimmed.
 *
 * Read from the model first, which names the town exactly as the breadcrumb
 * does. The dropdown's `title` does not always: with the game's "show
 * coordinates" option on it reads `"[42:97]  S-Clone1"`, so every name looked
 * up or waited for from it never matched, and Auto Build failed every task
 * with `Town "S-Clone1" not found`. The `title` stays as the fallback for a
 * page without the model.
 */
export function getTownNameFromList(townNumber: number | string): string {
  const cityId = townCityId(townNumber);
  const fromModel = cityId === null ? null : modelCityName(cityId);
  if (fromModel) return fromModel;

  const anchor = townAnchor(townNumber);
  if (!anchor) return "";
  // `title` carries the clean name; innerHTML has the stray leading space.
  return (anchor.getAttribute("title") ?? anchor.innerHTML).trim();
}

/**
 * Town list for display, ordered by the prefix players put in front of the name.
 *
 * The original assumed a NUMERIC prefix (`"3-Athens"` -> 3) and sorted on
 * `Number(name.split("-")[0])`. Real town names often use a letter prefix
 * instead — a live account shows `W-Athens`, `M-Corinth`, `C-Thebes`,
 * `S-Sparta` (the resource each town trades). `Number("W")` is NaN, and NaN
 * compares false both ways, so the comparator returned 0 for every pair and the
 * sort was a silent no-op for those players.
 *
 * Now: numeric prefixes sort numerically and come first; everything else sorts
 * alphabetically, which groups a letter-prefix scheme the way it was meant.
 *
 * `townNumber` is untouched by any of this — it stays the dropdown position the
 * game navigates by. Only presentation order changes.
 */
export function getTownList(): TownEntry[] {
  const list: TownEntry[] = [];
  for (let i = 0; i < townNodes().length; i++) {
    // Trimmed here, not at each call site: the raw innerHTML carries a leading
    // space, and `getTownNameFromList` trims while this used not to — so the
    // same town had two different spellings depending on which one you asked.
    const townName = getTownNameFromList(i);
    list.push({
      index: Number(townName.split("-")[0]),
      townNumber: i,
      townName,
    });
  }

  list.sort((a, b) => {
    const aNumbered = Number.isFinite(a.index);
    const bNumbered = Number.isFinite(b.index);
    if (aNumbered && bNumbered) {
      return a.index - b.index || a.townName.localeCompare(b.townName);
    }
    if (aNumbered) return -1;
    if (bNumbered) return 1;
    return a.townName.localeCompare(b.townName);
  });
  return list;
}

/** Dropdown index of a town, looked up by name. `null` when not found. */
export function getTownNumberByName(townName: string): number | null {
  const target = townName.trim();
  for (let i = 0; i < townNodes().length; i++) {
    if (getTownNameFromList(i) === target) return i;
  }
  return null;
}

/**
 * The town switch sent last, kept in `sessionStorage` across the page load it
 * causes, so the next page can tell whether it landed. This tab only, and out
 * of the data export, like the board's pending view.
 */
const PENDING_SWITCH_KEY = "ika_pendingTownSwitch";

/**
 * How long a sent switch counts as just sent. A switch reloads the page in
 * about 0.3 s (measured 02/10); past this, sending it again is a new attempt.
 */
const SWITCH_LANDING_WINDOW_MS = 30_000;

interface PendingSwitch {
  target: string;
  sentAt: number;
}

function readPendingSwitch(): PendingSwitch | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SWITCH_KEY);
    return raw ? (JSON.parse(raw) as PendingSwitch) : null;
  } catch {
    return null;
  }
}

function forgetPendingSwitch(): void {
  sessionStorage.removeItem(PENDING_SWITCH_KEY);
}

/**
 * Switch to `townNumber` and wait until the breadcrumb reflects it.
 *
 * The original (`gotoTown`) used an `isCallback` flag so it clicked only once
 * and then polled; the same semantics are kept here.
 *
 * Unlike the original this gives up after `TOWN_SWITCH_TIMEOUT_MS` instead of
 * polling forever. With a single shared task runner an unbounded wait no longer
 * stalls just one feature — it wedges every automated action permanently.
 * Throwing lets the runner retry on the next tick.
 *
 * A SWITCH RELOADS THE PAGE. Measured 02/10 from a city view: the server
 * answers `changeCurrentCity` with `["custom", ["reload", {link:
 * "?view=city&cityId=<target>&currentCityId=<target>"}]]`, and the game loads
 * that page — the dropdown does the same by hand. The wait below dies with
 * the old page; the task is still queued, runs again on the new one, and finds
 * itself in the right town. A switch that did not land would reload into the
 * wrong town and send the same switch again, for ever, so the switch is noted
 * before it is sent and not sent twice to the same town within
 * `SWITCH_LANDING_WINDOW_MS`: the task throws instead, and the runner gives up
 * on it after a few.
 *
 * Three routes, in order:
 *
 *  1. The game's own form (`submitChangeCityForm`) — what the dropdown sends.
 *     It needs nothing but the page. The reload loop it was blamed for on
 *     26/09 was the coordinates in the town names: the page landed, the name
 *     never matched, and the switch was sent again.
 *  2. The Empire Overview board's town name (`clickBoardTownName`), which
 *     sends the same `changeCurrentCity` over ajax.
 *  3. A click on the dropdown's `<a>`, which is known not to switch town
 *     (measured, 25/09) and is kept only as the last resort it always was.
 */
export async function gotoTown(townNumber: number | string): Promise<void> {
  const target = getTownNameFromList(townNumber);
  if (!target) {
    throw new Error(`No town at dropdown index ${townNumber}`);
  }
  if (getCurrentTownName() === target) {
    forgetPendingSwitch();
    return;
  }

  const pending = readPendingSwitch();
  if (
    pending?.target === target &&
    Date.now() - pending.sentAt < SWITCH_LANDING_WINDOW_MS
  ) {
    // The seconds go to the log, not into the message: the bug reporter
    // groups repeats by message, and a message that changed every second
    // made one fault fill all 50 records (03/10).
    const secondsAgo = Math.round((Date.now() - pending.sentAt) / 1000);
    logInfo(`The switch to "${target}" was sent ${secondsAgo}s ago`);
    throw new Error(
      `The switch to "${target}" did not land ` +
        `(now in "${getCurrentTownName()}") - not sending it again`,
    );
  }

  const sent: PendingSwitch = { target, sentAt: Date.now() };
  sessionStorage.setItem(PENDING_SWITCH_KEY, JSON.stringify(sent));
  if (
    !submitChangeCityForm(townNumber) &&
    !clickBoardTownName(target) &&
    !clickDropdownTown(townNumber)
  ) {
    forgetPendingSwitch();
    throw new Error(`No way to switch to "${target}" on this page`);
  }

  await waitFor(() => getCurrentTownName() === target, {
    intervalMs: 100,
    timeoutMs: TOWN_SWITCH_TIMEOUT_MS,
    label: `gotoTown(${target})`,
  });
  // Landed without a reload: nothing for the next page to check.
  forgetPendingSwitch();
}

/**
 * Change town the way the game's dropdown does. Returns whether it was sent.
 *
 * Put the city id into `#js_cityIdOnChange` and submit `#changeCityForm`
 * through the game's `ajaxHandlerCallFromForm` — what the Empire Overview
 * board uses to open another town's view (`switchTownWithGameForm` in
 * `game-api.ts`) and what IkaEasy V4 does. The game answers with a reload
 * into the new town (see `gotoTown`).
 *
 * Sends nothing, and returns false, when the entry has no city id or the page
 * lacks the form or the game function.
 */
function submitChangeCityForm(townNumber: number | string): boolean {
  const cityId = townCityId(townNumber);
  const form = qs<HTMLFormElement>(SEL.changeCityForm);
  const cityInput = qs<HTMLInputElement>(SEL.changeCityInput);
  const submitForm = (
    pageWindow as { ajaxHandlerCallFromForm?: (form: HTMLFormElement) => void }
  ).ajaxHandlerCallFromForm;
  if (cityId === null || !form || !cityInput) return false;
  if (typeof submitForm !== "function") return false;

  cityInput.value = cityId;
  submitForm(form);
  return true;
}

/**
 * Click the town's name on the Empire Overview board's Build tab. Returns
 * whether it was there to click.
 *
 * `#BuildTab` belongs to the Empire Overview userscript, not to the game; a
 * live capture with only the game running matched it zero times.
 */
function clickBoardTownName(target: string): boolean {
  for (const span of qsa<HTMLElement>(SEL.buildTabTownNames)) {
    if (span.innerHTML.trim() === target) {
      span.click();
      return true;
    }
  }
  return false;
}

/** Click the town's entry in the game's dropdown. Returns whether it was there. */
function clickDropdownTown(townNumber: number | string): boolean {
  const anchor = townAnchor(townNumber);
  if (anchor) {
    anchor.click();
    return true;
  }
  return false;
}

/**
 * Whether the current town has a port, read from the town view's sea slots.
 *
 * The original probed `#position1` then `#position2`, and accepted a port
 * under construction as well; the same test, without clicking it — the
 * shipment form is opened directly now (`openShipmentForm`).
 */
export function townHasPort(): boolean {
  for (const className of ["port", "constructionSite"]) {
    for (const position of [1, 2]) {
      if (qs(SEL.position(position))?.className.includes(className)) {
        return true;
      }
    }
  }
  return false;
}

/** How long the shipment form has to appear after asking for it. */
const SHIPMENT_FORM_TIMEOUT_MS = 15_000;

/**
 * Open the shipment form from the current town to `destination` (a dropdown
 * index), and wait until it is on screen for that town.
 *
 * The game's port no longer lists destinations to click. Its transport panel
 * (`#js_transportPanel`, hidden in every page) holds one `a.action_transport`
 * per town, `href="?view=transport&destinationCityId=<id>"` with
 * `onclick="ajaxHandlerCall(this.href)"` (measured 26/09); the form that
 * opens carries the destination in a hidden `destinationCityId` field
 * (captured 03/10). This makes the same call with the destination's city id
 * — the dropdown entry's `selectvalue` — and waits for that field to hold it,
 * so a form for another town is never filled in. Nothing is entered here, so
 * throwing is safe: the runner retries, and gives up after a few.
 */
export async function openShipmentForm(
  destination: number | string,
): Promise<void> {
  const cityId = townCityId(destination);
  if (cityId === null) {
    throw new Error(`No city id for the town at dropdown index ${destination}`);
  }
  const ajaxHandlerCall = (
    pageWindow as { ajaxHandlerCall?: (url: string) => void }
  ).ajaxHandlerCall;
  if (typeof ajaxHandlerCall !== "function") {
    throw new Error("The game's ajaxHandlerCall is not on this page");
  }
  ajaxHandlerCall(`?view=transport&destinationCityId=${cityId}`);
  await waitForElement(SEL.shipmentDestination(cityId), {
    timeoutMs: SHIPMENT_FORM_TIMEOUT_MS,
  });
}

/**
 * Return to the town view — which, on the live game, reloads the page.
 *
 * `reason` is required and logged, so a log that shows the page reloading
 * over and over also says who did it. Five places call this, and the reload
 * loops of 26/09 could not be told apart without it.
 */
export function backToCity(reason: string): void {
  if (clickIfPresent(SEL.cityLink)) logInfo(`Back to the town view: ${reason}`);
}

/** Whether neither the element nor any of its ancestors is `display: none`. */
function isDisplayed(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return true;
}

/**
 * Close the game's own popup if one is open.
 *
 * Only a close button that is on screen is clicked. The game's transport
 * panel (`#js_transportPanel`) sits hidden in every page with a `.close` of
 * its own, the first in the document, and clicking it SHOWS the panel
 * (measured, 26/09) — so taking the first `.close`, as the original did,
 * opened the transport panel on every Auto Build task.
 */
export function closeGamePopup(): void {
  const button = qsa<HTMLElement>(SEL.closeButton).find(isDisplayed);
  button?.click();
}

/** Open the safehouse (hotkey S). */
export function openSpyBuilding(): void {
  if (!clickIfPresent(SEL.safehouse)) {
    showToast(MISC.noSafehouse);
  }
}

/** Press "max" on every unit slot (hotkey A). */
export function sendAllArmy(): void {
  qsa<HTMLElement>(SEL.setMax).forEach((button) => button.click());
}
