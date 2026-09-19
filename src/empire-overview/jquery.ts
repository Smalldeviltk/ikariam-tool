/**
 * jQuery access and the runtime flags the original kept in its IIFE header.
 *
 * The original wrapped everything in `(function ($) { ... })(jQuery)`, where
 * `$` was the jQuery instance loaded into the sandbox by `@require`. After the
 * module split there is no IIFE parameter any more, so `$` is picked up from
 * the sandbox scope here and re-exported.
 *
 * The original header block:
 * ```js
 * var jQuery = $;
 * var isChrome;
 * if (typeof unsafeWindow.jQuery === "undefined") return;
 * if (window.navigator.vendor.match(/Google/)) isChrome = true;
 * if (!isChrome) this.$ = this.jQuery = jQuery.noConflict(true);
 * ```
 */

/**
 * The jQuery instance loaded by `@require`.
 *
 * This deliberately references the bare identifier `jQuery` rather than
 * `window.jQuery`. The original received jQuery through the IIFE parameter
 * `(function ($) {...})(jQuery)`, i.e. resolved via the scope chain, which
 * finds the copy `@require` put into the sandbox scope first. Reading through
 * `window.jQuery` risks Tampermonkey's sandbox proxy handing back the GAME
 * PAGE's jQuery — that copy has no jQuery UI, and every `.tabs()`,
 * `.draggable()` and `.button()` call in the renderer would break.
 *
 * `jQuery` is already declared globally by `@types/jquery`, so it is fully typed.
 */
import { installJQueryCompat } from "./jquery-compat";

const jq: JQueryStatic =
  typeof jQuery !== "undefined" ? jQuery : (window as any).jQuery;

if (!jq) {
  throw new Error(
    "jQuery not found — check the @require lines in the userscript header",
  );
}

/**
 * Restore helpers the page's jQuery may have dropped.
 *
 * Runs before anything else imports this module's default export, which is what
 * guarantees `$.now()` exists by the time the first City is constructed. See
 * `jquery-compat.ts` for why this is needed at all.
 */
export const jqueryCompatAdded: string[] = installJQueryCompat(jq);

/**
 * Whether this is a Chromium-based browser.
 *
 * The original tested `navigator.vendor.match(/Google/)` and called the result
 * `isChrome`. What it actually gates is Chromium behaviour, not Chrome the
 * product — and that distinction matters here, because **the userscript build
 * is deployed on Edge**, which is Chromium and deliberately reports
 * `navigator.vendor === "Google Inc."` for compatibility. So the flag is `true`
 * on Edge, which is the correct answer at all four call sites:
 *
 *  - `jquery.ts`   — skip `noConflict`, as on Chrome
 *  - `render.ts`   — the Chromium keycode tables (the one that would actually
 *                    misbehave if this were wrong)
 *  - `render.ts`   — a cosmetic row class
 *  - `helpers.ts`  — a `-webkit-transform` rule
 *
 * The detection itself is broadened, because `navigator.vendor` is deprecated
 * and may be emptied: `userAgentData.brands` is checked first (Edge lists
 * "Chromium" there), then vendor, then the user-agent string.
 */
function detectChromium(): boolean {
  const nav = window.navigator as Navigator & {
    userAgentData?: { brands?: Array<{ brand?: string }> };
  };

  const brands = nav.userAgentData?.brands;
  if (Array.isArray(brands) && brands.length) {
    return brands.some((entry) =>
      /Chromium|Google Chrome|Edge/i.test(entry?.brand ?? ""),
    );
  }
  if (/Google/.test(nav.vendor ?? "")) return true;
  return /Chrome|Chromium|Edg\//.test(nav.userAgent ?? "");
}

export const isChromium: boolean = detectChromium();

/**
 * Legacy name kept because the ported renderer and utils import it.
 * Prefer `isChromium` in new code — see the note above.
 */
export const isChrome: boolean = isChromium;

export default jq;
