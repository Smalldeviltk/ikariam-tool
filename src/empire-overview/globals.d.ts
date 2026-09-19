/**
 * Declarations for Tampermonkey APIs that `@types/greasemonkey` does not cover,
 * and for the jQuery plugins this script adds itself.
 *
 * Empire Overview only: Send Resources runs with `@grant none` and cannot use `GM_*`.
 * Declarations shared by both scripts live in `src/env.d.ts`.
 */

declare function GM_addStyle(css: string): HTMLStyleElement;
declare function GM_openInTab(url: string, options?: unknown): unknown;
declare function GM_xmlhttpRequest(details: Record<string, unknown>): unknown;
declare function GM_registerMenuCommand(
  name: string,
  fn: () => void,
  accessKey?: string,
): number;

/**
 * Helpers that `jquery-ext.ts` attaches to `$` via `$.extend({...})`.
 * Declared here so the call sites (`database.ts`, `render.ts`, ...) are typed.
 */
interface JQueryStatic {
  /** Drop duplicate entries, keeping the first occurrence. */
  exclusive<T>(arr: T[]): T[];
  /** Deep-merge several objects; later values win. */
  mergeValues<T = any>(...objects: any[]): T;
  /** Parse a URL query string into a plain object. */
  decodeUrlParam(input: string): Record<string, string>;
}
