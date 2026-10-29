import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@core/task-queue";
import {
  AUTO_WINE_LABEL,
  getState,
  initState,
  KEY,
  loadAutoBuild,
  saveAutoBuild,
  setQueueChangeListener,
} from "./state";
import {
  CHANGE_SYNC_DELAY_MS,
  claimShipment,
  claimUpgrade,
  encodeEntry,
  encodeNote,
  isWritable,
  LEASE_RECHECK_MS,
  LEASE_REFRESH_MINUTES,
  LEASE_TTL_MINUTES,
  leaseAgeMinutes,
  leaseHeldByOther,
  MACHINE_ID_KEY,
  machineId,
  mergeEntries,
  minuteStamp,
  nextLease,
  NOTE_MAX_CHARS,
  type NoteEntry,
  type NoteShipment,
  type NoteUpgrade,
  parseEntry,
  parseNote,
  queueChanged,
  queueNoteAllowsRunning,
  resetQueueNoteState,
  startQueueNoteSync,
  syncQueueNote,
  syncQueueNoteFromScan,
  townFingerprint,
} from "./queue-note";

vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
  logInfo: () => {},
}));

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@core/ui/window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/ui/window")>()),
  showToast,
}));

/**
 * The game's notepad, as the two requests see it: `readAvatarNotes` returns
 * `notepad.text`, `saveAvatarNotes` replaces it. Either can be made to fail.
 */
const notepad = vi.hoisted(() => ({
  text: "",
  readError: null as Error | null,
  saveError: null as Error | null,
  reads: 0,
  saves: [] as string[],
}));
vi.mock("@core/ikariam/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/ikariam/http")>()),
  readAvatarNotes: vi.fn(async () => {
    notepad.reads++;
    if (notepad.readError) throw notepad.readError;
    return notepad.text;
  }),
  saveAvatarNotes: vi.fn(async (text: string) => {
    if (notepad.saveError) throw notepad.saveError;
    notepad.saves.push(text);
    notepad.text = text;
  }),
}));

/** Town dropdown markup as in `navigation.test.ts`, no whitespace between items. */
function townDropdown(names: string[], firstId = 78038): string {
  const items = names
    .map(
      (n, i) =>
        `<li selectvalue="${firstId + i}" class="ownCity"><a title="${n}"> ${n}</a></li>`,
    )
    .join("");
  return `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>${items}</ul></div></div>`;
}

const TOWNS = ["T-Athens", "T-Sparta", "T-Corinth", "T-Argos"];
const TOWN_IDS = TOWNS.map((_, i) => String(78038 + i));
const FINGERPRINT = townFingerprint(TOWN_IDS);
/** Fixed for the lease tests: 2026-10-29 10:00 UTC. */
const NOW = new Date("2026-10-29T10:00:00Z").getTime();
const MINUTE = 60_000;

function shipment(
  id: string,
  amount = 1000,
  origin = 0,
  destination = 1,
  resource: NoteShipment["resource"] = "wood",
): NoteShipment {
  return { kind: "shipment", id, origin, destination, resource, amount };
}

function upgrade(town: number, slot: number, level: number): NoteUpgrade {
  return { kind: "upgrade", town, slot, level };
}

/** The notepad text another computer would have written. */
function noteText(
  entries: NoteEntry[],
  lease: { machine: string; minute: number } | null = null,
  fingerprint = FINGERPRINT,
): string {
  return encodeNote({ fingerprint, lease, entries }).text;
}

type ShipmentTask = Extract<Task, { type: "sendResource" }>;

function queueShipment(data: Partial<ShipmentTask["data"]> = {}): ShipmentTask {
  return getState().queue.push({
    type: "sendResource",
    data: {
      origin: "0",
      destination: "1",
      resource: "wood",
      amount: 1000,
      ...data,
    },
  }) as ShipmentTask;
}

function shipmentTasks() {
  return getState().queue.listOfType("sendResource");
}

function savedUpgrades(): Record<string, string[]> {
  const account = loadAutoBuild().find((a) => a.accountName === "tester");
  const result: Record<string, string[]> = {};
  for (const town of account?.townList ?? []) {
    result[town.townName] = town.queue.map(
      (entry) => `${entry.positionId}|${entry.buildingName}`,
    );
  }
  return result;
}

function saveUpgrades(towns: Record<string, Array<[string, string]>>): void {
  saveAutoBuild([
    {
      accountName: "tester",
      townList: Object.entries(towns).map(([townName, entries]) => ({
        townName,
        queue: entries.map(([positionId, buildingName]) => ({
          positionId,
          buildingName,
        })),
      })),
    },
  ]);
}

function lastToast(): unknown {
  return showToast.mock.calls[showToast.mock.calls.length - 1][0];
}

/** The entries now in the notepad. */
function noteEntries(): NoteEntry[] {
  const parsed = parseNote(notepad.text);
  if (parsed.kind !== "queue") throw new Error(`notepad is ${parsed.kind}`);
  return parsed.note.entries;
}

function base(): NoteEntry[] {
  return getState().account.getJSON<NoteEntry[]>(KEY.queueNoteBase, []);
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  localStorage.clear();
  document.body.innerHTML = townDropdown(TOWNS);
  initState("tester");
  setQueueChangeListener(null);
  resetQueueNoteState();
  notepad.text = "";
  notepad.readError = null;
  notepad.saveError = null;
  notepad.reads = 0;
  notepad.saves = [];
  showToast.mockClear();
});

afterEach(() => {
  setQueueChangeListener(null);
  vi.useRealTimers();
});

/* ─────────────────────────────── Format ────────────────────────────────── */

describe("the notepad's format", () => {
  it("writes a shipment as id, from, to, resource and amount in base 36", () => {
    expect(encodeEntry(shipment("k7", 12000, 3, 5, "wood"))).toBe("k735w99c");
  });

  it("writes an upgrade as a mark, town, slot and level in base 36", () => {
    expect(encodeEntry(upgrade(3, 8, 21))).toBe("@38l");
  });

  it("gives each resource its own letter", () => {
    const letters = (
      ["wood", "wine", "marble", "glass", "sulfur"] as const
    ).map((resource) => encodeEntry(shipment("aa", 1, 0, 1, resource))[4]);
    expect(letters).toEqual(["w", "v", "m", "g", "s"]);
  });

  it("reads back every entry it writes, at the edges of base 36", () => {
    const entries: NoteEntry[] = [
      shipment("00", 1, 0, 35, "wine"),
      shipment("zz", 1_000_000, 35, 0, "sulfur"),
      shipment("a9", 46655, 7, 9, "marble"),
      shipment("q1", 500, 2, 4, "glass"),
      upgrade(0, 0, 1),
      upgrade(35, 35, 1295),
      upgrade(9, 17, 36),
    ];
    for (const entry of entries) {
      expect(parseEntry(encodeEntry(entry))).toEqual(entry);
    }
  });

  it("refuses text it would never write", () => {
    for (const text of [
      "",
      "k7",
      "k735",
      "k735w",
      "k735x99c", // unknown resource letter
      "k735w0", // nothing to send
      "K735w99c", // capitals are not base 36 here
      "k7 5w99c",
      "@38",
      "@380", // level 0
      "@38zzz", // level of three digits
      "@3-l",
    ]) {
      expect(parseEntry(text), text).toBeNull();
    }
  });

  it("only writes what its fields can carry", () => {
    expect(isWritable(shipment("k7"))).toBe(true);
    expect(isWritable(shipment("k7", 1000, 36, 1))).toBe(false);
    expect(isWritable(shipment("k7", 1000, 2, 2))).toBe(false);
    expect(isWritable(shipment("k7", 10.5))).toBe(false);
    expect(isWritable(shipment("k7", 0))).toBe(false);
    expect(isWritable(shipment("K7"))).toBe(false);
    expect(isWritable(shipment("k"))).toBe(false);
    expect(isWritable(upgrade(0, 36, 1))).toBe(false);
    expect(isWritable(upgrade(0, 1, 0))).toBe(false);
    expect(isWritable(upgrade(0, 1, 1296))).toBe(false);
    expect(isWritable(upgrade(0, 1, Number.NaN))).toBe(false);
  });

  it("starts with the tag, fingerprint and lease, then the entries", () => {
    const { text } = encodeNote({
      fingerprint: "a1",
      lease: { machine: "m4", minute: 37 },
      entries: [shipment("k7", 12000, 3, 5), upgrade(3, 8, 21)],
    });
    expect(text).toBe("Q1a1m4011|k735w99c;@38l");
  });

  it("writes no lease as machine 00", () => {
    const { text } = encodeNote({
      fingerprint: "a1",
      lease: null,
      entries: [],
    });
    expect(text).toBe("Q1a100000|");
  });

  it("reads back a whole notepad", () => {
    const note = {
      fingerprint: "a1",
      lease: { machine: "m4", minute: 46655 },
      entries: [shipment("k7", 12000, 3, 5), upgrade(3, 8, 21)],
    };
    expect(parseNote(encodeNote(note).text)).toEqual({ kind: "queue", note });
    expect(parseNote(" Q1a100000|\n")).toEqual({
      kind: "queue",
      note: { fingerprint: "a1", lease: null, entries: [] },
    });
  });

  it("calls an empty notepad empty, and anything else not its own foreign", () => {
    expect(parseNote("")).toEqual({ kind: "empty" });
    expect(parseNote("  \n")).toEqual({ kind: "empty" });
    for (const text of [
      "buy wine for Sparta",
      "Q2a100000|", // another version
      "Q1a10000|", // header one character short
      "Q1A100000|", // fingerprint not base 36
      "Q1a100000|k735w99c;oops", // one bad entry spoils it all
      "Q1a100000|k735w99c;", // empty entry
    ]) {
      expect(parseNote(text).kind, text).toBe("foreign");
    }
  });

  it("stops at the first entry that does not fit, and keeps the order", () => {
    const entries = Array.from({ length: 30 }, (_, i) =>
      shipment(i.toString(36).padStart(2, "0"), 12000, 0, 1),
    );
    const { text, written } = encodeNote(
      { fingerprint: "a1", lease: null, entries },
      NOTE_MAX_CHARS,
    );
    expect(text.length).toBeLessThanOrEqual(NOTE_MAX_CHARS);
    // 10 for the header, 8 for the first entry, 9 with a separator after it.
    expect(written).toHaveLength(Math.floor((NOTE_MAX_CHARS - 10 + 1) / 9));
    expect(written).toEqual(entries.slice(0, written.length));
  });

  it("fills the notepad to exactly its limit", () => {
    // 10 header + 8 + 9 * 20 = 198; two short upgrades after that fit 200 only once.
    const entries: NoteEntry[] = Array.from({ length: 21 }, (_, i) =>
      shipment(i.toString(36).padStart(2, "0"), 12000, 0, 1),
    );
    entries.push(upgrade(1, 2, 3));
    const { text, written } = encodeNote({
      fingerprint: "a1",
      lease: null,
      entries,
    });
    expect(text.length).toBe(198);
    expect(written).toHaveLength(21);
    const roomy = encodeNote(
      { fingerprint: "a1", lease: null, entries: [upgrade(1, 2, 3)] },
      14,
    );
    expect(roomy.text.length).toBe(14);
    expect(roomy.written).toHaveLength(1);
  });

  it("fingerprints the town list by its ids and their order", () => {
    const print = townFingerprint(["78038", "78039", "78040"]);
    expect(print).toMatch(/^[0-9a-z]{2}$/);
    expect(townFingerprint(["78038", "78039", "78040"])).toBe(print);
    expect(townFingerprint(["78039", "78038", "78040"])).not.toBe(print);
    expect(townFingerprint(["78038", "78039", "78041"])).not.toBe(print);
    expect(townFingerprint(["78038", "78039", "78040", "78041"])).not.toBe(
      print,
    );
  });
});

/* ──────────────────────────────── Lease ────────────────────────────────── */

describe("the lease", () => {
  const now = minuteStamp(NOW);

  it("is nobody's when absent or our own", () => {
    expect(leaseHeldByOther(null, "m1", NOW)).toBe(false);
    expect(leaseHeldByOther({ machine: "m1", minute: now }, "m1", NOW)).toBe(
      false,
    );
  });

  it("is another computer's until it is ten minutes old", () => {
    const at = (age: number) => ({ machine: "m2", minute: now - age });
    expect(leaseHeldByOther(at(0), "m1", NOW)).toBe(true);
    expect(leaseHeldByOther(at(LEASE_TTL_MINUTES - 1), "m1", NOW)).toBe(true);
    expect(leaseHeldByOther(at(LEASE_TTL_MINUTES), "m1", NOW)).toBe(false);
  });

  it("counts its age across the wrap of the minute stamp", () => {
    const wrap = 36 ** 3;
    const justBeforeWrap =
      Math.ceil(NOW / MINUTE / wrap) * wrap * MINUTE - MINUTE;
    const lease = { machine: "m2", minute: minuteStamp(justBeforeWrap) };
    expect(lease.minute).toBe(wrap - 1);
    expect(minuteStamp(justBeforeWrap + 3 * MINUTE)).toBe(2);
    expect(leaseAgeMinutes(lease, justBeforeWrap + 3 * MINUTE)).toBe(3);
  });

  it("is left alone when this computer does not want to run", () => {
    const theirs = { machine: "m2", minute: now - 30 };
    expect(nextLease(theirs, "m1", NOW, false)).toBe(theirs);
    expect(nextLease(null, "m1", NOW, false)).toBeNull();
  });

  it("is taken when free, expired, or our own and old", () => {
    const mine = { machine: "m1", minute: now };
    expect(nextLease(null, "m1", NOW, true)).toEqual(mine);
    expect(
      nextLease(
        { machine: "m2", minute: now - LEASE_TTL_MINUTES },
        "m1",
        NOW,
        true,
      ),
    ).toEqual(mine);
    expect(
      nextLease(
        { machine: "m1", minute: now - LEASE_REFRESH_MINUTES },
        "m1",
        NOW,
        true,
      ),
    ).toEqual(mine);
  });

  it("is not written again while our own is young, nor taken from another", () => {
    const young = { machine: "m1", minute: now - (LEASE_REFRESH_MINUTES - 1) };
    expect(nextLease(young, "m1", NOW, true)).toBe(young);
    const theirs = { machine: "m2", minute: now - 1 };
    expect(nextLease(theirs, "m1", NOW, true)).toBe(theirs);
  });

  it("names this computer with two characters, never 00, the same every time", () => {
    const id = machineId();
    expect(id).toMatch(/^[0-9a-z]{2}$/);
    expect(id).not.toBe("00");
    expect(machineId()).toBe(id);
    expect(localStorage.getItem(MACHINE_ID_KEY)).toBe(id);

    localStorage.setItem(MACHINE_ID_KEY, "00");
    expect(machineId()).not.toBe("00");
  });
});

/* ─────────────────────────────── Merging ───────────────────────────────── */

describe("the three-way merge", () => {
  const a = shipment("aa");
  const b = upgrade(1, 2, 3);

  it("keeps what all three hold", () => {
    const result = mergeEntries([a, b], [a, b], [a, b]);
    expect(result.forLocal).toEqual([a, b]);
    expect(result.forNote).toEqual([a, b]);
  });

  it("drops here what was run or deleted on another computer", () => {
    const result = mergeEntries([a, b], [a, b], [b]);
    expect(result.forLocal).toEqual([b]);
    expect(result.forNote).toEqual([b]);
  });

  it("drops from the notepad what was run or deleted here", () => {
    const result = mergeEntries([a, b], [b], [a, b]);
    expect(result.forLocal).toEqual([b]);
    expect(result.forNote).toEqual([b]);
  });

  it("copies to the notepad what was added here, after the notepad's own", () => {
    const result = mergeEntries([b], [a, b], [b]);
    expect(result.forNote).toEqual([b, a]);
    expect(result.forLocal).toEqual([a, b]);
  });

  it("copies here what was added on another computer, after this one's own", () => {
    const result = mergeEntries([b], [b], [a, b]);
    expect(result.forLocal).toEqual([b, a]);
    expect(result.forNote).toEqual([a, b]);
  });

  it("takes the side that shipped part of an order", () => {
    const at = (amount: number) => shipment("aa", amount);
    expect(mergeEntries([at(900)], [at(900)], [at(400)]).forLocal).toEqual([
      at(400),
    ]);
    expect(mergeEntries([at(900)], [at(300)], [at(900)]).forNote).toEqual([
      at(300),
    ]);
  });

  it("takes the smaller when both sides shipped, or there is no base", () => {
    const at = (amount: number) => shipment("aa", amount);
    expect(mergeEntries([at(900)], [at(700)], [at(500)]).forLocal).toEqual([
      at(500),
    ]);
    expect(mergeEntries([], [at(700)], [at(500)]).forNote).toEqual([at(500)]);
  });

  it("reads each upgrade level as its own entry", () => {
    const level4 = upgrade(1, 2, 4);
    const result = mergeEntries([b], [b, level4], [b]);
    expect(result.forNote).toEqual([b, level4]);
  });

  it("settles the player's case: added on one, part run on the other", () => {
    const [x, y, z] = [shipment("xa"), shipment("yb"), shipment("zc")];
    // Computer 1 adds three; the notepad is empty.
    const one = mergeEntries([], [x, y, z], []);
    expect(one.forNote).toEqual([x, y, z]);
    const baseOne = one.forNote;
    // Computer 2 has nothing yet and picks them up.
    const two = mergeEntries([], [], one.forNote);
    expect(two.forLocal).toEqual([x, y, z]);
    // Computer 2 runs x and y.
    const twoAfter = mergeEntries(two.forNote, [z], two.forNote);
    expect(twoAfter.forNote).toEqual([z]);
    // Computer 1 still holds all three.
    const oneBack = mergeEntries(baseOne, [x, y, z], twoAfter.forNote);
    expect(oneBack.forLocal).toEqual([z]);
    expect(oneBack.forNote).toEqual([z]);
  });
});

/* ──────────────────────────────── Syncing ──────────────────────────────── */

describe("syncing with the notepad", () => {
  it("copies the player's shipments and saved upgrades into an empty notepad", async () => {
    queueShipment({
      origin: "0",
      destination: "2",
      resource: "marble",
      amount: 500,
    });
    queueShipment({ resource: "wine", amount: 800, label: AUTO_WINE_LABEL });
    saveUpgrades({ "T-Sparta": [["js_CityPosition8Link", "Warehouse 21"]] });

    const result = await syncQueueNote({ wantLease: false });

    expect(result).toEqual({
      status: "synced",
      written: 2,
      overflow: 0,
      leaseHeldByOther: false,
    });
    const [player, autoWine] = shipmentTasks();
    expect(player.data.noteId).toMatch(/^[0-9a-z]{2}$/);
    expect(autoWine.data.noteId).toBeUndefined();
    expect(noteEntries()).toEqual([
      shipment(player.data.noteId!, 500, 0, 2, "marble"),
      upgrade(1, 8, 21),
    ]);
    expect(base()).toEqual(noteEntries());
  });

  it("writes nothing when nothing changed", async () => {
    queueShipment();
    await syncQueueNote({ wantLease: false });
    expect(notepad.saves).toHaveLength(1);

    await syncQueueNote({ wantLease: false });
    expect(notepad.saves).toHaveLength(1);
  });

  it("brings in shipments and upgrades added on another computer", async () => {
    notepad.text = noteText([
      shipment("k7", 12000, 3, 1, "glass"),
      upgrade(2, 5, 7),
    ]);

    await syncQueueNote({ wantLease: false });

    expect(shipmentTasks().map((task) => task.data)).toEqual([
      {
        origin: "3",
        destination: "1",
        resource: "glass",
        amount: 12000,
        noteId: "k7",
      },
    ]);
    expect(savedUpgrades()).toEqual({
      "T-Corinth": ["js_CityPosition5Link|Position 5 7"],
    });
  });

  it("settles the player's case end to end: computer 1 forgets what computer 2 ran", async () => {
    // Computer 1 queues three shipments and syncs.
    const tasks = [
      queueShipment({ destination: "1" }),
      queueShipment({ destination: "2" }),
      queueShipment({ destination: "3" }),
    ];
    await syncQueueNote({ wantLease: false });
    const computerOne = { ...localStorage };

    // Computer 2: the same account, nothing stored yet.
    localStorage.clear();
    initState("tester");
    await syncQueueNote({ wantLease: false });
    expect(shipmentTasks()).toHaveLength(3);
    // It runs the first two.
    const [first, second] = shipmentTasks();
    getState().queue.removeById(first.id);
    getState().queue.removeById(second.id);
    await syncQueueNote({ wantLease: false });
    expect(noteEntries()).toHaveLength(1);

    // Back on computer 1, with all three still queued.
    localStorage.clear();
    for (const [key, value] of Object.entries(computerOne)) {
      localStorage.setItem(key, value);
    }
    initState("tester");
    expect(shipmentTasks()).toHaveLength(3);
    await syncQueueNote({ wantLease: false });

    expect(shipmentTasks().map((task) => task.id)).toEqual([tasks[2].id]);
    expect(noteEntries()).toHaveLength(1);
  });

  it("takes a part shipped elsewhere off the amount here", async () => {
    const task = queueShipment({ amount: 9000 });
    await syncQueueNote({ wantLease: false });
    const id = shipmentTasks()[0].data.noteId!;
    notepad.text = noteText([shipment(id, 4000)]);

    await syncQueueNote({ wantLease: false });

    expect(shipmentTasks()).toHaveLength(1);
    expect(shipmentTasks()[0].id).toBe(task.id);
    expect(shipmentTasks()[0].data.amount).toBe(4000);
  });

  it("drops an upgrade run elsewhere, and the lap task queued from it", async () => {
    saveUpgrades({
      "T-Sparta": [
        ["js_CityPosition8Link", "Warehouse 21"],
        ["js_CityPosition8Link", "Warehouse 22"],
      ],
    });
    getState().queue.push({
      type: "upgradeBuilding",
      data: {
        townName: "T-Sparta",
        positionId: "js_CityPosition8Link",
        buildingName: "Warehouse 21",
      },
    });
    await syncQueueNote({ wantLease: false });
    notepad.text = noteText([upgrade(1, 8, 22)]);

    await syncQueueNote({ wantLease: false });

    expect(savedUpgrades()).toEqual({
      "T-Sparta": ["js_CityPosition8Link|Warehouse 22"],
    });
    expect(getState().queue.listOfType("upgradeBuilding")).toEqual([]);
  });

  it("leaves tasks the notepad does not carry alone", async () => {
    queueShipment({ resource: "wine", label: AUTO_WINE_LABEL });
    queueShipment({ origin: "40" }); // no index in base 36's single digit
    notepad.text = noteText([]);
    getState().account.setJSON(KEY.queueNoteBase, [shipment("zz")]);

    await syncQueueNote({ wantLease: false });

    expect(shipmentTasks()).toHaveLength(2);
    expect(noteEntries()).toEqual([]);
  });

  it("changes nothing when the notepad cannot be read", async () => {
    queueShipment();
    getState().account.setJSON(KEY.queueNoteBase, [shipment("zz")]);
    notepad.readError = new Error("timed out");

    const result = await syncQueueNote({ wantLease: true });

    expect(result).toEqual({ status: "failed", reason: "timed out" });
    expect(shipmentTasks()).toHaveLength(1);
    expect(notepad.saves).toEqual([]);
    expect(base()).toEqual([shipment("zz")]);
  });

  it("does nothing without a readable town list", async () => {
    document.body.innerHTML = "";
    queueShipment();

    const result = await syncQueueNote({ wantLease: false });

    expect(result.status).toBe("failed");
    expect(notepad.reads).toBe(0);
  });

  it("leaves a notepad holding the player's own text alone", async () => {
    queueShipment();
    notepad.text = "buy wine for Sparta";

    const result = await syncQueueNote({ wantLease: true });

    expect(result).toEqual({ status: "foreign" });
    expect(notepad.saves).toEqual([]);
    expect(shipmentTasks()[0].data.noteId).toBeUndefined();
  });

  it("does not use a queue written for another town list", async () => {
    queueShipment();
    notepad.text = noteText([shipment("k7")], null, "zz");
    expect(FINGERPRINT).not.toBe("zz");

    const result = await syncQueueNote({ wantLease: false });

    expect(result).toEqual({ status: "foreign" });
    expect(shipmentTasks()).toHaveLength(1);
    expect(notepad.saves).toEqual([]);
  });

  it("sees the town list change when a town is founded", async () => {
    await syncQueueNote({ wantLease: false });
    document.body.innerHTML = townDropdown([...TOWNS, "T-Delphi"]);

    expect((await syncQueueNote({ wantLease: false })).status).toBe("foreign");
  });

  it("replaces another text with this computer's queue when told to take over", async () => {
    queueShipment({ amount: 700 });
    notepad.text = "buy wine for Sparta";

    const result = await syncQueueNote({ wantLease: false, takeOver: true });

    expect(result.status).toBe("synced");
    expect(noteEntries()).toEqual([
      shipment(shipmentTasks()[0].data.noteId!, 700),
    ]);
  });

  it("takes an emptied notepad as a fresh start, not as every order run", async () => {
    queueShipment();
    await syncQueueNote({ wantLease: false });
    notepad.text = "";

    await syncQueueNote({ wantLease: false });

    expect(shipmentTasks()).toHaveLength(1);
    expect(noteEntries()).toHaveLength(1);
  });

  it("copies its changes again after a write that failed", async () => {
    notepad.text = noteText([shipment("k7")]);
    await syncQueueNote({ wantLease: false });
    queueShipment({ destination: "3" });
    notepad.saveError = new Error("HTTP 500");

    const failed = await syncQueueNote({ wantLease: false });

    expect(failed).toEqual({ status: "failed", reason: "HTTP 500" });
    expect(base()).toEqual([shipment("k7")]);

    notepad.saveError = null;
    await syncQueueNote({ wantLease: false });
    expect(noteEntries()).toHaveLength(2);
  });

  it("after a write that failed, still drops what the other computer then ran", async () => {
    notepad.text = noteText([shipment("k7")]);
    await syncQueueNote({ wantLease: false });
    // Another computer adds m2; this one adds a shipment and cannot write.
    notepad.text = noteText([shipment("k7"), shipment("m2", 500, 2, 3)]);
    queueShipment({ destination: "3" });
    notepad.saveError = new Error("HTTP 500");
    await syncQueueNote({ wantLease: false });
    expect(shipmentTasks().map((task) => task.data.noteId)).toContain("m2");

    // The other computer runs m2.
    notepad.saveError = null;
    notepad.text = noteText([shipment("k7")]);
    await syncQueueNote({ wantLease: false });

    expect(shipmentTasks().map((task) => task.data.noteId)).not.toContain("m2");
    expect(
      noteEntries().map((entry) => (entry as NoteShipment).id),
    ).not.toContain("m2");
  });

  it("keeps on this computer what does not fit, and writes it once there is room", async () => {
    for (let i = 0; i < 25; i++) queueShipment({ amount: 12000 });

    const result = await syncQueueNote({ wantLease: false });

    expect(result.status === "synced" && result.overflow).toBe(4);
    expect(noteEntries()).toHaveLength(21);
    expect(shipmentTasks()).toHaveLength(25);
    expect(base()).toHaveLength(21);

    const [first, second, third, fourth] = shipmentTasks();
    for (const task of [first, second, third, fourth]) {
      getState().queue.removeById(task.id);
    }
    await syncQueueNote({ wantLease: false });
    expect(noteEntries()).toHaveLength(21);
    expect(noteEntries().map((entry) => (entry as NoteShipment).id)).toEqual(
      shipmentTasks().map((task) => task.data.noteId),
    );
  });

  it("gives a new id to a shipment whose id another computer gave to another", async () => {
    queueShipment({ destination: "2", noteId: "k7" });
    notepad.text = noteText([shipment("k7", 1000, 0, 3)]);

    await syncQueueNote({ wantLease: false });

    const ids = shipmentTasks().map((task) => task.data.noteId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain("k7");
    expect(noteEntries()).toHaveLength(2);
  });

  it("takes the lease when it wants to run and nobody holds it", async () => {
    const result = await syncQueueNote({ wantLease: true });

    expect(result.status === "synced" && result.leaseHeldByOther).toBe(false);
    const parsed = parseNote(notepad.text);
    expect(parsed.kind === "queue" && parsed.note.lease).toEqual({
      machine: machineId(),
      minute: minuteStamp(NOW),
    });
  });

  it("does not take another computer's fresh lease, and says so", async () => {
    const theirs = { machine: "zz", minute: minuteStamp(NOW) - 2 };
    notepad.text = noteText([], theirs);

    const result = await syncQueueNote({ wantLease: true });

    expect(result.status === "synced" && result.leaseHeldByOther).toBe(true);
    const parsed = parseNote(notepad.text);
    expect(parsed.kind === "queue" && parsed.note.lease).toEqual(theirs);
  });
});

/* ──────────────────────────────── Claims ───────────────────────────────── */

describe("claiming before acting", () => {
  async function syncedShipment(amount = 9000): Promise<ShipmentTask> {
    queueShipment({ amount });
    await syncQueueNote({ wantLease: true });
    return shipmentTasks()[0];
  }

  it("writes what is left of a shipment before it is sent, and changes nothing here", async () => {
    const task = await syncedShipment(9000);

    const result = await claimShipment(task, 2500);

    expect(result).toEqual({ status: "go" });
    expect(noteEntries()).toEqual([shipment(task.data.noteId!, 6500)]);
    expect(shipmentTasks()[0].data.amount).toBe(9000);
  });

  it("takes a shipment that will be sent whole off the notepad, and keeps it here", async () => {
    const task = await syncedShipment(2000);

    expect(await claimShipment(task, 2000)).toEqual({ status: "go" });

    expect(noteEntries()).toEqual([]);
    expect(shipmentTasks()).toHaveLength(1);
  });

  it("does not send a shipment already run on another computer", async () => {
    const task = await syncedShipment();
    notepad.text = noteText([]);

    const result = await claimShipment(task, 2000);

    expect(result).toEqual({ status: "gone" });
    expect(shipmentTasks()).toEqual([]);
  });

  it("says how much is left when part was sent from another computer", async () => {
    const task = await syncedShipment(9000);
    notepad.text = noteText([shipment(task.data.noteId!, 3000)]);

    const result = await claimShipment(task, 2000);

    expect(result).toEqual({ status: "changed", amount: 3000 });
    expect(shipmentTasks()[0].data.amount).toBe(3000);
  });

  it("does not act while another computer holds the lease", async () => {
    const task = await syncedShipment();
    const id = task.data.noteId!;
    notepad.text = noteText([shipment(id, 9000)], {
      machine: "zz",
      minute: minuteStamp(NOW),
    });
    const saves = notepad.saves.length;

    expect(await claimShipment(task, 2000)).toEqual({
      status: "blocked",
    });
    expect(notepad.saves).toHaveLength(saves);
  });

  it("holds the runner back after a claim finds another computer's lease, and looks again", async () => {
    const task = await syncedShipment();
    await startQueueNoteSync(() => true);
    notepad.text = noteText([shipment(task.data.noteId!, 9000)], {
      machine: "zz",
      minute: minuteStamp(NOW),
    });

    expect((await claimShipment(task, 2000)).status).toBe("blocked");
    expect(queueNoteAllowsRunning()).toBe(false);
    const reads = notepad.reads;

    await vi.advanceTimersByTimeAsync(LEASE_RECHECK_MS);
    expect(notepad.reads).toBe(reads + 1);
  });

  it("goes ahead as before when the notepad cannot be read", async () => {
    const task = await syncedShipment();
    notepad.readError = new Error("offline");

    expect(await claimShipment(task, 2000)).toEqual({ status: "go" });
    expect(shipmentTasks()).toHaveLength(1);
  });

  it("goes ahead as before when the notepad holds other text", async () => {
    const task = await syncedShipment();
    notepad.text = "my own notes";

    expect(await claimShipment(task, 2000)).toEqual({ status: "go" });
    expect(notepad.text).toBe("my own notes");
  });

  it("asks nothing for Auto Wine's shipments", async () => {
    const task = queueShipment({ resource: "wine", label: AUTO_WINE_LABEL });

    expect(await claimShipment(task, 2000)).toEqual({ status: "go" });
    expect(notepad.reads).toBe(0);
  });

  it("claims a shipment that was never synced, under a fresh id", async () => {
    const task = queueShipment({ amount: 5000 });

    expect(await claimShipment(task, 2000)).toEqual({ status: "go" });

    const id = shipmentTasks()[0].data.noteId as string;
    expect(id).toMatch(/^[0-9a-z]{2}$/);
    expect(noteEntries()).toEqual([shipment(id, 3000)]);
  });

  it("puts a shipment back in the notepad when the action did not happen", async () => {
    const task = await syncedShipment(9000);
    await claimShipment(task, 9000);
    expect(noteEntries()).toEqual([]);

    // The send failed: the task is still queued in full.
    await syncQueueNote({ wantLease: true });

    expect(noteEntries()).toEqual([shipment(task.data.noteId!, 9000)]);
  });

  it("agrees with the notepad once the action happened", async () => {
    const task = await syncedShipment(9000);
    await claimShipment(task, 4000);
    getState().queue.replaceById(task.id, {
      ...task,
      data: { ...task.data, amount: 5000 },
    });
    const saves = notepad.saves.length;

    await syncQueueNote({ wantLease: true });

    expect(noteEntries()).toEqual([shipment(task.data.noteId!, 5000)]);
    expect(notepad.saves).toHaveLength(saves);
  });

  it("takes an upgrade off the notepad before its button is clicked", async () => {
    saveUpgrades({ "T-Sparta": [["js_CityPosition8Link", "Warehouse 21"]] });
    await syncQueueNote({ wantLease: true });

    const result = await claimUpgrade(
      "T-Sparta",
      "js_CityPosition8Link",
      "Warehouse 21",
    );

    expect(result).toEqual({ status: "go" });
    expect(noteEntries()).toEqual([]);
    expect(savedUpgrades()).toEqual({
      "T-Sparta": ["js_CityPosition8Link|Warehouse 21"],
    });
  });

  it("does not start an upgrade already run on another computer", async () => {
    saveUpgrades({ "T-Sparta": [["js_CityPosition8Link", "Warehouse 21"]] });
    await syncQueueNote({ wantLease: true });
    notepad.text = noteText([]);

    const result = await claimUpgrade(
      "T-Sparta",
      "js_CityPosition8Link",
      "Warehouse 21",
    );

    expect(result).toEqual({ status: "gone" });
    expect(savedUpgrades()).toEqual({ "T-Sparta": [] });
  });
});

/* ─────────────────────────── Page wiring ───────────────────────────────── */

describe("on the page", () => {
  it("keeps the runner waiting until the page-load sync is over, however it went", async () => {
    notepad.readError = new Error("offline");
    expect(queueNoteAllowsRunning()).toBe(false);

    const pending = startQueueNoteSync(() => false);
    expect(queueNoteAllowsRunning()).toBe(false);
    await pending;

    expect(queueNoteAllowsRunning()).toBe(true);
  });

  it("keeps the runner idle while another computer holds the lease, and looks again", async () => {
    notepad.text = noteText([], { machine: "zz", minute: minuteStamp(NOW) });

    await startQueueNoteSync(() => true);
    expect(queueNoteAllowsRunning()).toBe(false);
    const reads = notepad.reads;

    await vi.advanceTimersByTimeAsync(LEASE_RECHECK_MS);
    expect(notepad.reads).toBe(reads + 1);
    expect(queueNoteAllowsRunning()).toBe(false);

    // Ten minutes on, the lease has run out and is ours.
    await vi.advanceTimersByTimeAsync(4 * LEASE_RECHECK_MS);
    expect(queueNoteAllowsRunning()).toBe(true);
    const parsed = parseNote(notepad.text);
    expect(parsed.kind === "queue" && parsed.note.lease?.machine).toBe(
      machineId(),
    );

    // And stops looking.
    const settled = notepad.reads;
    await vi.advanceTimersByTimeAsync(3 * LEASE_RECHECK_MS);
    expect(notepad.reads).toBe(settled);
  });

  it("syncs once, a little after a burst of changes", async () => {
    setQueueChangeListener(queueChanged);
    await startQueueNoteSync(() => false);
    const reads = notepad.reads;

    queueShipment();
    queueShipment();
    await vi.advanceTimersByTimeAsync(CHANGE_SYNC_DELAY_MS - 1);
    expect(notepad.reads).toBe(reads);

    await vi.advanceTimersByTimeAsync(1);
    expect(notepad.reads).toBe(reads + 1);
    expect(noteEntries()).toHaveLength(2);
  });

  it("does not sync again for its own writes, nor for a change that changes nothing copied", async () => {
    setQueueChangeListener(queueChanged);
    notepad.text = noteText([shipment("k7")]);
    await startQueueNoteSync(() => false);
    expect(shipmentTasks()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    const reads = notepad.reads;

    // An Auto Wine run is not in the notepad.
    queueShipment({ resource: "wine", label: AUTO_WINE_LABEL });
    await vi.advanceTimersByTimeAsync(CHANGE_SYNC_DELAY_MS);

    expect(notepad.reads).toBe(reads);
  });

  it("tells the player once a page when the notepad holds other text", async () => {
    setQueueChangeListener(queueChanged);
    notepad.text = "my own notes";
    await startQueueNoteSync(() => false);
    expect(showToast).not.toHaveBeenCalled();

    queueShipment();
    await vi.advanceTimersByTimeAsync(CHANGE_SYNC_DELAY_MS);
    queueShipment();
    await vi.advanceTimersByTimeAsync(CHANGE_SYNC_DELAY_MS);

    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it("tells the player once a page when entries do not fit", async () => {
    setQueueChangeListener(queueChanged);
    await startQueueNoteSync(() => false);
    for (let i = 0; i < 22; i++) queueShipment({ amount: 12000 });
    await vi.advanceTimersByTimeAsync(CHANGE_SYNC_DELAY_MS);
    queueShipment({ amount: 12000 });
    await vi.advanceTimersByTimeAsync(CHANGE_SYNC_DELAY_MS);

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(String(showToast.mock.calls[0][0])).toContain("1 queued entries");
  });

  it("on Scan, offers to replace other text, and replaces it only when told to", async () => {
    queueShipment();
    notepad.text = "my own notes";
    const confirm = vi.fn<(message: string) => boolean>();
    vi.stubGlobal("confirm", confirm);

    confirm.mockReturnValueOnce(false);
    expect((await syncQueueNoteFromScan()).status).toBe("foreign");
    expect(notepad.text).toBe("my own notes");

    confirm.mockReturnValueOnce(true);
    expect((await syncQueueNoteFromScan()).status).toBe("synced");
    expect(noteEntries()).toHaveLength(1);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(String(lastToast())).toContain("1 entries");
    vi.unstubAllGlobals();
  });

  it("on Scan, says when the notepad could not be reached", async () => {
    notepad.readError = new Error("offline");

    await syncQueueNoteFromScan();

    expect(String(lastToast())).toContain("offline");
  });
});
