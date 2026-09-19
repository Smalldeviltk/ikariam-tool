/**
 * A short trace of what the game actually sends, and what the board does with it.
 *
 * WHY THIS EXISTS
 * A live scan reported "9/9 towns visited" while three towns stayed blank on the
 * Buildings tab, with nothing thrown and nothing logged. Every candidate
 * explanation — navigation, the ajax hook, the recording guard — is invisible
 * from the outside, and guessing at them cost several round trips. This records
 * the few facts that tell them apart:
 *
 *  - which entry types arrived in each ajax response,
 *  - whether the entry carried a `position` array (the building layout),
 *  - which city id it claimed,
 *  - and, at the moment the recorder ran, whether it accepted or dropped it.
 *
 * Kept deliberately small: the last `MAX_ENTRIES` records, in localStorage so
 * they survive Ikariam's full page loads, and mirrored onto the page window so
 * `tools/collect-dom-report.js` can pick them up. It never throws.
 */

const KEY = "ikaAjaxTrace";
const MAX_ENTRIES = 40;

export interface TraceRecord {
  at: number;
  kind: string;
  [field: string]: unknown;
}

function load(): TraceRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function trace(kind: string, data: Record<string, unknown>): void {
  try {
    const records = load();
    records.push({ at: Date.now(), kind, ...data });
    while (records.length > MAX_ENTRIES) records.shift();
    localStorage.setItem(KEY, JSON.stringify(records));
    // The crawler runs in page context; the script may not.
    (unsafeWindow as any).ikaAjaxTrace = records;
  } catch {
    // Diagnostics must never be the reason something fails.
  }
}

export function readTrace(): TraceRecord[] {
  return load();
}

export function clearTrace(): void {
  try {
    localStorage.removeItem(KEY);
    delete (unsafeWindow as any).ikaAjaxTrace;
  } catch {
    /* ignore */
  }
}

/** Compact description of one ajax entry, safe on any shape. */
export function describeEntry(entry: unknown): Record<string, unknown> {
  if (!Array.isArray(entry)) return { raw: String(entry).slice(0, 60) };
  const payload: any = entry[1];
  const background = payload && payload.backgroundData;
  return {
    type: String(entry[0]),
    hasPayload: payload != null,
    // `position` is the building layout — the thing the Buildings tab needs.
    hasPosition: !!(
      payload &&
      (payload.position || (background && background.position))
    ),
    cityId: (payload && (payload.id ?? (background && background.id))) ?? null,
  };
}
