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
  saveSenders,
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
  /** Wine the town's island makes an hour; 0 off a wine island. */
  production: number;
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

    result.set(name, {
      stock,
      consume: Math.abs(parseAmount(consumeText)),
      // Blank off a wine island, and parsed as 0.
      production: parseAmount(qs(SEL.resTabWineProduction, row)?.textContent),
    });
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
): WineBoardRow | null {
  const measured =
    board.get(townName.trim()) ?? projectedStats(getState().account, townName);
  if (!measured) return null;
  // A snapshot from before production was recorded counts as no vineyard.
  const { stock, consume, production = 0 } = measured;
  return { stock, consume, production };
}

/**
 * Wine a receiver needs an hour: what it drinks less what its own island
 * makes. Not above 0 — a town on a wine island that makes at least what it
 * drinks — and it is no receiver at all. A town with no figure for its
 * production counts as making none, as every town off a wine island does.
 */
function netWineNeed(
  receiver: WineReceiver,
  measured: WineBoardRow | null,
): number {
  const consume = measured?.consume || Number(receiver.winePerHour) || 0;
  return consume - (measured?.production ?? 0);
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
  const towns: WineTown[] = [];
  for (const receiver of receivers) {
    const townName = townNameOf(receiver.townNumber);
    const measured = measuredStats(townName, board);
    // Only a town that drinks more than its island makes gets wine, and it
    // is levelled on the difference: the rest it makes itself.
    const need = netWineNeed(receiver, measured);
    if (need <= 0) continue;
    const town: WineTown = {
      townNumber: receiver.townNumber,
      townName,
      stock: measured?.stock ?? 0,
      consume: need,
    };
    const capacity = projectedStats(store, townName)?.capacity;
    if (capacity !== undefined) town.capacity = capacity;
    const toCityId = townCityId(receiver.townNumber);
    const seconds =
      fromCityId === null || toCityId === null
        ? null
        : routeSeconds(fromCityId, toCityId);
    if (seconds !== null) town.transitHours = seconds / SECONDS_PER_HOUR;
    towns.push(town);
  }
  return towns;
}

/** A town Auto Wine could ship from, with the figures that chose it. */
interface WineSourceCandidate {
  townNumber: string;
  townName: string;
  stock: number;
  consume: number;
  production: number;
}

/** How a source town nobody ticked was chosen. */
export type WineSourceChoice = WineSourceCandidate & {
  /** `production`: it makes the most wine; `hoursLeft`: no town makes any. */
  by: "production" | "hoursLeft";
};

/** Hours its stock lasts at its own consumption; a town drinking none, forever. */
function hoursOfWineLeft(town: WineSourceCandidate): number {
  return town.consume > 0 ? town.stock / town.consume : Infinity;
}

/**
 * The town to ship wine from when none is ticked, by the same figures Auto
 * Wine plans with: the one that makes the most wine an hour. When no town is
 * known to make any, the one whose stock lasts longest at its own
 * consumption — a town that drinks none lasts forever, and among those the
 * larger stock wins. A town holding no wine is never chosen that way. Ties
 * go to the first in the town list; null when nothing qualifies.
 */
export function chooseWineSource(
  board = readWineBoard(),
): WineSourceChoice | null {
  const towns: WineSourceCandidate[] = [];
  for (const town of getTownList()) {
    const measured = measuredStats(town.townName, board);
    if (!measured) continue;
    towns.push({
      townNumber: town.townNumber.toString(),
      townName: town.townName.trim(),
      ...measured,
    });
  }

  let maker: WineSourceCandidate | null = null;
  for (const town of towns) {
    if (town.production > (maker?.production ?? 0)) maker = town;
  }
  if (maker) return { ...maker, by: "production" };

  let longest: WineSourceCandidate | null = null;
  for (const town of towns) {
    if (town.stock <= 0) continue;
    if (
      !longest ||
      hoursOfWineLeft(town) > hoursOfWineLeft(longest) ||
      (hoursOfWineLeft(town) === hoursOfWineLeft(longest) &&
        town.stock > longest.stock)
    ) {
      longest = town;
    }
  }
  return longest ? { ...longest, by: "hoursLeft" } : null;
}

/**
 * With no town ticked as the source, tick the one `chooseWineSource` picks
 * and return it, saying why in the log and a toast. Null, with nothing
 * saved, when no town qualifies.
 */
export function pickWineSource(): string | null {
  const choice = chooseWineSource();
  if (!choice) return null;
  saveSenders([choice.townNumber]);
  const message =
    choice.by === "production"
      ? AUTO_WINE.sourcePicked(choice.townName, Math.round(choice.production))
      : AUTO_WINE.sourcePickedByStock(
          choice.townName,
          Math.round(choice.stock),
          hoursOfWineLeft(choice),
        );
  logInfo(`Auto Wine: ${message}`);
  showToast(message);
  return choice.townNumber;
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

/**
 * The towns, other than the source and the ticked senders, whose island
 * makes at least the wine they drink — so they get none.
 */
function townsMakingTheirOwnWine(
  fromTown: string,
  board: Map<string, WineBoardRow>,
): string[] {
  const senders = loadSenders();
  const names: string[] = [];
  for (const town of getTownList()) {
    const id = town.townNumber.toString();
    if (id === fromTown || senders.includes(id)) continue;
    const measured = measuredStats(town.townName, board);
    if (
      measured &&
      measured.production > 0 &&
      measured.production >= measured.consume
    ) {
      names.push(town.townName.trim());
    }
  }
  return names;
}

/**
 * Whether any configured receiver, other than the source town itself, needs
 * wine: drinks more than its island makes. When none does, says why in a
 * toast and returns false.
 */
export function hasReceiversFor(
  fromTown: string,
  board = readWineBoard(),
): boolean {
  const configured = loadReceivers();
  const others = configured.filter((r) => r.townNumber !== fromTown);
  const needing = others.filter(
    (receiver) =>
      netWineNeed(
        receiver,
        measuredStats(townNameOf(receiver.townNumber), board),
      ) > 0,
  );
  if (needing.length > 0) return true;
  // Towns left out for making their own wine: the old messages blamed the
  // Sender ticks or the source for what was the island's vineyard.
  const selfSupplied = townsMakingTheirOwnWine(fromTown, board);
  if (selfSupplied.length > 0) {
    showToast(AUTO_WINE.allMakeTheirOwn(selfSupplied));
    return false;
  }
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
      : others.length === 0
        ? AUTO_WINE.onlyReceiverIsSource
        : AUTO_WINE.nothingToSend,
  );
  return false;
}

/** Keeps text literal inside a JavaScript template literal. */
function escapeTemplateLiteral(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

/**
 * The receiving towns' wine figures as the snippet the player pastes into
 * their own sheet:
 *
 *     const csv = `
 *     account,town,stock,consume,maxSupply
 *     Smalldevil1, S-Nuithanh    , 0    , 194    , 65000
 *     `;
 *
 * One row per receiver Auto Wine would ship to from `fromTown`, with the
 * same stock and hourly consumption it plans with. `maxSupply` is what the
 * source can spare — its stock less one hour of its own consumption, the
 * `supply` of `planWineRun` — and is the same on every row. The spacing
 * copies the player's sample.
 */
export function buildWineCsv(
  fromTown: string,
  accountName: string,
): { text: string; rows: number } {
  const board = readWineBoard();
  const receivers = loadReceivers().filter((r) => r.townNumber !== fromTown);
  const maxSupply = Math.round(getSourceSupply(fromTown, board));
  const lines = buildWineTowns(receivers, board).map(
    (town) =>
      `${accountName}, ${town.townName}    , ${Math.round(town.stock)}    , ` +
      `${Math.round(town.consume)}    , ${maxSupply}`,
  );
  const body = ["account,town,stock,consume,maxSupply", ...lines].join("\n");
  return {
    text: "const csv = `\n" + escapeTemplateLiteral(body) + "\n`;\n",
    rows: lines.length,
  };
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
  if (!hasReceiversFor(fromTown)) return 0;

  const plan = planWineRun(fromTown);
  if (plan.supply <= 0) {
    showToast(AUTO_WINE.noSpareWine(plan.reserve));
    return 0;
  }

  const { queue } = getState();
  queue.removeByLabel(AUTO_WINE_LABEL);

  // Ship first to the town with the fewest hours of wine left now, so the
  // one closest to running dry does not wait behind towns that can hold out
  // longer. Only towns that drink get a share, so `consume` is never 0 here;
  // `sort` is stable, so towns that tie keep their configured order.
  const fewestHoursFirst = plan.allocations
    .filter((allocation) => allocation.add > 0)
    .sort((a, b) => a.stock / a.consume - b.stock / b.consume);

  let added = 0;
  for (const allocation of fewestHoursFirst) {
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
 * up a receiver when that figure is above what its island makes (0 off a wine
 * island).
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
    if (Number(winePerHour) > (measured?.production ?? 0))
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
