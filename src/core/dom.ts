/** Typed wrappers around `querySelector`, plus small DOM utilities. */

import { waitFor, type WaitForOptions } from "./async";
import { parseGameNumber } from "./format";

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

/**
 * Read an element's text as a number, or `null` when the element is absent or
 * does not parse.
 *
 * `null` rather than 0, because this feeds values another reading falls back
 * from — a real 0 and a missing element have to be told apart. Parsing is
 * `parseGameNumber`'s.
 */
export function readNumberOrNull(selector: string): number | null {
  const el = qs(selector);
  return el ? parseGameNumber(el.textContent) : null;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape text for use inside HTML built as a string, in element content or
 * in a quoted attribute. Town and account names come from the game, and every
 * template here interpolates them.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Let `box` show at most `count` of the rows matched by `rowSelector` inside
 * it, and scroll the rest: its `max-height` reaches the bottom of row
 * `count` (anything above the rows, such as a header, included). With no
 * more rows than that, the cap is removed.
 *
 * Measured rather than a fixed height, because a row's height depends on
 * where it is drawn — this script's window and the game's popups style
 * their tables differently. A box that is not laid out (hidden) measures
 * zero and keeps the cap it had; call this again once it shows.
 */
export function capVisibleRows(
  box: HTMLElement,
  rowSelector: string,
  count: number,
): void {
  const rows = box.querySelectorAll<HTMLElement>(rowSelector);
  if (rows.length <= count) {
    box.style.maxHeight = "";
    return;
  }

  const previousCap = box.style.maxHeight;
  const scrollTop = box.scrollTop;
  box.style.overflowY = "auto";
  box.style.maxHeight = "";
  const top = box.getBoundingClientRect().top;
  const bottom = rows[count - 1].getBoundingClientRect().bottom;
  if (bottom - top <= 0) {
    box.style.maxHeight = previousCap;
    return;
  }
  box.style.maxHeight = `${Math.ceil(bottom - top)}px`;
  box.scrollTop = scrollTop;
}
