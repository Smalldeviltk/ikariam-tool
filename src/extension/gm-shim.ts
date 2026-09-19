/**
 * Userscript-manager API shims for the Chrome extension build.
 *
 * Empire Overview was written against Tampermonkey and reaches for APIs that do
 * not exist in a plain page: `GM_addStyle` (21 call sites), `GM_openInTab`,
 * `GM_xmlhttpRequest`, `GM_registerMenuCommand`, and the bare `unsafeWindow`
 * identifier.
 *
 * Injected into the page world those are all just globals, so the shims below
 * install browser-native equivalents before the feature code loads.
 *
 * IMPORTANT: this module must be imported BEFORE the feature entry. ES modules
 * evaluate their imports in source order, so `import "./gm-shim"` on the line
 * above `import "@empire/main"` is what guarantees the globals exist in time.
 */

interface ShimTarget {
  unsafeWindow?: unknown;
  GM_addStyle?: (css: string) => HTMLStyleElement;
  GM_openInTab?: (url: string, options?: unknown) => unknown;
  GM_xmlhttpRequest?: (details: Record<string, any>) => unknown;
  GM_registerMenuCommand?: (name: string, fn: () => void) => number;
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
  target.GM_addStyle = (css: string): HTMLStyleElement => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  };
}

if (typeof target.GM_openInTab !== "function") {
  target.GM_openInTab = (url: string) => window.open(url, "_blank");
}

if (typeof target.GM_registerMenuCommand !== "function") {
  // Tampermonkey's menu has no equivalent here. The only call site is commented
  // out in the original, so a no-op loses nothing.
  target.GM_registerMenuCommand = () => 0;
}

if (typeof target.GM_xmlhttpRequest !== "function") {
  /**
   * `fetch`-backed stand-in supporting the subset the code actually uses:
   * `method`, `url`, `headers`, `onload`, `onerror`.
   *
   * Note this does NOT get Tampermonkey's cross-origin exemption — a page-world
   * fetch is bound by the page's CORS rules. The sole caller is
   * `empire.CheckForUpdates`, which is disabled in the original anyway, so a
   * failure surfaces through `onerror` rather than breaking anything.
   */
  target.GM_xmlhttpRequest = (details: Record<string, any>) => {
    fetch(details.url, {
      method: details.method ?? "GET",
      headers: details.headers,
    })
      .then(async (response) => {
        const responseText = await response.text();
        details.onload?.({
          responseText,
          status: response.status,
          statusText: response.statusText,
        });
      })
      .catch((error) => details.onerror?.(error));
    return undefined;
  };
}

export {};
