import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calibrateShipCapacity,
  getFreighterCapacity,
  getPerShipCapacity,
  parseUpgradeDesc,
} from "./ship-capacity";

/**
 * Verbatim `.upgrade_desc` text from a live shipyard
 * (tools/output/output3.json). The runs of whitespace are real — the game pads
 * the cells heavily — which is why the parser must not assume single spaces.
 */
const MERCHANT_DESC =
  "Next Level: Superior Stacking (7)                                Cargo space                                    +120                                    ⇒                                    +140";
const FREIGHTER_DESC =
  "Next Level: Superior Loading (7)                                Cargo space                                    +3000                                    ⇒                                    +3500";

function shipyard(merchantDesc: string, freighterDesc: string): string {
  return (
    `<div class="units clearboth"><span title="Merchant Ships"></span>` +
    `<div class="upgrade_desc">${merchantDesc}</div></div>` +
    `<div class="units clearboth"><span title="Freighter"></span>` +
    `<div class="upgrade_desc">${freighterDesc}</div></div>` +
    // Real pages have a dozen other unit blocks; none must be mistaken for these.
    `<div class="units clearboth"><span title="Hoplite"></span>` +
    `<div class="upgrade_desc">Next Level: Something (3) Attack +5 ⇒ +9</div></div>`
  );
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  // happy-dom does not implement `alert`, so assign rather than spy on it.
  (window as any).alert = vi.fn();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("parseUpgradeDesc", () => {
  it("reads the current level as one below the bracketed next level", () => {
    document.body.innerHTML = `<div class="units clearboth"><div class="upgrade_desc">${MERCHANT_DESC}</div></div>`;
    const block = document.querySelector(".units")!;
    expect(parseUpgradeDesc(block).level).toBe(6);
  });

  it("reads the CURRENT bonus, not the next level's", () => {
    document.body.innerHTML = `<div class="units clearboth"><div class="upgrade_desc">${MERCHANT_DESC}</div></div>`;
    const block = document.querySelector(".units")!;
    // "+120 ⇒ +140": the first number is what the unit has today.
    expect(parseUpgradeDesc(block).currentBonus).toBe(120);
  });

  it("handles the freighter's larger numbers", () => {
    document.body.innerHTML = `<div class="units clearboth"><div class="upgrade_desc">${FREIGHTER_DESC}</div></div>`;
    const block = document.querySelector(".units")!;
    expect(parseUpgradeDesc(block)).toEqual({ level: 6, currentBonus: 3000 });
  });

  it("returns nulls when the description is missing", () => {
    document.body.innerHTML = `<div class="units clearboth"></div>`;
    const block = document.querySelector(".units")!;
    expect(parseUpgradeDesc(block)).toEqual({
      level: null,
      currentBonus: null,
    });
  });
});

describe("calibrateShipCapacity", () => {
  it("derives both capacities from a live shipyard", () => {
    document.body.innerHTML = shipyard(MERCHANT_DESC, FREIGHTER_DESC);
    calibrateShipCapacity();

    // 500 base + 120 bonus. The old level maths agrees here (6 x 20 = 120),
    // which is what confirms the constants are right.
    expect(getPerShipCapacity()).toBe(620);
    // 50000 base + 3000 bonus, likewise matching 6 x 500.
    expect(getFreighterCapacity()).toBe(53000);
  });

  it("prefers the printed bonus over the per-level constant", () => {
    // Same level, but the game now grants a different bonus — a rebalance. The
    // level maths would still say 620; the printed bonus is authoritative.
    document.body.innerHTML = shipyard(
      "Next Level: Superior Stacking (7)   Cargo space   +200   ⇒   +260",
      FREIGHTER_DESC,
    );
    calibrateShipCapacity();
    expect(getPerShipCapacity()).toBe(700);
  });

  it("falls back to the level when no bonus is printed", () => {
    document.body.innerHTML = shipyard(
      "Next Level: Superior Stacking (7)",
      FREIGHTER_DESC,
    );
    calibrateShipCapacity();
    expect(getPerShipCapacity()).toBe(500 + 6 * 20);
  });

  it("prefers transportConfig when the Trading Port view supplies it", () => {
    (window as any).transportConfig = {
      maxCapacityPerTransport: 777,
      freighterCapacity: 88888,
    };
    try {
      document.body.innerHTML = "";
      calibrateShipCapacity();
      expect(getPerShipCapacity()).toBe(777);
      expect(getFreighterCapacity()).toBe(88888);
    } finally {
      delete (window as any).transportConfig;
    }
  });

  it("keeps the defaults when nothing can be read", () => {
    document.body.innerHTML = "";
    calibrateShipCapacity();
    expect(getPerShipCapacity()).toBe(500);
    expect(getFreighterCapacity()).toBe(50000);
  });
});
