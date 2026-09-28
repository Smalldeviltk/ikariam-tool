/**
 * Automatic building upgrades driven by a per-town queue.
 *
 * Ported from `checkAndProcessAutoBuild` / `startQueue` / `clickUpgrade` /
 * `addBuildingToQueue` / `removeBuildingFromQueue` / `cleanListAutoBuild`.
 *
 * Same rhythm as the original: one LAP per run. Each town with something
 * saved gets one visit, and that visit tries the town's FIRST saved upgrade
 * only; a town that is busy, short of resources or refuses the click is left
 * for the next lap. When the lap is over the queue drains, and the next lap
 * comes with the keep-alive reload (even minutes, see `summary-account.ts`).
 *
 * Structural change: the original walked every town inside one long run
 * (`checkAndProcessAutoBuild(townIndex + 1)`), holding the DOM busy for a long
 * time — precisely when it collided with the shipping loop. Here each town's
 * visit is its own task in the shared queue, so a shipment can slot in between
 * two towns without contention.
 *
 * `listAutoBuild` in localStorage remains the configuration (the UI reads and
 * writes it as before); `enqueueAutoBuild` is where that config is loaded into
 * the run queue.
 */

import { qs, qsa } from "@core/dom";
import { sleep, waitFor } from "@core/async";
import { compareValues, errorMessage, MS_PER_SECOND } from "@core/format";
import { getCurrentTownName } from "@core/ikariam/globals";
import { SEL } from "@core/ikariam/selectors";
import { logInfo } from "@core/logger";
import type { Task, TaskResult } from "@core/task-queue";
import { SCAN } from "../messages";
import {
  backToCity,
  closeGamePopup,
  getTownCount,
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

/**
 * How long to let a town's view settle after arriving, before reading its slots.
 *
 * `gotoTown` resolves as soon as the BREADCRUMB names the target, and the
 * breadcrumb is a different ajax box from `#locations` — the game applies them
 * from one response but not in one paint. Reading the slots on the instant the
 * breadcrumb flips can therefore still see the PREVIOUS town's buildings, which
 * is how a busy town passed the "already building" check below and had its
 * upgrade clicked anyway.
 *
 * The original waited a flat 1000 ms here for the same reason, and
 * `SCAN_SETTLE_MS` further down waits 1200 ms for the sibling case.
 */
const TOWN_SETTLE_MS = 1200;

/**
 * How long to wait for the clicked upgrade to show up as a building site.
 *
 * Generous on purpose: the cost of giving up too early is a duplicate upgrade
 * one lap later, which is worse than the cost of waiting.
 */
const UPGRADE_CONFIRM_TIMEOUT_MS = 10_000;

/** Pause between arriving in a town and clicking the building to upgrade. */
const BUILDING_CLICK_PAUSE_MS = 500;

/* ─────────────────────────── Building labels ───────────────────────────── */

/** The level at the end of a label such as `"Warehouse 12"`. */
function levelOf(label: string): number {
  return Number(label.split(" ").pop());
}

/** The same label showing another level: `"Warehouse 12"` -> `"Warehouse 13"`. */
function withLevel(label: string, level: number): string {
  return label.replace(String(label.split(" ").pop()), String(level));
}

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
export function getTownQueue(townName: string): AutoBuildTown["queue"] {
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

  const alreadyQueued =
    town?.queue.filter((entry) => entry.positionId === positionId).length ?? 0;
  const nextLevel = levelOf(buildingName) + alreadyQueued + 1;
  const entry = {
    positionId,
    buildingName: withLevel(buildingName, nextLevel),
  };

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

/** Whether the logged-in account still has upgrades in its saved build list. */
export function hasConfiguredUpgrades(): boolean {
  const account = findAccount(loadAutoBuild(), getState().accountName);
  return account?.townList.some((town) => town.queue.length > 0) ?? false;
}

/* ────────────────────────── Loading into the queue ─────────────────────── */

/**
 * Where a town comes in a lap: its row on the Empire Overview board, else its
 * place in the game's dropdown, else last.
 *
 * The board is the order the player sees and chose (its rows can be dragged),
 * which is why it is not the dropdown order alone.
 */
function townLapRank(townName: string, boardNames: string[]): number {
  const boardIndex = boardNames.indexOf(townName);
  if (boardIndex >= 0) return boardIndex;
  const dropdownIndex = getTownNumberByName(townName);
  if (dropdownIndex !== null) return boardNames.length + dropdownIndex;
  return Number.POSITIVE_INFINITY;
}

/**
 * Queue one lap: one task per town that has upgrades saved, for the town's
 * first saved upgrade only, in board order.
 *
 * Any pending upgrade tasks are cleared first so pressing Start twice does not
 * queue everything twice.
 *
 * One task per town, not one per saved upgrade. Queueing every upgrade had a
 * busy town's entries sent to the back over and over, so the runner hopped
 * between towns every second; and the reload that re-queued them from the
 * first town again kept the last towns from ever being reached.
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

  const boardNames = qsa(SEL.buildTabTownNames).map(
    (span) => span.textContent?.trim() ?? "",
  );
  const towns = account.townList
    .filter((town) => town.queue.length > 0)
    .sort(
      (a, b) =>
        townLapRank(a.townName, boardNames) -
          townLapRank(b.townName, boardNames) ||
        a.townName.localeCompare(b.townName),
    );
  for (const town of towns) {
    const [first] = town.queue;
    queue.push({
      type: "upgradeBuilding",
      data: {
        townName: town.townName,
        positionId: first.positionId,
        buildingName: first.buildingName,
      },
    });
  }
  logInfo(`Auto Build: queued ${towns.length} towns`);
  return towns.length;
}

/* ────────────────────────────── Task handler ───────────────────────────── */

/**
 * The slot number inside a queue entry's id.
 *
 * Entries store the hoverable's id (`js_CityPosition8Link`), while the slot div
 * it belongs to is `#position8` and the upgrade button's href carries
 * `position=8`. All three are reached from this one number.
 */
function slotNumberOf(positionId: string): string | null {
  return positionId.match(/\d+/)?.[0] ?? null;
}

/** The `#positionN` slot div for a queue entry's `js_CityPositionNLink` id. */
function slotElement(positionId: string): HTMLElement | null {
  const slotNumber = slotNumberOf(positionId);
  return slotNumber === null
    ? null
    : document.getElementById(`position${slotNumber}`);
}

/**
 * Whether this town already has something going up.
 *
 * Confirmed against two live captures of the same account. In a town that was
 * building, `.constructionSite` matched and the slot read
 * `position8 building constructionSite animated`; in a town that was not, it
 * matched nothing. The class survives opening a building, so this stays
 * readable from the building view as well as from the town view — which is what
 * lets it be re-checked at the moment of the click.
 *
 * Deliberately NOT read from the upgrade button's label. In the busy capture it
 * read "In building queue!" and in the free one "Upgrade", so it does
 * discriminate — but it is a translated string, and its `title` attribute says
 * "In building queue!" in BOTH, so the tempting attribute is the useless one.
 * `ikariam.model` also carries `queueETA` / `nextETA`, which would be sturdier
 * still; their values have not been captured yet, so they are not used here.
 */
function isTownBuilding(): boolean {
  return qs(SEL.constructionSite) !== null;
}

/**
 * End this town's turn in the lap, leaving its saved upgrade for the next one.
 *
 * `done`, not `defer`: the task is one visit, and the visit is over. Deferring
 * kept it circling the queue, a town switch each time round, which is what had
 * the runner hopping between towns non-stop. The saved build list, which is
 * what the next lap is queued from, is not touched.
 */
function endTownTurn(reason: string): TaskResult {
  logInfo(`${reason} - next town`);
  return { status: "done" };
}

export async function handleUpgradeBuilding(
  task: Extract<Task, { type: "upgradeBuilding" }>,
): Promise<TaskResult> {
  const { townName, positionId, buildingName } = task.data;

  // Upgrades are only reachable from the town view.
  if (!qs(SEL.cityBread)) {
    backToCity("Auto Build needs the town view");
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
  await sleep(TOWN_SETTLE_MS);

  // A town can only build one thing at a time. The original moved on to the
  // next town here ("This town is inprogress, Next>>"); holding the head
  // would block every other town's upgrade until this build finished.
  if (isTownBuilding()) {
    return endTownTurn(`${townName} is already building`);
  }

  logInfo(`Start upgrading ${buildingName}`);
  await sleep(BUILDING_CLICK_PAUSE_MS);
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
  //
  // A button for another slot is waited past, not given up on: it is usually
  // the previous building's, still on screen until the game swaps in this
  // one's view. Giving up on the first one seen deferred the task as "not
  // enough resources?" when there were enough (seen live, 26/09).
  const slotNumber = slotNumberOf(positionId);
  let otherSlotSeen: string | null = null;
  const button = await waitFor(
    () => {
      const element = qs<HTMLElement>(SEL.buildingUpgradeButton);
      if (!element) return null;
      const href = element.getAttribute("href") ?? "";
      const hrefPosition = href.match(/[?&]position=(\d+)/)?.[1] ?? null;
      if (
        slotNumber !== null &&
        hrefPosition !== null &&
        hrefPosition !== slotNumber
      ) {
        otherSlotSeen = hrefPosition;
        return null;
      }
      return element;
    },
    {
      timeoutMs: UPGRADE_BUTTON_TIMEOUT_MS,
      label: `upgrade button for ${buildingName}`,
    },
  ).catch(() => null);

  if (!button && otherSlotSeen !== null) {
    logInfo(
      `Upgrade button still pointed at position ${otherSlotSeen}, expected ${slotNumber} - not clicked`,
    );
  }

  if (!button) {
    // Specific to this building (usually not enough resources), so let the
    // rest of the lap past rather than stalling on it.
    return endTownTurn(
      `${buildingName}: upgrade button unavailable (not enough resources?)`,
    );
  }

  // Last look before committing. Opening the building took a round trip, and
  // the check on arrival was made against a view that has since been replaced;
  // a build started in between (by the player, or by the town finishing a
  // queued one) would otherwise be clicked straight over.
  if (isTownBuilding()) {
    return endTownTurn(`${townName} started building meanwhile`);
  }

  button.click();

  // Do NOT drop the config entry yet.
  //
  // This used to remove it and report `done` the instant the click returned,
  // with nothing checking that anything happened. The game refuses the click
  // whenever the town is already building, and the entry was consumed all the
  // same — the queue counted down while no building ever went up, which is the
  // bug this whole guard exists for.
  //
  // A started upgrade turns the slot into a building site, so that is the
  // receipt. The specific slot is checked rather than any `.constructionSite`,
  // so a build the player kicked off elsewhere cannot be mistaken for ours.
  const started = await waitFor(
    () => slotElement(positionId)?.classList.contains("constructionSite"),
    {
      timeoutMs: UPGRADE_CONFIRM_TIMEOUT_MS,
      label: `upgrade ${buildingName} in ${townName}`,
    },
  ).catch(() => false);

  closeGamePopup();

  if (!started) {
    // Keep the entry. Worst case the upgrade did start and we simply failed to
    // see it, in which case the next lap finds the town building and moves on.
    return endTownTurn(
      `${buildingName} in ${townName}: clicked Upgrade but no building site ` +
        `appeared - leaving it queued`,
    );
  }

  logInfo(`Finished upgrading ${buildingName}`);

  // Drop it from the config so a later re-queue does not repeat it.
  removeBuildingFromQueue(positionId, buildingName, townName);

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
    alert(SCAN.alreadyRunning);
    return;
  }

  const limit = Math.min(getTownCount(), maxTowns);
  if (limit === 0) {
    alert(SCAN.noTownList);
    return;
  }

  // The queue runner navigates too. Two of them steering the same page means
  // whichever loses the race times out.
  if (queueIsRunning()) {
    alert(SCAN.queueRunning);
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
      const summary = SCAN.syncFinished(
        result.synced,
        result.synced + result.failed.length,
        (result.elapsedMs / MS_PER_SECOND).toFixed(1),
        result.failed.join(", "),
      );
      logInfo(summary);
      alert(summary);
      return;
    } catch (e) {
      logInfo(
        `Sync failed, falling back to walking the towns - ${errorMessage(e)}`,
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
        logInfo(`Scan: could not open ${townName} — ${errorMessage(e)}`);
      }
    }
  } finally {
    scanning = false;
    backToCity("building scan finished");
  }

  const summary = SCAN.walkFinished(visited, limit, failed.join(", "));
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
      buildingName = withLevel(buildingName, levelOf(buildingName) + 1);
    }
    return {
      buildingName,
      positionId: qs(SEL.buildingHover, element)?.id.trim() ?? "",
    };
  });

  slots.sort(compareValues<BuildingSlot>("buildingName"));
  return slots;
}
