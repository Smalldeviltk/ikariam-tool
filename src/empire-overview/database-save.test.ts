/**
 * @vitest-environment-options { "url": "https://s303-en.ikariam.gameforge.com/?view=city" }
 */
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require_ = createRequire(import.meta.url);

let database: any;
let events: any;
let Constant: any;

beforeEach(async () => {
  localStorage.clear();
  document.body.innerHTML = `<div class="avatarName"><a class="noViewParameters" title="tester"></a></div>`;
  const mod = require_("jquery");
  (globalThis as any).jQuery =
    typeof mod.fn === "undefined" ? mod(window) : mod;
  (globalThis as any).unsafeWindow = window;
  (window as any).ikariam = { model: {}, backgroundView: { id: "city" } };

  await import("./jquery-ext");
  await import("./constants");
  Constant = (await import("./constants")).Constant;
  events = (await import("./events")).events;
  database = (await import("./database")).database;
  database._saveSuspended = false;
});

afterEach(() => {
  vi.useRealTimers();
});

/** The key `empire.setVar` writes the city table to. */
const CITIES_KEY = "***tester***cities";

describe("database persistence", () => {
  it(
    "REGRESSION: saves when the board learns something — " +
      "`startMonitoringChanges` was never called (its only apparent call site " +
      "is bound to `render`, so it reached render's method of the same name), " +
      "so building data was recorded in memory and never written down",
    () => {
      vi.useFakeTimers();
      database.cities = {};
      database.startMonitoringChanges();

      events(Constant.Events.BUILDINGS_UPDATED).pub(297034, [{ position: 0 }]);
      // Debounced: nothing yet.
      expect(localStorage.getItem(CITIES_KEY)).toBeNull();

      vi.advanceTimersByTime(2000);
      expect(localStorage.getItem(CITIES_KEY)).not.toBeNull();
    },
  );

  it(
    "REGRESSION: saves what a town view reports about a town — the Town " +
      "Hall's and the Finances' figures waited for some other change, or " +
      "for leaving the page",
    () => {
      vi.useFakeTimers();
      database.cities = {};
      database.startMonitoringChanges();

      events(Constant.Events.CITY_UPDATED).pub(297034, { finances: true });
      vi.advanceTimersByTime(2000);

      expect(localStorage.getItem(CITIES_KEY)).not.toBeNull();
    },
  );

  it("coalesces a burst into one write", () => {
    vi.useFakeTimers();
    database.cities = {};
    database.startMonitoringChanges();
    const setItem = vi.spyOn(localStorage, "setItem");

    // One ajax response publishes several of these.
    events(Constant.Events.BUILDINGS_UPDATED).pub(297034, []);
    events(Constant.Events.RESOURCES_UPDATED).pub(297034, []);
    events(Constant.Events.GLOBAL_UPDATED).pub([]);
    vi.advanceTimersByTime(2000);

    // Three keys, written once — not three times each.
    expect(setItem).toHaveBeenCalledTimes(3);
  });

  it(
    "REGRESSION: `Save` writes synchronously, so the beforeunload handler " +
      "actually persists — it used to defer through two nested timeouts, " +
      "neither of which runs once the page is going away",
    () => {
      database.cities = {};
      database.Save();
      expect(localStorage.getItem(CITIES_KEY)).not.toBeNull();
    },
  );

  it("a pending debounced save does not fire again after a flush", () => {
    vi.useFakeTimers();
    database.cities = {};
    database.startMonitoringChanges();
    events(Constant.Events.BUILDINGS_UPDATED).pub(297034, []);

    database.Save();
    const setItem = vi.spyOn(localStorage, "setItem");
    vi.advanceTimersByTime(5000);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("data written from outside this page", () => {
  beforeEach(() => {
    database.stopSavingAfterImport();
    database.cities = { 297034: { _id: 297034 } };
  });

  it(
    "REGRESSION: stops writing once an import in another tab has written " +
      "the board's data — every save wrote this page's whole copy, older " +
      "by then, back over it",
    async () => {
      const { BOARD_DATA_IMPORTED_KEY } = await import("@core/storage");
      localStorage.setItem(CITIES_KEY, "imported");
      window.dispatchEvent(
        new StorageEvent("storage", { key: BOARD_DATA_IMPORTED_KEY }),
      );

      database.Save();
      expect(localStorage.getItem(CITIES_KEY)).toBe("imported");
    },
  );

  it(
    "REGRESSION: stops writing once an import has written the board's data " +
      "— it went back over the imported data on the next save, or on leaving",
    async () => {
      const { BOARD_DATA_IMPORTED_EVENT } = await import("@core/storage");
      localStorage.setItem(CITIES_KEY, "imported");
      document.dispatchEvent(new Event(BOARD_DATA_IMPORTED_EVENT));

      database.Save();
      expect(localStorage.getItem(CITIES_KEY)).toBe("imported");
    },
  );

  it("keeps saving what it learns after another tab's own save", () => {
    vi.useFakeTimers();
    database.startMonitoringChanges();
    window.dispatchEvent(new StorageEvent("storage", { key: CITIES_KEY }));
    localStorage.removeItem(CITIES_KEY);

    events(Constant.Events.BUILDINGS_UPDATED).pub(297034, []);
    vi.advanceTimersByTime(2000);

    expect(localStorage.getItem(CITIES_KEY)).toContain("297034");
  });

  it("keeps writing when another tab writes something else", () => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: "***someoneElse***cities" }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: "listAutoBuild" }));

    database.Save();
    expect(localStorage.getItem(CITIES_KEY)).toContain("297034");
  });
});

describe("loading what was saved", () => {
  beforeEach(() => {
    // Without settings of a current version, `Load` reads nothing else.
    localStorage.setItem(
      "***tester***settings",
      JSON.stringify({ version: 2 }),
    );
  });

  it(
    "REGRESSION: starts with no saved game data — reading the government " +
      "of data that was not there threw, and the board never started",
    () => {
      localStorage.removeItem("***tester***globalData");
      expect(() => database.Init()).not.toThrow();
    },
  );

  it(
    "REGRESSION: starts each saved town with every town already loaded — " +
      "each was started with only the towns before it in the empire",
    () => {
      localStorage.setItem(
        CITIES_KEY,
        JSON.stringify({
          297034: { _id: 297034, _name: "Alpha" },
          297035: { _id: 297035, _name: "Beta" },
        }),
      );
      const City = Object.getPrototypeOf(database.addCity(1));
      const seen: number[] = [];
      const init = vi.spyOn(City, "init").mockImplementation(function () {
        seen.push(Object.keys(database.cities).length);
      });

      database.cities = {};
      database.Init();
      init.mockRestore();

      expect(seen).toEqual([2, 2]);
    },
  );
});

describe("interaction with HardReset", () => {
  it(
    "REGRESSION: unloading after a reset neither throws nor writes the " +
      "database back — `HardReset` empties the object, methods included, and " +
      "then navigates, which fires the beforeunload handler",
    () => {
      database.cities = { 297034: { _id: 297034 } };
      database.Save();
      expect(localStorage.getItem(CITIES_KEY)).toContain("297034");

      // What HardReset does.
      for (const key of Object.keys(database)) delete (database as any)[key];
      localStorage.removeItem(CITIES_KEY);

      expect(() =>
        window.dispatchEvent(new Event("beforeunload")),
      ).not.toThrow();
      expect(localStorage.getItem(CITIES_KEY)).toBeNull();
    },
  );
});
