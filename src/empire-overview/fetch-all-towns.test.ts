/**
 * @vitest-environment-options { "url": "https://s303-en.ikariam.gameforge.com/?view=city" }
 *
 * `constants.ts` derives the default language from the host, so the URL has
 * to look like a real world.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);

let ikariam: any;
let database: any;

/** `relatedCityData` as the game shapes it, for one town on screen. */
function relatedCityData(
  towns: Array<{ id: number; name: string; relationship?: string }>,
) {
  const data: Record<string, unknown> = { selectedCity: `city_${towns[0].id}` };
  for (const town of towns) {
    data[`city_${town.id}`] = {
      id: town.id,
      name: town.name,
      coords: "[41:98] ",
      tradegood: "1",
      relationship: town.relationship ?? "ownCity",
    };
  }
  return data;
}

beforeEach(async () => {
  localStorage.clear();
  document.body.innerHTML = `<div class="avatarName"><a class="noViewParameters" title="tester"></a></div>`;
  const mod = require_("jquery");
  const jq = typeof mod.fn === "undefined" ? mod(window) : mod;
  (globalThis as any).jQuery = jq;
  (globalThis as any).unsafeWindow = window;
  (window as any).ikariam = { model: {}, backgroundView: { id: "city" } };

  await import("./jquery-ext");
  // `constants` and `game-api` import each other. Whichever starts first wins:
  // entering through `constants` lets `game-api` finish defining `ikariam`
  // before `constants` reads `ikariam.Language()`. `main.ts` relies on the
  // same order.
  await import("./constants");
  ikariam = (await import("./game-api")).ikariam;
  database = (await import("./database")).database;
  database.cities = {};
  database.settings.cityOrder = { value: [] };
});

describe("FetchAllTowns", () => {
  it("adds the towns the game reports", () => {
    (window as any).ikariam.model.relatedCityData = relatedCityData([
      { id: 297034, name: "W-Athens" },
      { id: 297035, name: "M-Corinth" },
    ]);
    ikariam.FetchAllTowns();
    expect(Object.keys(database.cities).sort()).toEqual(["297034", "297035"]);
  });

  it(
    "REGRESSION: keeps a town that is simply absent from the current view — " +
      "`relatedCityData` describes the view you are on, not the empire, so " +
      "treating absence as proof of loss deleted every other town and " +
      "recreated it empty, discarding everything the board had recorded",
    () => {
      (window as any).ikariam.model.relatedCityData = relatedCityData([
        { id: 297034, name: "W-Athens" },
        { id: 297035, name: "M-Corinth" },
      ]);
      ikariam.FetchAllTowns();

      // Record something, the way an ajax response would.
      const athens = database.cities[297034];
      athens.knownTime = 111;
      const corinth = database.cities[297035];
      corinth.knownTime = 222;

      // Now the player switches to M-Corinth, and the game reports only it.
      (window as any).ikariam.model.relatedCityData = relatedCityData([
        { id: 297035, name: "M-Corinth" },
      ]);
      ikariam.FetchAllTowns();

      expect(database.cities[297034]).toBeDefined();
      // Same object, not a fresh one: a new City would reset `knownTime`,
      // which is exactly how the live bug was identified.
      expect(database.cities[297034].knownTime).toBe(111);
      expect(database.cities[297035].knownTime).toBe(222);
    },
  );

  it("still drops a town the game says is no longer ours", () => {
    (window as any).ikariam.model.relatedCityData = relatedCityData([
      { id: 297034, name: "W-Athens" },
      { id: 297035, name: "M-Corinth" },
    ]);
    ikariam.FetchAllTowns();
    expect(database.cities[297035]).toBeDefined();

    (window as any).ikariam.model.relatedCityData = relatedCityData([
      { id: 297034, name: "W-Athens" },
      { id: 297035, name: "M-Corinth", relationship: "occupiedCities" },
    ]);
    ikariam.FetchAllTowns();

    expect(database.cities[297035]).toBeUndefined();
    expect(database.cities[297034]).toBeDefined();
  });

  it("leaves a town that was never ours alone", () => {
    (window as any).ikariam.model.relatedCityData = relatedCityData([
      { id: 297034, name: "W-Athens" },
      { id: 999999, name: "Someone else", relationship: "deployedCities" },
    ]);
    ikariam.FetchAllTowns();
    expect(Object.keys(database.cities)).toEqual(["297034"]);
  });
});
