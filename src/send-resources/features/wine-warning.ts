/**
 * How long each town can hold out on the wine it has.
 *
 * No new data is needed for this. `measuredStats` already returns stock and
 * hourly consumption per town — from the Empire Overview board when it is open,
 * from the town cache otherwise — and "hours remaining" is division.
 *
 * What it buys: a town running dry is the one failure in this game that is both
 * slow-moving and expensive, and the only warning the game itself gives is a
 * tooltip on a screen you have to go looking for.
 */

import {
  forgetNotification,
  isNotificationEnabled,
  notify,
} from "@core/notifications";
import { measuredStats } from "./auto-wine";
import { DURATION, NOTIFICATIONS } from "../messages";
import { getTownList } from "../navigation";
import { loadSenders } from "../state";

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
  const senders = loadSenders();
  return getTownList().map((town) => {
    const measured = measuredStats(town.townName);
    const stock = measured?.stock ?? 0;
    const consume = measured?.consume ?? 0;

    // A town ticked as an Auto Wine source makes the wine it hands out, and
    // each run leaves it one hour of its own consumption on purpose
    // (`getSourceReserve`). Stock over consumption leaves its production out,
    // so it read as running dry, and was notified, after every run. It is
    // counted as one that does not run out.
    const isSource = senders.includes(town.townNumber.toString());

    // A town that drinks nothing never runs out. That is not the same as a
    // town nothing is known about, but the advice is identical: do nothing.
    const hoursLeft =
      !isSource && measured && consume > 0 ? stock / consume : null;

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

/**
 * Only the towns worth showing, worst first. Takes a status list the caller
 * already has, so the panel does not measure every town twice.
 */
export function townsNeedingWine(
  towns: readonly TownWineStatus[] = wineStatus(),
): TownWineStatus[] {
  return towns
    .filter((town) => town.severity !== "ok")
    .sort((a, b) => (a.hoursLeft ?? Infinity) - (b.hoursLeft ?? Infinity));
}

/** `"7h"`, `"2d 6h"`, or a dash when nothing is known. */
export function formatHours(hours: number | null): string {
  if (hours === null) return DURATION.unknown;
  if (hours < 1) return DURATION.underAnHour;
  if (hours < 24) return DURATION.hours(Math.floor(hours));
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  return rest > 0 ? DURATION.daysAndHours(days, rest) : DURATION.days(days);
}

/**
 * A desktop notification for each town under `CRITICAL_HOURS`. Once per
 * town: the town is said again only after it has been back
 * above the line, like the board's own wine warning. A town nothing is known
 * about is left as it was.
 */
export function notifyLowWine(accountName: string): void {
  if (!isNotificationEnabled("wineLow")) return;
  for (const town of wineStatus()) {
    if (town.hoursLeft === null) continue;
    const key = `wineLow:${accountName}:${town.townName}`;
    if (town.severity === "critical") {
      notify({
        kind: "wineLow",
        key,
        title: NOTIFICATIONS.wineLowTitle(town.townName),
        body: NOTIFICATIONS.wineLowBody(formatHours(town.hoursLeft)),
      });
    } else {
      forgetNotification(key);
    }
  }
}
