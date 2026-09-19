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
import { logInfo } from "@core/logger";
import { getCurrentTownName } from "@core/ikariam/globals";
import { SEL } from "@core/ikariam/selectors";
import { getFreeShips, parseAmount, readCurrentWine } from "../game-state";
import { getTownList, getTownNameFromList } from "../navigation";
import {
  AUTO_WINE_LABEL,
  getState,
  loadReceivers,
  loadSenders,
} from "../state";
import type { WineReceiver } from "../types";
import { projectedStats } from "../town-cache";
import { distributeWine, type WineTown } from "./wine-distribution";

/** Wine kept at the source town rather than shipped out. */
export const WINE_RESERVE = 500;

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
 */
export function buildWineTowns(
  receivers: readonly WineReceiver[],
  board = readWineBoard(),
): WineTown[] {
  return receivers.map((receiver) => {
    const townName = townNameOf(receiver.townNumber);
    const measured = measuredStats(townName, board);
    return {
      townNumber: receiver.townNumber,
      townName,
      stock: measured?.stock ?? 0,
      consume: measured?.consume || Number(receiver.winePerHour) || 0,
    };
  });
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
): number {
  const sourceName = townNameOf(fromTown);

  const measured = board.get(sourceName);
  if (measured) return Math.max(0, measured.stock - WINE_RESERVE);

  // The source town IS the one on screen: read it live, most accurate of all.
  if (sourceName === getCurrentTownName().trim()) {
    return Math.max(0, readCurrentWine() - WINE_RESERVE);
  }

  // Otherwise fall back to whatever was recorded last time this town was
  // visited. Never the global menu bar — that describes the town on screen, so
  // using it here would plan the whole run against the wrong town's stock.
  const cached = projectedStats(getState().account, sourceName);
  return cached ? Math.max(0, cached.stock - WINE_RESERVE) : 0;
}

/**
 * Compute the distribution plan for one source town.
 *
 * Pure aside from reading the board, so the UI can preview the plan before
 * anything is queued.
 */
export function planWineRun(fromTown: string) {
  const board = readWineBoard();
  const receivers = loadReceivers().filter((r) => r.townNumber !== fromTown);
  const supply = getSourceSupply(fromTown, board);
  return {
    supply,
    boardAvailable: board.size > 0,
    ...distributeWine(buildWineTowns(receivers, board), supply),
  };
}

/**
 * Queue a full wine run. Returns how many shipments were added, or 0.
 *
 * Any pending Auto Wine shipments are cleared first: a new run recomputes the
 * split from current stock, so leftovers from an earlier plan would double-ship.
 * Manual shipments (no label) are untouched.
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
    alert(
      configured.length === 0
        ? `No town is set to receive wine — ${senderCount} of ${townCount} ` +
            "towns are ticked as Sender.\n\n" +
            "Sender and receiver are exclusive roles: tick a town to make it " +
            "a source, or leave it unticked and give it a Wine/h above 0 to " +
            "make it a receiver. The Load button fills those figures in."
        : "The only town set to receive wine is the one you are sending " +
            "from.\n\nPick a different source, or give another town a " +
            "Wine/h figure.",
    );
    return 0;
  }

  const { merchants, freighters } = getFreeShips();
  if (merchants <= 0 && freighters <= 0) {
    alert("Not enough ships!");
    return 0;
  }

  const plan = planWineRun(fromTown);
  if (plan.supply <= 0) {
    alert(
      `The source town has no spare wine (it must hold more than ${WINE_RESERVE}).`,
    );
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
        reserve: WINE_RESERVE,
        label: AUTO_WINE_LABEL,
      },
    });
    added++;
  }

  if (added === 0) {
    alert("Every receiving town already has enough wine — nothing to send.");
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
    alert(
      "No wine figures are available yet.\n\n" +
        "They come from the Empire Overview board, or from visiting a town " +
        "(each visit records that town's wine). Visit the towns once, or open " +
        "the board, then press Load again — or just type the Wine/h values.",
    );
  }
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

export { loadReceivers, loadSenders };
