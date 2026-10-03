import { createRequire } from "node:module";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const require_ = createRequire(import.meta.url);

let Building: any;
let events: any;
let Constant: any;
let database: any;

/** The account the board reads its name from when its modules load. */
const ACCOUNT = "Tester";

beforeAll(async () => {
  const mod = require_("jquery");
  (globalThis as any).jQuery =
    typeof mod.fn === "undefined" ? mod(window) : mod;
  (globalThis as any).unsafeWindow = window;
  document.body.innerHTML = `<div class="avatarName"><a class="noViewParameters" title="${ACCOUNT}">${ACCOUNT}</a></div>`;
  Building = (await import("./building")).Building;
  events = (await import("../events")).events;
  Constant = (await import("../constants")).Constant;
  database = (await import("../database")).database;
});

afterEach(() => {
  vi.useRealTimers();
});

/** A city stub good enough for an empty building slot. */
function makeBuilding(): any {
  // `getUpgradeCost` asks the city for the Carpenter's Workshop discount and
  // for each resource's current stock. Plenty of everything, no carpenter.
  // The constructor wraps the city in a closure itself, so pass the object.
  return new Building(
    {
      getResource: () => ({ getCurrent: 1e9 }),
      getBuildingFromName: () => null,
    },
    3,
  );
}

describe("Building.startUpgradeTimer", () => {
  it(
    "REGRESSION: the status poll does not throw (its IIFE was called bare, " +
      "so under strict mode `this` was undefined and every tick threw " +
      "`Cannot read properties of undefined (reading 'isUpgradable')`)",
    () => {
      vi.useFakeTimers();
      const building = makeBuilding();
      const errors: unknown[] = [];

      building.startUpgradeTimer();
      try {
        vi.advanceTimersByTime(10_000);
      } catch (e) {
        errors.push(e);
      }

      expect(errors).toEqual([]);
    },
  );

  it("polls the building itself, not the global object", () => {
    vi.useFakeTimers();
    const building = makeBuilding();
    const seen: any[] = [];
    events(Constant.Events.BUILDINGS_UPDATED).sub((changes: any) =>
      seen.push(changes),
    );

    // Empty slot: not upgradable, not upgrading, so the poll should stay
    // silent. Before the fix it compared against `window.isUpgradable`
    // (undefined) and published one entry with `position: undefined`.
    building.startUpgradeTimer();
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual([]);

    // Now make it upgradable and confirm the change is reported with the
    // building's own position — proof the callback is bound correctly.
    building._name = "port";
    building._level = 1;
    vi.advanceTimersByTime(3_000);
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toMatchObject({ position: 3, name: "port" });

    events(Constant.Events.BUILDINGS_UPDATED).unsub();
  });

  it("REGRESSION: restarting cancels the previous poll instead of stacking", () => {
    vi.useFakeTimers();
    const building = makeBuilding();

    building.startUpgradeTimer();
    const afterFirst = vi.getTimerCount();
    building.startUpgradeTimer();
    building.startUpgradeTimer();

    // `city.init()` calls this once per building and `update()` calls it again
    // on every completion time, so a leaked interval per call adds up over a
    // session.
    expect(vi.getTimerCount()).toBe(afterFirst);
  });
});

describe("Building.getUpgradeCost time", () => {
  /** The port's level-2 upgrade: 258 s in the game's help table. */
  const PORT_SECONDS = 258;

  /** A town holding the given buildings, by name -> level. */
  function townWith(levels: Record<string, number>) {
    return {
      getResource: () => ({ getCurrent: 1e9 }),
      getBuildingFromName: (name: string) =>
        name in levels ? { getLevel: levels[name] } : null,
    };
  }

  function upgradeTime(
    name: string,
    level: number,
    town = townWith({}),
  ): number {
    const building = new Building(town, 3);
    building._name = name;
    building._level = level;
    return building.getUpgradeCost.time;
  }

  function setBuff(percent: unknown) {
    localStorage.setItem(
      "listAccount",
      JSON.stringify([
        { account: "Someone else", time: 0, buildTimeBuffPercent: 90 },
        { account: ACCOUNT, time: 0, buildTimeBuffPercent: percent },
      ]),
    );
  }

  beforeEach(() => {
    localStorage.clear();
    database._globalData = {
      getGovernmentType: "Anarchy",
      getResearchTopicLevel: () => 0,
    };
  });

  it("is the help table's seconds with nothing to take off", () => {
    expect(upgradeTime("port", 1)).toBe(PORT_SECONDS * 1000);
  });

  it("takes off this account's server buff, entered as a percentage", () => {
    setBuff(36);
    // 258 × 0.64 = 165.12 s, rounded to a whole second.
    expect(upgradeTime("port", 1)).toBe(165_000);
  });

  it("ignores a buff that is not a percentage below 100", () => {
    setBuff(150);
    expect(upgradeTime("port", 1)).toBe(PORT_SECONDS * 1000);
    setBuff("36");
    expect(upgradeTime("port", 1)).toBe(PORT_SECONDS * 1000);
  });

  it("leaves 0.8 per level of the town's Chronos' Forge (-36% at level 2)", () => {
    const town = townWith({ chronosForge: 2 });
    // 258 × 0.8² = 165.12 s.
    expect(upgradeTime("port", 1, town)).toBe(165_000);
  });

  it("does not speed up the Forge's own upgrade", () => {
    const forgeSeconds = Constant.BuildingData.chronosForge.time[2];
    const town = townWith({ chronosForge: 2 });
    expect(upgradeTime("chronosForge", 2, town)).toBe(forgeSeconds * 1000);
  });

  it("applies the buff, the Forge and the government one after another", () => {
    setBuff(36);
    database._globalData.getGovernmentType = "Aristocracy";
    const town = townWith({ chronosForge: 1 });
    // 258 × (1 − 0.36) × 0.8 × (1 − 0.2) = 105.68 s, rounded up to 106.
    expect(upgradeTime("port", 1, town)).toBe(106_000);
  });

  it("is a whole number of seconds, rounded to the nearest", () => {
    setBuff(10);
    // 258 × 0.9 = 232.2 s, rounded down.
    expect(upgradeTime("port", 1)).toBe(232_000);
    setBuff(30);
    // 258 × 0.7 = 180.6 s, rounded up.
    expect(upgradeTime("port", 1)).toBe(181_000);
  });
});
