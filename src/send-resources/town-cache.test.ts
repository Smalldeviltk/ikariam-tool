import { beforeEach, describe, expect, it } from "vitest";
import { globalStore } from "@core/storage";
import {
  clearTownStats,
  loadTownStats,
  MAX_AGE_MS,
  projectedStats,
  pruneTownStats,
  recordCurrentTown,
  saveTownStats,
} from "./town-cache";

const store = globalStore;

/** Stand in for the game's own state object. */
function mockModel(wine: number, wineSpendings: number): void {
  (window as any).ikariam = {
    model: { currentResources: { wine }, wineSpendings },
  };
}

/**
 * A city view with buildings but no Wine Press.
 *
 * `modelWineConsumption` refuses to answer without the building slots, because
 * off the city view it cannot tell "no press" from "cannot see the press" and
 * would otherwise cache the tavern's gross draw.
 */
const CITY_VIEW =
  `<div id="position18" class="position18 building carpentering level50"></div>`;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = CITY_VIEW;
  delete (window as any).ikariam;
});

describe("recordCurrentTown", () => {
  it("snapshots the town on screen from ikariam.model", () => {
    document.body.innerHTML = CITY_VIEW + `<div id="js_cityBread">W-Athens</div>`;
    mockModel(32495, 525);

    const entry = recordCurrentTown(store);
    expect(entry).toMatchObject({ stock: 32495, consume: 525 });
    expect(loadTownStats(store)["W-Athens"]).toMatchObject({
      stock: 32495,
      consume: 525,
    });
  });

  it("normalises a negative wineSpendings to a positive drain", () => {
    document.body.innerHTML = CITY_VIEW + `<div id="js_cityBread">W-Athens</div>`;
    mockModel(1000, -350);
    expect(recordCurrentTown(store)?.consume).toBe(350);
  });

  it("records a town that consumes nothing", () => {
    // 0 is a legitimate value (no tavern), so the guard must test for null
    // rather than falsiness or the town would never be recorded.
    document.body.innerHTML = CITY_VIEW + `<div id="js_cityBread">W-Athens</div>`;
    mockModel(0, 0);
    expect(recordCurrentTown(store)).toMatchObject({ stock: 0, consume: 0 });
  });

  it("records nothing when the model is unavailable", () => {
    document.body.innerHTML = CITY_VIEW + `<div id="js_cityBread">W-Athens</div>`;
    expect(recordCurrentTown(store)).toBeNull();
    expect(loadTownStats(store)).toEqual({});
  });

  it("records nothing when no town is on screen", () => {
    mockModel(1000, 100);
    expect(recordCurrentTown(store)).toBeNull();
  });

  it("overwrites the previous snapshot for the same town", () => {
    document.body.innerHTML = CITY_VIEW + `<div id="js_cityBread">W-Athens</div>`;
    mockModel(1000, 100);
    recordCurrentTown(store);
    mockModel(2000, 100);
    recordCurrentTown(store);
    expect(Object.keys(loadTownStats(store))).toHaveLength(1);
    expect(loadTownStats(store)["W-Athens"].stock).toBe(2000);
  });
});

describe("projectedStats", () => {
  const now = 1_700_000_000_000;

  it("drains the stock forward from when it was recorded", () => {
    // 500/h for 2 hours = 1000 consumed.
    saveTownStats(store, {
      "W-Athens": { stock: 5000, consume: 500, at: now - 2 * 3_600_000 },
    });
    expect(projectedStats(store, "W-Athens", now)?.stock).toBe(4000);
  });

  it("never projects below zero", () => {
    saveTownStats(store, {
      "W-Athens": { stock: 100, consume: 500, at: now - 10 * 3_600_000 },
    });
    expect(projectedStats(store, "W-Athens", now)?.stock).toBe(0);
  });

  it("leaves a fresh snapshot alone", () => {
    saveTownStats(store, {
      "W-Athens": { stock: 5000, consume: 500, at: now },
    });
    expect(projectedStats(store, "W-Athens", now)?.stock).toBe(5000);
  });

  it("reports the consumption unchanged", () => {
    saveTownStats(store, {
      "W-Athens": { stock: 5000, consume: 500, at: now - 3_600_000 },
    });
    expect(projectedStats(store, "W-Athens", now)?.consume).toBe(500);
  });

  it("discards a snapshot past the age limit", () => {
    saveTownStats(store, {
      "W-Athens": { stock: 5000, consume: 0, at: now - MAX_AGE_MS - 1 },
    });
    expect(projectedStats(store, "W-Athens", now)).toBeNull();
  });

  it("trims the town name before looking it up", () => {
    saveTownStats(store, { "W-Athens": { stock: 10, consume: 0, at: now } });
    expect(projectedStats(store, "  W-Athens  ", now)?.stock).toBe(10);
  });

  it("returns null for a town never visited", () => {
    expect(projectedStats(store, "Nowhere", now)).toBeNull();
  });
});

describe("pruneTownStats", () => {
  const now = 1_700_000_000_000;

  it("removes only the expired entries", () => {
    saveTownStats(store, {
      Fresh: { stock: 1, consume: 0, at: now },
      Stale: { stock: 1, consume: 0, at: now - MAX_AGE_MS - 1 },
    });
    expect(pruneTownStats(store, now)).toBe(1);
    expect(Object.keys(loadTownStats(store))).toEqual(["Fresh"]);
  });

  it("clearTownStats empties everything", () => {
    saveTownStats(store, { A: { stock: 1, consume: 0, at: now } });
    clearTownStats(store);
    expect(loadTownStats(store)).toEqual({});
  });
});

describe("name and figures come from one source", () => {
  it(
    "REGRESSION: uses the model's own town name, not the breadcrumb, so a " +
      "mid-swap read cannot file one town's wine under another",
    () => {
      // The breadcrumb still shows the previous town while the model has
      // already moved on — exactly what a view swap looks like in flight.
      document.body.innerHTML = CITY_VIEW + `<div id="js_cityBread">STALE-Corinth</div>`;
      (window as any).ikariam = {
        model: {
          currentResources: { wine: 5000 },
          wineSpendings: 300,
          relatedCityData: {
            selectedCity: "city_1",
            city_1: { id: 1, name: "W-Athens", relationship: "ownCity" },
          },
        },
      };

      recordCurrentTown(store);
      const stats = loadTownStats(store);
      expect(Object.keys(stats)).toEqual(["W-Athens"]);
      expect(stats["W-Athens"].stock).toBe(5000);
      expect(stats["STALE-Corinth"]).toBeUndefined();
    },
  );

  it("falls back to the breadcrumb when the model has no name", () => {
    document.body.innerHTML = CITY_VIEW + `<div id="js_cityBread">W-Athens</div>`;
    mockModel(1234, 100);
    expect(recordCurrentTown(store)?.stock).toBe(1234);
    expect(loadTownStats(store)["W-Athens"]).toBeTruthy();
  });
});
