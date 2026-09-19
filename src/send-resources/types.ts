/** Types specific to Send Resources. */

/** Resource ids exactly as the game uses them in `#textfield_<resource>`. */
export type ResourceId = "wood" | "wine" | "marble" | "glass" | "sulfur";

export const RESOURCE_OPTIONS: ReadonlyArray<{
  value: ResourceId;
  label: string;
}> = [
  { value: "wood", label: "Wood" },
  { value: "wine", label: "Wine" },
  { value: "marble", label: "Marble" },
  // The game calls crystal "glass" in the DOM but shows "Crystal" in the UI.
  { value: "glass", label: "Crystal" },
  { value: "sulfur", label: "Sulfur" },
];

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
