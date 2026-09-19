import { describe, expect, it } from "vitest";
import { distributeWine, type WineTown } from "./wine-distribution";

function town(
  name: string,
  stock: number,
  consume: number,
  townNumber = name,
): WineTown {
  return { townNumber, townName: name, stock, consume };
}

/** The worked example from `sample/wine-distribution.js`. */
const SAMPLE_TOWNS: WineTown[] = [
  town("M-Corinth", 32495, 525),
  town("M-Aegina", 26612, 430),
  town("M-Rhodes", 30384, 491),
  town("C-Thebes", 15100, 244),
  town("S-Sparta", 21657, 350),
  town("M-Syracuse", 49664, 560),
  town("M-Argos", 21658, 350),
];
const SAMPLE_SUPPLY = 31000;

describe("distributeWine", () => {
  it("never allocates more than the available supply", () => {
    const result = distributeWine(SAMPLE_TOWNS, SAMPLE_SUPPLY);
    expect(result.used).toBeLessThanOrEqual(SAMPLE_SUPPLY);
  });

  it("allocations sum exactly to `used`, and used + unused == supply", () => {
    const result = distributeWine(SAMPLE_TOWNS, SAMPLE_SUPPLY);
    const sum = result.allocations.reduce((total, a) => total + a.add, 0);
    expect(sum).toBe(result.used);
    expect(result.used + result.unused).toBe(SAMPLE_SUPPLY);
  });

  it("never produces a negative allocation", () => {
    const result = distributeWine(SAMPLE_TOWNS, SAMPLE_SUPPLY);
    expect(result.allocations.every((a) => a.add >= 0)).toBe(true);
  });

  it("levels every topped-up town to the same hours remaining", () => {
    const result = distributeWine(SAMPLE_TOWNS, SAMPLE_SUPPLY);
    const hours = result.allocations
      .filter((a) => a.add > 0)
      .map((a) => a.finalHours);
    // Within one hour: integer rounding prevents an exact match.
    expect(Math.max(...hours) - Math.min(...hours)).toBeLessThan(1);
  });

  it(
    "excludes an already over-supplied town and recomputes the target " +
      "(the case `sample/wine-distribution-2.js` gets wrong)",
    () => {
      const result = distributeWine(SAMPLE_TOWNS, SAMPLE_SUPPLY);
      const syracuse = result.allocations.find(
        (a) => a.townName === "M-Syracuse",
      );

      // Syracuse holds ~88.7h, well past the ~74.9h target, so it gets nothing.
      expect(syracuse?.add).toBe(0);
      expect(result.targetHours).toBeGreaterThan(74);
      expect(result.targetHours).toBeLessThan(76);

      // The naive `Math.max(0, ...)` version would demand 37,271 here.
      expect(result.used).toBe(SAMPLE_SUPPLY);
    },
  );

  it("gives the whole supply to the needy town when another is over-supplied", () => {
    const result = distributeWine(
      [town("Starving", 100, 500), town("Flooded", 900_000, 100)],
      10_000,
    );
    expect(result.allocations.find((a) => a.townName === "Starving")?.add).toBe(
      10_000,
    );
    expect(result.allocations.find((a) => a.townName === "Flooded")?.add).toBe(
      0,
    );
    expect(result.used + result.unused).toBe(10_000);
  });

  it("splits evenly between towns that are already equally stocked", () => {
    // "Over-supplied" is relative, not absolute: with identical towns there is
    // no town to level up towards, so the supply simply raises them both.
    const result = distributeWine(
      [town("A", 100_000, 10), town("B", 100_000, 10)],
      5_000,
    );
    expect(result.allocations.map((a) => a.add)).toEqual([2_500, 2_500]);
    expect(result.used).toBe(5_000);
  });

  it("spends the whole supply whenever at least one town consumes", () => {
    // The target is a consumption-weighted average of current hours PLUS
    // supply/Σconsume, so it always exceeds the least-stocked town's hours.
    // At least one town is therefore always below target and the supply is
    // fully spent (bar integer rounding).
    for (const supply of [1, 999, 31_000, 250_000]) {
      const result = distributeWine(SAMPLE_TOWNS, supply);
      expect(result.used).toBe(supply);
      expect(result.unused).toBe(0);
    }
  });

  it("ignores towns that consume nothing", () => {
    const result = distributeWine(
      [town("Consumer", 0, 100), town("Idle", 0, 0)],
      1_000,
    );
    expect(result.allocations.find((a) => a.townName === "Idle")?.add).toBe(0);
    expect(result.allocations.find((a) => a.townName === "Consumer")?.add).toBe(
      1_000,
    );
  });

  it("handles an empty town list and a zero supply", () => {
    expect(distributeWine([], 1000).used).toBe(0);
    expect(distributeWine(SAMPLE_TOWNS, 0).used).toBe(0);
    expect(distributeWine(SAMPLE_TOWNS, -5).unused).toBe(0);
  });

  it("returns integer allocations only", () => {
    const result = distributeWine(SAMPLE_TOWNS, 12_345);
    expect(result.allocations.every((a) => Number.isInteger(a.add))).toBe(true);
  });
});
