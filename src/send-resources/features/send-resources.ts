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
 *  - When a shipment cannot start the task stays queued rather than being
 *    consumed for free: `retry` with no idle ships, `defer` when the source
 *    town is out of action points.
 */

import { qs, setInputValue, waitForElement } from "@core/dom";
import { sleep, waitFor } from "@core/async";
import { parseDurationSeconds } from "@core/format";
import { logInfo } from "@core/logger";
import { SEL } from "@core/ikariam/selectors";
import type { Task, TaskResult } from "@core/task-queue";
import {
  backToCity,
  getTownNameFromList,
  gotoTown,
  openShipmentForm,
  townCityId,
  townHasBuiltPort,
  townHasPort,
} from "../navigation";
import { getActionPoints, getFreeShips, readCurrentStock } from "../game-state";
import { getFreighterCapacity, getPerShipCapacity } from "../ship-capacity";
import { getState, recordRouteSeconds } from "../state";
import { TRANSFER_STATUS } from "../messages";
import { describeTask } from "../ui/queue-view";
import type { ResourceId } from "../types";

/**
 * How long to wait for the town view after asking to go back to it.
 * Short: if it does not arrive, `townHasPort` fails and the task defers,
 * which is the correct outcome anyway.
 */
const BACK_TO_TOWN_TIMEOUT_MS = 5_000;

/** How long to let the game settle after a submit, before navigating away. */
const POST_SUBMIT_TIMEOUT_MS = 5_000;

/**
 * Pause after touching the shipment form, before the next step: the game
 * recalculates ship counts and the mission summary from the field's events.
 */
const FORM_SETTLE_MS = 500;

/**
 * Note how long this route takes — loading plus sailing, as the open form
 * shows them — for Auto Wine, which counts the wine drunk on the way
 * (`buildWineTowns`). Nothing is recorded when the form shows no time this
 * can read. Never throws: it runs with the cargo entered.
 */
function recordRouteTime(origin: string, destination: string): void {
  try {
    const sailing = parseDurationSeconds(
      qs(SEL.shipmentJourneyTime)?.textContent,
    );
    if (sailing === null) return;
    const loading =
      parseDurationSeconds(qs(SEL.shipmentLoadingTime)?.textContent) ?? 0;
    const from = townCityId(origin);
    const to = townCityId(destination);
    if (from === null || to === null) return;
    recordRouteSeconds(from, to, sailing + loading);
  } catch {
    // A courtesy for the next plan; the shipment matters more.
  }
}

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

  // From here on the page has (most likely) been reloaded into `origin`, so a
  // `retry` is the wrong answer to anything specific to this town: it blocks
  // shipments only in this page's memory. A town switch for another task
  // reloads the page, the shipment runs first again and switches back, and
  // the two pages take turns for as long as the condition lasts. `defer`
  // moves the task to the back of the stored queue instead.
  if (getActionPoints() <= 0) {
    return {
      status: "defer",
      reason: `${getTownNameFromList(origin)} is out of action points`,
    };
  }

  /**
   * Ceiling for this convoy: the task's remaining amount, but no more than
   * the source town holds — less, with a `reserve` (Auto Wine), what it has
   * to keep. The shortfall stays on the task and ships once stock recovers.
   */
  const keep = reserve && reserve > 0 && resource === "wine" ? reserve : 0;
  const available = readCurrentStock(resource) - keep;
  /**
   * When that ceiling is short of the task AND short of one ship's cargo,
   * nothing ships: a queued amount above the stock used to send whatever had
   * trickled in since the last convoy, a few units at a time, a ship each.
   * A task whose own remainder is under one ship still ships when the stock
   * covers it. "One ship" is the kind that would sail: a merchant ship while
   * any is idle, a freighter otherwise. Checked here with the ships idle now,
   * so a short town is not navigated to the port for nothing, and again at the
   * form with the ships that will actually sail.
   */
  const tooLittle = (merchantsIdle: boolean): TaskResult | null => {
    const oneShip = merchantsIdle
      ? getPerShipCapacity()
      : getFreighterCapacity();
    if (available >= amount || available >= oneShip) return null;
    // This source is short; other queued shipments may not be.
    return {
      status: "defer",
      reason:
        `${getTownNameFromList(origin)} has ${Math.max(0, available)} ` +
        `${resource} to spare, less than one ` +
        `${merchantsIdle ? "merchant ship" : "freighter"}'s cargo`,
    };
  };
  const shortBeforeLeaving = tooLittle(getFreeShips().merchants > 0);
  if (shortBeforeLeaving) return shortBeforeLeaving;
  const sendable = Math.min(amount, available);

  // Get back to the TOWN view before looking for the port.
  //
  // `townHasPort` reads `#position1` / `#position2`, which exist only there —
  // and nothing guaranteed we were there. The previous shipment leaves the
  // page elsewhere, and `gotoTown` returns early when the town is already
  // selected, so it does not navigate back either. The queue therefore ran
  // exactly one shipment and then deferred every tick after it, until the
  // player opened a town by hand.
  if (!qs(SEL.position(1)) && !qs(SEL.position(2))) {
    backToCity("shipment needs the town view to find the port");
    await waitForElement(SEL.position(1), {
      timeoutMs: BACK_TO_TOWN_TIMEOUT_MS,
    }).catch(() => null);
  }

  if (!townHasPort()) {
    // Specific to this town — other shipments may still be possible.
    return {
      status: "defer",
      reason: `${getTownNameFromList(origin)} has no port`,
    };
  }

  // Straight to the form for this destination, the way the game's transport
  // panel opens it. It replaces clicking the port and then the destination in
  // a town list the game no longer draws (improvement-plan.md §2.A).
  //
  // A sea slot under construction may be the port being upgraded, or the
  // shipyard — the slot does not say. When that is all the town has and no
  // form comes, this town cannot ship now: defer, so other shipments run and
  // this one is tried again later, rather than throw and be dropped.
  const onlyUnderConstruction = !townHasBuiltPort();
  try {
    await openShipmentForm(destination);
  } catch (error) {
    if (!onlyUnderConstruction) throw error;
    return {
      status: "defer",
      reason:
        `${getTownNameFromList(origin)} has no port to ship from ` +
        `(its sea slot is under construction)`,
    };
  }

  // Ship counts are re-read HERE, not before navigating. The original read them
  // inside `enterValue`, i.e. once the port form was up, and several seconds of
  // navigation pass in between — a returning fleet in that window would make an
  // earlier reading wrong, and the capacity below is computed from it.
  const { merchants, freighters } = getFreeShips();
  // A `retry` is right here, unlike above: ships belong to the account, so no
  // shipment can sail, and the idle-ship check before `gotoTown` returns the
  // same answer on the next page without switching town.
  if (merchants <= 0 && freighters <= 0) {
    return { status: "retry", reason: "Ships became unavailable en route" };
  }

  // Prefer merchant ships; fall back to freighters only when none are idle.
  const useMerchant = merchants > 0;
  // The merchant ships may have sailed meanwhile, leaving a freighter's
  // larger cargo as the bar. Nothing is entered yet, so nothing is lost.
  const shortAtTheForm = tooLittle(useMerchant);
  if (shortAtTheForm) return shortAtTheForm;
  const capacity = useMerchant
    ? getPerShipCapacity() * merchants
    : getFreighterCapacity() * freighters;

  if (!useMerchant) {
    // Let the Trading Post itself pick the maximum freighter count.
    await sleep(FORM_SETTLE_MS);
    qs<HTMLElement>(SEL.freightersMaxButton)?.click();
  }

  const sentAmount = Math.min(capacity, sendable);
  const field = qs<HTMLInputElement>(SEL.resourceField(resource));
  if (!field) {
    // Past the town switch: `defer`, for the reason given at `gotoTown`.
    return { status: "defer", reason: `No input field for ${resource}` };
  }
  // A missing button used to be clicked through `?.`, which does nothing —
  // and the shipment was still logged as sent and taken off the order. Looked
  // for before anything is entered, and again at the click, since the game
  // may draw the form anew in between. Nothing has left before that click.
  const noSubmit: TaskResult = {
    status: "defer",
    reason: "No submit button on the shipment form",
  };
  if (!qs(SEL.submit)) return noSubmit;
  // Not a bare `.value =`: the game recalculates the ship count and mission
  // summary from the field's own events. See `setInputValue`.
  setInputValue(field, String(sentAmount));

  await sleep(FORM_SETTLE_MS);
  // Before the submit, while the form still shows this convoy's times.
  recordRouteTime(origin, destination);
  const submit = qs<HTMLElement>(SEL.submit);
  if (!submit) return noSubmit;
  submit.click();

  // PAST THIS POINT THE GOODS HAVE LEFT. Nothing below may throw: the runner
  // deliberately keeps a thrown task queued, so a throw here would send the
  // same cargo a second time. The wait is a courtesy — it lets the game
  // take the form down before we navigate — not a condition.
  await waitFor(() => !qs(SEL.shipmentForm), {
    timeoutMs: POST_SUBMIT_TIMEOUT_MS,
    label: "shipment form to close",
  }).catch(() => null);

  logInfo(
    `Sent ${sentAmount} ${resource} ${useMerchant ? "[Merchant]" : "[Freighter]"}`,
  );

  const remaining = amount - sentAmount;
  // Leave the page where the next shipment expects to find it.
  backToCity("shipment sent");

  if (remaining <= 0) return { status: "done" };
  return {
    status: "progress",
    task: { ...task, data: { ...task.data, amount: remaining } },
  };
}

/**
 * Status line for the panel, for the task the runner is on (`task`) — not
 * the head of the queue, which a shipment waiting for ships can hold while
 * the upgrades behind it run.
 */
export function describeCurrentTransfer(task: Task | undefined): string {
  if (!task) return TRANSFER_STATUS.idle;
  // Named the way the queue names it — an upgrade too (the line read "Nothing
  // is transferring" while the runner was on one), and a shipment with its
  // resource's label and a grouped amount rather than `1000 glass`. The line
  // is also the body of the "task dropped" notification.
  return describeTask(task);
}
