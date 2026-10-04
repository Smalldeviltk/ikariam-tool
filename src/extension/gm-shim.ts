/**
 * Userscript-manager API shims for the Chrome extension build.
 *
 * Empire Overview was written against Tampermonkey and reaches for APIs that do
 * not exist in a plain page: `GM_addStyle` (21 call sites) and the bare
 * `unsafeWindow` identifier. (`GM_openInTab`, `GM_xmlhttpRequest` and
 * `GM_registerMenuCommand` had no caller left once the update check was
 * removed, and their shims went with it.)
 *
 * Injected into the page world those are all just globals, so the shims below
 * install browser-native equivalents before the feature code loads.
 *
 * IMPORTANT: this module must be imported BEFORE the feature entry. ES modules
 * evaluate their imports in source order, so `import "./gm-shim"` on the line
 * above `import "@empire/main"` is what guarantees the globals exist in time.
 */

import { addStyle } from "../core/dom";

interface ShimTarget {
  unsafeWindow?: unknown;
  GM_addStyle?: (css: string) => HTMLStyleElement;
  [key: string]: unknown;
}

const target = window as unknown as ShimTarget;

/**
 * In the page world `window` already IS the page's window, so `unsafeWindow`
 * only has to be an alias. Empire Overview references the bare identifier.
 */
if (typeof target.unsafeWindow === "undefined") {
  target.unsafeWindow = window;
}

if (typeof target.GM_addStyle !== "function") {
  target.GM_addStyle = addStyle;
}

export {};
