/**
 * Automatic building upgrades driven by a per-town queue.
 *
 * Ported from `checkAndProcessAutoBuild` / `startQueue` / `clickUpgrade` /
 * `addBuildingToQueue` / `removeBuildingFromQueue` / `cleanListAutoBuild`.
 *
 * Structural change: the original walked every town inside one long run
 * (`checkAndProcessAutoBuild(townIndex + 1)`), holding the DOM busy for a long
 * time — precisely when it collided with the shipping loop. Here each building
 * is its own task in the shared queue, so a shipment can slot in between two
 * upgrades without contention.
 *
 * `listAutoBuild` in localStorage remains the configuration (the UI reads and
 * writes it as before); `enqueueAutoBuild` is where that config is loaded into
 * the run queue.
 */

import { qs, qsa, waitForElement } from "@core/dom";
import { sleep } from "@core/async";
import { compareValues } from "@core/format";
import { getCurrentTownName } from "@core/ikariam/globals";
import { SEL } from "@core/ikariam/selectors";
import { logInfo } from "@core/logger";
import type { Task, TaskResult } from "@core/task-queue";
import {
  backToCity,
  closeGamePopup,
  getTownNameFromList,
  getTownNumberByName,
  gotoTown,
} from "../navigation";
import {
  getState,
  loadAccounts,
  loadAutoBuild,
  saveAccounts,
  saveAutoBuild,
} from "../state";
import { recordCurrentTown } from "../town-cache";
import { ownTownIds, syncAllTowns } from "./sync-towns";
import type { AutoBuildAccount, AutoBuildTown } from "../types";

/** How long to wait for the upgrade button before assuming it will not appear. */
const UPGRADE_BUTTON_TIMEOUT_MS = 15_000;

/* ────────────────────── Reading / writing the config ───────────────────── */

function findAccount(
  list: AutoBuildAccount[],
  accountName: string,
): AutoBuildAccount | undefined {
  return list.find((entry) => entry.accountName === accountName);
}

function findTown(
  account: AutoBuildAccount | undefined,
  townName: string,
): AutoBuildTown | undefined {
  return account?.townList.find((entry) => entry.townName === townName);
}

/** Configured upgrade queue for one town of the logged-in account. */
export function getTownQueue(townName: string) {
  const { accountName } = getState();
  return (
    findTown(findAccount(loadAutoBuild(), accountName), townName)?.queue ?? []
  );
}

/**
 * Append one upgrade level to the configured queue.
 *
 * Displayed levels stack: with N entries already queued for the same slot, the
 * new entry shows `current + N + 1`. Same arithmetic as the original.
 */
export function addBuildingToQueue(
  positionId: string,
  buildingName: string,
): void {
  const { accountName } = getState();
  const list = loadAutoBuild();
  const townName = getCurrentTownName();

  const account = findAccount(list, accountName);
  const town = findTown(account, townName);

  const currentLevel = Number(buildingName.split(" ").pop());
  const alreadyQueued =
    town?.queue.filter((entry) => entry.positionId === positionId).length ?? 0;
  const nextLevel = currentLevel + alreadyQueued + 1;
  const label = buildingName.replace(
    String(buildingName.split(" ").pop()),
    String(nextLevel),
  );
  const entry = { positionId, buildingName: label };

  if (town) {
    town.queue.push(entry);
  } else if (account) {
    account.townList.push({ townName, queue: [entry] });
  } else {
    list.push({ accountName, townList: [{ townName, queue: [entry] }] });
  }
  saveAutoBuild(list);
}

export function removeBuildingFromQueue(
  positionId: string,
  buildingName: string,
  townName: string,
): void {
  const { accountName } = getState();
  const list = loadAutoBuild();
  const town = findTown(findAccount(list, accountName), townName);
  if (!town) return;

  const index = town.queue.findIndex(
    (entry) =>
      entry.buildingName === buildingName && entry.positionId === positionId,
  );
  if (index >= 0) town.queue.splice(index, 1);
  saveAutoBuild(list);
}

/** Drop towns and accounts whose configured queue is now empty. */
export function cleanAutoBuildConfig(): void {
  const cleaned = loadAutoBuild()
    .map((account) => ({
      ...account,
      townList: account.townList.filter((town) => town.queue.length > 0),
    }))
    .filter((account) => account.townList.length > 0);
  saveAutoBuild(cleaned);
}

/* ────────────────────────── Loading into the queue ─────────────────────── */

/**
 * Copy the logged-in account's configured upgrades into the shared queue.
 *
 * Any pending upgrade tasks are cleared first so pressing Start twice does not
 * queue everything twice. Towns are ordered by name, matching the original.
 */
export function enqueueAutoBuild(): number {
  const { accountName, queue } = getState();
  const account = findAccount(loadAutoBuild(), accountName);

  queue.removeType("upgradeBuilding");

  if (!account) {
    // Nothing to build, so untick this account in the summary table as before.
    const accounts = loadAccounts();
    const row = accounts.find((entry) => entry.account === accountName);
    if (row) {
      row.isAutoBuildChecked = false;
      saveAccounts(accounts);
    }
    return 0;
  }

  const towns = [...account.townList].sort(
    compareValues<AutoBuildTown>("townName"),
  );
  let added = 0;
  for (const town of towns) {
    for (const entry of town.queue) {
      queue.push({
        type: "upgradeBuilding",
        data: {
          townName: town.townName,
          positionId: entry.positionId,
          buildingName: entry.buildingName,
        },
      });
      added++;
    }
  }
  logInfo(`Auto Build: queued ${added} upgrades`);
  return added;
}

/* ────────────────────────────── Task handler ───────────────────────────── */

export async function handleUpgradeBuilding(
  task: Extract<Task, { type: "upgradeBuilding" }>,
): Promise<TaskResult> {
  const { townName, positionId, buildingName } = task.data;

  // Upgrades are only reachable from the town view.
  if (!qs(SEL.cityBread)) {
    backToCity();
    return { status: "retry", reason: "Not on the town view" };
  }

  closeGamePopup();

  const townNumber = getTownNumberByName(townName);
  if (townNumber === null) {
    return { status: "failed", reason: `Town "${townName}" not found` };
  }

  logInfo(`Going to town ${townName}`);
  await gotoTown(townNumber);
  closeGamePopup();

  // A town can only build one thing at a time. `defer`, not `retry`: the
  // original explicitly moved on to the next town here ("This town is
  // inprogress, Next>>"), and holding the head would block every other
  // town's upgrade until this build finished.
  if (qs(SEL.constructionSite)) {
    return { status: "defer", reason: `${townName} is already building` };
  }

  logInfo(`Start upgrading ${buildingName}`);
  await sleep(500);
  // `getElementById` takes a literal id. Interpolating into a `#...`
  // selector (as the original did) makes `querySelector` THROW a
  // SyntaxError for any id that is not a valid CSS identifier, and that
  // throw would leave the task retrying forever.
  document.getElementById(positionId)?.click();

  // The upgrade button must belong to the slot we just clicked.
  //
  // A live capture found `#js_buildingUpgradeButton` present on a screen whose
  // template was something else entirely, left over from an earlier view — its
  // href still pointed at that other building. Clicking it would have upgraded
  // the wrong thing. The href carries `position=N`, so the slot is checkable.
  const slotNumber = positionId.match(/\d+/)?.[0] ?? null;
  const button = await waitForElement<HTMLElement>(SEL.buildingUpgradeButton, {
    timeoutMs: UPGRADE_BUTTON_TIMEOUT_MS,
  })
    .then((element) => {
      const href = element.getAttribute("href") ?? "";
      const hrefPosition = href.match(/[?&]position=(\d+)/)?.[1] ?? null;
      if (
        slotNumber !== null &&
        hrefPosition !== null &&
        hrefPosition !== slotNumber
      ) {
        logInfo(
          `Upgrade button points at position ${hrefPosition}, expected ${slotNumber} - ignoring`,
        );
        return null;
      }
      return element;
    })
    .catch(() => null);

  if (!button) {
    // Specific to this building (usually not enough resources), so let the
    // rest of the queue past rather than stalling on it.
    return {
      status: "defer",
      reason: `${buildingName}: upgrade button unavailable (not enough resources?)`,
    };
  }

  button.click();
  logInfo(`Finished upgrading ${buildingName}`);

  // Drop it from the config so a later re-queue does not repeat it.
  removeBuildingFromQueue(positionId, buildingName, townName);

  await sleep(1500);
  closeGamePopup();
  return { status: "done" };
}

/* ───────────────────── Scanning buildings per town ─────────────────────── */

/**
 * How long to stay in a town before moving on.
 *
 * Arriving only means the breadcrumb changed. The game delivers the town data
 * in that same response, but Empire Overview records it from its own ajax hook
 * a moment later, and the town cache reads `ikariam.model`. Leaving the instant
 * the breadcrumb flips can outrun both, which is how a scan could walk every
 * town and still leave most of them blank.
 */
const SCAN_SETTLE_MS = 1200;

/** Guards against a second scan being started while one is walking towns. */
let scanning = false;

/**
 * Visit each town in turn so the game loads its building data.
 * The original hard-capped this at the first 14 towns (`index <= 13`).
 *
 * Three things the original did not do, each of which made a failed scan look
 * like a scan that did nothing:
 *
 *  1. **One unreachable town no longer aborts the rest.** `gotoTown` throws on
 *     timeout, and the caller invokes this as `void scanBuildings()`, so the
 *     rejection vanished into an unhandled promise and the remaining towns were
 *     never visited — with nothing logged anywhere.
 *  2. **It reports what happened.** A scan takes tens of seconds and changed
 *     nothing on screen until now.
 *  3. **It records the town cache as it goes.** The walk already has every town
 *     open; taking the snapshot here is free and is what Auto Wine falls back on
 *     when the Empire Overview board has no figures.
 */
export async function scanBuildings(
  maxTowns = 14,
  /**
   * Whether the shared task runner is currently active. Injected because the
   * runner is owned by `app.ts`; the queue itself does not know.
   */
  queueIsRunning: () => boolean = () => false,
): Promise<void> {
  if (scanning) {
    alert("A scan is already walking the towns.");
    return;
  }

  const container = qs(SEL.townListContainer);
  const total = container ? container.childNodes.length : 0;
  const limit = Math.min(total, maxTowns);
  if (limit === 0) {
    alert("No town list on this page — open a town view and try again.");
    return;
  }

  // The queue runner navigates too. Two of them steering the same page means
  // whichever loses the race times out.
  if (queueIsRunning()) {
    alert(
      "The task queue is running and also changes town.\n\n" +
        "Stop it first, then scan.",
    );
    return;
  }

  // Ask the game for every town instead of walking to each one, when the
  // model is readable. Measured: 2367 ms per town walking, 328-841 ms per
  // request. The walk stays as the fallback, because it needs nothing but
  // the page.
  if (ownTownIds().length > 0) {
    scanning = true;
    try {
      const result = await syncAllTowns();
      const summary =
        `Sync finished: ${result.synced}/${result.synced + result.failed.length} ` +
        `towns in ${(result.elapsedMs / 1000).toFixed(1)}s` +
        (result.failed.length ? `, failed: ${result.failed.join(", ")}` : "");
      logInfo(summary);
      alert(summary);
      return;
    } catch (e) {
      logInfo(
        `Sync failed, falling back to walking the towns - ${(e as Error)?.message ?? e}`,
      );
    } finally {
      scanning = false;
    }
  }

  scanning = true;
  const failed: string[] = [];
  let visited = 0;

  try {
    for (let i = 0; i < limit; i++) {
      const townName = getTownNameFromList(i) || `#${i}`;
      try {
        await gotoTown(i);
        await sleep(SCAN_SETTLE_MS);
        recordCurrentTown(getState().account);
        visited++;
      } catch (e) {
        failed.push(townName);
        logInfo(
          `Scan: could not open ${townName} — ${(e as Error)?.message ?? e}`,
        );
      }
    }
  } finally {
    scanning = false;
    backToCity();
  }

  const summary =
    `Scan finished: ${visited}/${limit} towns visited` +
    (failed.length ? `, failed: ${failed.join(", ")}` : "");
  logInfo(summary);
  alert(summary);
}

export interface BuildingSlot {
  buildingName: string;
  positionId: string;
}

/** Buildings in the currently open town, for the settings dialog. */
export function listBuildingsInCurrentTown(): BuildingSlot[] {
  const slots: BuildingSlot[] = qsa(SEL.buildings).map((element) => {
    let buildingName =
      qs(SEL.buildingHover, element)
        ?.getAttribute("title")
        ?.trim()
        .replace("(", "")
        .replace(")", "")
        .replace("Under construction", "0") ?? "";

    // While upgrading, the title still shows the old level — add one.
    if (element.classList.contains("constructionSite")) {
      const oldLevel = Number(buildingName.split(" ").pop());
      buildingName = buildingName.replace(
        String(oldLevel),
        String(oldLevel + 1),
      );
    }
    return {
      buildingName,
      positionId: qs(SEL.buildingHover, element)?.id.trim() ?? "",
    };
  });

  slots.sort(compareValues<BuildingSlot>("buildingName"));
  return slots;
}
