/**
 * The game's live counters.
 *
 * Two sources:
 *
 *  1. `ikariam.model` — the game's own state object. Stable, because the
 *     game's own code depends on its shape. Reading it rather than scraping
 *     was learned from the IkaEasy extension, which never scrapes at all.
 *  2. The rendered DOM — what the original scripts used exclusively, and what
 *     breaks whenever Gameforge reworks the markup.
 *
 * The model comes first for anything describing the CURRENT TOWN, which is
 * what the model is about.
 *
 * It does NOT come first for the three global-menu counters — see
 * `getFreeShips`. The model is view-scoped and reports 0 for those from a
 * city view, and 0 wins through a `??`.
 *
 * Kept separate from the feature modules to avoid an import cycle —
 * `send-resources.ts` and `auto-wine.ts` both need these and reference each other.
 */

import { qs, readNumberOrNull } from "@core/dom";
import { SEL } from "@core/ikariam/selectors";
import {
  modelActionPoints,
  modelFreeFreighters,
  modelFreeTransporters,
  modelResource,
} from "@core/ikariam/model";

/** `"12,345"` / `"12.3k"` -> number. */
export function parseAmount(text: string | null | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/,/g, "").replace(/\s/g, "").trim();
  if (/k$/i.test(clean)) return Math.round(parseFloat(clean) * 1000);
  const parsed = parseFloat(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Idle merchant ships and freighters.
 *
 * THE GLOBAL MENU WINS HERE, against the model-first rule the rest of this
 * file follows. Those three counters live in the game's own header, which is
 * rendered on every page and refreshed by the game on every ajax response —
 * they are literally the numbers the player is looking at.
 *
 * `ikariam.model`, by contrast, describes the current VIEW. Seen live: with
 * 227 merchants and 5 freighters idle and both shown correctly in the header,
 * Auto Wine refused to start with "Not enough ships!" — the model reported 0
 * from a city view, and 0 is a finite number, so it won through the `??` and
 * no fallback ever happened.
 *
 * The model stays as the fallback for the case the DOM route was added to
 * survive: markup that moves or disappears.
 */
export function getFreeShips(): { merchants: number; freighters: number } {
  return {
    merchants:
      readNumberOrNull(SEL.globalMenu.freeTransporters) ??
      modelFreeTransporters() ??
      0,
    freighters:
      readNumberOrNull(SEL.globalMenu.freeFreighters) ??
      modelFreeFreighters() ??
      0,
  };
}

/** Remaining action points. Same reasoning as `getFreeShips`. */
export function getActionPoints(): number {
  return (
    readNumberOrNull(SEL.globalMenu.maxActionPoints) ?? modelActionPoints() ?? 0
  );
}

/**
 * Wine held by the town currently open.
 *
 * The model carries the exact figure. The menu bar rounds to `"12.3k"` above
 * ~10,000, so the DOM route can be off by up to 50 — which matters when the
 * reserve is being computed down to the unit.
 */
export function readCurrentWine(): number {
  return (
    modelResource("wine") ?? parseAmount(qs(SEL.globalMenu.wine)?.textContent)
  );
}
