/**
 * Send Resources — application bootstrap.
 *
 * Exported as `start()` rather than self-executing, because the two packagings
 * need to invoke it differently: the userscript header already restricts which
 * views it loads on, while the Chrome extension has to filter at runtime
 * (Chrome match patterns cannot see the query string). See
 * `src/extension/view-guard.ts`.
 *
 * Startup order:
 *   1. Build the panel and install the event dispatcher
 *   2. Initialise per-account state, migrating any legacy queue
 *   3. Register a handler per task type on the shared runner
 *   4. Resume whatever automation the user left running last session
 */

import { qs } from "@core/dom";
import { getAccountName, getCurrentTownName } from "@core/ikariam/globals";
import { DIALOG_ID, SEL } from "@core/ikariam/selectors";
import { installErrorHandlers } from "@core/bug-report";
import { clearLog, initLogger, logInfo } from "@core/logger";
import { TabLock, TaskRunner } from "@core/task-queue";
import { showToast } from "@core/ui/window";

import { BUG_REPORT, QUEUE_VIEW, SEND_DIALOG, WINE_DIALOG } from "./messages";
import {
  FLAG,
  getFlag,
  getState,
  initState,
  isAutoStart,
  isFlagTrue,
  loadSenders,
  migrateLegacyQueues,
  saveReceivers,
  saveSenders,
  setAutoStart,
  setFlag,
} from "./state";

import { backToCity, openSpyBuilding, sendAllArmy } from "./navigation";

import {
  describeCurrentTransfer,
  enqueueSendResource,
  handleSendResource,
} from "./features/send-resources";
import {
  collectWineSettings,
  enqueueWineRun,
  loadConsumedWine,
} from "./features/auto-wine";
import {
  addBuildingToQueue,
  cleanAutoBuildConfig,
  enqueueAutoBuild,
  hasConfiguredUpgrades,
  handleUpgradeBuilding,
  removeBuildingFromQueue,
  scanBuildings,
} from "./features/auto-build";
import {
  clearAccounts,
  renderSummary,
  setAutoBuildChecked,
  setReloadGuard,
  updateCurrentAccount,
} from "./features/summary-account";
import { startBarbarianObserver } from "./features/barbarian";
import {
  applyTransportStep,
  startTransportButtonObserver,
} from "./features/transport-buttons";
import {
  clearBugs,
  exportBugReport,
  getBugs,
  installDiagnostics,
  summariseBugs,
} from "./diagnostics";
import { pruneTownStats, recordCurrentTown } from "./town-cache";
import { calibrateShipCapacity } from "./ship-capacity";

import { installActionDispatcher, registerActions } from "./ui/actions";
import { exportDataToFile, importDataFromFile } from "./ui/data-transfer-ui";
import {
  closeDialog,
  openAutoBuildDialog,
  openAutoWineDialog,
  openSendResourcesDialog,
  openWineSourceDialog,
  readSendForm,
  refreshTownQueueCell,
  renderResourceTable,
  renderWinePlanPreview,
} from "./ui/dialogs";
import {
  buildPanel,
  setAutoBuildButtonLabel,
  setQueueButtonLabel,
  setTransferInfo,
  togglePanel,
  toggleZoom,
} from "./ui/panel";
import { refreshQueueView } from "./ui/queue-view";

/** Queue poll interval in ms. The original used 1000 for the shipping loop. */
const QUEUE_INTERVAL_MS = 1000;
/** How often the multi-account summary is redrawn. */
const SUMMARY_INTERVAL_MS = 10_000;
/** How often the panel's status line is refreshed. */
const STATUS_INTERVAL_MS = 1000;
/**
 * How often the town currently on screen is snapshotted into the town cache.
 * Cheap: it only reads `ikariam.model` and writes one localStorage key.
 */
const TOWN_SNAPSHOT_INTERVAL_MS = 5_000;

/**
 * Physical keys for the hotkeys inherited from the original. `event.code`
 * names the key, not the character, so the bindings do not move with the
 * keyboard layout — which is also what the deprecated `keyCode` numbers the
 * original used amounted to on a Latin layout.
 */
const KEY_TOGGLE_PANEL = "Space";
const KEY_SEND_ALL_ARMY = "KeyA";
const KEY_AUTO_BUILD = "KeyB";
const KEY_SAFEHOUSE = "KeyS";

/** How much of the bug summary fits in the confirmation toast. */
const BUG_SUMMARY_PREVIEW_CHARS = 800;

let runner: TaskRunner;
/** Keeps a second tab of the same account from driving the same queue. */
let tabLock: TabLock;
/** Whether "another tab is running the queue" has been logged since. */
let waitingForTabLogged = false;

/** Start the runner, asking for the cross-tab lock it needs to do anything. */
function startRunner(): void {
  tabLock.acquire();
  runner.start();
}

/** Stop the runner and let another tab of this account take over. */
function stopRunner(): void {
  runner.stop();
  tabLock.release();
}

/** The runner's `canRun`: only the tab holding the lock drives the queue. */
function holdsTabLock(): boolean {
  if (tabLock.isHeld) {
    waitingForTabLogged = false;
    return true;
  }
  if (!waitingForTabLogged) {
    logInfo("Another tab is running the task queue for this account - waiting");
    waitingForTabLogged = true;
  }
  return false;
}

/**
 * Whether the UI is ready for another task.
 *
 * The precondition for every task: check the UI state before starting one
 * (no popup, not loading). This script's OWN popup must block (the user is
 * editing settings); the GAME's popups must not, because tasks close those
 * themselves.
 */
function isUiReady(): boolean {
  if (qs(`#${DIALOG_ID}`)) return false;
  if (!qs(SEL.cityBread)) return false;
  return true;
}

/**
 * Start or stop the shared runner so it matches the two automation switches.
 *
 * There is one queue, one runner and one interval, but TWO buttons that turn
 * automation on: Transport's Start Timer and Build's Start Timer. Each used to
 * drive the runner directly, which made them fight:
 *
 *   - Transport's Stop called `runner.stop()` unconditionally, silently
 *     halting a running Auto Build while its button still read "Stop Timer".
 *   - Build's Stop never called `runner.stop()` at all, so queued upgrades
 *     carried on executing after the button said they had stopped.
 *   - Build's Start called `runner.start()`, which also began working through
 *     queued shipments while Transport's button still read "Start Timer".
 *
 * So the runner's state is derived here instead of poked from either handler:
 * it runs while either switch is on, and each button only owns its own flag.
 * That is the rule the startup path already used (`autoStart || autoBuildStart`),
 * now applied to the toggles as well.
 */
function syncRunnerToFlags(): void {
  const wanted = isAutoStart() || isFlagTrue(FLAG.isAutoBuildStart);
  if (wanted && !runner.isRunning) startRunner();
  else if (!wanted && runner.isRunning) stopRunner();
}

function toggleQueueRunner(): void {
  // Read the flag, not `runner.isRunning` — the runner may well be up for Auto
  // Build's sake while this switch is off.
  const running = isAutoStart();
  setAutoStart(!running);
  setQueueButtonLabel(!running);
  syncRunnerToFlags();
}

/**
 * Plan a wine run and put it in the queue, without starting the runner.
 *
 * Auto Wine's Start only ever fills the queue; the Transport switch is what
 * decides whether anything is sent. Starting the runner from here started
 * shipping while that switch still read "Start Timer", and because it bypassed
 * `syncRunnerToFlags` — which derives the runner's state from the two feature
 * flags — the next Build toggle would stop it again. Same class of bug the
 * comment above `syncRunnerToFlags` describes, in the one button that was
 * missed.
 */
function startWineRun(fromTown: string): void {
  if (enqueueWineRun(fromTown) > 0) refreshQueueView();
}

function registerUiActions(): void {
  registerActions({
    "dialog.close": closeDialog,

    /* ── Send resources ── */
    "send.settings": openSendResourcesDialog,
    "send.add": () => {
      const form = readSendForm();
      if (!form) {
        showToast(SEND_DIALOG.errors.incomplete);
        return;
      }
      if (form.origin === form.destination) {
        showToast(SEND_DIALOG.errors.sameTown);
        return;
      }
      if (form.invalid.length > 0) {
        showToast(SEND_DIALOG.errors.invalidAmount(form.invalid.join(", ")));
        return;
      }
      if (form.amounts.length === 0) {
        showToast(SEND_DIALOG.errors.noAmount);
        return;
      }
      // One queued row per resource filled in.
      for (const { resource, amount } of form.amounts) {
        enqueueSendResource(form.origin, form.destination, resource, amount);
      }
      renderResourceTable();
    },
    "send.removeFirst": () => {
      const { queue } = getState();
      const first = queue.listOfType("sendResource")[0];
      if (first) queue.removeById(first.id);
      renderResourceTable();
    },
    "send.removeLast": () => {
      const { queue } = getState();
      const all = queue.listOfType("sendResource");
      const last = all[all.length - 1];
      if (last) queue.removeById(last.id);
      renderResourceTable();
    },
    "queue.toggle": toggleQueueRunner,

    /* ── Auto wine ── */
    "wine.settings": openAutoWineDialog,
    "wine.save": () => {
      const { senders, receivers } = collectWineSettings();
      saveSenders(senders);
      saveReceivers(receivers);
      closeDialog();
    },
    "wine.load": loadConsumedWine,
    "wine.preview": () => {
      const senders = loadSenders();
      if (senders.length === 0) {
        showToast(WINE_DIALOG.noSourceTicked);
        return;
      }
      // With several sources, preview against the first one.
      renderWinePlanPreview(senders[0]);
    },
    "wine.chooseSource": () => {
      const senders = loadSenders();
      if (senders.length === 0) {
        showToast(WINE_DIALOG.noSourceTicked);
        return;
      }
      if (senders.length === 1) {
        startWineRun(senders[0]);
        return;
      }
      openWineSourceDialog();
    },
    "wine.start": (element) => {
      const town = element.dataset.ikaTown;
      if (!town) return;
      closeDialog();
      startWineRun(town);
    },

    /* ── Auto build ── */
    "build.settings": openAutoBuildDialog,
    "build.add": (element) => {
      const { ikaPosition, ikaBuilding } = element.dataset;
      if (!ikaPosition || !ikaBuilding) return;
      addBuildingToQueue(ikaPosition, ikaBuilding);
      refreshTownQueueCell(getCurrentTownName());
    },
    "build.remove": (element) => {
      const { ikaPosition, ikaBuilding, ikaTown } = element.dataset;
      if (!ikaPosition || !ikaBuilding || !ikaTown) return;
      removeBuildingFromQueue(ikaPosition, ikaBuilding, ikaTown);
      refreshTownQueueCell(ikaTown);
    },
    // Save only closes the dialog, as the original's did: every + and - is
    // already saved. Starting the queue is the panel's Start button's job;
    // the dialog doing it too ("Run queue") was a second Start.
    "build.save": closeDialog,
    "build.startNow": () => {
      if (enqueueAutoBuild() > 0) startRunner();
    },
    "build.toggleTimer": () => {
      const running = isFlagTrue(FLAG.isAutoBuildStart);
      setFlag(FLAG.isAutoBuildStart, !running);
      setAutoBuildButtonLabel(!running);
      // Stopping has to take the upgrades back out of the queue as well. The
      // queue is shared, so leaving them there means Transport's timer carries
      // on building after the Build button says it stopped. Nothing is lost:
      // `enqueueAutoBuild` rebuilds them from the saved build list, which is
      // exactly what it does on the way back in (it clears them first too).
      if (running) getState().queue.removeType("upgradeBuilding");
      else enqueueAutoBuild();
      syncRunnerToFlags();
      refreshQueueView();
    },
    // The runner navigates too, so the scan needs to know whether it is live.
    "build.scan": () => void scanBuildings(undefined, () => runner.isRunning),

    /* ── Quick amounts on the game's shipment form ── */
    "transport.add": (element) => {
      const { ikaResource, ikaShips, ikaKind, ikaSet } = element.dataset;
      if (!ikaResource) return;
      applyTransportStep(
        ikaResource,
        Number(ikaShips) || 0,
        ikaKind === "freighter" ? "freighter" : "merchant",
        ikaSet === "1",
      );
    },

    /* ── Queue ── */
    "queue.remove": (element) => {
      const id = element.dataset.ikaTask;
      if (!id) return;
      getState().queue.removeById(id);
      refreshQueueView();
    },
    "queue.moveToBack": (element) => {
      const id = element.dataset.ikaTask;
      if (!id) return;
      getState().queue.moveToBack(id);
      refreshQueueView();
    },
    "queue.clear": () => {
      const pending = getState().queue.length;
      if (pending === 0) return;
      // Losing a queue by a stray click is worth one confirmation.
      if (!confirm(QUEUE_VIEW.confirmClear(pending))) return;
      getState().queue.clear();
      refreshQueueView();
    },

    /* ── Multi-account summary ── */
    "account.update": updateCurrentAccount,
    "account.clear": clearAccounts,

    /* ── Moving data between browsers ── */
    // The userscript build runs on Edge and the extension on Chrome. Those are
    // separate browser profiles, so they have separate localStorage and no way
    // to share it automatically; a file is the only channel.
    "data.export": exportDataToFile,
    "data.import": importDataFromFile,

    /* ── Diagnostics ── */
    "bug.report": () => {
      const bugs = getBugs();
      if (bugs.length === 0) {
        showToast(BUG_REPORT.nothingToReport);
        return;
      }
      const report = exportBugReport();
      // `navigator.clipboard` needs a user gesture, which a button click is.
      void navigator.clipboard
        ?.writeText(report)
        .then(() =>
          showToast(
            BUG_REPORT.copied(
              bugs.length,
              summariseBugs().slice(0, BUG_SUMMARY_PREVIEW_CHARS),
            ),
          ),
        )
        .catch(() => {
          // Clipboard blocked: fall back to the console, which always works.
          console.log(report);
          showToast(BUG_REPORT.clipboardUnavailable);
        });
    },
    "bug.clear": () => {
      clearBugs();
      showToast(BUG_REPORT.cleared);
    },

    /* ── Misc ── */
    "ship.calibrate": calibrateShipCapacity,
    "panel.toggleZoom": toggleZoom,
    "log.clear": clearLog,
  });

  // The summary table's auto-build checkbox reacts to `change`, not `click`,
  // so it does not go through the data-ika-action dispatcher.
  document.addEventListener("change", (event) => {
    const element = (
      event.target as HTMLElement | null
    )?.closest<HTMLInputElement>(".js-ika-autobuild");
    if (!element) return;
    const account = element.dataset.ikaAccount;
    if (account) setAutoBuildChecked(account, element.checked);
  });
}

/** Hotkeys — same bindings as the original. */
function registerHotkeys(): void {
  document.addEventListener("keydown", (event) => {
    const tag = (event.target as HTMLElement | null)?.nodeName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    switch (event.code) {
      case KEY_TOGGLE_PANEL:
        togglePanel();
        break;
      case KEY_SEND_ALL_ARMY:
        sendAllArmy();
        break;
      case KEY_SAFEHOUSE:
        openSpyBuilding();
        break;
      case KEY_AUTO_BUILD:
        openAutoBuildDialog();
        break;
    }
  });
}

export function start(): void {
  let accountName: string;
  try {
    accountName = getAccountName();
  } catch {
    // The original reloaded whenever the account name was unreadable. Kept,
    // but only once, so a genuinely broken page cannot cause a reload loop.
    if (!sessionStorage.getItem("ikaReloadedOnce")) {
      sessionStorage.setItem("ikaReloadedOnce", "1");
      location.reload();
    }
    return;
  }
  sessionStorage.removeItem("ikaReloadedOnce");

  initState(accountName);
  buildPanel();
  initLogger(accountName);
  // Installed early so failures during the rest of startup are still captured.
  installDiagnostics();
  installErrorHandlers();
  installActionDispatcher();
  registerUiActions();
  registerHotkeys();
  startBarbarianObserver();
  startTransportButtonObserver();

  const moved = migrateLegacyQueues();
  if (moved > 0) {
    logInfo(`Migrated ${moved} shipment orders into the unified queue`);
  }

  // The original's guard against running on the load its own run caused: a
  // finished run sets `isAutoReload` and reloads, and the load that follows
  // only clears the flag. The next run waits for the keep-alive reload, which
  // clears it first. Without this every load drained at once and reloaded
  // again, so the page never stopped loading.
  const loadedAfterRun = getFlag(FLAG.isAutoReload) === "true";
  setFlag(FLAG.isAutoReload, false);

  tabLock = new TabLock(`ika-task-runner:${accountName}`, undefined, (held) => {
    if (held) logInfo("This tab now runs the task queue for this account");
  });
  runner = new TaskRunner(getState().queue, {
    intervalMs: QUEUE_INTERVAL_MS,
    canRun: holdsTabLock,
    isUiReady,
    onDrain: () => {
      stopRunner();
      setAutoStart(false);
      setQueueButtonLabel(false);
      cleanAutoBuildConfig();
      // Nothing left to build: switch Build's timer off rather than leave its
      // button reading "Stop Timer" over a runner with no work.
      if (!hasConfiguredUpgrades()) {
        setFlag(FLAG.isAutoBuildStart, false);
        setAutoBuildButtonLabel(false);
      }
      if (loadedAfterRun) return;
      setFlag(FLAG.isAutoReload, true);
      backToCity("the queue ran dry");
    },
  })
    .register("sendResource", handleSendResource)
    .register("upgradeBuilding", handleUpgradeBuilding);

  // Never let the keep-alive reload interrupt a task in flight.
  setReloadGuard(() => !runner.isBusy);

  updateCurrentAccount();

  // Build up per-town wine figures as the player (or the queue) moves around.
  // This is what lets Auto Wine work without the Empire Overview board.
  pruneTownStats(getState().account);
  recordCurrentTown(getState().account);
  window.setInterval(
    () => recordCurrentTown(getState().account),
    TOWN_SNAPSHOT_INTERVAL_MS,
  );

  window.setInterval(renderSummary, SUMMARY_INTERVAL_MS);
  window.setInterval(
    () => setTransferInfo(describeCurrentTransfer()),
    STATUS_INTERVAL_MS,
  );

  // Restore the automation state from the previous session.
  const autoStart = isAutoStart();
  const autoBuildStart = isFlagTrue(FLAG.isAutoBuildStart);
  setQueueButtonLabel(autoStart);
  setAutoBuildButtonLabel(autoBuildStart);

  // A lap the keep-alive reload cut short is still in the stored queue: carry
  // on with it. Queueing a fresh lap here started over from the first town on
  // every reload, so a long lap never reached its last towns.
  const lapInProgress =
    getState().queue.listOfType("upgradeBuilding").length > 0;
  if (autoBuildStart && !loadedAfterRun && !lapInProgress) enqueueAutoBuild();
  syncRunnerToFlags();
}
