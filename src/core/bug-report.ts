/**
 * Runtime bug collection.
 *
 * WHY
 * Everything these scripts do happens inside someone else's page, on a schedule,
 * against markup that changes without notice. When something goes wrong the user
 * sees "nothing happened" and there is no way to find out why after the fact —
 * the console has scrolled away, and the failure was probably three page loads
 * ago.
 *
 * This records failures as they happen, deduplicated and persisted, so a single
 * "copy bug report" produces something actually diagnosable.
 *
 * DESIGN CONSTRAINTS
 *  - It must never throw. A reporter that breaks while reporting is worse than
 *    no reporter, so every entry point is wrapped.
 *  - It must never recurse. Reporting an error must not be able to trigger the
 *    error handler again.
 *  - It must not depend on app state. Errors happen before `initState`, so this
 *    talks to `localStorage` directly rather than going through `Store`.
 *  - It must stay small. Stacks are truncated and the buffer is bounded, because
 *    localStorage is shared with the queue and the log.
 */

const STORAGE_KEY = "ikaBugReports";

/** Distinct bugs kept. Repeats of a known bug bump a counter instead. */
const MAX_RECORDS = 50;
/** Characters of stack retained per bug. */
const MAX_STACK = 2000;
/** Context snapshots kept per bug — the first and the most recent are the useful ones. */
const MAX_CONTEXTS = 3;
/** How stale the newest snapshot must be before a repeat takes another. */
const RESNAPSHOT_INTERVAL_MS = 60_000;

/** True for 1, 10, 100, 1000 ... — the counts a repeat is worth logging at. */
function isLogWorthy(count: number): boolean {
  if (count < 1) return false;
  let n = count;
  while (n % 10 === 0) n /= 10;
  return n === 1;
}

export type BugKind =
  /** Thrown out of a task handler. */
  | "task-error"
  /** A task ended with `failed`. */
  | "task-failed"
  /** A selector that should have matched did not. */
  | "selector-miss"
  /** Caught by `window.onerror`. May well belong to the game, not to us. */
  | "uncaught"
  /** Caught by `unhandledrejection`. */
  | "unhandled-rejection"
  /** Reported explicitly by feature code. */
  | "manual";

export interface BugContext {
  at: number;
  [key: string]: unknown;
}

export interface BugRecord {
  /** Stable identity, so repeats aggregate instead of flooding. */
  fingerprint: string;
  kind: BugKind;
  message: string;
  stack?: string;
  count: number;
  firstAt: number;
  lastAt: number;
  /** Up to `MAX_CONTEXTS` snapshots: the first occurrence and the latest ones. */
  contexts: BugContext[];
}

/* ─────────────────────────────── Build info ────────────────────────────── */

export interface BuildInfo {
  /** Which artefact this is running as. */
  packaging: "userscript" | "extension";
  /** Which feature set — the two ship separately. */
  script: string;
  version: string;
}

let buildInfo: BuildInfo | null = null;

/**
 * Declare which build this is.
 *
 * It cannot be detected at runtime: an extension's PAGE-world script has no
 * access to `chrome.runtime`, so it is indistinguishable from a userscript by
 * inspection. Each entry states it instead.
 *
 * This is stamped onto every RECORD, not just the export envelope. On Edge both
 * userscripts run on the same page and write to the same storage key, but each
 * is a separate bundle with its own module instance — so without a per-record
 * stamp a report exported from one script would list the other's bugs with no
 * way to tell them apart.
 */
export function setBuildInfo(info: BuildInfo): void {
  buildInfo = info;
}

export function getBuildInfo(): BuildInfo | null {
  return buildInfo;
}

/* ─────────────────────────── Context providers ─────────────────────────── */

export type ContextProvider = () => Record<string, unknown>;

const providers: ContextProvider[] = [];

/**
 * Register a source of diagnostic context.
 *
 * `core` deliberately knows nothing about queues or towns, so the app supplies
 * that itself — see `src/send-resources/diagnostics.ts`.
 */
export function registerContextProvider(provider: ContextProvider): void {
  providers.push(provider);
}

/** Drop every registered provider. Exists so tests can isolate from each other. */
export function clearContextProviders(): void {
  providers.length = 0;
}

function collectContext(extra?: Record<string, unknown>): BugContext {
  const context: BugContext = {
    at: Date.now(),
    // Per-record, so bugs from the two scripts stay distinguishable in a
    // report exported from either one. See `setBuildInfo`.
    build: buildInfo ?? undefined,
    ...extra,
  };
  for (const provider of providers) {
    try {
      Object.assign(context, provider());
    } catch (e) {
      // A broken provider must not stop the bug being recorded.
      context.providerError = String((e as Error)?.message ?? e);
    }
  }
  return context;
}

/* ────────────────────────────── Persistence ────────────────────────────── */

function load(): BugRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(records: BugRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage full or blocked. Dropping the report is the correct trade —
    // never let bookkeeping break the feature it is watching.
  }
}

/**
 * Identity for deduplication: kind, message, and the first stack frame.
 *
 * The first frame is what distinguishes "the same message from a different
 * place". Including the whole stack instead would defeat aggregation, because
 * async stacks vary between occurrences of the same fault.
 */
function fingerprintOf(kind: BugKind, message: string, stack?: string): string {
  const frame = stack?.split("\n").find((line) => /\s+at\s+/.test(line)) ?? "";
  return `${kind}|${message}|${frame.trim()}`.slice(0, 300);
}

/* ──────────────────────────── Recording ────────────────────────────────── */

/** Guards against an error raised *inside* the reporter re-entering it. */
let reporting = false;

export function reportBug(
  kind: BugKind,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  if (reporting) return;
  reporting = true;
  try {
    const isError = error instanceof Error;
    const message = String(
      (isError ? error.message : (error as { message?: unknown })?.message) ??
        error ??
        "unknown",
    ).slice(0, 500);
    const stack = isError ? error.stack?.slice(0, MAX_STACK) : undefined;

    const fingerprint = fingerprintOf(kind, message, stack);
    const records = load();
    const existing = records.find((r) => r.fingerprint === fingerprint);

    if (existing) {
      const now = Date.now();
      existing.count += 1;
      existing.lastAt = now;
      // A fault inside a repeating timer reports itself over and over — one
      // live session produced the same error every 3 seconds for every
      // building in every town. Snapshotting the page on each of those is
      // pure cost: the providers walk the DOM, and the result is a context
      // indistinguishable from the one taken a moment earlier. Take a fresh
      // one only once the previous is stale.
      const newest = existing.contexts[existing.contexts.length - 1];
      if (!newest || now - newest.at >= RESNAPSHOT_INTERVAL_MS) {
        // Keep the first snapshot plus the most recent ones: the first shows
        // how it started, the latest shows whether anything has changed since.
        existing.contexts = [
          existing.contexts[0],
          ...existing.contexts.slice(1),
          collectContext(extra),
        ]
          .filter(Boolean)
          .slice(-MAX_CONTEXTS);
      }
    } else {
      const context = collectContext(extra);
      records.push({
        fingerprint,
        kind,
        message,
        stack,
        count: 1,
        firstAt: context.at,
        lastAt: context.at,
        contexts: [context],
      });
      // Oldest-first eviction; `records` is append-ordered.
      while (records.length > MAX_RECORDS) records.shift();
    }

    save(records);

    // Log the first occurrence, then only at 10, 100, 1000... A repeating
    // fault otherwise fills the console and buries everything else — which is
    // exactly how this limit came to be written.
    const count = existing ? existing.count : 1;
    if (isLogWorthy(count)) {
      console.warn(
        `[ika] bug recorded (${kind}): ${message}` +
          (count > 1 ? ` [x${count}]` : ""),
      );
    }
  } catch {
    // Swallowed on purpose — see the module note.
  } finally {
    reporting = false;
  }
}

/** Convenience for the most common non-exception case. */
export function reportSelectorMiss(
  selector: string,
  extra?: Record<string, unknown>,
): void {
  reportBug(
    "selector-miss",
    new Error(`No match for selector: ${selector}`),
    extra,
  );
}

/* ──────────────────────────── Global handlers ──────────────────────────── */

let handlersInstalled = false;

/**
 * Listen for uncaught errors and rejections.
 *
 * NOTE these fire for the WHOLE page, so most of what lands here belongs to
 * Ikariam rather than to us. They are recorded anyway — a game error during one
 * of our automated actions is often the actual explanation — but the `kind`
 * keeps them separable from failures we detected ourselves.
 */
export function installErrorHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  window.addEventListener("error", (event) => {
    reportBug("uncaught", event.error ?? new Error(event.message), {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportBug("unhandled-rejection", event.reason);
  });
}

/* ───────────────────────────── Reading back ────────────────────────────── */

export function getBugs(): BugRecord[] {
  return load();
}

export function clearBugs(): void {
  save([]);
}

export interface BugReport {
  generatedAt: string;
  environment: Record<string, unknown>;
  totalOccurrences: number;
  bugs: BugRecord[];
}

/** Everything worth knowing about where this is running. */
function environment(): Record<string, unknown> {
  const anyWindow = window as unknown as Record<string, any>;
  return {
    url: location.href,
    view: new URLSearchParams(location.search).get("view"),
    userAgent: navigator.userAgent,
    build: buildInfo,
    hasIkariamModel: !!anyWindow.ikariam?.model,
    jQuery: anyWindow.jQuery?.fn?.jquery ?? null,
    jQueryUi: anyWindow.jQuery?.ui?.version ?? null,
    language: navigator.language,
  };
}

export function buildBugReport(): BugReport {
  const bugs = load();
  return {
    generatedAt: new Date().toISOString(),
    environment: environment(),
    totalOccurrences: bugs.reduce((sum, bug) => sum + bug.count, 0),
    bugs,
  };
}

export function exportBugReport(): string {
  return JSON.stringify(buildBugReport(), null, 2);
}

/** One-line summary per bug, for showing in the panel. */
export function summariseBugs(): string {
  const bugs = load();
  if (bugs.length === 0) return "No bugs recorded.";
  return bugs
    .slice()
    .sort((a, b) => b.lastAt - a.lastAt)
    .map(
      (bug) =>
        `${new Date(bug.lastAt).toLocaleString()}  x${bug.count}  [${bug.kind}] ${bug.message}`,
    )
    .join("\n");
}
