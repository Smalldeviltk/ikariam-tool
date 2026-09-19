/**
 * Content script — runs in the extension's ISOLATED world.
 *
 * It deliberately does almost nothing. A MV3 content script shares the page's
 * DOM but not its JavaScript globals, so from here `window.ikariam`,
 * `window.transportConfig` and the page's jQuery simply do not exist — and
 * those are exactly what both features are built on.
 *
 * The way across is the one the IkaEasy extension uses: inject a `<script>`
 * element whose `src` is a web-accessible file. The browser then executes that
 * file in the PAGE's world, where the globals are real.
 *
 * The userscript builds do not need any of this: Tampermonkey either runs in
 * page context outright (`@grant none`) or bridges via `unsafeWindow`.
 */

/** Runtime shape of the tiny slice of the extension API used here. */
declare const chrome: {
  runtime: { getURL(path: string): string };
};

const PAGE_SCRIPTS = [
  "page/empire-overview.js",
  "page/send-resources.js",
] as const;

function injectPageScript(path: string): void {
  const element = document.createElement("script");
  element.src = chrome.runtime.getURL(path);
  element.async = false; // preserve order between the two bundles
  // Remove the tag once it has run; the code stays loaded, the DOM stays clean.
  element.addEventListener("load", () => element.remove());
  element.addEventListener("error", () =>
    console.error(`[ika] Failed to inject ${path}`),
  );
  (document.head || document.documentElement).appendChild(element);
}

for (const path of PAGE_SCRIPTS) {
  injectPageScript(path);
}
