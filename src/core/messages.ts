/**
 * Every user-facing string the shared core produces, in one place.
 *
 * Kept apart from the code that uses them so the wording can be reviewed in
 * one sitting and a translation can later be swapped in without touching
 * logic. Strings that take values are functions. Send Resources keeps its own
 * in `src/send-resources/messages.ts`; Empire Overview has its own
 * translation table (`Constant.LanguageData`).
 */

/**
 * What a countdown shows once it has run out.
 *
 * Returned by `formatTimeLengthToStr` for negative durations, and compared
 * against by callers, so it is exported as a constant rather than retyped.
 */
export const TIME_FINISHED = "Finished.";

/** Tooltip of the close button on the shared window widget. */
export const WINDOW_CLOSE_TITLE = "Close";

export const BUGS_NONE_RECORDED = "No bugs recorded.";

/** Reasons an import file is rejected. */
export const IMPORT_ERRORS = {
  notJson: "That is not valid JSON.",
  notOurFormat:
    "That file was not produced by this tool (missing or wrong format tag).",
  unsupportedVersion: (found: unknown, supported: number) =>
    `Unsupported export version ${found}; this build understands up to ${supported}.`,
  noEntries: "The export contains no entries.",
} as const;

/** Notes shown after an import, one per entry that was not written. */
export const IMPORT_NOTES = {
  keptExisting: (key: string) => `kept existing ${key}`,
  couldNotWrite: (key: string, reason: string) =>
    `could not write ${key}: ${reason}`,
} as const;

/** The breakdown shown before an import is applied. */
export const IMPORT_SUMMARY = {
  exportedAt: (when: string) => `Exported ${when}`,
  entries: (count: number, groups: string) =>
    `${count} entries (${groups || "none"})`,
  accounts: (accounts: string) =>
    `Accounts: ${accounts || "none (global data only)"}`,
} as const;
