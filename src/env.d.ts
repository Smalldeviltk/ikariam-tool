/**
 * Ambient declarations shared by both userscripts.
 *
 * Userscript-manager APIs that only one script uses (the `GM_*` family) live in
 * `src/empire-overview/globals.d.ts` instead — Send Resources runs with `@grant none`
 * and has no access to them.
 */

/**
 * The real game page window.
 *
 * Deliberately `any`: the code reaches dozens of globals defined by Ikariam
 * (`ajaxHandlerCallFromForm`, `LocalizationStrings`, `relatedCityData`,
 * `executeAjaxRequest`, `ajaxResponder`, ...). Declaring them properly would
 * mean reconstructing the game's whole type surface, which is separate work
 * from porting these scripts.
 *
 * Because of this declaration, `@types/greasemonkey` is left out of `types` in
 * tsconfig: it declares `unsafeWindow: Window`, which is narrower than reality
 * here and would reject every page-global access.
 *
 * Note it is declared as possibly undefined at runtime — under `@grant none`
 * there is no sandbox and the identifier does not exist, which is why
 * `core/ikariam/globals.ts` guards with `typeof unsafeWindow !== "undefined"`.
 */
declare const unsafeWindow: any;

/**
 * Version string, replaced at build time by each build config.
 *
 * Declared rather than imported so the two packagings can stamp different
 * values without the feature code having to know which one it is in.
 */
declare const __SCRIPT_VERSION__: string;

/**
 * Which artefact this bundle is, replaced at build time.
 *
 * A build-time constant rather than something an entry calls, because ES module
 * imports are HOISTED: a statement placed above `import "./main"` still runs
 * after it, so an entry cannot reliably announce anything before the feature
 * code evaluates.
 */
declare const __PACKAGING__: "userscript" | "extension";
