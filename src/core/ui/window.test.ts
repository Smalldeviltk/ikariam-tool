import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWindow,
  setWindowFooter,
  showToast,
  TOAST_STACK_ID,
  TOAST_STYLE_ID,
  toastDuration,
  WINDOW_COLLAPSE_CLASS,
  WINDOW_COLLAPSED_CLASS,
  WINDOW_STYLE_ID,
} from "./window";
import { accountStore } from "@core/storage";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `<div id="container"></div>`;
  document.head.innerHTML = "";
});

/** Drag the header from one point to another. */
function drag(
  handle: HTMLElement,
  from: [number, number],
  to: [number, number],
) {
  handle.dispatchEvent(
    new PointerEvent("pointerdown", {
      clientX: from[0],
      clientY: from[1],
      bubbles: true,
    }),
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", { clientX: to[0], clientY: to[1] }),
  );
  window.dispatchEvent(
    new PointerEvent("pointerup", { clientX: to[0], clientY: to[1] }),
  );
}

describe("createWindow", () => {
  it("starts closed and opens on demand", () => {
    const win = createWindow({ id: "test-window", title: "Test" });
    expect(win.isOpen()).toBe(false);

    win.open();
    expect(win.isOpen()).toBe(true);

    win.toggle();
    expect(win.isOpen()).toBe(false);
  });

  it("lives inside the game's container, alongside its own popups", () => {
    createWindow({ id: "test-window", title: "Test" });
    expect(document.querySelector("#container > #test-window")).toBeTruthy();
  });

  it("falls back to the body when the page has no container", () => {
    document.body.innerHTML = "";
    createWindow({ id: "test-window", title: "Test" });
    expect(document.querySelector("body > #test-window")).toBeTruthy();
  });

  it("installs its stylesheet once, however many windows there are", () => {
    createWindow({ id: "a", title: "A" });
    createWindow({ id: "b", title: "B" });
    expect(document.querySelectorAll(`#${WINDOW_STYLE_ID}`)).toHaveLength(1);
  });

  it("closes on the close button and reports it", () => {
    const onClose = vi.fn();
    const win = createWindow({ id: "test-window", title: "Test", onClose });
    win.open();

    win.root.querySelector<HTMLElement>(".ika-window-close")!.click();

    expect(win.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const win = createWindow({ id: "test-window", title: "Test" });
    win.open();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(win.isOpen()).toBe(false);
  });

  it(
    "ignores Escape while a field has focus — every settings dialog here is " +
      "full of text inputs, and losing one mid-edit would be worse than not " +
      "having the shortcut",
    () => {
      const win = createWindow({ id: "test-window", title: "Test" });
      win.open();
      win.content.innerHTML = `<input id="field"/>`;
      const field = win.content.querySelector("#field")!;

      field.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );

      expect(win.isOpen()).toBe(true);
    },
  );
});

describe("remembering whether it was left open", () => {
  const options = (store = accountStore("tester")) => ({
    id: "test-window",
    title: "Test",
    store,
    rememberOpen: true,
    openByDefault: true,
  });

  it("opens on the first load when nothing is stored yet", () => {
    expect(createWindow(options()).isOpen()).toBe(true);
  });

  it("stays closed on the next load after being closed", () => {
    const store = accountStore("tester");
    createWindow(options(store)).close();

    document.body.innerHTML = `<div id="container"></div>`;
    expect(createWindow(options(store)).isOpen()).toBe(false);
  });

  it("opens on the next load after being opened again", () => {
    const store = accountStore("tester");
    const first = createWindow(options(store));
    first.close();
    first.toggle();

    document.body.innerHTML = `<div id="container"></div>`;
    expect(createWindow(options(store)).isOpen()).toBe(true);
  });

  it("stores nothing for a window that does not ask to remember", () => {
    const store = accountStore("tester");
    const win = createWindow({ id: "test-window", title: "Test", store });
    win.open();
    win.close();

    expect(store.get("ikaWindowOpen_test-window")).toBeNull();
  });
});

describe("folding down to the title bar", () => {
  const options = (store = accountStore("tester")) => ({
    id: "test-window",
    title: "Test",
    store,
    collapsible: true,
    openByDefault: true,
  });

  const foldButton = (win: { root: HTMLElement }) =>
    win.root.querySelector<HTMLElement>(`.${WINDOW_COLLAPSE_CLASS}`);

  it("has no fold button unless asked for", () => {
    expect(
      foldButton(createWindow({ id: "test-window", title: "T" })),
    ).toBeNull();
  });

  it("folds from the header's button and unfolds again, staying open", () => {
    const win = createWindow(options());
    const button = foldButton(win)!;
    expect(button.textContent).toBe("▾");
    expect(win.root.classList.contains(WINDOW_COLLAPSED_CLASS)).toBe(false);

    button.click();
    expect(win.root.classList.contains(WINDOW_COLLAPSED_CLASS)).toBe(true);
    expect(button.textContent).toBe("▸");
    expect(button.title).toBe("Expand");
    expect(win.isOpen()).toBe(true);

    button.click();
    expect(win.root.classList.contains(WINDOW_COLLAPSED_CLASS)).toBe(false);
    expect(button.title).toBe("Collapse");
  });

  it("stays folded on the next load", () => {
    const store = accountStore("tester");
    foldButton(createWindow(options(store)))!.click();

    document.body.innerHTML = `<div id="container"></div>`;
    const next = createWindow(options(store));
    expect(next.root.classList.contains(WINDOW_COLLAPSED_CLASS)).toBe(true);
    expect(foldButton(next)!.textContent).toBe("▸");
  });

  it("hides the body and footer while folded, keeping the header", () => {
    createWindow(options());
    const css = document.getElementById(WINDOW_STYLE_ID)!.textContent!;
    expect(css).toContain(
      `.${WINDOW_COLLAPSED_CLASS} .ika-window-body,\n.${WINDOW_COLLAPSED_CLASS} .ika-window-footer { display: none; }`,
    );
  });

  it("tells its owner when it folds or unfolds, from the button or the API", () => {
    const onCollapsedChange = vi.fn();
    const win = createWindow({ ...options(), onCollapsedChange });

    foldButton(win)!.click();
    win.toggleCollapsed();

    expect(onCollapsedChange.mock.calls).toEqual([[true], [false]]);
  });

  it("does not start a drag when the fold button is pressed", () => {
    const win = createWindow(options());
    const before = [win.root.style.left, win.root.style.top];

    drag(foldButton(win)!, [10, 10], [200, 200]);

    expect([win.root.style.left, win.root.style.top]).toEqual(before);
  });
});

describe("a window that is always open", () => {
  const options = (store = accountStore("tester")) => ({
    id: "test-window",
    title: "Test",
    store,
    collapsible: true,
    alwaysOpen: true,
  });

  const folded = (win: { root: HTMLElement }) =>
    win.root.classList.contains(WINDOW_COLLAPSED_CLASS);

  it("opens on creation and has no close button", () => {
    const win = createWindow(options());
    expect(win.isOpen()).toBe(true);
    expect(win.root.querySelector(".ika-window-close")).toBeNull();
  });

  it("folds on Escape and unfolds on the next, staying open", () => {
    const win = createWindow(options());

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(win.isOpen()).toBe(true);
    expect(folded(win)).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(win.isOpen()).toBe(true);
    expect(folded(win)).toBe(false);
  });

  it("ignores Escape while a field has focus", () => {
    const win = createWindow(options());
    win.content.innerHTML = `<input id="field"/>`;

    win.content
      .querySelector("#field")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );

    expect(folded(win)).toBe(false);
  });

  it("cannot be closed, by close() or toggle()", () => {
    const onClose = vi.fn();
    const win = createWindow({ ...options(), onClose });

    win.close();
    win.toggle();

    expect(win.isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens on the next load whatever was stored as its open state", () => {
    const store = accountStore("tester");
    store.setJSON("ikaWindowOpen_test-window", false);

    expect(
      createWindow({ ...options(store), rememberOpen: true }).isOpen(),
    ).toBe(true);
  });

  it("stays folded on the next load when Escape folded it", () => {
    const store = accountStore("tester");
    createWindow(options(store));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    document.body.innerHTML = `<div id="container"></div>`;
    expect(folded(createWindow(options(store)))).toBe(true);
  });
});

describe("dragging", () => {
  it("moves the window by its header", () => {
    const win = createWindow({ id: "test-window", title: "Test" });
    win.open();
    const header = win.root.querySelector<HTMLElement>(".ika-window-header")!;

    drag(header, [200, 200], [260, 240]);

    expect(win.root.style.left).toBe("180px");
    expect(win.root.style.top).toBe("160px");
  });

  it("remembers where it was left", () => {
    const store = accountStore("tester");
    const win = createWindow({ id: "test-window", title: "Test", store });
    win.open();
    drag(
      win.root.querySelector<HTMLElement>(".ika-window-header")!,
      [200, 200],
      [230, 250],
    );
    win.destroy();

    const again = createWindow({ id: "test-window", title: "Test", store });
    expect(again.root.style.left).toBe("150px");
    expect(again.root.style.top).toBe("170px");
  });

  it(
    "REGRESSION: keeps a remembered position on screen — a position saved on " +
      "a larger screen would otherwise put the window entirely out of view, " +
      "with no header left to drag it back by",
    () => {
      const store = accountStore("tester");
      store.setJSON("ikaWindow_test-window", { left: 9000, top: 9000 });

      const win = createWindow({ id: "test-window", title: "Test", store });

      expect(parseInt(win.root.style.left, 10)).toBeLessThan(window.innerWidth);
      expect(parseInt(win.root.style.top, 10)).toBeLessThan(window.innerHeight);
    },
  );

  it("never drags off the left or top edge", () => {
    const win = createWindow({ id: "test-window", title: "Test" });
    win.open();

    drag(
      win.root.querySelector<HTMLElement>(".ika-window-header")!,
      [200, 200],
      [-5000, -5000],
    );

    expect(win.root.style.left).toBe("0px");
    expect(win.root.style.top).toBe("0px");
  });
});

describe("content and chrome", () => {
  it("renames", () => {
    const win = createWindow({ id: "test-window", title: "Before" });
    win.setTitle("After");
    expect(win.root.querySelector(".ika-window-title")!.textContent).toBe(
      "After",
    );
  });

  it("writes the footer, which is where live status goes", () => {
    const win = createWindow({ id: "test-window", title: "Test" });
    setWindowFooter(win, "2 tasks queued");
    expect(win.root.querySelector(".ika-window-footer")!.textContent).toBe(
      "2 tasks queued",
    );
  });

  it("removes itself completely", () => {
    const win = createWindow({ id: "test-window", title: "Test" });
    win.destroy();
    expect(document.querySelector("#test-window")).toBeNull();
  });
});

describe("showToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function toasts(): string[] {
    return [...document.querySelectorAll(`#${TOAST_STACK_ID} .ika-toast`)].map(
      (toast) => toast.textContent ?? "",
    );
  }

  it("shows the message as text, never as markup", () => {
    showToast("<b>W-Athens</b>");
    expect(toasts()).toEqual(["<b>W-Athens</b>"]);
    expect(document.querySelector(`#${TOAST_STACK_ID} b`)).toBeNull();
  });

  it("stacks several messages instead of replacing one", () => {
    showToast("first");
    showToast("second");
    expect(toasts()).toEqual(["first", "second"]);
  });

  it("goes away by itself once it has been read", () => {
    const message = "Please choose both towns.";
    showToast(message);

    vi.advanceTimersByTime(toastDuration(message) - 1);
    expect(toasts()).toEqual([message]);

    vi.advanceTimersByTime(1000);
    expect(toasts()).toEqual([]);
  });

  it("stays longer for a longer message, up to a limit", () => {
    expect(toastDuration("x".repeat(200))).toBeGreaterThan(
      toastDuration("short"),
    );
    expect(toastDuration("x".repeat(100_000))).toBe(
      toastDuration("x".repeat(200_000)),
    );
  });

  it("goes away early when clicked", () => {
    showToast("click me");
    document.querySelector<HTMLElement>(".ika-toast")!.click();
    vi.advanceTimersByTime(1000);
    expect(toasts()).toEqual([]);
  });

  it("installs its stylesheet once, however many toasts there are", () => {
    showToast("a");
    showToast("b");
    expect(document.querySelectorAll(`#${TOAST_STYLE_ID}`)).toHaveLength(1);
  });

  it("brings its stack back after the page body was redrawn", () => {
    showToast("a");
    document.body.innerHTML = "";
    showToast("b");
    expect(toasts()).toEqual(["b"]);
  });
});
