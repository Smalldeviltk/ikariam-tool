import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWindow, setWindowFooter, WINDOW_STYLE_ID } from "./window";
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
