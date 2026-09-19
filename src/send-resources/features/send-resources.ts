/**
 * Bulk resource shipments between towns.
 *
 * Ported from the original `sendResources` / `townClick` / `enterValue` /
 * `finishSendResource` / `checkAndProcess`. The nested callback chain is
 * flattened into async/await; the steps and the wait timings are unchanged.
 *
 * Intentional behaviour differences from the original:
 *  - No separate `isAutoSendResourceRunning` flag. "One action at a time" is
 *    enforced by `TaskRunner`, and it guards both directions rather than just
 *    one as the old flag did.
 *  - When a shipment cannot start (no ships, no action points) the task returns
 *    `retry` instead of silently doing nothing, so the order stays queued
 *    rather than being consumed for free.
 */

import { qs, setInputValue, waitForElement, waitForElements } from "@core/dom";
import { sleep } from "@core/async";
import { logInfo } from "@core/logger";
import { SEL } from "@core/ikariam/selectors";
import type { Task, TaskResult } from "@core/task-queue";
import {
  adjustDestinationIndex,
  backToCity,
  clickDestinationTown,
  getTownNameFromList,
  gotoTown,
  openPort,
} from "../navigation";
import { getActionPoints, getFreeShips, readCurrentWine } from "../game-state";
import { getFreighterCapacity, getPerShipCapacity } from "../ship-capacity";
import { getState } from "../state";
import type { ResourceId } from "../types";

/**
 * How long to wait for the town view after asking to go back to it.
 * Short: if it does not arrive, `openPort` fails and the task defers, which
 * is the correct outcome anyway.
 */
const BACK_TO_TOWN_TIMEOUT_MS = 5_000;

/** How long to let the game settle after a submit, before navigating away. */
const POST_SUBMIT_TIMEOUT_MS = 5_000;

/** Queue one shipment. */
export function enqueueSendResource(
  origin: string,
  destination: string,
  resource: ResourceId | string,
  amount: number,
): void {
  getState().queue.push({
    type: "sendResource",
    data: { origin, destination, resource, amount },
  });
}

/**
 * Run one shipment.
 *
 * One run equals one convoy. When the remaining amount exceeds total cargo
 * capacity the handler returns `progress` with the remainder, and the runner
 * picks it up again once ships are back.
 */
export async function handleSendResource(
  task: Extract<Task, { type: "sendResource" }>,
): Promise<TaskResult> {
  const { origin, destination, resource, amount, reserve, label } = task.data;

  if (origin === destination) {
    return { status: "failed", reason: "Source and destination are the same" };
  }
  if (amount <= 0) return { status: "done" };

  // Cheap pre-check so an impossible task does not navigate anywhere. The
  // counts that actually drive the shipment are re-read at the port form below.
  if (getFreeShips().merchants <= 0 && getFreeShips().freighters <= 0) {
    return { status: "retry", reason: "No idle ships" };
  }

  logInfo(
    `${label ? label + ": " : ""}Start sending ${resource} from ` +
      `${getTownNameFromList(origin)} to ${getTownNameFromList(destination)}`,
  );

  await gotoTown(origin);

  if (getActionPoints() <= 0) {
    return { status: "retry", reason: "Out of action points" };
  }

  /**
   * Ceiling for this convoy. Normally the task's remaining amount, but with a
   * `reserve` (Auto Wine) it must not dip into what the source town has to
   * keep. The shortfall stays on the task and ships once stock recovers.
   */
  let sendable = amount;
  if (reserve && reserve > 0 && resource === "wine") {
    const available = readCurrentWine() - reserve;
    if (available <= 0) {
      // This source is dry; other queued shipments may not be.
      return { status: "defer", reason: "Source town has no spare wine" };
    }
    sendable = Math.min(amount, available);
  }

  // Get back to the TOWN view before looking for the port.
  //
  // `openPort` finds its target through `#position1` / `#position2`, which
  // exist only there — and nothing guaranteed we were there. The previous
  // shipment leaves the page on the port's town list, and `gotoTown` returns
  // early when the town is already selected, so it does not navigate back
  // either. The queue therefore ran exactly one shipment and then deferred
  // every tick after it, until the player opened a town by hand — which is
  // precisely what the port had to be clicked for, over and over.
  if (!qs(SEL.position(1)) && !qs(SEL.position(2))) {
    backToCity();
    await waitForElement(SEL.position(1), {
      timeoutMs: BACK_TO_TOWN_TIMEOUT_MS,
    }).catch(() => null);
  }

  if (!openPort()) {
    // Specific to this town — other shipments may still be possible.
    return {
      status: "defer",
      reason: `${getTownNameFromList(origin)} has no port`,
    };
  }

  await clickDestinationTown(adjustDestinationIndex(destination, origin));

  // The shipment form is only ready once the wine input exists — the original
  // used that same element to tell the resource form apart from the troop
  // transport form, which has no wine field.
  await waitForElement(SEL.wineField);

  // Ship counts are re-read HERE, not before navigating. The original read them
  // inside `enterValue`, i.e. once the port form was up, and several seconds of
  // navigation pass in between — a returning fleet in that window would make an
  // earlier reading wrong, and the capacity below is computed from it.
  const { merchants, freighters } = getFreeShips();
  if (merchants <= 0 && freighters <= 0) {
    return { status: "retry", reason: "Ships became unavailable en route" };
  }

  // Prefer merchant ships; fall back to freighters only when none are idle.
  const useMerchant = merchants > 0;
  const capacity = useMerchant
    ? getPerShipCapacity() * merchants
    : getFreighterCapacity() * freighters;

  if (!useMerchant) {
    // Let the Trading Post itself pick the maximum freighter count.
    await sleep(500);
    qs<HTMLElement>(SEL.freightersMaxButton)?.click();
  }

  const sentAmount = Math.min(capacity, sendable);
  const field = qs<HTMLInputElement>(SEL.resourceField(resource));
  if (!field) {
    return { status: "retry", reason: `No input field for ${resource}` };
  }
  // Not a bare `.value =`: the game recalculates the ship count and mission
  // summary from the field's own events. See `setInputValue`.
  setInputValue(field, String(sentAmount));

  await sleep(500);
  qs<HTMLElement>(SEL.submit)?.click();

  // PAST THIS POINT THE GOODS HAVE LEFT. Nothing below may throw: the runner
  // deliberately keeps a thrown task queued, so a throw here would send the
  // same cargo a second time. The wait is a courtesy — it lets the game
  // settle before we navigate — not a condition.
  await waitForElements(SEL.dockCities, 1, {
    timeoutMs: POST_SUBMIT_TIMEOUT_MS,
  }).catch(() => null);

  logInfo(
    `Sent ${sentAmount} ${resource} ${useMerchant ? "[Merchant]" : "[Freighter]"}`,
  );

  const remaining = amount - sentAmount;
  // Leave the page where the next shipment expects to find it.
  backToCity();

  if (remaining <= 0) return { status: "done" };
  return {
    status: "progress",
    task: { ...task, data: { ...task.data, amount: remaining } },
  };
}

/** Status line for the panel. */
export function describeCurrentTransfer(): string {
  const head = getState().queue.head();
  if (!head || head.type !== "sendResource") return "Nothing is transferring";
  const { amount, resource, origin, destination } = head.data;
  return (
    `${amount} ${resource} from ${getTownNameFromList(origin)} ` +
    `to ${getTownNameFromList(destination)}`
  );
}
