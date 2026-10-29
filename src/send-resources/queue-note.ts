/**
 * A copy of the queue in the game's notepad, so that another computer logged
 * into the same account carries on with it.
 *
 * What is copied: shipments the player queued (not Auto Wine's, which every
 * run plans afresh) and the saved build list (`listAutoBuild`), not the lap
 * tasks queued from it. The notepad is the game's own (`view=avatarNotes`),
 * measured to hold 200 characters, so the copy is a compact text:
 *
 *   Q1<fingerprint 2><machine 2><minute 3>|<entry>;<entry>;...
 *
 *   - shipment: `<id 2><from 1><to 1><resource 1><amount>`
 *   - upgrade:  `@<town 1><slot 1><level>`
 *
 * every number in base 36, towns by their index in the town dropdown. The
 * fingerprint is a hash of the town list: a town founded or renamed shifts the
 * indexes, and a copy written for another list is not used.
 *
 * ── Conflicts ───────────────────────────────────────────────────────────────
 * Each computer keeps the BASE: the entries as last agreed with the notepad.
 * An entry in the base that one side no longer has was run or deleted there,
 * so it is deleted on the other side too; an entry missing from the base was
 * added on one side and is copied to the other (`mergeEntries`). That is how
 * a computer learns that the orders it still holds were run elsewhere.
 *
 * A shipment reloads the page the moment it is sent (`backToCity`), so a copy
 * written afterwards would die with the page. The handlers therefore CLAIM an
 * entry just before acting: the notepad is written as it will be once the
 * action is done, and an entry already gone from it is not acted on.
 *
 * ── Two computers at once ───────────────────────────────────────────────────
 * The header carries a lease: which computer runs the queue, and since when.
 * Another computer's lease younger than `LEASE_TTL_MINUTES` keeps this one's
 * runner idle.
 *
 * Plan: `docs/improvement-plan.md` §2.AE.
 */

import { errorMessage } from "@core/format";
import { readAvatarNotes, saveAvatarNotes } from "@core/ikariam/http";
import { logInfo } from "@core/logger";
import type { Task } from "@core/task-queue";
import { showToast } from "@core/ui/window";
import { QUEUE_NOTE } from "./messages";
import {
  getTownCount,
  getTownNameFromList,
  getTownNumberByName,
  townCityId,
} from "./navigation";
import {
  AUTO_WINE_LABEL,
  getState,
  KEY,
  loadAutoBuild,
  saveAutoBuild,
} from "./state";
import type { AutoBuildAccount, ResourceId } from "./types";

/* ─────────────────────────────── Format ────────────────────────────────── */

/** The notepad's limit, as the player measured it. */
export const NOTE_MAX_CHARS = 200;

/** Marks the notepad as this tool's queue, format version 1. */
const NOTE_TAG = "Q1";
const RADIX = 36;
const FINGERPRINT_WIDTH = 2;
const MACHINE_WIDTH = 2;
const MINUTE_WIDTH = 3;
const HEADER_LENGTH =
  NOTE_TAG.length + FINGERPRINT_WIDTH + MACHINE_WIDTH + MINUTE_WIDTH;
const HEADER_END = "|";
const ENTRY_SEPARATOR = ";";
const UPGRADE_MARK = "@";
const SHIPMENT_ID_WIDTH = 2;
/** The machine field of a header no computer holds a lease in. */
const NO_MACHINE = "00";
/** Lease minutes wrap at three base-36 digits, about 32 days. */
const MINUTE_WRAP = RADIX ** MINUTE_WIDTH;
const MS_PER_MINUTE = 60_000;
/** The largest level two base-36 digits hold. */
const MAX_LEVEL = RADIX ** 2 - 1;

/** Another computer's lease younger than this keeps the runner here idle. */
export const LEASE_TTL_MINUTES = 10;
/** Our own lease is written again once it is this old. */
export const LEASE_REFRESH_MINUTES = 3;

const RESOURCE_CODE: Record<ResourceId, string> = {
  wood: "w",
  wine: "v",
  marble: "m",
  glass: "g",
  sulfur: "s",
};

const RESOURCE_BY_CODE = new Map(
  Object.entries(RESOURCE_CODE).map(([id, code]) => [code, id as ResourceId]),
);

export interface NoteShipment {
  kind: "shipment";
  /** Two base-36 characters, shared by every computer (`noteId`). */
  id: string;
  /** Town dropdown indexes. */
  origin: number;
  destination: number;
  resource: ResourceId;
  amount: number;
}

export interface NoteUpgrade {
  kind: "upgrade";
  /** Town dropdown index. */
  town: number;
  /** The building slot, `N` of `#positionN`. */
  slot: number;
  /** The level this entry builds up to. */
  level: number;
}

export type NoteEntry = NoteShipment | NoteUpgrade;

export interface NoteLease {
  machine: string;
  /** Minute stamp, see `minuteStamp`. */
  minute: number;
}

export interface QueueNote {
  fingerprint: string;
  lease: NoteLease | null;
  entries: NoteEntry[];
}

export type ParsedNote =
  | { kind: "empty" }
  /** The player's own text, or a format this version cannot read. */
  | { kind: "foreign" }
  | { kind: "queue"; note: QueueNote };

const BASE36 = /^[0-9a-z]+$/;

function isIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < RADIX;
}

function padded(value: number, width: number): string {
  return value.toString(RADIX).padStart(width, "0");
}

/** A base-36 number, or `null` for anything else. */
function readNumber(text: string): number | null {
  return BASE36.test(text) ? parseInt(text, RADIX) : null;
}

/** Whether the notepad's format can carry this entry. */
export function isWritable(entry: NoteEntry): boolean {
  if (entry.kind === "upgrade") {
    return (
      isIndex(entry.town) &&
      isIndex(entry.slot) &&
      Number.isInteger(entry.level) &&
      entry.level >= 1 &&
      entry.level <= MAX_LEVEL
    );
  }
  return (
    entry.id.length === SHIPMENT_ID_WIDTH &&
    BASE36.test(entry.id) &&
    isIndex(entry.origin) &&
    isIndex(entry.destination) &&
    entry.origin !== entry.destination &&
    RESOURCE_CODE[entry.resource] !== undefined &&
    Number.isInteger(entry.amount) &&
    entry.amount > 0
  );
}

export function encodeEntry(entry: NoteEntry): string {
  if (entry.kind === "upgrade") {
    return (
      UPGRADE_MARK +
      entry.town.toString(RADIX) +
      entry.slot.toString(RADIX) +
      entry.level.toString(RADIX)
    );
  }
  return (
    entry.id +
    entry.origin.toString(RADIX) +
    entry.destination.toString(RADIX) +
    RESOURCE_CODE[entry.resource] +
    entry.amount.toString(RADIX)
  );
}

/** One entry, or `null` when the text is not one this format writes. */
export function parseEntry(text: string): NoteEntry | null {
  if (text.startsWith(UPGRADE_MARK)) {
    // Mark, town, slot, and a level of one or two digits.
    if (text.length < 4 || text.length > 5) return null;
    const town = readNumber(text[1]);
    const slot = readNumber(text[2]);
    const level = readNumber(text.slice(3));
    if (town === null || slot === null || level === null || level < 1) {
      return null;
    }
    return { kind: "upgrade", town, slot, level };
  }

  // Id, from, to, resource, and an amount of at least one digit.
  if (text.length < SHIPMENT_ID_WIDTH + 4) return null;
  const id = text.slice(0, SHIPMENT_ID_WIDTH);
  const origin = readNumber(text[2]);
  const destination = readNumber(text[3]);
  const resource = RESOURCE_BY_CODE.get(text[4]);
  const amount = readNumber(text.slice(5));
  if (
    !BASE36.test(id) ||
    origin === null ||
    destination === null ||
    resource === undefined ||
    amount === null ||
    amount <= 0
  ) {
    return null;
  }
  return { kind: "shipment", id, origin, destination, resource, amount };
}

/**
 * Read the notepad's text.
 *
 * Anything that is not wholly this format is `foreign`, one bad entry
 * included: dropping only the bad entry would read as "deleted elsewhere" and
 * delete it here too.
 */
export function parseNote(text: string): ParsedNote {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  if (
    !trimmed.startsWith(NOTE_TAG) ||
    trimmed.indexOf(HEADER_END) !== HEADER_LENGTH
  ) {
    return { kind: "foreign" };
  }

  let at = NOTE_TAG.length;
  const fingerprint = trimmed.slice(at, (at += FINGERPRINT_WIDTH));
  const machine = trimmed.slice(at, (at += MACHINE_WIDTH));
  const minute = readNumber(trimmed.slice(at, (at += MINUTE_WIDTH)));
  if (!BASE36.test(fingerprint) || !BASE36.test(machine) || minute === null) {
    return { kind: "foreign" };
  }

  const body = trimmed.slice(HEADER_LENGTH + HEADER_END.length);
  const entries: NoteEntry[] = [];
  if (body !== "") {
    for (const piece of body.split(ENTRY_SEPARATOR)) {
      const entry = parseEntry(piece);
      if (!entry) return { kind: "foreign" };
      entries.push(entry);
    }
  }

  return {
    kind: "queue",
    note: {
      fingerprint,
      lease: machine === NO_MACHINE ? null : { machine, minute },
      entries,
    },
  };
}

/**
 * The notepad's text for a queue, and the entries that fit in it.
 *
 * Entries go in order until the next one would not fit; it and every entry
 * after it are left out, so the copy is always a head of the queue.
 */
export function encodeNote(
  note: QueueNote,
  maxChars = NOTE_MAX_CHARS,
): { text: string; written: NoteEntry[] } {
  const lease = note.lease
    ? note.lease.machine + padded(note.lease.minute, MINUTE_WIDTH)
    : NO_MACHINE + padded(0, MINUTE_WIDTH);
  let text = NOTE_TAG + note.fingerprint + lease + HEADER_END;
  const written: NoteEntry[] = [];
  for (const entry of note.entries) {
    const piece =
      (written.length > 0 ? ENTRY_SEPARATOR : "") + encodeEntry(entry);
    if (text.length + piece.length > maxChars) break;
    text += piece;
    written.push(entry);
  }
  return { text, written };
}

/**
 * Two base-36 characters that change when the town list does.
 *
 * Indexes in the notepad only mean something against the list they were
 * written for; a town founded or renamed shifts them. One list in 1296 shares
 * another's fingerprint.
 */
export function townFingerprint(cityIds: readonly string[]): string {
  const modulus = RADIX ** FINGERPRINT_WIDTH;
  let hash = 0;
  for (const char of cityIds.join(",")) {
    hash = (hash * 31 + char.charCodeAt(0)) % modulus;
  }
  return padded(hash, FINGERPRINT_WIDTH);
}

/* ──────────────────────────────── Lease ────────────────────────────────── */

/** The minute a lease is written in, wrapped to three base-36 digits. */
export function minuteStamp(nowMs: number): number {
  return Math.floor(nowMs / MS_PER_MINUTE) % MINUTE_WRAP;
}

/** Minutes since the lease was written, across the wrap. */
export function leaseAgeMinutes(lease: NoteLease, nowMs: number): number {
  return (minuteStamp(nowMs) - lease.minute + MINUTE_WRAP) % MINUTE_WRAP;
}

/** Whether another computer runs this account's queue right now. */
export function leaseHeldByOther(
  lease: NoteLease | null,
  machine: string,
  nowMs: number,
): boolean {
  return (
    lease !== null &&
    lease.machine !== machine &&
    leaseAgeMinutes(lease, nowMs) < LEASE_TTL_MINUTES
  );
}

/**
 * The lease to write: ours when we want to run the queue and nobody else
 * holds it, renewed only once it is `LEASE_REFRESH_MINUTES` old so that not
 * every page load costs a write; otherwise the notepad's, untouched.
 */
export function nextLease(
  lease: NoteLease | null,
  machine: string,
  nowMs: number,
  wanted: boolean,
): NoteLease | null {
  if (!wanted || leaseHeldByOther(lease, machine, nowMs)) return lease;
  if (
    lease !== null &&
    lease.machine === machine &&
    leaseAgeMinutes(lease, nowMs) < LEASE_REFRESH_MINUTES
  ) {
    return lease;
  }
  return { machine, minute: minuteStamp(nowMs) };
}

/* ─────────────────────────────── Merging ───────────────────────────────── */

/** What identifies an entry on every computer. */
export function entryKey(entry: NoteEntry): string {
  return entry.kind === "shipment"
    ? `s:${entry.id}`
    : `u:${entry.town}.${entry.slot}.${entry.level}`;
}

function byKey(entries: readonly NoteEntry[]): Map<string, NoteEntry> {
  const map = new Map<string, NoteEntry>();
  for (const entry of entries) {
    const key = entryKey(entry);
    if (!map.has(key)) map.set(key, entry);
  }
  return map;
}

/**
 * A shipment's amount when both sides still hold it. Amounts only go down,
 * so the side that differs from the base has shipped part of it; when both
 * have, the smaller is left.
 */
function mergeAmount(
  base: NoteEntry | undefined,
  local: NoteEntry,
  remote: NoteEntry,
): NoteEntry {
  if (local.kind !== "shipment" || remote.kind !== "shipment") return local;
  const before = base?.kind === "shipment" ? base.amount : undefined;
  let amount: number;
  if (before === undefined) amount = Math.min(local.amount, remote.amount);
  else if (local.amount === before) amount = remote.amount;
  else if (remote.amount === before) amount = local.amount;
  else amount = Math.min(local.amount, remote.amount);
  return { ...local, amount };
}

export interface MergeResult {
  /** For the notepad: its own order, then what this computer added. */
  forNote: NoteEntry[];
  /** For this computer: its own order, then what the notepad added. */
  forLocal: NoteEntry[];
}

/**
 * Three-way merge of the base, this computer's queue and the notepad's.
 *
 * | base | local | notepad | result                                  |
 * | yes  | yes   | yes     | kept, amounts merged (`mergeAmount`)     |
 * | yes  | yes   | no      | run or deleted elsewhere: dropped here   |
 * | yes  | no    | yes     | run or deleted here: dropped from note   |
 * | no   | yes   | -       | added here: copied to the notepad        |
 * | no   | no    | yes     | added elsewhere: copied here             |
 */
export function mergeEntries(
  base: readonly NoteEntry[],
  local: readonly NoteEntry[],
  remote: readonly NoteEntry[],
): MergeResult {
  const baseByKey = byKey(base);
  const localByKey = byKey(local);
  const remoteByKey = byKey(remote);
  const kept = new Map<string, NoteEntry>();
  const forLocal: NoteEntry[] = [];

  for (const [key, entry] of localByKey) {
    const remoteEntry = remoteByKey.get(key);
    if (remoteEntry) {
      const merged = mergeAmount(baseByKey.get(key), entry, remoteEntry);
      kept.set(key, merged);
      forLocal.push(merged);
    } else if (!baseByKey.has(key)) {
      kept.set(key, entry);
      forLocal.push(entry);
    }
  }

  const forNote: NoteEntry[] = [];
  for (const [key, entry] of remoteByKey) {
    const merged = kept.get(key);
    if (merged) forNote.push(merged);
    else if (!baseByKey.has(key) && !localByKey.has(key)) {
      forNote.push(entry);
      forLocal.push(entry);
    }
  }
  for (const entry of forLocal) {
    if (!remoteByKey.has(entryKey(entry))) forNote.push(entry);
  }

  return { forNote, forLocal };
}

/* ───────────────────────── This computer's queue ───────────────────────── */

/** Mirrors `slotNumberOf` in `features/auto-build.ts`: `js_CityPosition8Link` -> 8. */
function slotOf(positionId: string): number | null {
  const match = positionId.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/** Mirrors `levelOf` in `features/auto-build.ts`: `"Warehouse 12"` -> 12. */
function levelOfLabel(label: string): number {
  return Number(label.split(" ").pop());
}

/** The slot's hoverable id, as saved upgrades store it. */
function positionIdOf(slot: number): string {
  return `js_CityPosition${slot}Link`;
}

type ShipmentTask = Extract<Task, { type: "sendResource" }>;

/** Whether the notepad carries this task: the player's shipments only. */
function isCopiedShipment(task: Task): task is ShipmentTask {
  return task.type === "sendResource" && task.data.label !== AUTO_WINE_LABEL;
}

function shipmentEntry(task: ShipmentTask): NoteShipment | null {
  if (!task.data.noteId) return null;
  const entry: NoteShipment = {
    kind: "shipment",
    id: task.data.noteId,
    origin: Number(task.data.origin),
    destination: Number(task.data.destination),
    resource: task.data.resource as ResourceId,
    amount: task.data.amount,
  };
  return isWritable(entry) ? entry : null;
}

interface SavedUpgradeRef {
  townName: string;
  positionId: string;
  buildingName: string;
}

/** This computer's queue as notepad entries, and where each one came from. */
interface LocalSnapshot {
  entries: NoteEntry[];
  taskIdByKey: Map<string, string>;
  upgradeByKey: Map<string, SavedUpgradeRef>;
}

function findAccount(
  list: AutoBuildAccount[],
  accountName: string,
): AutoBuildAccount | undefined {
  return list.find((entry) => entry.accountName === accountName);
}

/** Writes this module makes itself, which must not schedule another sync. */
let applying = false;

function randomTwoDigitId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = padded(
      Math.floor(Math.random() * RADIX ** SHIPMENT_ID_WIDTH),
      SHIPMENT_ID_WIDTH,
    );
    if (!taken.has(id)) return id;
  }
}

/**
 * Give an id to every copied shipment without one, and a new one to a
 * shipment whose id another computer gave to a different shipment meanwhile
 * (each picks ids on its own). The ids are saved on the tasks.
 */
function assignShipmentIds(
  base: readonly NoteEntry[],
  remote: readonly NoteEntry[],
): void {
  const { queue } = getState();
  const tasks = queue.list();
  const taken = new Set<string>();
  for (const entry of [...base, ...remote]) {
    if (entry.kind === "shipment") taken.add(entry.id);
  }
  const remoteById = new Map(
    remote.flatMap((entry) =>
      entry.kind === "shipment" ? [[entry.id, entry] as const] : [],
    ),
  );
  const baseIds = new Set(
    base.flatMap((entry) => (entry.kind === "shipment" ? [entry.id] : [])),
  );

  let changed = false;
  const used = new Set<string>();
  const next = tasks.map((task) => {
    if (!isCopiedShipment(task)) return task;
    const id = task.data.noteId;
    const other = id ? remoteById.get(id) : undefined;
    const clashes =
      id !== undefined &&
      other !== undefined &&
      !baseIds.has(id) &&
      (other.origin !== Number(task.data.origin) ||
        other.destination !== Number(task.data.destination) ||
        other.resource !== task.data.resource);
    if (id && !clashes && !used.has(id)) {
      used.add(id);
      return task;
    }
    const fresh = randomTwoDigitId(new Set([...taken, ...used]));
    used.add(fresh);
    changed = true;
    return { ...task, data: { ...task.data, noteId: fresh } };
  });
  if (!changed) return;
  applying = true;
  try {
    queue.replaceAll(next);
  } finally {
    applying = false;
  }
}

function takeLocalSnapshot(): LocalSnapshot {
  const { queue, accountName } = getState();
  const snapshot: LocalSnapshot = {
    entries: [],
    taskIdByKey: new Map(),
    upgradeByKey: new Map(),
  };

  for (const task of queue.list()) {
    if (!isCopiedShipment(task)) continue;
    const entry = shipmentEntry(task);
    if (!entry) continue;
    snapshot.entries.push(entry);
    snapshot.taskIdByKey.set(entryKey(entry), task.id);
  }

  const account = findAccount(loadAutoBuild(), accountName);
  for (const town of account?.townList ?? []) {
    const index = getTownNumberByName(town.townName);
    if (index === null) continue;
    for (const saved of town.queue) {
      const slot = slotOf(saved.positionId);
      if (slot === null) continue;
      const entry: NoteUpgrade = {
        kind: "upgrade",
        town: index,
        slot,
        level: levelOfLabel(saved.buildingName),
      };
      if (!isWritable(entry)) continue;
      const key = entryKey(entry);
      if (snapshot.upgradeByKey.has(key)) continue;
      snapshot.entries.push(entry);
      snapshot.upgradeByKey.set(key, {
        townName: town.townName,
        positionId: saved.positionId,
        buildingName: saved.buildingName,
      });
    }
  }
  return snapshot;
}

/**
 * Make this computer's queue match the merge.
 *
 * Only entries the snapshot holds are dropped or changed; tasks the notepad
 * does not carry (Auto Wine, an upgrade lap) and entries its format cannot
 * carry are left alone. `keepKey` is the entry a claim is about to act on:
 * left exactly as it is, since the action has not happened yet.
 */
function applyLocal(
  forLocal: readonly NoteEntry[],
  snapshot: LocalSnapshot,
  keepKey: string | null = null,
): void {
  const { queue, accountName } = getState();
  const wanted = byKey(forLocal);
  const isDropped = (key: string) => key !== keepKey && !wanted.has(key);

  // Saved upgrades first: the lap tasks queued from a dropped one go too.
  const droppedUpgrades = new Set<string>();
  for (const [key, ref] of snapshot.upgradeByKey) {
    if (isDropped(key)) {
      droppedUpgrades.add(
        `${ref.townName}|${ref.positionId}|${ref.buildingName}`,
      );
    }
  }
  const addedUpgrades = forLocal.filter(
    (entry): entry is NoteUpgrade =>
      entry.kind === "upgrade" && !snapshot.upgradeByKey.has(entryKey(entry)),
  );

  applying = true;
  try {
    if (droppedUpgrades.size > 0 || addedUpgrades.length > 0) {
      const list = loadAutoBuild();
      let account = findAccount(list, accountName);
      if (!account) {
        account = { accountName, townList: [] };
        list.push(account);
      }
      for (const town of account.townList) {
        town.queue = town.queue.filter(
          (saved) =>
            !droppedUpgrades.has(
              `${town.townName}|${saved.positionId}|${saved.buildingName}`,
            ),
        );
      }
      for (const entry of addedUpgrades) {
        const townName = getTownNameFromList(entry.town);
        if (!townName) continue;
        let town = account.townList.find((item) => item.townName === townName);
        if (!town) {
          town = { townName, queue: [] };
          account.townList.push(town);
        }
        town.queue.push({
          positionId: positionIdOf(entry.slot),
          buildingName: QUEUE_NOTE.placeholderBuilding(entry.slot, entry.level),
        });
      }
      saveAutoBuild(list);
    }

    const tasks = queue.list();
    const next: Task[] = [];
    for (const task of tasks) {
      if (task.type === "upgradeBuilding") {
        const { townName, positionId, buildingName } = task.data;
        if (!droppedUpgrades.has(`${townName}|${positionId}|${buildingName}`)) {
          next.push(task);
        }
        continue;
      }
      const entry = isCopiedShipment(task) ? shipmentEntry(task) : null;
      if (!entry) {
        next.push(task);
        continue;
      }
      const key = entryKey(entry);
      if (key === keepKey) {
        next.push(task);
        continue;
      }
      const merged = wanted.get(key);
      if (merged?.kind !== "shipment") continue;
      next.push(
        merged.amount === task.data.amount
          ? task
          : { ...task, data: { ...task.data, amount: merged.amount } },
      );
    }
    for (const entry of forLocal) {
      if (entry.kind !== "shipment") continue;
      if (snapshot.taskIdByKey.has(entryKey(entry))) continue;
      next.push({
        id: `sendResource-note-${entry.id}-${Date.now().toString(RADIX)}`,
        type: "sendResource",
        data: {
          origin: String(entry.origin),
          destination: String(entry.destination),
          resource: entry.resource,
          amount: entry.amount,
          noteId: entry.id,
        },
      });
    }
    if (JSON.stringify(next) !== JSON.stringify(tasks)) queue.replaceAll(next);
  } finally {
    applying = false;
  }
}

/* ──────────────────────────────── Storage ──────────────────────────────── */

/**
 * This computer's id in the lease. In `localStorage` with no account prefix
 * and left out of the data export on purpose: imported on another computer,
 * it would make the two the same computer.
 */
export const MACHINE_ID_KEY = "ikaQueueNoteMachine";

export function machineId(): string {
  try {
    const saved = localStorage.getItem(MACHINE_ID_KEY);
    if (saved && saved.length === MACHINE_WIDTH && BASE36.test(saved)) {
      if (saved !== NO_MACHINE) return saved;
    }
    const fresh = randomTwoDigitId(new Set([NO_MACHINE]));
    localStorage.setItem(MACHINE_ID_KEY, fresh);
    return fresh;
  } catch {
    return randomTwoDigitId(new Set([NO_MACHINE]));
  }
}

function loadBase(): NoteEntry[] {
  return getState().account.getJSON<NoteEntry[]>(KEY.queueNoteBase, []);
}

function saveBase(entries: readonly NoteEntry[]): void {
  getState().account.setJSON(KEY.queueNoteBase, entries);
}

/** The fingerprint of the town dropdown, or `null` when it is not readable. */
function localFingerprint(): string | null {
  const count = getTownCount();
  if (count === 0) return null;
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = townCityId(i);
    if (id === null) return null;
    ids.push(id);
  }
  return townFingerprint(ids);
}

/* ──────────────────────────────── Syncing ──────────────────────────────── */

export type SyncResult =
  | {
      status: "synced";
      /** Entries now in the notepad. */
      written: number;
      /** Entries that did not fit and stay on this computer only. */
      overflow: number;
      leaseHeldByOther: boolean;
    }
  /** The notepad holds other text, or a queue for another town list. */
  | { status: "foreign" }
  | { status: "failed"; reason: string };

export interface SyncOptions {
  /** Whether this computer wants to run the queue, and so the lease. */
  wantLease: boolean;
  /** Replace a foreign notepad with this computer's queue (Scan, confirmed). */
  takeOver?: boolean;
}

/** Whether another computer held the lease at the last look. */
let otherMachineRunning = false;
/** Whether the sync made on page load has finished, however it went. */
let firstSyncDone = false;

/**
 * Whether the runner may work: not before the page-load sync has merged in
 * what other computers did, and not while another computer holds the lease.
 */
export function queueNoteAllowsRunning(): boolean {
  return firstSyncDone && !otherMachineRunning;
}

/** One exchange with the notepad at a time, claims included. */
let inFlight: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = inFlight.then(work, work);
  inFlight = next.catch(() => undefined);
  return next;
}

/** The notepad's queue when this computer can use it, or `null`. */
function usableNote(parsed: ParsedNote, fingerprint: string): QueueNote | null {
  if (parsed.kind === "empty") {
    return { fingerprint, lease: null, entries: [] };
  }
  if (parsed.kind === "queue" && parsed.note.fingerprint === fingerprint) {
    return parsed.note;
  }
  return null;
}

/**
 * Read the notepad and the base for one exchange.
 *
 * An empty notepad resets the base: a notepad emptied by hand, or never
 * written, must not read as "every order was run elsewhere".
 */
async function readForExchange(
  takeOver: boolean,
): Promise<
  | { kind: "read"; text: string; note: QueueNote; base: NoteEntry[] }
  | { kind: "stopped"; result: SyncResult }
> {
  const fingerprint = localFingerprint();
  if (fingerprint === null) {
    return {
      kind: "stopped",
      result: { status: "failed", reason: "the town list is not readable" },
    };
  }
  let text: string;
  try {
    text = await readAvatarNotes();
  } catch (e) {
    return {
      kind: "stopped",
      result: { status: "failed", reason: errorMessage(e) },
    };
  }
  const parsed = parseNote(text);
  const usable = usableNote(parsed, fingerprint);
  if (usable) {
    const base = parsed.kind === "empty" ? [] : loadBase();
    return { kind: "read", text, note: usable, base };
  }
  if (!takeOver) return { kind: "stopped", result: { status: "foreign" } };
  return {
    kind: "read",
    text,
    note: { fingerprint, lease: null, entries: [] },
    base: [],
  };
}

/**
 * Write the merged copy when it differs, and remember what was agreed.
 * When the write fails, the base becomes what the notepad still says, so the
 * next exchange copies this computer's changes again.
 */
async function writeExchange(
  previousText: string,
  note: QueueNote,
): Promise<
  | { kind: "written"; written: NoteEntry[] }
  | { kind: "notWritten"; reason: string }
> {
  const { text, written } = encodeNote(note);
  if (text !== previousText) {
    try {
      await saveAvatarNotes(text);
    } catch (e) {
      return { kind: "notWritten", reason: errorMessage(e) };
    }
  }
  saveBase(written);
  return { kind: "written", written };
}

/** Read the notepad, merge it with this computer's queue, write it back. */
export function syncQueueNote(options: SyncOptions): Promise<SyncResult> {
  return oneAtATime(async () => {
    const read = await readForExchange(options.takeOver ?? false);
    if (read.kind === "stopped") return read.result;
    const { text, note, base } = read;

    assignShipmentIds(base, note.entries);
    const snapshot = takeLocalSnapshot();
    const { forNote, forLocal } = mergeEntries(
      base,
      snapshot.entries,
      note.entries,
    );
    applyLocal(forLocal, snapshot);

    const now = Date.now();
    const me = machineId();
    const lease = nextLease(note.lease, me, now, options.wantLease);
    otherMachineRunning = leaseHeldByOther(lease, me, now);

    const outcome = await writeExchange(text, {
      fingerprint: note.fingerprint,
      lease,
      entries: forNote,
    });
    if (outcome.kind === "notWritten") {
      saveBase(note.entries);
      return { status: "failed", reason: outcome.reason };
    }
    lastSyncedSignature = localSignature();
    return {
      status: "synced",
      written: outcome.written.length,
      overflow: forNote.length - outcome.written.length,
      leaseHeldByOther: otherMachineRunning,
    };
  });
}

/* ──────────────────────────────── Claims ───────────────────────────────── */

export type ClaimResult =
  /** Act: the notepad now says the action is done. */
  | { status: "go" }
  /** Already run or deleted on another computer; dropped here too. */
  | { status: "gone" }
  /** Another computer shipped part of it; this is what is left. */
  | { status: "changed"; amount: number }
  /** Another computer runs this account's queue. */
  | { status: "blocked" };

/**
 * Write the notepad as it will be once an action is done, just before doing
 * it. `after` is the entry once done, `null` when nothing is left of it.
 *
 * Anything that stops the exchange (no notepad, the player's own text in it)
 * answers `go`: the action goes ahead as it did before the notepad was used.
 */
function claim(
  findTarget: (snapshot: LocalSnapshot) => NoteEntry | null,
  after: (target: NoteEntry) => NoteEntry | null,
): Promise<ClaimResult> {
  return oneAtATime(async (): Promise<ClaimResult> => {
    const read = await readForExchange(false);
    if (read.kind === "stopped") {
      if (read.result.status === "failed") {
        logInfo(`Notepad not updated before acting: ${read.result.reason}`);
      }
      return { status: "go" };
    }
    const { text, note, base } = read;

    assignShipmentIds(base, note.entries);
    const snapshot = takeLocalSnapshot();
    const target = findTarget(snapshot);
    if (!target) return { status: "go" };
    const key = entryKey(target);

    const now = Date.now();
    const me = machineId();
    if (leaseHeldByOther(note.lease, me, now)) {
      otherMachineRunning = true;
      watchLease(true);
      return { status: "blocked" };
    }

    const baseEntry = byKey(base).get(key);
    const remoteEntry = byKey(note.entries).get(key);

    // Run or deleted elsewhere, or part of it shipped elsewhere: take the
    // notepad's word, write nothing about this action, do not act on it.
    const merged = mergeEntries(base, snapshot.entries, note.entries);
    const mergedTarget = byKey(merged.forLocal).get(key);
    const gone = baseEntry !== undefined && remoteEntry === undefined;
    const shrunk =
      target.kind === "shipment" &&
      mergedTarget?.kind === "shipment" &&
      mergedTarget.amount !== target.amount;
    if (gone || shrunk) {
      applyLocal(merged.forLocal, snapshot);
      const outcome = await writeExchange(text, {
        fingerprint: note.fingerprint,
        lease: nextLease(note.lease, me, now, true),
        entries: merged.forNote,
      });
      if (outcome.kind === "notWritten") saveBase(note.entries);
      if (gone) return { status: "gone" };
      return {
        status: "changed",
        amount: (mergedTarget as NoteShipment).amount,
      };
    }

    const done = after(target);
    const localAfter = snapshot.entries.flatMap((entry) =>
      entryKey(entry) !== key ? [entry] : done ? [done] : [],
    );
    const { forNote, forLocal } = mergeEntries(base, localAfter, note.entries);
    applyLocal(forLocal, snapshot, key);
    const outcome = await writeExchange(text, {
      fingerprint: note.fingerprint,
      lease: nextLease(note.lease, me, now, true),
      entries: forNote,
    });
    if (outcome.kind === "notWritten") {
      saveBase(note.entries);
      logInfo(`Notepad not updated before acting: ${outcome.reason}`);
    }
    return { status: "go" };
  });
}

/**
 * Claim a shipment of `sending` units from a queued order, before the
 * shipment form is opened.
 */
export function claimShipment(
  task: ShipmentTask,
  sending: number,
): Promise<ClaimResult> {
  if (!isCopiedShipment(task)) return Promise.resolve({ status: "go" });
  return claim(
    (snapshot) => {
      for (const [key, taskId] of snapshot.taskIdByKey) {
        if (taskId === task.id) {
          return snapshot.entries.find((entry) => entryKey(entry) === key)!;
        }
      }
      return null;
    },
    (target) => {
      if (target.kind !== "shipment") return null;
      const left = target.amount - sending;
      return left > 0 ? { ...target, amount: left } : null;
    },
  );
}

/** Claim a saved upgrade, before its Upgrade button is clicked. */
export function claimUpgrade(
  townName: string,
  positionId: string,
  buildingName: string,
): Promise<ClaimResult> {
  return claim(
    (snapshot) => {
      for (const [key, ref] of snapshot.upgradeByKey) {
        if (
          ref.townName === townName &&
          ref.positionId === positionId &&
          ref.buildingName === buildingName
        ) {
          return snapshot.entries.find((entry) => entryKey(entry) === key)!;
        }
      }
      return null;
    },
    () => null,
  );
}

/* ─────────────────────────── Page wiring ───────────────────────────────── */

/** Pause after a change before syncing, so a burst of edits is one write. */
export const CHANGE_SYNC_DELAY_MS = 2000;
/** How often to look again while another computer holds the lease. */
export const LEASE_RECHECK_MS = 2 * MS_PER_MINUTE;

let changeTimer: number | null = null;
let leaseRecheckTimer: number | null = null;
let wantsLease: () => boolean = () => false;
/** The local queue as of the last sync, to skip syncs that change nothing. */
let lastSyncedSignature: string | null = null;
/** Toasts already shown on this page, by kind. */
const toastsShown = new Set<string>();

/** Every copied entry and its amount; a task without a notepad id counts. */
function localSignature(): string {
  const { queue, accountName } = getState();
  const parts: string[] = [];
  for (const task of queue.list()) {
    if (!isCopiedShipment(task)) continue;
    const { noteId, origin, destination, resource, amount } = task.data;
    parts.push(
      `s:${noteId ?? "?"}:${origin}:${destination}:${resource}:${amount}`,
    );
  }
  for (const town of findAccount(loadAutoBuild(), accountName)?.townList ??
    []) {
    for (const saved of town.queue) {
      parts.push(
        `u:${town.townName}:${saved.positionId}:${saved.buildingName}`,
      );
    }
  }
  return parts.sort().join("\n");
}

function toastOnce(kind: string, message: string): void {
  if (toastsShown.has(kind)) return;
  toastsShown.add(kind);
  showToast(message);
}

/** Log a result, toasting what the player can act on when `toast` is set. */
function report(result: SyncResult, when: string, toast: boolean): void {
  switch (result.status) {
    case "synced":
      logInfo(
        `Notepad ${when}: ${result.written} entries in it` +
          (result.overflow > 0 ? `, ${result.overflow} did not fit` : "") +
          (result.leaseHeldByOther
            ? " - another computer runs the queue, waiting"
            : ""),
      );
      if (toast && result.overflow > 0) {
        toastOnce("overflow", QUEUE_NOTE.overflow(result.overflow));
      }
      break;
    case "foreign":
      logInfo(`Notepad ${when}: it holds other text, not synced`);
      if (toast) toastOnce("foreign", QUEUE_NOTE.foreign);
      break;
    case "failed":
      logInfo(`Notepad ${when} failed: ${result.reason}`);
      break;
  }
}

/**
 * Look again every `LEASE_RECHECK_MS` while another computer holds the
 * lease, and stop looking once it does not.
 */
function watchLease(blocked: boolean): void {
  if (blocked && leaseRecheckTimer === null) {
    leaseRecheckTimer = window.setInterval(() => {
      void syncQueueNote({ wantLease: wantsLease() }).then((next) => {
        report(next, "recheck", false);
        watchLease(leaseBlocks(next));
      });
    }, LEASE_RECHECK_MS);
  } else if (!blocked && leaseRecheckTimer !== null) {
    window.clearInterval(leaseRecheckTimer);
    leaseRecheckTimer = null;
  }
}

/** Whether a sync found another computer holding the lease. */
function leaseBlocks(result: SyncResult): boolean {
  return result.status === "synced" && result.leaseHeldByOther;
}

/**
 * The sync on page load, before the runner's first task. The runner waits
 * for it (`queueNoteAllowsRunning`) however it ends: a notepad that cannot be
 * read leaves the queue running as it did before the notepad was used.
 */
export async function startQueueNoteSync(
  wantLease: () => boolean,
): Promise<SyncResult> {
  wantsLease = wantLease;
  try {
    const result = await syncQueueNote({ wantLease: wantLease() });
    report(result, "on page load", false);
    watchLease(leaseBlocks(result));
    return result;
  } finally {
    firstSyncDone = true;
  }
}

/**
 * The runner was switched on: take the lease now rather than at the next
 * page load. Before the page-load sync is done, that sync takes it.
 */
export function queueRunnerStarted(): void {
  if (!firstSyncDone) return;
  void syncQueueNote({ wantLease: true }).then((result) => {
    report(result, "on Start", false);
    watchLease(leaseBlocks(result));
  });
}

/** Sync a little after the queue or the build list changed. */
export function queueChanged(): void {
  if (applying) return;
  if (changeTimer !== null) window.clearTimeout(changeTimer);
  changeTimer = window.setTimeout(() => {
    changeTimer = null;
    if (localSignature() === lastSyncedSignature) return;
    void syncQueueNote({ wantLease: wantsLease() }).then((result) => {
      report(result, "after a change", true);
      watchLease(leaseBlocks(result));
    });
  }, CHANGE_SYNC_DELAY_MS);
}

/**
 * Scan's part: sync, and offer to take over a notepad holding other text.
 * Every outcome is told.
 */
export async function syncQueueNoteFromScan(): Promise<SyncResult> {
  let result = await syncQueueNote({ wantLease: wantsLease() });
  if (result.status === "foreign" && confirm(QUEUE_NOTE.confirmTakeOver)) {
    result = await syncQueueNote({ wantLease: wantsLease(), takeOver: true });
  }
  report(result, "after Scan", false);
  watchLease(leaseBlocks(result));
  if (result.status === "synced") {
    showToast(
      QUEUE_NOTE.synced(result.written) +
        (result.overflow > 0
          ? `\n${QUEUE_NOTE.overflow(result.overflow)}`
          : ""),
    );
  } else if (result.status === "failed") {
    showToast(QUEUE_NOTE.failed(result.reason));
  }
  return result;
}

/** Forget this page's state. For tests. */
export function resetQueueNoteState(): void {
  if (changeTimer !== null) window.clearTimeout(changeTimer);
  if (leaseRecheckTimer !== null) window.clearInterval(leaseRecheckTimer);
  changeTimer = null;
  leaseRecheckTimer = null;
  otherMachineRunning = false;
  firstSyncDone = false;
  applying = false;
  wantsLease = () => false;
  lastSyncedSignature = null;
  toastsShown.clear();
  inFlight = Promise.resolve();
}
