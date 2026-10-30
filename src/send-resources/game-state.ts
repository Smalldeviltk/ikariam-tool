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
import { parseGameNumber } from "@core/format";
import { SEL } from "@core/ikariam/selectors";
import { empireKeyPrefix } from "@core/storage";
import {
  modelActionPoints,
  modelFreeFreighters,
  modelFreeTransporters,
  modelResource,
} from "@core/ikariam/model";

/**
 * `"12,345"` / `"12.3k"` -> number, and 0 for anything unreadable.
 *
 * The parsing is `parseGameNumber`'s; this only settles "unreadable" as 0,
 * which is what a displayed amount wants.
 */
export function parseAmount(text: string | null | undefined): number {
  return parseGameNumber(text) ?? 0;
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

/**
 * Stock of any resource in the town currently open, read the same way as
 * `readCurrentWine`: the model's exact figure, else the menu bar's rounded
 * one, else 0.
 */
export function readCurrentStock(resource: string): number {
  return (
    modelResource(resource) ??
    parseAmount(qs(SEL.globalMenu.resource(resource))?.textContent)
  );
}

/** Empire Overview's saved towns, under its account prefix. */
const EMPIRE_CITIES_KEY = "cities";

/**
 * A town's stock of one resource as Empire Overview last saved it, or `null`
 * when it saved nothing for that town.
 *
 * Send Resources' own town cache holds wine only, and Scan asks the game for
 * every town without opening it, so the other towns' stocks land on the board
 * alone: its response hook records each town Scan fetches and saves them all
 * as `***<account>***cities` (`empire-overview/database.ts`), keyed by city
 * id, each with `_resources.<resource>._current`. The two scripts share no
 * module, only the page's localStorage. The figure is as of that save, not
 * projected forward.
 */
export function readStoredStock(
  accountName: string,
  cityId: string,
  resource: string,
): number | null {
  let cities: unknown;
  try {
    cities = JSON.parse(
      localStorage.getItem(empireKeyPrefix(accountName) + EMPIRE_CITIES_KEY) ??
        "null",
    );
  } catch {
    return null;
  }
  const current = (
    cities as Record<
      string,
      { _resources?: Record<string, { _current?: unknown }> } | undefined
    > | null
  )?.[cityId]?._resources?.[resource]?._current;
  return typeof current === "number" && Number.isFinite(current)
    ? Math.floor(current)
    : null;
}
