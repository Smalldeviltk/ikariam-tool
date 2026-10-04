/**
 * Desktop notifications.
 *
 * The page's own `Notification` API, in both builds: the userscripts and the
 * extension run the same code, and both can notify while the game's tab is
 * open, even behind other tabs or minimised. Nothing notifies once the tab is
 * closed; that would need the extension's background worker, which is left
 * for later.
 *
 * Shared by the two scripts, which are separate bundles: Empire Overview
 * notifies when a building finishes and when a fleet arrives, Send Resources
 * when a town's wine runs low and when the runner drops a task. So the
 * switches and the record of what was already said live in localStorage, which
 * both bundles (and every open tab) read.
 */

import { writeToConsole } from "./logger";
import { NOTIFICATION_PERMISSION } from "./messages";

export type NotificationKind =
  "buildFinished" | "arrival" | "wineLow" | "taskDropped";

/** Which kinds the player switched on: `{ buildFinished: true, ... }`. */
export const NOTIFICATION_SETTINGS_KEY = "ikaNotifications";

/** Notice key -> epoch ms it was shown, so nothing is said twice. */
export const NOTIFIED_KEY = "ikaNotified";

/**
 * An event older than this is not announced. A building that finished while
 * the game was closed is found finished on the next load, hours late; saying
 * "finished" then tells the player nothing.
 */
export const STALE_AFTER_MS = 2 * 60_000;

/** How long a shown notice is remembered before its record is pruned. */
const NOTIFIED_MEMORY_MS = 7 * 24 * 3_600_000;

export interface DesktopNotice {
  kind: NotificationKind;
  /** Names the event; a notice with a key already shown is not shown again. */
  key: string;
  title: string;
  body: string;
  /** Epoch ms the event happened, when it has a time of its own. */
  happenedAt?: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    writeToConsole("warn", e);
  }
}

/** The page's `Notification`, or undefined where the browser has none. */
function notificationApi(): typeof Notification | undefined {
  return (globalThis as { Notification?: typeof Notification }).Notification;
}

export function isNotificationEnabled(kind: NotificationKind): boolean {
  const settings = readJson<Partial<Record<NotificationKind, boolean>>>(
    NOTIFICATION_SETTINGS_KEY,
    {},
  );
  return settings[kind] === true;
}

/**
 * Switch one kind on or off. Switching on asks the browser for permission
 * first, if it has not been given; a refusal leaves the kind off. Called from
 * the checkbox's own event, because a browser may only ask in answer to the
 * player doing something.
 *
 * @returns whether the kind is on now.
 */
export async function setNotificationEnabled(
  kind: NotificationKind,
  enabled: boolean,
): Promise<boolean> {
  let on = enabled;
  if (on) {
    const api = notificationApi();
    if (!api) {
      on = false;
    } else if (api.permission !== "granted") {
      try {
        on = (await api.requestPermission()) === "granted";
      } catch (e) {
        writeToConsole("warn", e);
        on = false;
      }
    }
  }

  const settings = readJson<Partial<Record<NotificationKind, boolean>>>(
    NOTIFICATION_SETTINGS_KEY,
    {},
  );
  settings[kind] = on;
  writeJson(NOTIFICATION_SETTINGS_KEY, settings);
  return on;
}

/** Why switching on did not take, for the caller to tell the player. */
export function notificationRefusal(): string {
  return notificationApi()
    ? NOTIFICATION_PERMISSION.blocked
    : NOTIFICATION_PERMISSION.unsupported;
}

/**
 * Show a notice, unless its kind is off, permission is missing, the event is
 * stale, or the same key was already shown (by this tab or another).
 *
 * @returns whether it was shown.
 */
export function notify(notice: DesktopNotice): boolean {
  if (!isNotificationEnabled(notice.kind)) return false;
  const api = notificationApi();
  if (!api || api.permission !== "granted") return false;

  const now = Date.now();
  if (
    notice.happenedAt !== undefined &&
    now - notice.happenedAt > STALE_AFTER_MS
  ) {
    return false;
  }

  const shown = readJson<Record<string, number>>(NOTIFIED_KEY, {});
  if (notice.key in shown) return false;
  for (const [key, at] of Object.entries(shown)) {
    if (now - at > NOTIFIED_MEMORY_MS) delete shown[key];
  }
  shown[notice.key] = now;
  writeJson(NOTIFIED_KEY, shown);

  try {
    // The tag makes the system replace rather than stack a notice two tabs
    // raced to show.
    const shownNotice = new api(notice.title, {
      body: notice.body,
      tag: notice.key,
    });
    shownNotice.onclick = () => {
      window.focus();
      shownNotice.close();
    };
  } catch (e) {
    writeToConsole("warn", e);
    return false;
  }
  return true;
}

/**
 * Forget that a notice was shown, so the same key can be shown again — for a
 * condition that ended and may come back, like a town's wine running low.
 */
export function forgetNotification(key: string): void {
  const shown = readJson<Record<string, number>>(NOTIFIED_KEY, {});
  if (!(key in shown)) return;
  delete shown[key];
  writeJson(NOTIFIED_KEY, shown);
}
