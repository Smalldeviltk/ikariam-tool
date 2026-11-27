/**
 * @vitest-environment-options { "url": "https://s303-en.ikariam.gameforge.com/?view=city" }
 */
import { createRequire } from "node:module";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);

let database: any;
let Constant: any;
let Movement: any;
let MilitaryUnits: any;

/** The id of the town every test builds. */
const CITY_ID = 297034;

beforeAll(async () => {
  localStorage.clear();
  document.body.innerHTML = `<div class="avatarName"><a class="noViewParameters" title="tester"></a></div>
    <span id="js_GlobalMenu_maxActionPoints">5</span>`;
  const mod = require_("jquery");
  (globalThis as any).jQuery =
    typeof mod.fn === "undefined" ? mod(window) : mod;
  (globalThis as any).unsafeWindow = window;
  (window as any).ikariam = { model: {}, backgroundView: { id: "city" } };

  await import("../jquery-ext");
  Constant = (await import("../constants")).Constant;
  database = (await import("../database")).database;
  Movement = (await import("./movement")).Movement;
  MilitaryUnits = (await import("./military")).MilitaryUnits;
  database.Init();
});

beforeEach(() => {
  database.cities = {};
  database.getGlobalData.fleetMovements = [];
  database.getGlobalData.premium = {};
});

/** A town of the empire with the given buildings, by position. */
function townWith(buildings: { building: string; level: number }[] = []): any {
  const city = database.addCity(CITY_ID);
  database.cities[CITY_ID] = city;
  buildings.forEach((data, position) => {
    city.getBuildingFromPosition(position).update({
      building: data.building,
      level: String(data.level),
      name: data.building,
    });
  });
  return city;
}

/** What the game sends about a town, with the given fields changed. */
function cityData(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    producedTradegood: "1",
    currentResources: {
      resource: 1000,
      1: 1000,
      2: 1000,
      3: 1000,
      4: 1000,
      population: 100,
      citizens: 50,
    },
    resourceProduction: 0.01,
    tradegoodProduction: 0.01,
    wineSpendings: 0,
    islandXCoord: "50",
    islandYCoord: "50",
    ...fields,
  };
}

describe("a town's figures from the game's data", () => {
  it(
    "REGRESSION: takes 0 action points as 0 — it read as missing, and the " +
      "town took the count in the header, which is the town on screen's",
    () => {
      const city = townWith();
      city.updateCityDataFromAjax(CITY_ID, cityData({ maxActionPoints: 0 }));
      expect(city.getAvailableActions).toBe(0);
    },
  );

  it("takes the header's count when the data has none", () => {
    const city = townWith();
    city.updateCityDataFromAjax(CITY_ID, cityData({}));
    expect(city.getAvailableActions).toBe(5);
  });

  it(
    "REGRESSION: on s202 knows a tavern's serving from that server's own " +
      "table — only the first was searched, so the Wine Press's saving was " +
      "not taken off",
    async () => {
      const { ikariam } = await import("../game-api");
      ikariam._Server = "s202";
      try {
        const city = townWith([
          { building: "tavern", level: 1 },
          { building: "vineyard", level: 10 },
        ]);
        // 12 is in the s202 table only.
        expect(
          Constant.BuildingData[Constant.Buildings.TAVERN].wineUse,
        ).not.toContain(12);
        city.updateCityDataFromAjax(CITY_ID, cityData({ wineSpendings: 12 }));
        expect(city.getResource(Constant.Resources.WINE).getConsumption).toBe(
          (12 * 90) / 100,
        );
      } finally {
        ikariam._Server = null;
      }
    },
  );

  it(
    "REGRESSION: on another server does not read a figure from the s202 " +
      "table as a tavern's serving — 179, measured net of a level 1 press " +
      "on s303, had the press taken off a second time",
    () => {
      const city = townWith([
        { building: "tavern", level: 10 },
        { building: "vineyard", level: 1 },
      ]);
      const tables = Constant.BuildingData[Constant.Buildings.TAVERN];
      expect(tables.wineUse).not.toContain(179);
      expect(tables.wineUse2).toContain(179);

      city.updateCityDataFromAjax(CITY_ID, cityData({ wineSpendings: 179 }));

      expect(city.getResource(Constant.Resources.WINE).getConsumption).toBe(
        179,
      );
    },
  );
});

describe("a town's derived figures", () => {
  it(
    "REGRESSION: a town with no buildings known has no gold to plunder — " +
      "reading its Town Hall threw",
    () => {
      const city = townWith();
      expect(() => city.plundergold).not.toThrow();
      expect(city.plundergold).toBe(0);
    },
  );

  it("still works out the gold to plunder from the Town Hall", () => {
    const city = townWith([{ building: "townHall", level: 10 }]);
    expect(city.plundergold).toBe(9500);
  });

  it("works it out for the capital of an empire of several towns", () => {
    const capital = townWith([
      { building: "townHall", level: 10 },
      { building: "palace", level: 1 },
    ]);
    database.cities[CITY_ID + 1] = database.addCity(CITY_ID + 1);

    expect(capital.plundergold).toBe(9500);
  });

  it("gives none for a colony of an empire of several towns", () => {
    const colony = townWith([{ building: "townHall", level: 10 }]);
    database.cities[CITY_ID + 1] = database.addCity(CITY_ID + 1);

    expect(colony.plundergold).toBe(0);
  });

  it(
    "REGRESSION: shows no tavern level when the serving matches none — the " +
      "length of the table was shown as the level",
    () => {
      const city = townWith([{ building: "tavern", level: 5 }]);
      city.updateCityDataFromAjax(CITY_ID, cityData({ wineSpendings: 10000 }));
      expect(city.tavernlevel).toBe("");
    },
  );

  it(
    "REGRESSION: priests add nothing while the town's maximum population " +
      "is not known — 0/0 counted them at the full 150",
    () => {
      const city = townWith();
      city.updatePriests(10);
      expect(city._getSatisfactionData.priest).toBe(0);
    },
  );

  it(
    "REGRESSION: the storage figures follow a warehouse finished on the " +
      "board's own timer — they stayed at the old level until a city view",
    () => {
      const city = townWith([
        { building: "townHall", level: 10 },
        { building: "warehouse", level: 5 },
      ]);
      const before = city.maxResourceCapacities.capacity;

      city.getBuildingFromPosition(1).completeUpgrade();

      expect(city.maxResourceCapacities.capacity).toBeGreaterThan(before);
    },
  );

  it("the storage figures follow a storage bonus that starts", () => {
    const city = townWith([
      { building: "townHall", level: 10 },
      { building: "warehouse", level: 5 },
    ]);
    const before = city.maxResourceCapacities.capacity;

    database.getGlobalData.setPremiumFeature(
      Constant.Premium.STORAGECAPACITY_BONUS,
      Date.now() + 3600_000,
      false,
    );

    expect(city.maxResourceCapacities.capacity).toBeGreaterThan(before);
  });
});

describe("a resource's stock", () => {
  it(
    "REGRESSION: a stock that changed by more than 10 reads as changed — " +
      "the check was a remainder, so a first figure (from 0) and a stock " +
      "that doubled did not",
    async () => {
      const { Resource } = await import("./resource");
      const wood = new Resource(townWith(), "wood");

      expect(wood.update(1000, 0, 0)).toBe(true);
      expect(wood.update(2000, 0, 0)).toBe(true);
      expect(wood.update(2005, 0, 0)).toBe(false);
    },
  );
});

describe("armies on the way", () => {
  /** A movement as the board keeps it, after a reload. */
  function movement(fields: Record<string, unknown>): any {
    return new Movement({
      _id: 1,
      _originCityId: 1,
      _targetCityId: 2,
      _mission: "deployarmy",
      _arrivalTime: Date.now() + 3600_000,
      ...fields,
    });
  }

  it(
    "REGRESSION: counts troops and fleets deployed to a town as coming to " +
      "it — the filter asked for a mission none has, so none ever came",
    () => {
      database.getGlobalData.fleetMovements = [
        movement({ _id: 1, _targetCityId: CITY_ID, _mission: "deployarmy" }),
        movement({ _id: 2, _targetCityId: CITY_ID, _mission: "deployfleet" }),
        movement({ _id: 3, _targetCityId: CITY_ID, _mission: "transport" }),
        movement({ _id: 4, _originCityId: CITY_ID, _mission: "deployarmy" }),
      ];
      const city = townWith();

      expect(city.getIncomingMilitary.map((m: any) => m._id)).toEqual([1, 2]);
    },
  );

  it(
    "REGRESSION: a movement reloaded from storage still reads its troops — " +
      "it kept the plain object, which has no `totals`",
    () => {
      const stored = JSON.parse(
        JSON.stringify(
          movement({
            _military: new MilitaryUnits({ _units: { 301: 7 } }),
          }),
        ),
      );
      expect(new Movement(stored)._military.totals).toEqual({ 301: 7 });
    },
  );

  it(
    "REGRESSION: taking units away leaves the rest — the count was read " +
      "as a property of the method, and every unit went",
    () => {
      const units = new MilitaryUnits();
      units.setUnit(301, 5);
      units.removeUnit(301, 2);
      expect(units.getUnit(301)).toBe(3);
    },
  );
});
