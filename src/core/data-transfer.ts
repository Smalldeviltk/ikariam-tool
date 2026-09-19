/**
 * Export and import of this project's localStorage data.
 *
 * WHY
 * The two artefacts are deployed to different browsers — the userscripts to
 * Edge, the extension to Chrome — and `localStorage` is scoped per origin **per
 * browser profile**. There is no channel between them: no shared storage, no
 * sync API that spans vendors, nothing a page-context script could reach even
 * if there were. Moving a JSON file by hand is the only mechanism that does not
 * require a server.
 *
 * WHAT MOVES, AND WHAT DOES NOT
 * Not all stored data should travel, so keys are classified:
 *
 *  - `config`       — settings you would hate to retype: wine senders and
 *                     receivers, the building queue, calibrated cargo capacity,
 *                     Empire Overview's own board settings. Portable.
 *  - `measurements` — the town cache. Observations about the game world, equally
 *                     true in either browser, and having them means Auto Wine
 *                     works immediately instead of after a tour of every town.
 *  - `runtime`      — in-flight work: the task queue, "is automation running"
 *                     flags. NOT exported by default. See the warning below.
 *  - `diagnostics`  — logs, bug reports, crawler captures. Local noise; the bug
 *                     reporter has its own export.
 *
 * ⚠ Runtime state is excluded on purpose. Copying a half-finished queue into a
 * second browser gives two installations the same orders against ONE game
 * account. The whole point of the unified task queue is that exactly one action
 * touches the game at a time, and that guarantee cannot span browsers — there is
 * no lock to take. Two runners would double-send resources and fight over the
 * same DOM, which is the class of bug this project exists to have removed.
 */

/** Bumped when the envelope shape changes incompatibly. */
export const TRANSFER_FORMAT = "ikariam-tool/data";
export const TRANSFER_VERSION = 1;

export type DataGroup = "config" | "measurements" | "runtime" | "diagnostics";

/** Groups included when nothing is specified. */
export const DEFAULT_GROUPS: DataGroup[] = ["config", "measurements"];

/** Keys with no account prefix. */
const GLOBAL_KEYS: Record<string, DataGroup> = {
  listAutoBuild: "config",
  ika_perShipCapacity: "config",
  ika_freighterCapacity: "config",
  isSendResourceHidden: "config",

  listAccount: "measurements",

  isAutoBuildStart: "runtime",
  isAutoReload: "runtime",
  reloadedMinute: "runtime",

  loggerInfo: "diagnostics",
  ikaBugReports: "diagnostics",
  ikaDomReports: "diagnostics",
};

/**
 * Keys stored as `<accountName><suffix>` by `accountStore`.
 *
 * Matched by suffix because the prefix is the account name, which can be
 * anything. Longest suffix wins, so `listReceiver` is not mistaken for a key
 * ending in `receiver`.
 */
const ACCOUNT_SUFFIXES: Record<string, DataGroup> = {
  listSender: "config",
  listReceiver: "config",
  ikaTownStats: "measurements",
  ikaGlobalTaskQueue: "runtime",
  resource: "runtime",
};

/** Empire Overview stores its own settings as `***<account>***<key>`. */
const EMPIRE_PREFIX_PATTERN = /^\*\*\*.*\*\*\*/;

export interface ClassifiedKey {
  key: string;
  group: DataGroup;
  /** `null` for global keys. */
  account: string | null;
  /** The part after the account prefix, for remapping between accounts. */
  suffix: string;
}

/** Work out what a stored key is, or `null` if it is not ours. */
export function classifyKey(key: string): ClassifiedKey | null {
  const globalGroup = GLOBAL_KEYS[key];
  if (globalGroup) {
    return { key, group: globalGroup, account: null, suffix: key };
  }

  if (EMPIRE_PREFIX_PATTERN.test(key)) {
    const match = key.match(/^\*\*\*(.*?)\*\*\*(.*)$/);
    if (match) {
      return {
        key,
        // Empire Overview only stores board settings and cached game data here.
        group: "config",
        account: match[1],
        suffix: match[2],
      };
    }
  }

  // Longest suffix first so `listReceiver` beats a shorter accidental match.
  const suffixes = Object.keys(ACCOUNT_SUFFIXES).sort(
    (a, b) => b.length - a.length,
  );
  for (const suffix of suffixes) {
    if (key.length > suffix.length && key.endsWith(suffix)) {
      return {
        key,
        group: ACCOUNT_SUFFIXES[suffix],
        account: key.slice(0, -suffix.length),
        suffix,
      };
    }
  }
  return null;
}

export interface TransferEntry {
  key: string;
  group: DataGroup;
  account: string | null;
  suffix: string;
  value: string;
}

export interface TransferBundle {
  format: typeof TRANSFER_FORMAT;
  version: number;
  exportedAt: string;
  /** Account the export was taken from, for a mismatch warning on import. */
  account: string | null;
  groups: DataGroup[];
  entries: TransferEntry[];
}

export interface ExportOptions {
  groups?: DataGroup[];
  /** Restrict to one account's data; global keys are always included. */
  account?: string | null;
}

export function exportData(options: ExportOptions = {}): TransferBundle {
  const groups = options.groups ?? DEFAULT_GROUPS;
  const entries: TransferEntry[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const classified = classifyKey(key);
    if (!classified || !groups.includes(classified.group)) continue;
    if (
      options.account !== undefined &&
      classified.account !== null &&
      classified.account !== options.account
    ) {
      continue;
    }
    const value = localStorage.getItem(key);
    if (value === null) continue;
    entries.push({ ...classified, value });
  }

  return {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    account: options.account ?? null,
    groups,
    entries,
  };
}

export interface ImportOptions {
  groups?: DataGroup[];
  /**
   * Rewrite account-scoped keys onto this account.
   *
   * Normally unnecessary — both browsers play the same game account, so the
   * prefixes already match. It exists for the case where they do not, because
   * importing `AliceListSender` into Bob's browser would otherwise create data
   * that nothing ever reads.
   */
  remapAccountTo?: string;
  /** Replace existing values. When false, keys already present are skipped. */
  overwrite?: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  /** Reasons things were skipped, for showing back to the user. */
  notes: string[];
}

export function parseBundle(json: string): TransferBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That is not valid JSON.");
  }
  const bundle = parsed as Partial<TransferBundle>;
  if (bundle?.format !== TRANSFER_FORMAT) {
    throw new Error(
      "That file was not produced by this tool (missing or wrong format tag).",
    );
  }
  if (typeof bundle.version !== "number" || bundle.version > TRANSFER_VERSION) {
    throw new Error(
      `Unsupported export version ${bundle.version}; this build understands up to ${TRANSFER_VERSION}.`,
    );
  }
  if (!Array.isArray(bundle.entries)) {
    throw new Error("The export contains no entries.");
  }
  return bundle as TransferBundle;
}

export function importData(
  json: string,
  options: ImportOptions = {},
): ImportResult {
  const bundle = parseBundle(json);
  const groups = options.groups ?? DEFAULT_GROUPS;
  const overwrite = options.overwrite ?? true;

  const result: ImportResult = { imported: 0, skipped: 0, notes: [] };

  for (const entry of bundle.entries) {
    if (!groups.includes(entry.group)) {
      result.skipped++;
      continue;
    }

    let targetKey = entry.key;
    if (entry.account !== null && options.remapAccountTo !== undefined) {
      if (EMPIRE_PREFIX_PATTERN.test(entry.key)) {
        targetKey = `***${options.remapAccountTo}***${entry.suffix}`;
      } else {
        targetKey = `${options.remapAccountTo}${entry.suffix}`;
      }
    }

    if (!overwrite && localStorage.getItem(targetKey) !== null) {
      result.skipped++;
      result.notes.push(`kept existing ${targetKey}`);
      continue;
    }

    try {
      localStorage.setItem(targetKey, entry.value);
      result.imported++;
    } catch (e) {
      result.skipped++;
      result.notes.push(
        `could not write ${targetKey}: ${(e as Error).message}`,
      );
    }
  }

  return result;
}

/** Accounts that appear in a bundle, for warning about a mismatch. */
export function accountsInBundle(bundle: TransferBundle): string[] {
  return [
    ...new Set(
      bundle.entries
        .map((entry) => entry.account)
        .filter((account): account is string => !!account),
    ),
  ];
}

/** Human-readable breakdown, for showing before an import is applied. */
export function describeBundle(bundle: TransferBundle): string {
  const byGroup = new Map<DataGroup, number>();
  for (const entry of bundle.entries) {
    byGroup.set(entry.group, (byGroup.get(entry.group) ?? 0) + 1);
  }
  const parts = [...byGroup.entries()].map(
    ([group, count]) => `${count} ${group}`,
  );
  const accounts = accountsInBundle(bundle);
  return (
    `Exported ${new Date(bundle.exportedAt).toLocaleString()}\n` +
    `${bundle.entries.length} entries (${parts.join(", ") || "none"})\n` +
    `Accounts: ${accounts.join(", ") || "none (global data only)"}`
  );
}
