/**
 * Merchant ship and freighter cargo capacity.
 *
 * The game does not expose these numbers in any stable place, so the original
 * measured them once via the "Calibrate Cargo" button and cached the result in
 * localStorage. Both measurement sources and both fallbacks are preserved.
 */

import { qs, qsa } from "@core/dom";
import { getTransportConfig } from "@core/ikariam/globals";
import { SEL } from "@core/ikariam/selectors";
import { FLAG, getFlag, setFlag } from "./state";

/** Merchant ship capacity at research level 0. */
const BASE_MERCHANT_CAPACITY = 500;
/** Extra capacity per merchant-ship upgrade level. */
const MERCHANT_CAPACITY_PER_LEVEL = 20;

const BASE_FREIGHTER_CAPACITY = 50000;
const FREIGHTER_CAPACITY_PER_LEVEL = 500;

function readCalibrated(key: string, fallback: number): number {
  const saved = parseInt(getFlag(key) ?? "0", 10);
  return Number.isFinite(saved) && saved > 0 ? saved : fallback;
}

export function getPerShipCapacity(): number {
  return readCalibrated(FLAG.perShipCapacity, BASE_MERCHANT_CAPACITY);
}

export function getFreighterCapacity(): number {
  return readCalibrated(FLAG.freighterCapacity, BASE_FREIGHTER_CAPACITY);
}

export interface UpgradeInfo {
  /** Current research level, or `null` if it could not be read. */
  level: number | null;
  /** Cargo bonus the unit already has, or `null`. */
  currentBonus: number | null;
}

/**
 * Parse a shipyard upgrade description.
 *
 * Real text from a live page:
 *
 *   "Next Level: Superior Stacking (7)   Cargo space   +120   ⇒   +140"
 *   "Next Level: Superior Loading (7)    Cargo space   +3000  ⇒   +3500"
 *
 * Two numbers can be recovered:
 *
 *  - the bracketed level, which is the level being upgraded TO, so the current
 *    level is one less;
 *  - the FIRST `+N`, which is the bonus the unit already has (the second is
 *    what the next level would give).
 *
 * The bonus is preferred. The original only read the level and multiplied by a
 * hard-coded per-level constant; that happens to agree today (level 6 × 20 =
 * 120, and 6 × 500 = 3000, both matching the live values above) but it silently
 * goes wrong the moment Gameforge rebalances an upgrade. The printed bonus
 * cannot drift.
 */
export function parseUpgradeDesc(block: Element): UpgradeInfo {
  const text = qs(SEL.upgradeDesc, block)?.textContent?.trim() ?? "";
  const levelMatch = text.match(/\((\d+)\)/);
  const bonusMatch = text.match(/\+\s*(\d+)/);
  return {
    level: levelMatch ? parseInt(levelMatch[1], 10) - 1 : null,
    currentBonus: bonusMatch ? parseInt(bonusMatch[1], 10) : null,
  };
}

/** Capacity from an upgrade block: printed bonus first, level maths as fallback. */
function capacityFrom(
  block: Element,
  base: number,
  perLevel: number,
): number | null {
  const { level, currentBonus } = parseUpgradeDesc(block);
  if (currentBonus !== null) return base + currentBonus;
  if (level !== null) return base + level * perLevel;
  return null;
}

/**
 * Measure cargo capacity and store it.
 *
 * Two sources, tried in order (the later overrides the earlier, as in the
 * original):
 *  1. `transportConfig` — only present while the Trading Port view is open.
 *  2. Shipyard DOM — read the research level and compute.
 */
export function calibrateShipCapacity(): void {
  let perShip: number | null = null;
  let freighterCapacity: number | null = null;

  // Source 1: Trading Port
  try {
    const config = getTransportConfig();
    if (config) {
      if (config.maxCapacityPerTransport) {
        perShip = parseInt(String(config.maxCapacityPerTransport), 10);
      }
      if (config.freighterCapacity) {
        freighterCapacity = parseInt(String(config.freighterCapacity), 10);
      }
    }
  } catch (e) {
    console.warn("Could not read transportConfig:", e);
  }

  // Source 2: Shipyard
  try {
    // A live shipyard has 12 unit blocks; exactly one matches each title.
    for (const block of qsa(SEL.unitBlocks)) {
      if (qs(SEL.merchantShipTitle, block)) {
        perShip =
          capacityFrom(
            block,
            BASE_MERCHANT_CAPACITY,
            MERCHANT_CAPACITY_PER_LEVEL,
          ) ?? perShip;
      }
      if (qs(SEL.freighterTitle, block)) {
        freighterCapacity =
          capacityFrom(
            block,
            BASE_FREIGHTER_CAPACITY,
            FREIGHTER_CAPACITY_PER_LEVEL,
          ) ?? freighterCapacity;
      }
    }
  } catch (e) {
    console.warn("Could not parse the shipyard DOM:", e);
  }

  if (perShip) setFlag(FLAG.perShipCapacity, perShip);
  if (freighterCapacity) setFlag(FLAG.freighterCapacity, freighterCapacity);

  if (perShip || freighterCapacity) {
    alert(
      "Calibrated!\n" +
        (perShip ? `Merchant Ship: ${perShip}` : "") +
        (freighterCapacity ? `\nFreighter: ${freighterCapacity}` : ""),
    );
    console.log(
      "ika_perShipCapacity =",
      perShip,
      "ika_freighterCapacity =",
      freighterCapacity,
    );
  } else {
    alert(
      "Could not read cargo capacity. Open the Trading Port or the Shipyard, then click again.",
    );
  }
}
