/**
 * Load every town's data by asking the game, instead of walking to each one.
 *
 * WHAT THIS REPLACES
 * `scanBuildings` clicks a town, polls the breadcrumb until it changes, waits
 * for the page to settle, and repeats. Measured on the live game from the ajax
 * trace: 2367 ms per town, so about 21 seconds for nine — with the player's
 * view jumping around throughout, and the task runner forced to stand aside
 * because two things cannot steer the page at once.
 *
 * A request for the same data took 328 ms and 841 ms across two probe runs, and
 * moves nothing on screen. See `docs/improvement-plan.md` §1 for the capture.
 *
 * DOES ASKING FOR A TOWN SELECT IT?
 * Measured, on the live game: no, not in the client's model. Standing in
 * W-Athens (297034), a probe fetched M-Aegina (297036) and
 * `relatedCityData.selectedCity` read `city_297034` both before and after.
 *
 * That is the value `modelCurrentCityId` reads, so the restore below will
 * normally never fire. It is kept anyway, for two reasons: nothing here
 * applies responses to `ikariam.model`, so the measurement only proves the
 * client's copy is untouched rather than the server's; and a future handler
 * that does apply them would change the answer. The guard costs one
 * comparison when it does not fire.
 */

import { logInfo } from "@core/logger";
import { fetchTown } from "@core/ikariam/http";
import { modelCurrentCityId, modelOwnCities } from "@core/ikariam/model";

export interface SyncResult {
  /** Towns whose data came back. */
  synced: number;
  /** Towns that were asked for but failed, by id. */
  failed: number[];
  /** Whether the server's selected town moved while we were asking. */
  selectionMoved: boolean;
  elapsedMs: number;
}

/** Ids of every town this account owns, from the game's own model. */
export function ownTownIds(): number[] {
  return modelOwnCities()
    .map((city) => Number(city.id))
    .filter((id) => Number.isFinite(id));
}

/**
 * Refresh every town.
 *
 * Failures are per-town: one unreachable town does not abandon the rest. That
 * is the same lesson as the walking version, where a single `gotoTown` throw
 * used to abort the whole scan into an unhandled promise.
 */
export async function syncAllTowns(): Promise<SyncResult> {
  const startedAt = Date.now();
  const ids = ownTownIds();
  const before = modelCurrentCityId();

  const failed: number[] = [];
  let synced = 0;

  for (const id of ids) {
    try {
      await fetchTown(id);
      synced++;
    } catch (e) {
      failed.push(id);
      logInfo(`Sync: town ${id} failed - ${(e as Error)?.message ?? e}`);
    }
  }

  // Put the selection back if asking moved it. Harmless when it did not: the
  // condition is false and nothing is sent.
  const after = modelCurrentCityId();
  const selectionMoved = before !== null && after !== null && before !== after;
  if (selectionMoved) {
    try {
      await fetchTown(before);
    } catch (e) {
      logInfo(
        `Sync: could not return to town ${before} - ${(e as Error)?.message ?? e}`,
      );
    }
  }

  return {
    synced,
    failed,
    selectionMoved,
    elapsedMs: Date.now() - startedAt,
  };
}
