/**
 * How long each town can hold out on the wine it has.
 *
 * No new data is needed for this. `measuredStats` already returns stock and
 * hourly consumption per town — from the Empire Overview board when it is open,
 * from the town cache otherwise — and "hours remaining" is division.
 *
 * What it buys: a town running dry is the one failure in this game that is both
 * slow-moving and expensive, and the only warning the game itself gives is a
 * tooltip on a screen you have to go looking for. See
 * `docs/improvement-plan.md` §4.2 item C.
 */

import { measuredStats } from "./auto-wine";
import { getTownList } from "../navigation";

/** Below this, a town is worth acting on now. */
export const CRITICAL_HOURS = 12;

/** Below this, worth knowing about. */
export const WARNING_HOURS = 48;

export type WineSeverity = "critical" | "warning" | "ok";

export interface TownWineStatus {
  townNumber: string;
  townName: string;
  stock: number;
  /** Hourly consumption, as a positive number. */
  consume: number;
  /**
   * Hours of wine left, or `null` when it cannot be worked out — either the
   * town has never been measured, or it drinks nothing.
   */
  hoursLeft: number | null;
  severity: WineSeverity;
}

function severityOf(hours: number | null): WineSeverity {
  if (hours === null) return "ok";
  if (hours < CRITICAL_HOURS) return "critical";
  if (hours < WARNING_HOURS) return "warning";
  return "ok";
}

/** Every town, with whatever is known about its wine. */
export function wineStatus(): TownWineStatus[] {
  return getTownList().map((town) => {
    const measured = measuredStats(town.townName);
    const stock = measured?.stock ?? 0;
    const consume = measured?.consume ?? 0;

    // A town that drinks nothing never runs out. That is not the same as a
    // town nothing is known about, but the advice is identical: do nothing.
    const hoursLeft = measured && consume > 0 ? stock / consume : null;

    return {
      townNumber: town.townNumber.toString(),
      townName: town.townName,
      stock,
      consume,
      hoursLeft,
      severity: severityOf(hoursLeft),
    };
  });
}

/** Only the towns worth showing, worst first. */
export function townsNeedingWine(): TownWineStatus[] {
  return wineStatus()
    .filter((town) => town.severity !== "ok")
    .sort((a, b) => (a.hoursLeft ?? Infinity) - (b.hoursLeft ?? Infinity));
}

/** `"7h"`, `"2d 6h"`, or a dash when nothing is known. */
export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
}

/**
 * One line for the panel, or `null` when nothing needs saying.
 *
 * Deliberately short: this sits in a window someone glances at, not a report.
 */
export function wineWarningSummary(): string | null {
  const towns = townsNeedingWine();
  if (towns.length === 0) return null;

  const worst = towns[0];
  const rest = towns.length - 1;
  const tail = rest > 0 ? ` (+${rest} more)` : "";
  return `${worst.townName}: ${formatHours(worst.hoursLeft)} of wine left${tail}`;
}
