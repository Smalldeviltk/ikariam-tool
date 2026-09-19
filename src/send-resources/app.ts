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
import { getAccountName } from "@core/ikariam/globals";
import { DIALOG_ID, SEL } from "@core/ikariam/selectors";
import { installErrorHandlers } from "@core/bug-report";
import { clearLog, initLogger, logInfo } from "@core/logger";
import { TaskRunner } from "@core/task-queue";

import {
  FLAG,
  getState,
  initState,
  isAutoStart,
  isFlagTrue,
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
  loadSenders,
} from "./features/auto-wine";
import {
  addBuildingToQueue,
  cleanAutoBuildConfig,
  enqueueAutoBuild,
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

/** Key codes for the hotkeys inherited from the original. */
const KEY_SPACE = 32;
const KEY_A = 65;
const KEY_B = 66;
const KEY_S = 83;

let runner: TaskRunner;

/**
 * Whether the UI is ready for another task.
 *
 * This is the precondition `So_sanh_2_script_Ikariam.md` asked for: "check the
 * UI state carefully before starting a new task (no popup, not loading)". This
 * script's OWN popup must block (the user is editing settings); the GAME's
 * popups must not, because tasks close those themselves.
 */
function isUiReady(): boolean {
  if (qs(`#${DIALOG_ID}`)) return false;
  if (!qs(SEL.cityBread)) return false;
  return true;
}

function toggleQueueRunner(): void {
  if (runner.isRunning) {
    runner.stop();
    setAutoStart(false);
    setQueueButtonLabel(false);
  } else {
    runner.start();
    setAutoStart(true);
    setQueueButtonLabel(true);
  }
}

function registerUiActions(): void {
  registerActions({
    "dialog.close": closeDialog,

    /* ── Send resources ── */
    "send.settings": openSendResourcesDialog,
    "send.add": () => {
      const form = readSendForm();
      if (!form) {
        alert("Please fill in every field.");
        return;
      }
      if (form.origin === form.destination) {
        alert("Source and destination are the same!");
        return;
      }
      if (form.amount <= 0) {
        alert("Amount must be greater than 0!");
        return;
      }
      enqueueSendResource(
        form.origin,
        form.destination,
        form.resource,
        form.amount,
      );
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
        alert("No town is ticked as a wine source!");
        return;
      }
      // With several sources, preview against the first one.
      renderWinePlanPreview(senders[0]);
    },
    "wine.chooseSource": () => {
      const senders = loadSenders();
      if (senders.length === 0) {
        alert("No town is ticked as a wine source!");
        return;
      }
      if (senders.length === 1) {
        if (enqueueWineRun(senders[0]) > 0) runner.start();
        return;
      }
      openWineSourceDialog();
    },
    "wine.start": (element) => {
      const town = element.dataset.ikaTown;
      if (!town) return;
      closeDialog();
      if (enqueueWineRun(town) > 0) runner.start();
    },

    /* ── Auto build ── */
    "build.settings": openAutoBuildDialog,
    "build.add": (element) => {
      const { ikaPosition, ikaBuilding } = element.dataset;
      if (!ikaPosition || !ikaBuilding) return;
      addBuildingToQueue(ikaPosition, ikaBuilding);
      refreshTownQueueCell(qs(SEL.cityBread)?.innerHTML.trim() ?? "");
    },
    "build.remove": (element) => {
      const { ikaPosition, ikaBuilding, ikaTown } = element.dataset;
      if (!ikaPosition || !ikaBuilding || !ikaTown) return;
      removeBuildingFromQueue(ikaPosition, ikaBuilding, ikaTown);
      refreshTownQueueCell(ikaTown);
    },
    "build.enqueue": () => {
      closeDialog();
      if (enqueueAutoBuild() > 0) runner.start();
    },
    "build.startNow": () => {
      if (enqueueAutoBuild() > 0) runner.start();
    },
    "build.toggleTimer": () => {
      const running = isFlagTrue(FLAG.isAutoBuildStart);
      setFlag(FLAG.isAutoBuildStart, !running);
      setAutoBuildButtonLabel(!running);
      if (!running) {
        enqueueAutoBuild();
        runner.start();
      }
    },
    // The runner navigates too, so the scan needs to know whether it is live.
    "build.scan": () => void scanBuildings(undefined, () => runner.isRunning),

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
        alert("No bugs recorded. Nothing to report.");
        return;
      }
      const report = exportBugReport();
      // `navigator.clipboard` needs a user gesture, which a button click is.
      void navigator.clipboard
        ?.writeText(report)
        .then(() =>
          alert(
            `Copied a report of ${bugs.length} distinct issue(s) to the clipboard.

` + summariseBugs().slice(0, 800),
          ),
        )
        .catch(() => {
          // Clipboard blocked: fall back to the console, which always works.
          console.log(report);
          alert(
            "Clipboard unavailable — the full report was printed to the console " +
              "(F12). You can also run ikaBugReport().",
          );
        });
    },
    "bug.clear": () => {
      clearBugs();
      alert("Bug reports cleared.");
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

    switch (event.which) {
      case KEY_SPACE:
        togglePanel();
        break;
      case KEY_A:
        sendAllArmy();
        break;
      case KEY_S:
        openSpyBuilding();
        break;
      case KEY_B:
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

  const moved = migrateLegacyQueues();
  if (moved > 0) {
    logInfo(`Migrated ${moved} shipment orders into the unified queue`);
  }

  runner = new TaskRunner(getState().queue, {
    intervalMs: QUEUE_INTERVAL_MS,
    isUiReady,
    onDrain: () => {
      runner.stop();
      setAutoStart(false);
      setQueueButtonLabel(false);
      cleanAutoBuildConfig();
      setFlag(FLAG.isAutoReload, true);
      backToCity();
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

  if (autoBuildStart) enqueueAutoBuild();
  if (autoStart || autoBuildStart) runner.start();
}
