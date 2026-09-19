import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const require_ = createRequire(import.meta.url);

let Building: any;
let events: any;
let Constant: any;

beforeAll(async () => {
  const mod = require_("jquery");
  (globalThis as any).jQuery =
    typeof mod.fn === "undefined" ? mod(window) : mod;
  (globalThis as any).unsafeWindow = window;
  Building = (await import("./building")).Building;
  events = (await import("../events")).events;
  Constant = (await import("../constants")).Constant;
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
