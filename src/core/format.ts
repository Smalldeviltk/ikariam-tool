/**
 * Number and time formatting, and parsing numbers the game renders.
 *
 * Both original scripts carried near-identical copies of these helpers
 * (`formatTimeLengthToStr` / `Utils.FormatTimeLengthToStr`, `formatNumToStr` /
 * `Utils.FormatNumToStr`, ...). They are merged here, keeping each algorithm
 * step for step so output does not shift by a single character.
 */

import { TIME_FINISHED } from "./messages";

export const MS_PER_SECOND = 1000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;
export const SECONDS_PER_HOUR = 3600;

const TIME_FACTORS: ReadonlyArray<readonly [suffix: string, seconds: number]> =
  [
    // The game's year is 365 days and its month 30 (measured 01/10 against
    // the building help pages); the month was 2520000 s, about 29.17 days.
    ["Y", 31536000],
    ["M", 2592000],
    ["D", 86400],
    ["h", 3600],
    ["m", 60],
    ["s", 1],
  ];

/**
 * Format a duration in milliseconds as `"2D 5h"`.
 * Returns the exact string `"Finished."` for negative input — several call
 * sites compare against that literal.
 */
export function formatTimeLengthToStr(
  milliseconds: number | undefined,
  precision = 2,
  spacer = " ",
): string {
  const total = milliseconds || 0;
  if (total < 0) return TIME_FINISHED;

  let remaining = Math.ceil(total / MS_PER_SECOND);
  let precisionLeft = precision;
  let out = "";

  for (const [suffix, factor] of TIME_FACTORS) {
    const units = Math.floor(remaining / factor);
    if (Number.isNaN(units)) return out;
    if (precisionLeft > 0 && (units > 0 || out !== "")) {
      remaining -= units * factor;
      if (out !== "") out += spacer;
      out += units === 0 ? "" : units + suffix;
      precisionLeft = units === 0 ? precisionLeft : precisionLeft - 1;
    }
  }
  return out;
}

/**
 * Format a number with thousand separators: `1234567` -> `"1,234,567"`.
 *
 * Keeps one quirk of the original: for input `0` it returns the NUMBER `0`,
 * not a string. Some call sites depend on that.
 */
export function formatNumToStr(
  inputNum: number,
  outputSign = false,
  precision?: number,
): string | number {
  const factor = precision ? Number("10e" + (precision - 1)) : 1;
  const thousandsSep = ",";
  const decimalSep = ".";

  if (!Number.isFinite(inputNum)) return "∞";

  const sign = inputNum > 0 ? 1 : inputNum === 0 ? 0 : -1;
  if (!sign) return inputNum;

  const parts = (Math.floor(Math.abs(inputNum * factor)) / factor + "").split(
    ".",
  );
  const out: string[] = parts[1] !== undefined ? [decimalSep, parts[1]] : [];
  const digits = parts[0].split("");

  let i = digits.length;
  let group = 1;
  while (i--) {
    out.unshift(digits.pop() as string);
    if (i && group % 3 === 0) out.unshift(thousandsSep);
    group++;
  }
  if (outputSign) out.unshift(sign === 1 ? "+" : "-");
  return out.join("");
}

/**
 * A rounded amount with thousands separators: `31970` -> `"31,970"`.
 *
 * `formatNumToStr` above keeps the original's quirks (it returns the NUMBER 0
 * for 0); this is the plain version the newer tables use.
 */
export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** A sort key: strings compare case-insensitively, everything else as is. */
function sortKey(value: unknown): string | number {
  return typeof value === "string" ? value.toUpperCase() : (value as number);
}

/** Comparator for `Array.prototype.sort`, ordering by a single key. */
export function compareValues<T extends object>(
  key: keyof T,
  order: "asc" | "desc" = "asc",
): (a: T, b: T) => number {
  return (a, b) => {
    if (
      !Object.prototype.hasOwnProperty.call(a, key) ||
      !Object.prototype.hasOwnProperty.call(b, key)
    ) {
      return 0;
    }
    const valueA = sortKey(a[key]);
    const valueB = sortKey(b[key]);

    let comparison = 0;
    if (valueA > valueB) comparison = 1;
    else if (valueA < valueB) comparison = -1;

    return order === "desc" ? comparison * -1 : comparison;
  };
}

/**
 * Item with the smallest value for `key`, optionally filtered first.
 *
 * Replaces `Array.prototype.hasMin`, which the original patched directly onto
 * the built-in prototype — that leaks into `for...in` loops elsewhere.
 */
export function minBy<T>(
  items: readonly T[],
  key: keyof T,
  filter?: (item: T) => boolean,
): T | null {
  const pool = filter ? items.filter(filter) : items;
  if (pool.length === 0) return null;
  return pool.reduce((prev, curr) => (prev[key] < curr[key] ? prev : curr));
}

/**
 * A number as the game renders it: `"32,495"`, `"-525"`, `"12.3k"`, `" 1 234 "`.
 *
 * Thousands separators and whitespace are dropped, a trailing `k` multiplies
 * by a thousand (the menu bar abbreviates above ~10,000), and anything that
 * still does not start with a number gives `null` — so a real 0 and an
 * unreadable value stay distinguishable. Callers that want 0 for "unreadable"
 * write `?? 0`.
 */
export function parseGameNumber(
  text: string | null | undefined,
): number | null {
  if (text === null || text === undefined) return null;
  const clean = text.replace(/,/g, "").replace(/\s/g, "");
  const parsed = parseFloat(clean);
  if (!Number.isFinite(parsed)) return null;
  return /k$/i.test(clean) ? Math.round(parsed * 1000) : parsed;
}

/** The message of anything thrown, for a log line. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
