/**
 * Every user-facing string Send Resources shows, in one place.
 *
 * Kept apart from the code that uses them so the wording can be reviewed in
 * one sitting and a translation can later be swapped in without touching
 * logic. Strings that take values are functions. Log lines are not here:
 * they are for diagnosing, not for the player.
 *
 * The shared core keeps its own strings in `src/core/messages.ts`.
 */

/** Words used on buttons in more than one place. */
export const BUTTON = {
  start: "Start",
  startTimer: "Start Timer",
  stopTimer: "Stop Timer",
  settings: "Settings",
  save: "Save",
  load: "Load",
  close: "Close",
  cancel: "Cancel",
  add: "Add",
} as const;

export const PANEL = {
  title: "Send Resources",
  launcher: "Send Resources",
  groups: {
    wine: "Wine",
    transport: "Transport",
    build: "Build",
    queue: "Queue",
    account: "Account",
    data: "Data",
  },
  calibrateCargo: "Calibrate Cargo",
  scan: "Scan",
  updateAccount: "Update Account",
  exportData: "Export",
  importData: "Import",
  bugReport: "Bug Report",
  clearLog: "Clear Log",
  /** The footer, while tasks are waiting. */
  footerWithQueue: (status: string, pending: number) =>
    `${status}  —  ${pending} queued`,
  footerWithCounters: (
    status: string,
    merchants: number,
    freighters: number,
    actionPoints: number,
  ) =>
    `${status}  —  Idle ships ${merchants} + ${freighters} freighters  ·  AP ${actionPoints}`,
} as const;

export const WINE_WARNING = {
  unknown:
    "No wine figures yet — open the Empire Overview board, or visit a town.",
  allComfortable: (towns: number) => `Wine: ${towns} towns, all comfortable`,
  townLine: (town: string, left: string) => `${town} — ${left}`,
} as const;

export const QUEUE_VIEW = {
  empty: "The queue is empty.",
  more: (count: number) => `+ ${count} more`,
  headerTask: "Task",
  moveToBack: "Send to the back",
  remove: "Remove",
  clearAll: "Clear all",
  upgrade: (building: string, town: string) => `Upgrade ${building} in ${town}`,
  confirmClear: (pending: number) => `Remove all ${pending} queued task(s)?`,
} as const;

/** The status line describing what is transferring. */
export const TRANSFER_STATUS = {
  idle: "Nothing is transferring",
} as const;

export const SEND_DIALOG = {
  title: "Mass transport resources",
  from: "From: ",
  destination: "Destination: ",
  amount: "Amount",
  removeFirst: "Remove First",
  removeLast: "Remove Last",
  columns: ["Origin", "Destination", "Resource", "Amount", "Source"],
  errors: {
    incomplete: "Please choose both towns.",
    sameTown: "Source and destination are the same!",
    noAmount: "Enter an amount for at least one resource.",
    invalidAmount: (resources: string) =>
      `Amounts must be whole numbers greater than 0: ${resources}`,
  },
} as const;

export const WINE_DIALOG = {
  title: "Auto Wine",
  columns: ["Sender", "Town Name", "Wine/h", "Stock", "Lasts"],
  help:
    "<b>Sender</b> and <b>Wine/h</b> are the two roles and they are mutually " +
    "exclusive: tick a town to make it a source, or give it a Wine/h above 0 " +
    "to make it a receiver. A ticked town is never a receiver.<br/>" +
    "<b>Stock</b> and <b>Lasts</b> come from the Empire Overview board, or " +
    'from the last time each town was visited. When they show "—" there is ' +
    "no measurement yet and Auto Wine uses the <b>Wine/h</b> you type here, " +
    "assuming zero stock.",
  previewPlan: "Preview plan",
  chooseSourceTitle: "Choose the wine source town",
  noSourceTicked: "No town is ticked as a wine source!",
} as const;

export const WINE_PREVIEW = {
  noSpare: "The source town has no spare wine to send.",
  boardUnavailable:
    " (The Empire Overview board is not available, so its stock could not be read.)",
  storageFull: " (storage full)",
  levelEveryone: (hours: string) => `levelling everyone to <b>~${hours}h</b>.`,
  levelExcept: (hours: string, towns: string, count: number) =>
    `levelling to <b>~${hours}h</b>, except ${towns}: storage full, so ` +
    `${count === 1 ? "it ends" : "they end"} lower and the rest stays at ` +
    `the source for the next run.`,
  summary: (
    source: string,
    used: string,
    spare: string,
    unused: string,
    levelling: string,
  ) =>
    `<b>Source:</b> ${source} — shipping ${used} wine ` +
    `(spare ${spare}, ${unused} left over), ${levelling}`,
  columns: ["Town", "Stock", "Consume/h", "Send", "Lasts after"],
} as const;

export const AUTO_WINE = {
  noReceivers: (senders: number, towns: number) =>
    `No town is set to receive wine — ${senders} of ${towns} towns are ` +
    "ticked as Sender.\n\n" +
    "Sender and receiver are exclusive roles: tick a town to make it a " +
    "source, or leave it unticked and give it a Wine/h above 0 to make it a " +
    "receiver. The Load button fills those figures in.",
  onlyReceiverIsSource:
    "The only town set to receive wine is the one you are sending from.\n\n" +
    "Pick a different source, or give another town a Wine/h figure.",
  noSpareWine: (reserve: number) =>
    `The source town has no spare wine (it must hold more than ${reserve}).`,
  nothingToSend:
    "Every receiving town already has enough wine — nothing to send.",
  noFigures:
    "No wine figures are available yet.\n\n" +
    "They come from the Empire Overview board, or from visiting a town " +
    "(each visit records that town's wine). Visit the towns once, or open " +
    "the board, then press Load again — or just type the Wine/h values.",
} as const;

export const BUILD_DIALOG = {
  buildingList: "List Building",
  emptyTown: "-empty-",
  savedAsYouGo: "Changes are saved as you add or remove entries.",
} as const;

export const SCAN = {
  alreadyRunning: "A scan is already walking the towns.",
  noTownList: "No town list on this page — open a town view and try again.",
  queueRunning:
    "The task queue is running and also changes town.\n\n" +
    "Stop it first, then scan.",
  syncFinished: (
    synced: number,
    total: number,
    seconds: string,
    failed: string,
  ) =>
    `Sync finished: ${synced}/${total} towns in ${seconds}s` +
    (failed ? `, failed: ${failed}` : ""),
  walkFinished: (visited: number, total: number, failed: string) =>
    `Scan finished: ${visited}/${total} towns visited` +
    (failed ? `, failed: ${failed}` : ""),
} as const;

/** Tooltips of the quick-amount buttons on the game's shipment form. */
export const TRANSPORT_BUTTONS = {
  step: (adding: boolean, count: number, freighter: boolean) =>
    `${adding ? "Add" : "Remove"} ${count} ` +
    `${freighter ? "freighter" : "merchant ship"}${count === 1 ? "" : "s"}`,
  clear: "Clear",
} as const;

export const ACCOUNT_SUMMARY = {
  columns: ["Account", "Time Left", "Total Wood"],
  woodPerHour: "Wood Per h",
  woodPerWeek: "1 Week",
} as const;

export const SHIP_CAPACITY = {
  calibrated: (merchant: number | null, freighter: number | null) =>
    "Calibrated!\n" +
    (merchant ? `Merchant Ship: ${merchant}` : "") +
    (freighter ? `\nFreighter: ${freighter}` : ""),
  notReadable:
    "Could not read cargo capacity. Open the Trading Port or the Shipyard, then click again.",
} as const;

export const BUG_REPORT = {
  nothingToReport: "No bugs recorded. Nothing to report.",
  copied: (count: number, summary: string) =>
    `Copied a report of ${count} distinct issue(s) to the clipboard.\n\n` +
    summary,
  clipboardUnavailable:
    "Clipboard unavailable — the full report was printed to the console " +
    "(F12). You can also run ikaBugReport().",
  cleared: "Bug reports cleared.",
} as const;

export const DATA_TRANSFER = {
  /** How each kind of stored data is named to the player. */
  groupLabels: {
    config: "settings (wine lists, build queue, cargo calibration)",
    measurements: "measurements (town cache, account summary)",
    runtime: "in-flight work (task queue, running flags)",
    diagnostics: "logs and bug reports",
  },
  nothingToExport: "There is nothing to export yet.",
  saved: (
    count: number,
    description: string,
    moved: readonly string[],
    notMoved: string,
  ) =>
    `Saved ${count} entries.\n\n${description}\n\n` +
    `Moved: ${moved.join(" and ")}.\n\n` +
    `NOT moved: ${notMoved}. Two browsers running the same queue would ` +
    "both drive one game account and double-send.",
  otherAccount: (accounts: string, current: string) =>
    `This export holds data for a different account (${accounts}), ` +
    `but you are logged in as "${current}".\n\n` +
    `OK  = rewrite it onto "${current}"\n` +
    "Cancel = import only the account-independent entries",
  skippingOtherAccount:
    "Account-specific entries will be skipped. Nothing reads keys " +
    "belonging to another account.",
  confirmImport: (description: string) =>
    `Import this?\n\n${description}\n\n` +
    "Existing settings with the same names will be OVERWRITTEN.",
  imported: (imported: number, skipped: number, notes: string) =>
    `Imported ${imported} entries, skipped ${skipped}.\n\n` +
    "Reload the page for everything to take effect." +
    (notes ? `\n\n${notes}` : ""),
  failed: (reason: string) => `Import failed: ${reason}`,
} as const;

export const MISC = {
  noSafehouse: "No safehouse in this town!",
  popupUnavailable:
    "Could not open the settings dialog - the game's own popup API is not " +
    "available on this screen. Try again from the town view.",
} as const;
