/**
 * Per-town snapshots of wine stock and consumption.
 *
 * WHY THIS EXISTS
 * Auto Wine needs every town's stock and hourly consumption to work out the
 * split. Until now the only source was the `#ResTab` table — which the game does
 * not render. That table belongs to the Empire Overview userscript, so Auto Wine
 * silently required a second script to be installed AND its board to be open.
 *
 * The game's own `ikariam.model` carries both figures, but only for the town
 * currently on screen. Recording that number every time a town is visited builds
 * the same picture over time, with no dependency on anything else. Visiting all
 * towns is already something the scripts do — the Auto Build "Scan" button walks
 * every town, and every shipment navigates to its source.
 *
 * Entries carry a timestamp so stale data can be aged out and, more usefully,
 * projected forward: a town measured an hour ago with a known drain has a
 * predictable amount left now.
 */

import { getCurrentTownName } from "@core/ikariam/globals";
import {
  modelCurrentCityName,
  modelResource,
  modelWineConsumption,
} from "@core/ikariam/model";
import type { Store } from "@core/storage";

const KEY = "ikaTownStats";

/** Snapshots older than this are ignored outright. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface TownStats {
  /** Wine held when the snapshot was taken. */
  stock: number;
  /** Hourly wine consumption. */
  consume: number;
  /** Epoch ms of the snapshot. */
  at: number;
}

export type TownStatsMap = Record<string, TownStats>;

export function loadTownStats(store: Store): TownStatsMap {
  return store.getJSON<TownStatsMap>(KEY, {});
}

export function saveTownStats(store: Store, stats: TownStatsMap): void {
  store.setJSON(KEY, stats);
}

/**
 * Record the town currently on screen, if the model can be read.
 * Returns the stored snapshot, or `null` when there was nothing to record.
 */
export function recordCurrentTown(store: Store): TownStats | null {
  // Name and figures must come from the SAME source. The breadcrumb is only a
  // fallback for when the model has no name — pairing a DOM-read name with
  // model-read numbers can attribute one town's wine to another during a view
  // swap, and this cache is exactly what Auto Wine plans against.
  const townName = (modelCurrentCityName() ?? getCurrentTownName()).trim();
  if (!townName) return null;

  const stock = modelResource("wine");
  const consume = modelWineConsumption();
  // Consumption of 0 is legitimate (a town with no tavern), stock of 0 too —
  // so test for null rather than falsiness.
  if (stock === null || consume === null) return null;

  const stats = loadTownStats(store);
  const entry: TownStats = { stock, consume, at: Date.now() };
  stats[townName] = entry;
  saveTownStats(store, stats);
  return entry;
}

/**
 * Snapshot for one town, with its stock projected forward to now.
 *
 * A town measured 40 minutes ago that drains 500/h has roughly 333 less than it
 * did. Projecting keeps a slightly old reading useful instead of discarding it;
 * the result is clamped at zero because a town cannot hold negative wine.
 *
 * Production is deliberately NOT modelled: the game's `wineSpendings` is the net
 * drain for a consuming town, and wine-producing towns are the sources rather
 * than the receivers, so the projection is only ever applied where it holds.
 */
export function projectedStats(
  store: Store,
  townName: string,
  now = Date.now(),
): TownStats | null {
  const entry = loadTownStats(store)[townName.trim()];
  if (!entry) return null;

  const age = now - entry.at;
  if (age > MAX_AGE_MS) return null;

  const drained = (entry.consume * age) / 3_600_000;
  return {
    stock: Math.max(0, Math.round(entry.stock - drained)),
    consume: entry.consume,
    at: entry.at,
  };
}

/** Drop snapshots past `MAX_AGE_MS`. Returns how many were removed. */
export function pruneTownStats(store: Store, now = Date.now()): number {
  const stats = loadTownStats(store);
  let removed = 0;
  for (const [townName, entry] of Object.entries(stats)) {
    if (now - entry.at > MAX_AGE_MS) {
      delete stats[townName];
      removed++;
    }
  }
  if (removed) saveTownStats(store, stats);
  return removed;
}

export function clearTownStats(store: Store): void {
  saveTownStats(store, {});
}
