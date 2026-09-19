/**
 * View filter for the Chrome extension build.
 *
 * The Send Resources userscript excludes two views in its header:
 *
 *   @exclude *://*.ikariam.gameforge.*&#47;?view=island*
 *   @exclude *://*.ikariam.gameforge.*&#47;?view=worldmap_iso*
 *
 * Chrome cannot express that. `exclude_matches` uses match patterns, and match
 * patterns ignore the query string entirely — there is no way to exclude
 * `?view=island` in the manifest. The check therefore has to happen at runtime.
 *
 * It matters because neither view has a town context: the panel would render
 * over the map for no reason, and `isUiReady` would block every task anyway.
 */

/** Views the automation has nothing to do on. */
const EXCLUDED_VIEWS = ["island", "worldmap_iso"];

export function shouldRunHere(search = window.location.search): boolean {
  const view = new URLSearchParams(search).get("view");
  return view === null || !EXCLUDED_VIEWS.includes(view);
}
