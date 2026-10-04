/**
 * Auto Wine — move wine from a surplus town to the towns that need it.
 *
 * The important difference from the original: it used to hand every receiver a
 * flat `winePerHour * multiple` without looking at existing stock. Here both
 * stock and consumption are read from the Empire Overview board and split by
 * `distributeWine`, so every town ends up able to hold out for the same time.
 * See `wine-distribution.ts` for the formula and the edge cases.
 *
 * No DOM automation lives here any more: shipping wine reuses the shared
 * `sendResource` handler with `resource: "wine"`.
 */

import { qs, qsa } from "@core/dom";
import { SECONDS_PER_HOUR } from "@core/format";
import { logInfo } from "@core/logger";
import { getCurrentTownName } from "@core/ikariam/globals";
import { SEL } from "@core/ikariam/selectors";
import { showToast } from "@core/ui/window";
import { parseAmount, readCurrentWine } from "../game-state";
import { AUTO_WINE } from "../messages";
import { getTownList, getTownNameFromList, townCityId } from "../navigation";
import { getPerShipCapacity } from "../ship-capacity";
import {
  AUTO_WINE_LABEL,
  getState,
  loadReceivers,
  loadSenders,
  routeSeconds,
  saveReceivers,
} from "../state";
import type { WineReceiver } from "../types";
import { projectedStats } from "../town-cache";
import {
  distributeWine,
  type WineDistributionResult,
  type WineTown,
} from "./wine-distribution";

/**
 * Hours of its own consumption the source town keeps back.
 *
 * A source town produces wine, so it does not take part in the levelling. It
 * only has to keep its tavern supplied until production refills the stock, and
 * one hour of consumption covers that.
 */
export const SOURCE_RESERVE_HOURS = 1;

/** Wine kept at the source town when its consumption is not known. */
export const FALLBACK_WINE_RESERVE = 500;

interface WineBoardRow {
  stock: number;
  consume: number;
}

/**
 * Read each town's wine stock and consumption from the Empire Overview board,
 * keyed by town name.
 *
 * Returns an empty map when the board has not rendered (the Empire Overview script is
 * not running, or the board is closed); callers then fall back to the manually
 * entered `winePerHour`.
 */
export function readWineBoard(): Map<string, WineBoardRow> {
  const result = new Map<string, WineBoardRow>();

  for (const row of qsa(SEL.resTabRows)) {
    const name = qs(SEL.resTabTownName, row)?.textContent?.trim();
    if (!name) continue;

    const stock = parseAmount(qs(SEL.resTabWineStock, row)?.textContent);
    // Consumption renders as a negative number; flip the sign.
    const consumeText =
      qs(SEL.resTabWineConsumption, row)?.textContent ??
      qs(SEL.resTabWineConsumed, row)?.textContent;

    // An EMPTY consumption cell means the board has never loaded this town,
    // not that the town drinks nothing. Empire Overview fills a row in only
    // once it has seen that town's city view; until then it renders the stock
    // as a placeholder "0.00" with the production and consumption spans left
    // blank. A live capture right after installing the board showed exactly
    // that: eight of nine towns at "0.00" with empty spans, and only the town
    // on screen carrying real figures.
    //
    // Recording those rows would be worse than having no board at all: the
    // zero stock is wrong, and a present entry shadows the town cache, which
    // may well hold a real reading from an earlier visit. Skip them instead
    // and let the caller fall back.
    if (!consumeText || !consumeText.trim()) continue;

    result.set(name, { stock, consume: Math.abs(parseAmount(consumeText)) });
  }
  return result;
}

/** Resolve a dropdown index to a trimmed town name. */
function townNameOf(townNumber: string): string {
  const fromList = getTownList().find(
    (t) => t.townNumber.toString() === townNumber,
  );
  return (fromList?.townName ?? getTownNameFromList(townNumber)).trim();
}

/**
 * Best available figures for one town: the board first, then the cache.
 *
 * This is the pair that `buildWineTowns` uses, factored out because the
 * settings dialog and its "Load" button need exactly the same answer. They
 * used to read the board alone, so a freshly installed Empire Overview — which
 * only fills a row in once it has seen that town — left the dialog showing "—"
 * for every town and the Load button filling in nothing. The town cache is
 * built precisely to cover that gap; not consulting it here made the feature
 * look broken when it was not.
 */
export function measuredStats(
  townName: string,
  board = readWineBoard(),
): { stock: number; consume: number } | null {
  return (
    board.get(townName.trim()) ?? projectedStats(getState().account, townName)
  );
}

/**
 * Join the configured receivers with the best figures available.
 *
 * Three sources, in descending order of freshness:
 *
 *  1. The Empire Overview board — live for every town, but only when that other
 *     userscript is installed and its board is open.
 *  2. The town cache — recorded from `ikariam.model` whenever a town is visited,
 *     projected forward from the snapshot. Needs no other script.
 *  3. The hand-entered Wine/h, with stock assumed to be zero.
 *
 * Storage capacity only ever comes from the town cache: the board does not
 * carry it. A town whose capacity is unknown is not capped.
 *
 * With `fromTown`, each town also carries the hours a shipment from there
 * takes to reach it, as the last shipment on that route showed them
 * (`recordRouteSeconds`), so the plan counts the wine drunk on the way. A
 * route never shipped yet has no time, and nothing is counted for it.
 */
export function buildWineTowns(
  receivers: readonly WineReceiver[],
  board = readWineBoard(),
  fromTown?: string,
): WineTown[] {
  const store = getState().account;
  const fromCityId = fromTown === undefined ? null : townCityId(fromTown);
  return receivers.map((receiver) => {
    const townName = townNameOf(receiver.townNumber);
    const measured = measuredStats(townName, board);
    const town: WineTown = {
      townNumber: receiver.townNumber,
      townName,
      stock: measured?.stock ?? 0,
      consume: measured?.consume || Number(receiver.winePerHour) || 0,
    };
    const capacity = projectedStats(store, townName)?.capacity;
    if (capacity !== undefined) town.capacity = capacity;
    const toCityId = townCityId(receiver.townNumber);
    const seconds =
      fromCityId === null || toCityId === null
        ? null
        : routeSeconds(fromCityId, toCityId);
    if (seconds !== null) town.transitHours = seconds / SECONDS_PER_HOUR;
    return town;
  });
}

/**
 * Wine the source town keeps for its own tavern: one hour of its consumption,
 * or `FALLBACK_WINE_RESERVE` when that consumption is not known.
 */
export function getSourceReserve(
  fromTown: string,
  board = readWineBoard(),
): number {
  const measured = measuredStats(townNameOf(fromTown), board);
  return measured
    ? Math.ceil(measured.consume * SOURCE_RESERVE_HOURS)
    : FALLBACK_WINE_RESERVE;
}

/**
 * How much wine the source town can spare.
 *
 * Reads the source town's stock FROM THE BOARD rather than from the global
 * menu bar. The menu bar shows whichever town is currently open, which is not
 * necessarily the source town — using it would compute the plan against the
 * wrong town's stock. The menu bar is only used as a fallback when the source
 * town happens to be the one on screen.
 */
export function getSourceSupply(
  fromTown: string,
  board = readWineBoard(),
  reserve = getSourceReserve(fromTown, board),
): number {
  const sourceName = townNameOf(fromTown);

  const measured = board.get(sourceName);
  if (measured) return Math.max(0, measured.stock - reserve);

  // The source town IS the one on screen: read it live, most accurate of all.
  if (sourceName === getCurrentTownName().trim()) {
    return Math.max(0, readCurrentWine() - reserve);
  }

  // Otherwise fall back to whatever was recorded last time this town was
  // visited. Never the global menu bar — that describes the town on screen, so
  // using it here would plan the whole run against the wrong town's stock.
  const cached = projectedStats(getState().account, sourceName);
  return cached ? Math.max(0, cached.stock - reserve) : 0;
}

/** A distribution plan, plus what the source town could spare and keeps. */
export interface WineRunPlan extends WineDistributionResult {
  /** Wine the source can ship, after its reserve. */
  supply: number;
  /** Wine the source keeps for its own tavern. */
  reserve: number;
  /** Whether the Empire Overview board was on the page to read. */
  boardAvailable: boolean;
}

/**
 * Compute the distribution plan for one source town.
 *
 * Pure aside from reading the board, so the UI can preview the plan before
 * anything is queued.
 */
export function planWineRun(fromTown: string): WineRunPlan {
  const board = readWineBoard();
  const receivers = loadReceivers().filter((r) => r.townNumber !== fromTown);
  const reserve = getSourceReserve(fromTown, board);
  const supply = getSourceSupply(fromTown, board, reserve);
  return {
    supply,
    reserve,
    boardAvailable: board.size > 0,
    // Whole merchant ships, and the wine drunk on the way to
    // each town.
    ...distributeWine(buildWineTowns(receivers, board, fromTown), supply, {
      shipCapacity: getPerShipCapacity(),
    }),
  };
}

/**
 * Queue a full wine run. Returns how many shipments were added, or 0.
 *
 * Any pending Auto Wine shipments are cleared first: a new run recomputes the
 * split from current stock, so leftovers from an earlier plan would double-ship.
 * Manual shipments (no label) are untouched.
 *
 * Ship availability is deliberately NOT checked here. Queueing and shipping are
 * separate steps: `handleSendResource` re-reads the idle ships when it actually
 * runs and returns `retry` while there are none, so a task queued with the whole
 * fleet at sea simply waits for it to come home. Refusing to queue at all meant
 * the plan was lost and the user had to remember to press Start again later.
 */
export function enqueueWineRun(fromTown: string): number {
  const configured = loadReceivers();
  const receivers = configured.filter((r) => r.townNumber !== fromTown);
  if (receivers.length === 0) {
    // Two quite different situations reach this point, and "No receiving towns
    // configured for wine!" described neither well enough to act on. The
    // common one is ticking most towns as Sender: the tick and the Wine/h
    // figure are the two roles and `collectWineSettings` treats them as
    // exclusive, so a ticked town can never be a receiver.
    const senderCount = loadSenders().length;
    const townCount = getTownList().length;
    showToast(
      configured.length === 0
        ? AUTO_WINE.noReceivers(senderCount, townCount)
        : AUTO_WINE.onlyReceiverIsSource,
    );
    return 0;
  }

  const plan = planWineRun(fromTown);
  if (plan.supply <= 0) {
    showToast(AUTO_WINE.noSpareWine(plan.reserve));
    return 0;
  }

  const { queue } = getState();
  queue.removeByLabel(AUTO_WINE_LABEL);

  let added = 0;
  for (const allocation of plan.allocations) {
    if (allocation.add <= 0) continue;
    queue.push({
      type: "sendResource",
      data: {
        origin: fromTown,
        destination: allocation.townNumber,
        resource: "wine",
        amount: allocation.add,
        reserve: plan.reserve,
        label: AUTO_WINE_LABEL,
      },
    });
    added++;
  }

  if (added === 0) {
    showToast(AUTO_WINE.nothingToSend);
    return 0;
  }

  logInfo(
    `Auto Wine: levelling to ~${plan.targetHours.toFixed(1)}h, ` +
      `allocating ${plan.used} wine across ${added} towns ` +
      `(${plan.unused} left over)`,
  );
  return added;
}

/**
 * Fill the settings form with each town's measured consumption.
 * Keeps the original "Load" button so the user can still review and edit.
 */
export function loadConsumedWine(): void {
  const board = readWineBoard();
  let filled = 0;
  for (const town of getTownList()) {
    const measured = measuredStats(town.townName, board);
    if (!measured) continue;
    const input = qs<HTMLInputElement>(`#txtWine_${town.townNumber}`);
    if (input) {
      input.value = String(Math.round(measured.consume));
      filled++;
    }
  }
  if (filled === 0) {
    showToast(AUTO_WINE.noFigures);
  }
}

/**
 * Save the receivers that Load then Save in the settings dialog would save,
 * without the dialog: every town not ticked as a sender, with its measured
 * consumption, or its saved Wine/h when there is no measurement. A town ends
 * up a receiver when that figure is above 0.
 */
export function saveMeasuredReceivers(): void {
  const senders = loadSenders();
  const saved = loadReceivers();
  const board = readWineBoard();
  const receivers: WineReceiver[] = [];

  for (const town of getTownList()) {
    const id = town.townNumber.toString();
    if (senders.includes(id)) continue;
    const measured = measuredStats(town.townName, board);
    const winePerHour = measured
      ? String(Math.round(measured.consume))
      : (saved.find((entry) => entry.townNumber === id)?.winePerHour ?? "0");
    if (Number(winePerHour) > 0)
      receivers.push({ townNumber: id, winePerHour });
  }
  saveReceivers(receivers);
}

/** Read the settings form back. */
export function collectWineSettings(): {
  senders: string[];
  receivers: WineReceiver[];
} {
  const senders: string[] = [];
  const receivers: WineReceiver[] = [];

  for (const row of qsa(".txtWine")) {
    const checkbox = qs<HTMLInputElement>("input[type=checkbox]", row);
    if (checkbox?.checked) {
      senders.push(checkbox.id.replace("cbSender_", ""));
      continue;
    }
    const text = qs<HTMLInputElement>("input[type=text]", row);
    if (text && Number(text.value) > 0) {
      receivers.push({
        townNumber: text.id.replace("txtWine_", ""),
        winePerHour: text.value,
      });
    }
  }
  return { senders, receivers };
}
