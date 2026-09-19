/** Typed wrappers around `querySelector`, plus small DOM utilities. */

import { waitFor, type WaitForOptions } from "./async";

export function qs<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(selector);
}

export function qsa<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/** Like `qs` but throws when missing. Use for elements that must exist. */
export function qsStrict<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

/** Wait until the selector matches at least one element, then return it. */
export function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  options: WaitForOptions = {},
): Promise<T> {
  return waitFor(() => qs<T>(selector), {
    label: `waitForElement(${selector})`,
    ...options,
  });
}

/** Wait until the selector matches at least `min` elements, then return them. */
export function waitForElements<T extends Element = HTMLElement>(
  selector: string,
  min = 1,
  options: WaitForOptions = {},
): Promise<T[]> {
  return waitFor(
    () => {
      const list = qsa<T>(selector);
      return list.length >= min ? list : null;
    },
    { label: `waitForElements(${selector})`, ...options },
  );
}

/** Click an element if it exists. Returns whether a click happened. */
export function clickIfPresent(selector: string, root?: ParentNode): boolean {
  const el = qs<HTMLElement>(selector, root);
  if (!el) return false;
  el.click();
  return true;
}

/** Remove an element. Replaces the `.outerHTML = ""` idiom of the old code. */
export function removeElement(selector: string): void {
  qs(selector)?.remove();
}

/** Append a `<style>` block to `<head>`. */
export function addStyle(css: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

/**
 * Set a form field's value the way a human would, so the page notices.
 *
 * Assigning `.value` fires nothing. Ikariam recalculates the ship count, the
 * mission summary and its own clamping from `input`/`change`/`blur` handlers,
 * so a bare assignment leaves the form showing — and possibly submitting —
 * stale numbers. The original scripts did exactly that; the IkaEasy extension
 * always follows a value change with `.focus().blur()` for this reason.
 *
 * The events are dispatched in the order a real edit produces them.
 */
export function setInputValue(input: HTMLInputElement, value: string): void {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  // `.blur()` fires the blur event itself. Dispatching another by hand as well
  // would run the game's handler twice for one edit.
  input.blur();
}

/** `"1,234"` / `"1 234"` -> `1234`. Same semantics as the old `stringToNumber`. */
export function stringToNumber(str: string): number {
  return parseFloat(str.replace(",", "").replace(" ", ""));
}

/** Read an element's `innerHTML` as a number. Returns 0 when absent. */
export function readNumber(selector: string): number {
  const el = qs(selector);
  if (!el) return 0;
  return Number(el.innerHTML.replace(/,/g, "").trim());
}

/**
 * Read an element's `innerHTML` as a number, or `null` when the element is
 * absent or does not parse.
 *
 * `readNumber` collapses both of those into 0, which is fine for a display
 * but not for a value another reading is meant to fall back from — a real 0
 * and a missing element have to be told apart.
 */
export function readNumberOrNull(selector: string): number | null {
  const el = qs(selector);
  if (!el) return null;
  const parsed = Number(el.innerHTML.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Read an element's trimmed `innerHTML`. Returns `""` when absent. */
export function readText(selector: string): string {
  return qs(selector)?.innerHTML.trim() ?? "";
}
