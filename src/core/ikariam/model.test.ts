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
  winePressLevel,
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

/** A city view with buildings but no Wine Press, copied from a live capture. */
const CITY_VIEW =
  `<div id="position18" class="position18 building carpentering level50">` +
  `<a class="hoverable" id="js_CityPosition18Link" title="Carpenter's Workshop (50)"></a>` +
  `</div>`;

describe("counters", () => {
  beforeEach(() => {
    // Wine consumption is only readable from the city view, so the slots have
    // to be on the page for it to answer at all.
    document.body.innerHTML = CITY_VIEW;
    installModel();
  });

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

describe("the Wine Press", () => {
  /** The city view's slot for the press, copied from a live capture. */
  function press(level: number): string {
    return (
      `<div id="position19" class="position19 building vineyard level${level}">` +
      `<a class="hoverable" id="js_CityPosition19Link" title="Wine Press (${level})"></a>` +
      `</div>`
    );
  }

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reads its level off the slot's own class", () => {
    document.body.innerHTML = press(40);
    expect(winePressLevel()).toBe(40);
  });

  it("is absent on a town that has not built one", () => {
    document.body.innerHTML = CITY_VIEW;
    expect(winePressLevel()).toBe(0);
  });

  it(
    "is subtracted from the tavern's draw — wineSpendings is the GROSS " +
      "figure, which is what made the city view read -933 for a town that " +
      "actually spent 560",
    () => {
      document.body.innerHTML = press(40);
      installModel({ wineSpendings: 933 });

      // The game's own tooltip on that town: "The wine press saves you
      // 373.20 wine per hour". 933 - 373.20 = 559.80.
      expect(modelWineConsumption()).toBeCloseTo(559.8, 5);
    },
  );

  it("leaves the figure alone when there is no press", () => {
    document.body.innerHTML = CITY_VIEW;
    installModel({ wineSpendings: 933 });
    expect(modelWineConsumption()).toBe(933);
  });

  it(
    "says nothing at all off the city view, where the slots are not rendered " +
      "— reporting the gross figure there is what this guards against",
    () => {
      document.body.innerHTML = "";
      installModel({ wineSpendings: 933 });

      expect(winePressLevel()).toBeNull();
      expect(modelWineConsumption()).toBeNull();
    },
  );

  it("still reports null when the model itself is missing", () => {
    document.body.innerHTML = press(40);
    delete (window as any).ikariam;
    expect(modelWineConsumption()).toBeNull();
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
