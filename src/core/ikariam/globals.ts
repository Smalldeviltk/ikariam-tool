/**
 * Typed access to globals created by the GAME PAGE itself.
 *
 * Easy to confuse: the Empire Overview script also has its own object named
 * `ikariam` (`export const ikariam` in `src/empire-overview/game-api.ts`).
 * That is a completely different object from the page's `window.ikariam`.
 * This file is only about the page's one.
 *
 * Send Resources runs with `@grant none`, so `window` already is the page
 * window. Empire Overview runs sandboxed and must go through `unsafeWindow`.
 */

import { qs } from "../dom";
import { SEL } from "./selectors";

/**
 * The game's built-in popup API, reused by Send Resources for its dialogs.
 *
 * Parameters as the game's own source uses them (captured 03/10 through Bug
 * Report): `content` is HTML, or `[message, links, firstButton, secondButton]`;
 * `popupType` is compared with `ikariam.PopupController.TYPE_BUBBLE` (a
 * feedback bubble) and `TYPE_HEAVY` (adds a modal background), anything else
 * is a plain popup; `className` is added to the popup's root after
 * `popupMessage`, and `null` adds nothing.
 */
export interface IkariamPageApi {
  createPopup(
    id: string,
    title: string,
    content: string,
    popupType?: unknown,
    className?: string | null,
  ): void;
  templateView?: { id: string | null } | null;
  [key: string]: unknown;
}

/** Config object published by the game's Trading Port view. */
export interface TransportConfig {
  maxCapacityPerTransport?: number | string;
  freighterCapacity?: number | string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    ikariam?: IkariamPageApi;
    transportConfig?: TransportConfig;
  }
}

/**
 * The page window. Under `@grant none` there is no `unsafeWindow` and `window`
 * already is the page window; sandboxed, `unsafeWindow` is the page window.
 */
export const pageWindow: Window & typeof globalThis =
  typeof unsafeWindow !== "undefined"
    ? (unsafeWindow as Window & typeof globalThis)
    : window;

export function getIkariam(): IkariamPageApi | undefined {
  return pageWindow.ikariam;
}

export function getTransportConfig(): TransportConfig | undefined {
  return pageWindow.transportConfig;
}

/** Currently logged-in account name. Throws if the avatar bar has not rendered. */
export function getAccountName(): string {
  const el = qs<HTMLAnchorElement>(SEL.accountName);
  if (!el)
    throw new Error("Account name unavailable (avatar bar not rendered)");
  return el.title;
}

/**
 * Currently logged-in account name, or `""` — never throws.
 *
 * For code that runs while a module graph is still evaluating, where a throw
 * would take the whole script down before anything could record it. The
 * anchor's `title` and its text are the same name, differing only in leading
 * whitespace, so the text is a safe second source.
 */
export function readAccountName(): string {
  const anchor = qs<HTMLAnchorElement>(SEL.accountName);
  if (anchor) return anchor.title || anchor.textContent?.trim() || "";
  return qs(SEL.accountBlock)?.textContent?.trim() ?? "";
}

/**
 * A town's name as an element shows it.
 *
 * Read as TEXT, like every name it is compared with (the dropdown's `title`,
 * the model's `name`, the names Auto Build stores). `innerHTML` would read a
 * town called `A & B` as `A &amp; B`, and it would never match.
 */
export function readTownName(element: Element | null | undefined): string {
  return element?.textContent?.trim() ?? "";
}

/** Name of the currently open town, from the breadcrumb. */
export function getCurrentTownName(): string {
  return readTownName(qs(SEL.cityBread));
}
