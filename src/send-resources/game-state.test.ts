import { beforeEach, describe, expect, it } from "vitest";
import {
  getActionPoints,
  getFreeShips,
  readCurrentStock,
  readStoredStock,
} from "./game-state";

/** The game's header, as captured live. */
function globalMenu(merchants: string, freighters: string, points: string) {
  return (
    `<span id="js_GlobalMenu_freeTransporters">${merchants}</span>` +
    `<span id="js_GlobalMenu_freeFreighters">${freighters}</span>` +
    `<li id="js_GlobalMenu_maxActionPoints">${points}</li>`
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
  delete window.ikariam;
});

describe("getFreeShips", () => {
  it(
    "REGRESSION: trusts the rendered header over the model — with 227 " +
      "merchants idle and shown correctly, a city view's model reported 0, " +
      "and 0 is a finite number so it won through the `??`. Auto Wine " +
      'refused to start with "Not enough ships!"',
    () => {
      document.body.innerHTML = globalMenu("227", "5", "11");
      Object.assign(window, {
        ikariam: {
          model: { freeTransporters: 0, freeFreighters: 0, maxActionPoints: 0 },
        },
      });

      expect(getFreeShips()).toEqual({ merchants: 227, freighters: 5 });
      expect(getActionPoints()).toBe(11);
    },
  );

  it("parses the thousands separator the header uses", () => {
    document.body.innerHTML = globalMenu("1,227", "5", "11");
    expect(getFreeShips().merchants).toBe(1227);
  });

  it("falls back to the model when the header is not rendered", () => {
    Object.assign(window, {
      ikariam: {
        model: { freeTransporters: 12, freeFreighters: 3, maxActionPoints: 7 },
      },
    });
    expect(getFreeShips()).toEqual({ merchants: 12, freighters: 3 });
    expect(getActionPoints()).toBe(7);
  });

  it("reports zero rather than NaN when neither source is there", () => {
    expect(getFreeShips()).toEqual({ merchants: 0, freighters: 0 });
    expect(getActionPoints()).toBe(0);
  });

  it("keeps a genuine zero from the header", () => {
    document.body.innerHTML = globalMenu("0", "0", "0");
    Object.assign(window, { ikariam: { model: { freeTransporters: 99 } } });
    expect(getFreeShips()).toEqual({ merchants: 0, freighters: 0 });
  });
});

describe("readCurrentStock", () => {
  it("reads the model by the key the game files each resource under", () => {
    Object.assign(window, {
      ikariam: {
        model: { currentResources: { resource: 1200, "3": 450 } },
      },
    });
    expect(readCurrentStock("wood")).toBe(1200);
    expect(readCurrentStock("glass")).toBe(450);
  });

  it("falls back to the header, where crystal is `glass`", () => {
    document.body.innerHTML =
      `<span id="js_GlobalMenu_crystal">2,345</span>` +
      `<span id="js_GlobalMenu_sulfur">678</span>`;
    expect(readCurrentStock("glass")).toBe(2345);
    expect(readCurrentStock("sulfur")).toBe(678);
  });

  it("reports zero when neither source is there", () => {
    expect(readCurrentStock("marble")).toBe(0);
  });
});

describe("readStoredStock", () => {
  /** Empire Overview's saved towns, as `JSON.stringify(database.cities)`. */
  function saveEmpireCities(account: string, cities: unknown): void {
    localStorage.setItem(`***${account}***cities`, JSON.stringify(cities));
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it("reads a town's stock from Empire Overview's saved towns, by city id", () => {
    saveEmpireCities("tester", {
      "297034": {
        _id: 297034,
        _name: "W-Athens",
        _resources: {
          wood: { _current: 1834.6, _production: 0.2, _name: "wood" },
          glass: { _current: 500, _name: "glass" },
        },
      },
    });
    // Floored, as the board shows it (`getCurrent`).
    expect(readStoredStock("tester", "297034", "wood")).toBe(1834);
    expect(readStoredStock("tester", "297034", "glass")).toBe(500);
  });

  it("knows nothing of a town, a resource or an account it did not save", () => {
    saveEmpireCities("tester", {
      "297034": { _resources: { wood: { _current: 1834 } } },
    });
    expect(readStoredStock("tester", "297035", "wood")).toBeNull();
    expect(readStoredStock("tester", "297034", "marble")).toBeNull();
    expect(readStoredStock("other", "297034", "wood")).toBeNull();
  });

  it("takes broken or odd saved data as unknown, without throwing", () => {
    localStorage.setItem("***tester***cities", "{not json");
    expect(readStoredStock("tester", "297034", "wood")).toBeNull();
    saveEmpireCities("tester", {
      "297034": { _resources: { wood: { _current: "1834" } } },
    });
    expect(readStoredStock("tester", "297034", "wood")).toBeNull();
    saveEmpireCities("tester", null);
    expect(readStoredStock("tester", "297034", "wood")).toBeNull();
  });
});
