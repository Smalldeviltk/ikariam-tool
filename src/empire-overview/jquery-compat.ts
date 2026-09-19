/**
 * Compatibility shims for the jQuery the page happens to provide.
 *
 * WHY THIS EXISTS
 * The two builds get their jQuery from different places:
 *
 *  - The **userscript** `@require`s jQuery 2.2.4, the version the original was
 *    written against. Nothing here is needed.
 *  - The **extension** cannot `@require` anything, so Empire Overview uses the
 *    copy the game already loads. A live capture found that to be **jQuery
 *    4.0.0** (it was 3.6.3 on another world weeks earlier — Gameforge upgrades
 *    it without warning).
 *
 * jQuery 4 removed a batch of long-deprecated helpers, and this codebase calls
 * one of them **45 times**: `$.now()`. It runs in the `City` constructor, so
 * without a shim the extension build throws before the board ever renders.
 *
 * Each helper is installed ONLY if missing, so a page carrying an older jQuery
 * is left exactly as it was.
 *
 * If the renderer starts failing only in the extension, a newly removed jQuery
 * API is the first thing to suspect — add it here.
 */

interface LegacyStatics {
  now?: () => number;
  isNumeric?: (value: unknown) => boolean;
  isArray?: (value: unknown) => boolean;
  isFunction?: (value: unknown) => boolean;
  isWindow?: (value: unknown) => boolean;
  trim?: (value: string) => string;
  type?: (value: unknown) => string;
  parseJSON?: (value: string) => unknown;
  proxy?: (
    fn: (...args: any[]) => any,
    context: unknown,
  ) => (...args: any[]) => any;
}

/** Names this codebase actually depends on, plus the near neighbours. */
export function installJQueryCompat(jq: JQueryStatic): string[] {
  const legacy = jq as unknown as LegacyStatics;
  const added: string[] = [];

  const ensure = <K extends keyof LegacyStatics>(
    name: K,
    value: LegacyStatics[K],
  ) => {
    if (typeof legacy[name] !== "function") {
      legacy[name] = value;
      added.push(String(name));
    }
  };

  // Removed in jQuery 4. Used 45 times here, including in the City constructor.
  ensure("now", () => Date.now());

  // The rest are not all used today, but they are the other casualties of the
  // same deprecation sweep, and restoring them is free.
  // jQuery's own formula, verbatim. A naive `!isNaN(Number(v)) && isFinite(...)`
  // is NOT equivalent: `Number("")` is 0, so an empty string would come back
  // numeric. `render.ts` guards a `for...in` over resource movements with this,
  // and that guard is what keeps non-index keys out of the loop.
  ensure(
    "isNumeric",
    (value) =>
      (typeof value === "number" || typeof value === "string") &&
      !isNaN((value as number) - parseFloat(value as string)),
  );
  ensure("isArray", (value) => Array.isArray(value));
  ensure("isFunction", (value) => typeof value === "function");
  ensure(
    "isWindow",
    (value) => value != null && value === (value as Window).window,
  );
  ensure("trim", (value) => (value == null ? "" : String(value).trim()));
  ensure("parseJSON", (value) => JSON.parse(value));
  ensure("proxy", (fn, context) => fn.bind(context));
  ensure("type", (value) => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (Array.isArray(value)) return "array";
    return typeof value;
  });

  return added;
}
