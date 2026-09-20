/**
 * Typed access to `ikariam.model`, the game's own state object.
 *
 * WHY
 * Everything in these scripts historically came from scraping rendered HTML:
 * ship counts from `#js_GlobalMenu_freeTransporters`, wine from
 * `#js_GlobalMenu_wine`, and per-town figures from a table another userscript
 * happens to draw. All of that breaks whenever Gameforge touches the markup.
 *
 * The game already keeps the same numbers in a plain object. The IkaEasy
 * extension (`sample/IkaEasy-V3-Chrome-Web-Store/inner/ikaeasy.js`) reads
 * exclusively from there, which is far more stable — the shape of
 * `ikariam.model` has to stay put for the game's own code to work.
 *
 * Every accessor here returns `null` when the model is unavailable, so callers
 * can fall back to the old DOM route rather than failing outright.
 */

import { qs } from "../dom";
import { pageWindow } from "./globals";
import { SEL } from "./selectors";

/** One entry of `model.relatedCityData`, keyed as `city_<id>`. */
export interface RelatedCity {
  id: number | string;
  name: string;
  /** Rendered as `"[12:34]"`. */
  coords: string;
  /** `ownCity` | `deployedCities` | `occupiedCities` | ... */
  relationship: string;
  tradegood: number | string;
  [key: string]: unknown;
}

/**
 * The subset of `ikariam.model` these scripts use.
 *
 * Field names come from the game itself; see the IkaEasy `_updateResources`
 * payload for the full list it forwards.
 */
export interface IkariamModel {
  /** Current town's stock, keyed by resource name and by numeric id. */
  currentResources?: Record<string, number>;
  /** Current town's hourly wine consumption. */
  wineSpendings?: number;
  /** Idle merchant ships. */
  freeTransporters?: number;
  /** Idle freighters. Newer addition; not always present. */
  freeFreighters?: number;
  maxActionPoints?: number;
  maxResources?: Record<string, number>;
  /** Every town this account can see, plus a `selectedCity` marker. */
  relatedCityData?: Record<string, RelatedCity | string>;
  producedTradegood?: number | string;
  tradegoodProduction?: number;
  resourceProduction?: number;
  actionRequest?: string;
  isOwnCity?: boolean;
  avatarId?: number | string;
  serverName?: string;
  requestTime?: number;
  [key: string]: unknown;
}

export function getModel(): IkariamModel | null {
  const model = (pageWindow.ikariam as { model?: IkariamModel } | undefined)
    ?.model;
  return model && typeof model === "object" ? model : null;
}

/** Whether the model is readable at all. */
export function hasModel(): boolean {
  return getModel() !== null;
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/** Idle merchant ships, or `null` when the model cannot say. */
export function modelFreeTransporters(): number | null {
  return numberOrNull(getModel()?.freeTransporters);
}

/**
 * Idle freighters, or `null`.
 *
 * Freighters are a later addition to the game and the model does not always
 * carry them, which is why the DOM fallback is kept for this one.
 */
export function modelFreeFreighters(): number | null {
  return numberOrNull(getModel()?.freeFreighters);
}

export function modelActionPoints(): number | null {
  return numberOrNull(getModel()?.maxActionPoints);
}

/** Current town's stock of one resource. */
export function modelResource(resource: string): number | null {
  const resources = getModel()?.currentResources;
  if (!resources) return null;
  return numberOrNull(resources[resource]);
}

/**
 * Level of this town's Wine Press, 0 when it has none, or null when the page
 * is not showing a city view and therefore cannot be asked.
 *
 * Read from the DOM rather than the model because the model is not known to
 * carry it. The city view marks the slot with the building's own class and its
 * level, which is how the crawler already identifies buildings (`SEL.buildings`).
 * The slot number varies between towns, so only the class is matched.
 */
export function winePressLevel(): number | null {
  // No building slots at all means this is not the city view, so the press
  // cannot be read. That is NOT the same as a town without one, and the
  // difference matters: treating it as "no press" would quietly record the
  // gross figure, which is the bug this function exists to stop.
  if (!qs(SEL.buildings)) return null;

  const press = qs(SEL.winePress);
  if (!press) return 0;
  const match = /\blevel(\d+)\b/.exec(press.className);
  return match ? Number(match[1]) : 0;
}

/**
 * Current town's hourly wine consumption, as a positive number.
 *
 * NET of the Wine Press, which is NOT what `model.wineSpendings` reports.
 *
 * This was wrong until it was measured. `wineSpendings` is the tavern's GROSS
 * draw: on the account this was found on it read 933 while the town actually
 * spent 560, the game's own tooltip saying "The wine press saves you 373.20
 * wine per hour". 933 is `BuildingData.tavern.wineUse[42]`, the gross figure
 * for a level 42 tavern, and 373.20 is exactly 40% of it — the town's press is
 * level 40.
 *
 * So the press takes one percent per level off the tavern's draw, which is the
 * same formula the Empire Overview board has always applied
 * (`empire-overview/models/city.ts`, `updateCityDataFromAjax`). Only the
 * callers of this function were reading the raw figure.
 */
export function modelWineConsumption(): number | null {
  const spendings = numberOrNull(getModel()?.wineSpendings);
  if (spendings === null) return null;

  // Null means the press could not be read, so the net figure cannot be worked
  // out. Recording nothing beats recording a number that is 40% too high.
  const press = winePressLevel();
  if (press === null) return null;

  const level = Math.min(100, Math.max(0, press));
  return (Math.abs(spendings) * (100 - level)) / 100;
}

/** Numeric id of the town currently open. */
export function modelCurrentCityId(): number | null {
  const related = getModel()?.relatedCityData;
  const selected = related?.selectedCity;
  if (typeof selected !== "string") return null;
  return numberOrNull(selected.replace("city_", ""));
}

/**
 * Name of the town currently open, taken from the model.
 *
 * Prefer this over the `#js_cityBread` breadcrumb whenever it is being paired
 * with other model values. The DOM and the model are updated by separate steps
 * of the game's view swap, so a read that lands in between can pair one town's
 * name with another town's resources — which would poison the town cache with
 * wine figures attributed to the wrong town. Reading both from the same model
 * snapshot cannot disagree with itself.
 */
export function modelCurrentCityName(): string | null {
  const related = getModel()?.relatedCityData;
  const selected = related?.selectedCity;
  if (!related || typeof selected !== "string") return null;
  const city = related[selected];
  if (typeof city !== "object" || city === null) return null;
  const name = (city as RelatedCity).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** Every town owned by this account. */
export function modelOwnCities(): RelatedCity[] {
  const related = getModel()?.relatedCityData;
  if (!related) return [];
  return Object.entries(related)
    .filter(([key]) => key.startsWith("city_"))
    .map(([, value]) => value)
    .filter(
      (city): city is RelatedCity =>
        typeof city === "object" &&
        city !== null &&
        (city as RelatedCity).relationship === "ownCity",
    );
}

/**
 * Parse `"[12:34]"` into coordinates.
 *
 * Note the `g` flag: a single-group match returns `[whole, group]`, and with one
 * group both entries are the SAME number — the exact bug found in the ported
 * `parsePremium`, where every town's Y silently became a copy of its X.
 */
export function parseCoords(
  coords: string | undefined,
): { x: number; y: number } | null {
  const found = coords?.match(/\d+/g);
  if (!found || found.length < 2) return null;
  return { x: parseInt(found[0], 10), y: parseInt(found[1], 10) };
}
