import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capVisibleRows,
  ensureStyle,
  escapeHtml,
  isTypingTarget,
  readNumberOrNull,
  setInputValue,
} from "./dom";

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("escapeHtml", () => {
  it("escapes every character that can open markup or close an attribute", () => {
    expect(escapeHtml(`<a href="x" title='y'>A & B</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;A &amp; B&lt;/a&gt;",
    );
  });

  it("leaves text without those characters as it is", () => {
    expect(escapeHtml("W-Athens 12")).toBe("W-Athens 12");
  });

  it("makes a name safe inside a quoted attribute", () => {
    // The kind of value that, unescaped, closed `data-tooltip="…"` and
    // added an attribute of its own.
    document.body.innerHTML = `<div title="${escapeHtml('x" data-planted="1')}"></div>`;
    expect(document.querySelector("[data-planted]")).toBeNull();
    expect(document.querySelector("div")!.title).toBe('x" data-planted="1');
  });
});

describe("ensureStyle", () => {
  it("adds the sheet once, under its id", () => {
    ensureStyle("ika-test-style", ".a { color: red; }");
    ensureStyle("ika-test-style", ".a { color: blue; }");

    const sheets = document.querySelectorAll("#ika-test-style");
    expect(sheets).toHaveLength(1);
    expect(sheets[0].textContent).toBe(".a { color: red; }");
  });

  it("builds the text only when the sheet is added", () => {
    const build = vi.fn(() => ".b {}");
    ensureStyle("ika-built-style", build);
    ensureStyle("ika-built-style", build);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("adds it again once the page has dropped it", () => {
    ensureStyle("ika-test-style", ".a {}");
    document.getElementById("ika-test-style")!.remove();
    ensureStyle("ika-test-style", ".a {}");
    expect(document.querySelectorAll("#ika-test-style")).toHaveLength(1);
  });
});

describe("isTypingTarget", () => {
  it("is true for the fields a player types in", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isTypingTarget(document.createElement(tag)), tag).toBe(true);
    }
  });

  it("is false for anything else, and for no target", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(document)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("setInputValue", () => {
  it("fires input, change and blur, in that order, as an edit by hand does", () => {
    document.body.innerHTML = `<input id="field" value="0">`;
    const field = document.getElementById("field") as HTMLInputElement;
    const seen: string[] = [];
    for (const type of ["input", "change", "blur"]) {
      field.addEventListener(type, () => seen.push(`${type}:${field.value}`));
    }

    setInputValue(field, "620");

    expect(seen).toEqual(["input:620", "change:620", "blur:620"]);
  });
});

describe("readNumberOrNull", () => {
  it("reads a game number, and null when the element is absent", () => {
    document.body.innerHTML = `<span id="stock">12,345</span>`;
    expect(readNumberOrNull("#stock")).toBe(12345);
    expect(readNumberOrNull("#missing")).toBeNull();
  });
});

describe("capVisibleRows", () => {
  const ROW_HEIGHT = 20;
  const realRect = HTMLElement.prototype.getBoundingClientRect;

  /** A box of `rows` rows, each `ROW_HEIGHT` tall, from the top of the page. */
  function box(rows: number): HTMLElement {
    document.body.innerHTML =
      `<div id="box"><table>` +
      Array.from(
        { length: rows },
        (_, i) => `<tr class="row" data-i="${i}"></tr>`,
      ).join("") +
      `</table></div>`;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const index = Number((this as HTMLElement).dataset.i ?? -1);
      const top = index < 0 ? 0 : index * ROW_HEIGHT;
      const bottom = index < 0 ? rows * ROW_HEIGHT : top + ROW_HEIGHT;
      return {
        top,
        bottom,
        left: 0,
        right: 0,
        width: 0,
        height: bottom - top,
      } as DOMRect;
    };
    return document.getElementById("box")!;
  }

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
  });

  it("caps the box at the bottom of the last row allowed, and scrolls the rest", () => {
    const element = box(12);
    capVisibleRows(element, "tr.row", 10);
    expect(element.style.maxHeight).toBe(`${10 * ROW_HEIGHT}px`);
    expect(element.style.overflowY).toBe("auto");
  });

  it("puts no cap on a box with no more rows than allowed", () => {
    const element = box(10);
    element.style.maxHeight = "50px";
    capVisibleRows(element, "tr.row", 10);
    expect(element.style.maxHeight).toBe("");
  });

  it("keeps the cap it had while the box is not laid out", () => {
    const element = box(12);
    element.style.maxHeight = "150px";
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
      }) as DOMRect;
    capVisibleRows(element, "tr.row", 10);
    expect(element.style.maxHeight).toBe("150px");
  });
});
