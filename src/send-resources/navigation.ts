/**
 * In-game navigation: reading the town list, switching towns, opening the port.
 *
 * This is the most-used module and the one the original duplicated most:
 * `gotoTown`, `townClick` and `townClickWine` were all the same recursive shape.
 */

import { clickIfPresent, qs, qsa, waitForElements } from "@core/dom";
import { waitFor } from "@core/async";
import { getCurrentTownName } from "@core/ikariam/globals";
import { SEL } from "@core/ikariam/selectors";
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
  const node = townNodes()[Number(townNumber)] as HTMLElement | undefined;
  if (!node) return null;
  const anchor =
    node.querySelector?.("a") ?? (node.childNodes[0] as HTMLElement);
  return anchor instanceof HTMLElement ? anchor : null;
}

/** Town name for a dropdown index, always trimmed. */
export function getTownNameFromList(townNumber: number | string): string {
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
 * Switch to `townNumber` and wait until the breadcrumb reflects it.
 *
 * The original (`gotoTown`) used an `isCallback` flag so it clicked only once
 * and then polled; the same semantics are kept here.
 *
 * Unlike the original this gives up after `TOWN_SWITCH_TIMEOUT_MS` instead of
 * polling forever. With a single shared task runner an unbounded wait no longer
 * stalls just one feature — it wedges every automated action permanently.
 * Throwing lets the runner retry on the next tick.
 */
export async function gotoTown(townNumber: number | string): Promise<void> {
  const target = getTownNameFromList(townNumber);
  if (!target) {
    throw new Error(`No town at dropdown index ${townNumber}`);
  }
  if (getCurrentTownName() === target) return;

  if (!switchTown(townNumber, target)) {
    throw new Error(`No way to switch to "${target}" on this page`);
  }

  await waitFor(() => getCurrentTownName() === target, {
    intervalMs: 100,
    timeoutMs: TOWN_SWITCH_TIMEOUT_MS,
    label: `gotoTown(${target})`,
  });
}

/**
 * Click something that switches town. Returns whether anything was clicked.
 *
 * Two routes, in order:
 *
 *  1. The Empire Overview board's Build tab. This is what the original used and
 *     is kept first so behaviour is unchanged wherever that board is open.
 *
 *  2. The game's own town dropdown. This fallback is new, and it removes a
 *     hidden hard dependency: `#BuildTab` belongs to the Empire Overview
 *     userscript, not to the game. A live page capture with only the game
 *     running matched it ZERO times — so on its own, Send Resources could never
 *     change town, and every task would fail on the 15s timeout.
 */
function switchTown(townNumber: number | string, target: string): boolean {
  for (const span of qsa<HTMLElement>(SEL.buildTabTownNames)) {
    if (span.innerHTML.trim() === target) {
      span.click();
      return true;
    }
  }

  const anchor = townAnchor(townNumber);
  if (anchor) {
    anchor.click();
    return true;
  }
  return false;
}

/**
 * Open the current town's port.
 *
 * The original probed `#position1` then `#position2`, and accepted a port under
 * construction as well. That priority order is preserved.
 * `includeConstruction: false` is used by Auto Wine, which only looked for
 * finished ports.
 */
export function openPort(includeConstruction = true): boolean {
  const classes = [
    "port",
    ...(includeConstruction ? ["constructionSite"] : []),
  ];
  for (const className of classes) {
    for (const position of [1, 2]) {
      if (qs(SEL.position(position))?.className.includes(className)) {
        return clickIfPresent(SEL.cityPositionLink(position));
      }
    }
  }
  return false;
}

/**
 * Pick the destination town inside the port view.
 *
 * Trap carried over from the original: the port list does NOT include the town
 * you are standing in, so every index above the source index shifts down by
 * one. This function expects an ALREADY adjusted index — see
 * `adjustDestinationIndex`.
 */
export async function clickDestinationTown(
  adjustedIndex: number,
): Promise<void> {
  const links = await waitForElements<HTMLElement>(SEL.dockCities, 1);
  const link = links[adjustedIndex];
  if (!link) {
    throw new Error(`No destination town at port index ${adjustedIndex}`);
  }
  link.click();
}

/** Compensate for the port list omitting the source town. */
export function adjustDestinationIndex(
  destination: number | string,
  origin: number | string,
): number {
  const dest = Number(destination);
  return dest > Number(origin) ? dest - 1 : dest;
}

/** Return to the town view. */
export function backToCity(): void {
  clickIfPresent(SEL.cityLink);
}

/** Close the game's own popup if one is open. */
export function closeGamePopup(): void {
  clickIfPresent(SEL.closeButton);
}

/** Open the safehouse (hotkey S). */
export function openSpyBuilding(): void {
  if (!clickIfPresent(SEL.safehouse)) {
    alert("No safehouse in this town!");
  }
}

/** Press "max" on every unit slot (hotkey A). */
export function sendAllArmy(): void {
  qsa<HTMLElement>(SEL.setMax).forEach((button) => button.click());
}
