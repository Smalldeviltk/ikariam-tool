/**
 * Number and time formatting.
 *
 * Both original scripts carried near-identical copies of these helpers
 * (`formatTimeLengthToStr` / `Utils.FormatTimeLengthToStr`, `formatNumToStr` /
 * `Utils.FormatNumToStr`, ...). They are merged here, keeping each algorithm
 * step for step so output does not shift by a single character.
 */

const TIME_FACTORS: ReadonlyArray<readonly [suffix: string, seconds: number]> =
  [
    ["Y", 31536000],
    ["M", 2520000],
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
  if (total < 0) return "Finished.";

  let remaining = Math.ceil(total / 1000);
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

/** Format a timestamp as `"today, 14:05:00"` or `"Tue Jul 29, 14:05:00"`. */
export function formatFullTimeToDateString(
  timestamp: number | undefined,
  precise = true,
): string {
  const MS_PER_DAY = 86400000;
  const date = new Date(timestamp || 0);
  let day = "";

  if (precise) {
    const dayDelta =
      Math.floor(date.getTime() / MS_PER_DAY) -
      Math.floor(Date.now() / MS_PER_DAY);
    switch (dayDelta) {
      case 0:
        day = "today";
        break;
      case 1:
        day = "tomorrow";
        break;
      case -1:
        day = "yesterday";
        break;
      default:
        day = date.toString().split(" ").splice(0, 3).join(" ");
    }
  }
  if (day !== "") day += ", ";
  return day + date.toLocaleTimeString();
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

/** Comparator for `Array.prototype.sort`, ordering by a single key. */
export function compareValues<T extends Record<string, any>>(
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
    const valueA = typeof a[key] === "string" ? a[key].toUpperCase() : a[key];
    const valueB = typeof b[key] === "string" ? b[key].toUpperCase() : b[key];

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
