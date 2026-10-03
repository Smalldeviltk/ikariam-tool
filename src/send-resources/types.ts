/** Types specific to Send Resources. */

import { RESOURCE_LABEL } from "./messages";

/** Resource ids exactly as the game uses them in `#textfield_<resource>`. */
export type ResourceId = "wood" | "wine" | "marble" | "glass" | "sulfur";

export const RESOURCE_OPTIONS: ReadonlyArray<{
  value: ResourceId;
  label: string;
}> = (["wood", "wine", "marble", "glass", "sulfur"] as const).map((value) => ({
  value,
  label: RESOURCE_LABEL[value],
}));

/** The on-screen name of a resource id, or the id itself when unknown. */
export function resourceLabel(resource: string): string {
  return RESOURCE_LABEL[resource as ResourceId] ?? resource;
}

/** One town in the town-picker dropdown. */
export interface TownEntry {
  /** Ordinal the player prefixes to the name, e.g. `"3-Athens"` -> 3. */
  index: number;
  /** Position in the dropdown — the index the game uses for navigation. */
  townNumber: number;
  townName: string;
}

/** A wine-receiving town and its hourly consumption. */
export interface WineReceiver {
  townNumber: string;
  winePerHour: string;
}

/** One row of the multi-account summary table. */
export interface AccountSummary {
  account: string;
  /** Epoch ms at which this account's build queue finishes. */
  time: number;
  totalWood?: string;
  timeWood?: number;
  woodIncome?: string;
  isAutoBuildChecked?: boolean;
  /**
   * The server's construction-time buff for this account, in percent (36
   * means 36%). Entered by the player; the Empire Overview board reads it
   * (`accountBuildTimeBuff` in `core/storage.ts`).
   */
  buildTimeBuffPercent?: number;
}

/** Building upgrade queue, nested account -> town. */
export interface AutoBuildEntry {
  positionId: string;
  buildingName: string;
}

export interface AutoBuildTown {
  townName: string;
  queue: AutoBuildEntry[];
}

export interface AutoBuildAccount {
  accountName: string;
  townList: AutoBuildTown[];
}
