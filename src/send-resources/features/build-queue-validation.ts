/**
 * Checks on the saved Auto Build queue, kept apart from the code that reads
 * the page and writes storage so every rule can be tested on plain data.
 *
 * What these checks decide gets deleted from the saved queue, and the
 * notepad sync then deletes it on the player's other computers too. So every
 * doubt keeps the entry: an upgrade is only counted as done when its slot
 * was read, holds the same building, and has finished at least that level.
 */

/** A saved upgrade: the slot, and the label of the level it builds. */
export interface SavedUpgrade {
  positionId: string;
  buildingName: string;
}

/** What a town's slot holds now, read from the city view or from the game. */
export interface SlotState {
  positionId: string;
  /** The building's name without its level: `"Tavern"`. */
  name: string;
  /** The level built so far; null when it could not be read. */
  level: number | null;
  /** The next level is being built right now. */
  upgrading: boolean;
}

/**
 * A saved label split into building and level: `"Town Hall 12"` ->
 * `{ name: "Town Hall", level: 12 }`. Null when it does not end in a level.
 */
export function splitUpgradeLabel(
  label: string,
): { name: string; level: number } | null {
  const match = label.trim().match(/^(.*\S)\s+(\d+)$/);
  return match ? { name: match[1], level: Number(match[2]) } : null;
}

/**
 * The saved upgrades whose level the slot has already reached.
 *
 * A level still being built does not count: the game has not finished it,
 * and an entry kept one lap too long costs one look at a busy town, while
 * one removed too early is an upgrade the player never gets.
 *
 * Kept, whatever their level: an upgrade whose slot was not read, whose slot
 * holds another building (the reading may be another town's, or the
 * building was replaced), whose label carries no level, or whose slot's level
 * could not be read. A notepad copy from another computer is named
 * `"Position 9 13"`, which never matches a building, so it is kept too —
 * until `nameNotepadCopies` gives it its building's name.
 */
export function completedUpgrades(
  queue: readonly SavedUpgrade[],
  slots: readonly SlotState[],
): SavedUpgrade[] {
  const slotById = new Map(slots.map((slot) => [slot.positionId, slot]));
  return queue.filter((entry) => {
    const slot = slotById.get(entry.positionId);
    if (!slot || slot.level === null) return false;
    const saved = splitUpgradeLabel(entry.buildingName);
    if (!saved || saved.name !== slot.name.trim()) return false;
    return saved.level <= slot.level;
  });
}

/**
 * Saved upgrades received from the game's notepad, which carries no building
 * names, named after the building their slot holds: `"Position 8 22"` (the
 * label `placeholderLabel(8, 22)` gives) becomes `"Warehouse 22"` when slot 8
 * was read and holds a Warehouse.
 *
 * Unnamed, `completedUpgrades` could never count such an upgrade as done, and
 * a level already built was upgraded once more. Left as it is: an entry that
 * is not a notepad copy, or whose slot was not read or has no name.
 * Returns a new list, and the entries it named.
 */
export function nameNotepadCopies(
  queue: readonly SavedUpgrade[],
  slots: readonly SlotState[],
  placeholderLabel: (slot: number, level: number) => string,
): { queue: SavedUpgrade[]; named: SavedUpgrade[] } {
  const slotById = new Map(slots.map((slot) => [slot.positionId, slot]));
  const named: SavedUpgrade[] = [];
  const renamed = queue.map((entry) => {
    const slotNumber = entry.positionId.match(/\d+/)?.[0];
    const level = splitUpgradeLabel(entry.buildingName)?.level;
    if (slotNumber === undefined || level === undefined) return entry;
    if (entry.buildingName !== placeholderLabel(Number(slotNumber), level)) {
      return entry;
    }
    const name = slotById.get(entry.positionId)?.name.trim();
    if (!name) return entry;
    const result = { ...entry, buildingName: `${name} ${level}` };
    named.push(result);
    return result;
  });
  return { queue: renamed, named };
}

/**
 * Saved towns split by whether the game's town list has them. Only a town
 * the list has can be visited, so only those run; the others keep their
 * saved upgrades.
 *
 * An empty list means the page has none to read, not that every town is
 * gone, so nothing is held back then.
 */
export function splitRunnableTowns<T extends { townName: string }>(
  towns: readonly T[],
  dropdownNames: readonly string[],
): { runnable: T[]; notInDropdown: T[] } {
  if (dropdownNames.length === 0) {
    return { runnable: [...towns], notInDropdown: [] };
  }
  const known = new Set(dropdownNames.map((name) => name.trim()));
  const runnable: T[] = [];
  const notInDropdown: T[] = [];
  for (const town of towns) {
    (known.has(town.townName.trim()) ? runnable : notInDropdown).push(town);
  }
  return { runnable, notInDropdown };
}
