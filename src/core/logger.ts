/**
 * Logger writing to `<textarea id="txtLogger">` and mirroring into
 * localStorage so history survives the periodic page reloads the script does
 * to keep the session alive. Equivalent to the old `logInfo` / `clearLog`.
 */

import { qs } from "./dom";

const STORAGE_KEY = "loggerInfo";
const TEXTAREA_ID = "txtLogger";

/** Cap on retained log characters. The old code was unbounded, so the entry grew forever. */
const MAX_CHARS = 100_000;

let accountLabel = "";

export function initLogger(accountName: string): void {
  accountLabel = accountName;
  const box = qs<HTMLTextAreaElement>(`#${TEXTAREA_ID}`);
  if (box) box.innerHTML = localStorage.getItem(STORAGE_KEY) ?? "";
}

export function logInfo(message: string): void {
  const line = `${new Date().toLocaleString()} ${accountLabel} ${message}\n`;
  const box = qs<HTMLTextAreaElement>(`#${TEXTAREA_ID}`);

  if (box) {
    let next = line + box.innerHTML;
    if (next.length > MAX_CHARS) next = next.slice(0, MAX_CHARS);
    box.innerHTML = next;
    localStorage.setItem(STORAGE_KEY, next);
  }
  console.log(`[ika] ${line.trimEnd()}`);
}

export function clearLog(): void {
  const box = qs<HTMLTextAreaElement>(`#${TEXTAREA_ID}`);
  if (box) box.innerHTML = "";
  localStorage.setItem(STORAGE_KEY, "");
}
