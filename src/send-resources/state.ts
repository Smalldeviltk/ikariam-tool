/**
 * Global state for Send Resources.
 *
 * The original scattered variables across the `main()` scope (`listSender`,
 * `listReceiver`, `listAccount`, `listAutoBuild`, `resourcesJson`, ...) and
 * called `setVar(...)` from everywhere. Here each group of data has exactly one
 * read path and one write path.
 *
 * localStorage KEYS ARE UNCHANGED from the old script so existing users do not
 * lose their queues when they update.
 */

import { accountStore, globalStore, type Store } from "@core/storage";
import { TaskQueue } from "@core/task-queue";
import type { AccountSummary, AutoBuildAccount, WineReceiver } from "./types";

/* ─────────────────── localStorage keys (unchanged) ─────────────────────── */

const KEY = {
  /** Per account. Old code: `getVar("resource")`. */
  resource: "resource",
  listSender: "listSender",
  listReceiver: "listReceiver",
  /** Shared by all accounts. Old code: `getVar("listAccount", "[]", true)`. */
  listAccount: "listAccount",
  listAutoBuild: "listAutoBuild",
  /** Unified queue — NEW key, see `migrateLegacyQueues`. */
  globalTaskQueue: "ikaGlobalTaskQueue",
} as const;

/** Flat keys with no account prefix — the old code read/wrote `localStorage.x`. */
export const FLAG = {
  isAutoBuildStart: "isAutoBuildStart",
  isAutoReload: "isAutoReload",
  isSendResourceHidden: "isSendResourceHidden",
  reloadedMinute: "reloadedMinute",
  perShipCapacity: "ika_perShipCapacity",
  freighterCapacity: "ika_freighterCapacity",
} as const;

/** Label attached to Auto Wine shipments, used to group and clear them. */
export const AUTO_WINE_LABEL = "Auto Wine";

export function getFlag(key: string): string | null {
  return localStorage.getItem(key);
}

export function setFlag(key: string, value: string | boolean | number): void {
  localStorage.setItem(key, String(value));
}

export function isFlagTrue(key: string): boolean {
  return localStorage.getItem(key) === "true";
}

/* ────────────────────────────── Bootstrap ──────────────────────────────── */

export interface AppState {
  accountName: string;
  /** Account-scoped store. */
  account: Store;
  /** Store shared by every account on this server. */
  global: Store;
  /** Unified queue for shipments and building upgrades. */
  queue: TaskQueue;
}

let state: AppState | null = null;

export function initState(accountName: string): AppState {
  const account = accountStore(accountName);
  state = {
    accountName,
    account,
    global: globalStore,
    // Account-scoped: the shipment queue always was per account, and town
    // indices only mean anything within one account.
    queue: new TaskQueue(account, KEY.globalTaskQueue),
  };
  return state;
}

export function getState(): AppState {
  if (!state) throw new Error("State not initialised — call initState first");
  return state;
}

/* ────────────────────── Auto Wine: senders / receivers ─────────────────── */

export function loadSenders(): string[] {
  return getState().account.getJSON<string[]>(KEY.listSender, []);
}

export function saveSenders(list: string[]): void {
  getState().account.setJSON(KEY.listSender, list);
}

export function loadReceivers(): WineReceiver[] {
  return getState().account.getJSON<WineReceiver[]>(KEY.listReceiver, []);
}

export function saveReceivers(list: WineReceiver[]): void {
  getState().account.setJSON(KEY.listReceiver, list);
}

/* ───────────────────────── Multi-account summary ───────────────────────── */

export function loadAccounts(): AccountSummary[] {
  return getState().global.getJSON<AccountSummary[]>(KEY.listAccount, []);
}

export function saveAccounts(list: AccountSummary[]): void {
  getState().global.setJSON(KEY.listAccount, list);
}

/* ────────────────────────── Building upgrade config ────────────────────── */

export function loadAutoBuild(): AutoBuildAccount[] {
  return getState().global.getJSON<AutoBuildAccount[]>(KEY.listAutoBuild, []);
}

export function saveAutoBuild(list: AutoBuildAccount[]): void {
  getState().global.setJSON(KEY.listAutoBuild, list);
}

/* ─────────────────────────────── Migration ─────────────────────────────── */

/** Legacy shape of `getVar("resource")`. */
interface LegacyResourceJson {
  isStart?: boolean;
  queue?: Array<{
    resource: string;
    amount: number | string;
    destination: string;
    origin: string;
  }>;
}

/**
 * Move the old shipment queue into the unified queue.
 *
 * Runs once: afterwards the `queue` array in the legacy key is cleared but the
 * `isStart` flag is kept, since a user may roll back to the old JS build.
 * The building queue (`listAutoBuild`) is left alone — it stays the config
 * source for the UI and is only copied into the run queue on demand.
 */
export function migrateLegacyQueues(): number {
  const { account, queue } = getState();
  const legacy = account.getJSON<LegacyResourceJson>(KEY.resource, {});
  if (!legacy.queue || legacy.queue.length === 0) return 0;

  for (const item of legacy.queue) {
    queue.push({
      type: "sendResource",
      data: {
        origin: String(item.origin),
        destination: String(item.destination),
        resource: String(item.resource),
        amount: Number(item.amount),
      },
    });
  }
  const moved = legacy.queue.length;
  account.setJSON(KEY.resource, { isStart: legacy.isStart });
  return moved;
}

/** "Automation is on" flag — still stored inside the legacy `resource` key. */
export function isAutoStart(): boolean {
  return (
    getState().account.getJSON<LegacyResourceJson>(KEY.resource, {}).isStart ===
    true
  );
}

export function setAutoStart(value: boolean): void {
  const { account } = getState();
  const data = account.getJSON<LegacyResourceJson>(KEY.resource, {});
  data.isStart = value;
  account.setJSON(KEY.resource, data);
}
