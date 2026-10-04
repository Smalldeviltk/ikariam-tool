/**
 * Logger writing to `<textarea id="txtLogger">` and mirroring into
 * localStorage so history survives the periodic page reloads the script does
 * to keep the session alive. Equivalent to the old `logInfo` / `clearLog`.
 */

import { qs } from "./dom";

/** Where the log is mirrored, so it survives a reload. */
export const LOGGER_STORAGE_KEY = "loggerInfo";
const TEXTAREA_ID = "txtLogger";

/** Cap on retained log characters. The old code was unbounded, so the entry grew forever. */
const MAX_CHARS = 100_000;

let accountLabel = "";

/**
 * Write to the browser console without ever throwing.
 *
 * On the game's page `console.error` is not a function: measured 03/10, the
 * task runner's `console.error(e)` threw `console.error is not a function`
 * from inside its own catch, so the code after it — counting the handler's
 * consecutive throws and dropping the task after five — never ran, and a
 * failing task was retried every second for ever. Send Resources shares the
 * page's console (`@grant none`). A level that is missing falls back to
 * `console.log`, and to nothing.
 */
export function writeToConsole(
  level: "log" | "warn" | "error",
  ...args: unknown[]
): void {
  try {
    const write =
      typeof console[level] === "function" ? console[level] : console.log;
    if (typeof write === "function") write.apply(console, args);
  } catch {
    // The console is a convenience; nothing here may break the caller.
  }
}

export function initLogger(accountName: string): void {
  accountLabel = accountName;
  const box = qs<HTMLTextAreaElement>(`#${TEXTAREA_ID}`);
  if (box) box.innerHTML = localStorage.getItem(LOGGER_STORAGE_KEY) ?? "";
}

export function logInfo(message: string): void {
  const line = `${new Date().toLocaleString()} ${accountLabel} ${message}\n`;
  const box = qs<HTMLTextAreaElement>(`#${TEXTAREA_ID}`);

  if (box) {
    let next = line + box.innerHTML;
    if (next.length > MAX_CHARS) next = next.slice(0, MAX_CHARS);
    box.innerHTML = next;
    localStorage.setItem(LOGGER_STORAGE_KEY, next);
  }
  writeToConsole("log", `[ika] ${line.trimEnd()}`);
}

/**
 * The newest `count` log lines, newest first, as stored for the next page
 * load. Read from storage rather than the textarea, so it works before the
 * panel is drawn and covers lines written on earlier loads.
 */
export function recentLogLines(count: number): string[] {
  return (localStorage.getItem(LOGGER_STORAGE_KEY) ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(0, count);
}

export function clearLog(): void {
  const box = qs<HTMLTextAreaElement>(`#${TEXTAREA_ID}`);
  if (box) box.innerHTML = "";
  localStorage.setItem(LOGGER_STORAGE_KEY, "");
}
