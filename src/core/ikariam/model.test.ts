import { beforeEach, describe, expect, it } from "vitest";
import {
  hasModel,
  modelActionPoints,
  modelCurrentCityId,
  modelCurrentCityName,
  modelFreeFreighters,
  modelFreeTransporters,
  modelOwnCities,
  modelResource,
  modelWineConsumption,
  parseCoords,
} from "./model";

/**
 * Shape taken from a live page and from the payload IkaEasy forwards
 * (`sample/IkaEasy-V3-Chrome-Web-Store/inner/ikaeasy.js`).
 */
function installModel(overrides: Record<string, unknown> = {}): void {
  (window as any).ikariam = {
    model: {
      currentResources: { wood: 1000, wine: 32495, marble: 0 },
      wineSpendings: 525,
      freeTransporters: 148,
      maxActionPoints: 4,
      relatedCityData: {
        selectedCity: "city_78038",
        additionalInfo: "ignored",
        city_78038: {
          id: 78038,
          name: "W-Athens",
          coords: "[12:34]",
          relationship: "ownCity",
          tradegood: 1,
        },
        city_78039: {
          id: 78039,
          name: "M-Corinth",
          coords: "[56:78]",
          relationship: "ownCity",
          tradegood: 2,
        },
        city_99999: {
          id: 99999,
          name: "SomeoneElse",
          coords: "[1:2]",
          relationship: "deployedCities",
          tradegood: 3,
        },
      },
      ...overrides,
    },
  };
}

beforeEach(() => {
  delete (window as any).ikariam;
});

describe("model availability", () => {
  it("reports absence rather than throwing", () => {
    expect(hasModel()).toBe(false);
    expect(modelFreeTransporters()).toBeNull();
    expect(modelActionPoints()).toBeNull();
    expect(modelResource("wine")).toBeNull();
    expect(modelWineConsumption()).toBeNull();
    expect(modelCurrentCityName()).toBeNull();
    expect(modelOwnCities()).toEqual([]);
  });

  it("survives ikariam existing without a model", () => {
    (window as any).ikariam = {};
    expect(hasModel()).toBe(false);
  });
});

describe("counters", () => {
  beforeEach(() => installModel());

  it("reads ships, action points and resources", () => {
    expect(modelFreeTransporters()).toBe(148);
    expect(modelActionPoints()).toBe(4);
    expect(modelResource("wine")).toBe(32495);
    expect(modelResource("wood")).toBe(1000);
  });

  it("reads a resource that is legitimately zero", () => {
    // Must not be confused with "unavailable".
    expect(modelResource("marble")).toBe(0);
  });

  it("returns null for freighters when the model omits them", () => {
    // Freighters are a later addition; this is why the DOM fallback stays.
    expect(modelFreeFreighters()).toBeNull();
  });

  it("coerces numeric strings", () => {
    installModel({ freeTransporters: "42" });
    expect(modelFreeTransporters()).toBe(42);
  });

  it("returns null for an unknown resource", () => {
    expect(modelResource("nope")).toBeNull();
  });

  it("normalises wine consumption to a positive number", () => {
    installModel({ wineSpendings: -350 });
    expect(modelWineConsumption()).toBe(350);
  });
});

describe("city identity", () => {
  beforeEach(() => installModel());

  it("resolves the selected city id and name", () => {
    expect(modelCurrentCityId()).toBe(78038);
    expect(modelCurrentCityName()).toBe("W-Athens");
  });

  it("lists only towns this account owns", () => {
    // `deployedCities` belongs to someone else and must not appear.
    expect(modelOwnCities().map((c) => c.name)).toEqual([
      "W-Athens",
      "M-Corinth",
    ]);
  });

  it("returns null when the selected city is missing from the map", () => {
    installModel({
      relatedCityData: { selectedCity: "city_404" },
    });
    expect(modelCurrentCityName()).toBeNull();
  });
});

describe("parseCoords", () => {
  it("extracts both numbers", () => {
    expect(parseCoords("[12:34]")).toEqual({ x: 12, y: 34 });
  });

  it(
    "REGRESSION: y is not a copy of x — the ported parsePremium used a " +
      "single-group regex without the g flag, which returns [whole, group]",
    () => {
      const coords = parseCoords("[12:34]")!;
      expect(coords.x).not.toBe(coords.y);
      expect(coords.y).toBe(34);
    },
  );

  it("returns null when there are not two numbers", () => {
    expect(parseCoords("[12]")).toBeNull();
    expect(parseCoords("")).toBeNull();
    expect(parseCoords(undefined)).toBeNull();
  });
});
