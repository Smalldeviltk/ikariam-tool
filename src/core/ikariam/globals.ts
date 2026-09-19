/**
 * Typed access to globals created by the GAME PAGE itself.
 *
 * Easy to confuse: the Empire Overview script also has its own object named `ikariam`
 * (`var ikariam = {...}` at line 6650 of the original). That is a completely
 * different object from the page's `window.ikariam`. This file is only about
 * the page's one.
 *
 * Send Resources runs with `@grant none`, so `window` already is the page
 * window. Empire Overview runs sandboxed and must go through `unsafeWindow`.
 */

import { qs } from "../dom";
import { SEL } from "./selectors";

/** The game's built-in popup API, reused by Send Resources for its dialogs. */
export interface IkariamPageApi {
  createPopup(
    id: string,
    title: string,
    html: string,
    arg4?: string,
    arg5?: string,
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

/** Name of the currently open town. */
export function getCurrentTownName(): string {
  return qs(SEL.cityBread)?.innerHTML.trim() ?? "";
}
