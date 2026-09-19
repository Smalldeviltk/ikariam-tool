/**
 * Async helpers.
 *
 * The original scripts repeated one shape everywhere: a function that
 * re-invokes itself inside `setTimeout` until the DOM has what it needs.
 *
 * ```js
 * window.townClick = function (townNumber, resource, queueObj) {
 *   setTimeout(function () {
 *     if (document.querySelectorAll(".cities.clearfix > li > a").length > 0) {
 *       ...
 *     } else {
 *       townClick(townNumber, resource, queueObj);   // unbounded recursion
 *     }
 *   }, 200);
 * };
 * ```
 *
 * `waitFor` captures that shape once. Unlike the original it defaults to a
 * finite timeout: a single unbounded wait now stalls the shared task runner
 * forever (see `core/task-queue.ts`), so giving up and retrying is safer than
 * hanging. Pass `timeout: Infinity` to get the old never-give-up behaviour.
 */

/** Default poll interval, matching the original 200 ms loops. */
export const DEFAULT_POLL_INTERVAL_MS = 200;

/** Default give-up threshold. Generous enough for a slow ajax page render. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface WaitForOptions {
  /** Poll interval in milliseconds. */
  intervalMs?: number;
  /** Give up after this many milliseconds. Pass `Infinity` to never give up. */
  timeoutMs?: number;
  /** Label used in the timeout error message. */
  label?: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `predicate` until it returns a truthy value, then resolve with it.
 *
 * The first check happens AFTER one interval, matching the original code which
 * always opened with `setTimeout`. Do not change this to check immediately
 * without auditing the call sites — several rely on the initial delay to let
 * the game finish a DOM swap.
 */
export function waitFor<T>(
  predicate: () => T | null | undefined | false,
  options: WaitForOptions = {},
): Promise<T> {
  const {
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    label = "waitFor",
  } = options;

  const deadline = timeoutMs === Infinity ? Infinity : Date.now() + timeoutMs;

  return new Promise<T>((resolve, reject) => {
    const tick = () => {
      let value: T | null | undefined | false;
      try {
        value = predicate();
      } catch {
        value = null;
      }
      if (value) {
        resolve(value as T);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error(`${label}: timed out after ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    setTimeout(tick, intervalMs);
  });
}

/** Adapt an old callback-style `fn(done)` into a promise. */
export function promisify(fn: (done: () => void) => void): Promise<void> {
  return new Promise((resolve) => fn(resolve));
}
