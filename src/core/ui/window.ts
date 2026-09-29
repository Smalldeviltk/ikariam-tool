/**
 * A draggable window, styled to look like the game's own.
 *
 * WHY
 * The Send Resources panel was a fixed `<div>` pinned at `top:45px; left:635px`
 * with twelve buttons in one row and every style written inline. It covered the
 * game at some window sizes, could not be moved, and grouped nothing.
 *
 * Modelled on IkaEasy's `js/helper/win.js` and `tpl/helper-win.ejs`: a header
 * that drags, a scrolling body, Escape to close, and the game's own CSS classes
 * so it does not look bolted on. Rewritten rather than ported — that one needs
 * jQuery UI, and Send Resources runs in page context with no jQuery of its own.
 *
 * This lives in `core/` because both scripts can use it. Empire Overview has
 * its own board already and is left alone: merging the panel into it would
 * make Send Resources depend on Empire Overview again, which is what the town
 * cache was built to remove (`docs/improvement-plan.md`, the Phase 2 design
 * decision).
 */

import { addStyle } from "@core/dom";
import { WINDOW_CLOSE_TITLE } from "@core/messages";
import type { Store } from "@core/storage";

/** Where the window was left. Stored so it stays put across page loads. */
export interface WindowPosition {
  left: number;
  top: number;
}

export interface WindowOptions {
  /** Element id, and the storage key suffix when `store` is given. */
  id: string;
  title: string;
  /** Any CSS width. Defaults to fitting the content. */
  width?: string;
  /** Remembers the position between sessions when supplied. */
  store?: Store;
  onClose?: () => void;
}

export interface GameWindow {
  readonly root: HTMLElement;
  /** Put content in here. */
  readonly content: HTMLElement;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  setTitle(title: string): void;
  /** Remove it from the page entirely. */
  destroy(): void;
}

/** Room left under the window body, so it never runs off the viewport. */
const BODY_BOTTOM_MARGIN = 120;

/** The window body never gets shorter than this, however small the screen. */
const MIN_BODY_HEIGHT = 120;

/**
 * How much of a window must stay on screen after clamping: enough of the
 * header to grab it and drag it back.
 */
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 60;

/** Where a window first appears, when nothing was remembered. */
const DEFAULT_POSITION: WindowPosition = { left: 120, top: 120 };

export const WINDOW_STYLE_ID = "ika-window-style";

/**
 * The stylesheet, installed once for all windows.
 *
 * Colours follow the game's parchment palette so the window reads as part of
 * it rather than pasted on top.
 */
function windowStyles(): string {
  return `
.ika-window {
  position: fixed;
  z-index: 1000;
  min-width: 260px;
  border: 1px solid #b79b6f;
  border-radius: 4px;
  background: #f8e7b3;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
  font-size: 11px;
  color: #3b2c1a;
}
.ika-window[hidden] { display: none !important; }
.ika-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border-bottom: 1px solid #b79b6f;
  background: #e8d199;
  border-radius: 3px 3px 0 0;
  cursor: move;
  user-select: none;
}
.ika-window-title { font-weight: bold; font-size: 12px; }
.ika-window-close {
  cursor: pointer;
  padding: 0 4px;
  font-weight: bold;
  line-height: 1;
}
.ika-window-close:hover { color: #a3301f; }
.ika-window-body { overflow: auto; padding: 8px; }
.ika-window-footer {
  padding: 4px 8px;
  border-top: 1px solid #b79b6f;
  font-size: 10px;
  color: #6b5433;
  min-height: 14px;
}
.ika-group { margin-bottom: 8px; }
.ika-group:last-child { margin-bottom: 0; }
.ika-group-title {
  font-weight: bold;
  border-bottom: 1px dotted #b79b6f;
  margin-bottom: 4px;
  padding-bottom: 2px;
}
.ika-group button { margin: 0 4px 4px 0; }
`;
}

function installStyles(): void {
  if (document.getElementById(WINDOW_STYLE_ID)) return;
  addStyle(windowStyles()).id = WINDOW_STYLE_ID;
}

/**
 * Keep a window on screen.
 *
 * A remembered position is only valid for the window size it was saved at: a
 * smaller screen, or a game zoom change, can leave it entirely off-view with no
 * way to drag it back.
 */
function clampToViewport(position: WindowPosition): WindowPosition {
  const maxLeft = Math.max(0, window.innerWidth - MIN_VISIBLE_WIDTH);
  const maxTop = Math.max(0, window.innerHeight - MIN_VISIBLE_HEIGHT);
  return {
    left: Math.min(Math.max(0, position.left), maxLeft),
    top: Math.min(Math.max(0, position.top), maxTop),
  };
}

/** Drag the window by its header. */
function makeDraggable(
  root: HTMLElement,
  handle: HTMLElement,
  onMoved: (position: WindowPosition) => void,
): void {
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const onPointerMove = (event: PointerEvent) => {
    const next = clampToViewport({
      left: originLeft + (event.clientX - startX),
      top: originTop + (event.clientY - startY),
    });
    root.style.left = `${next.left}px`;
    root.style.top = `${next.top}px`;
  };

  const onPointerUp = (event: PointerEvent) => {
    handle.releasePointerCapture?.(event.pointerId);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    onMoved({
      left: parseInt(root.style.left, 10) || 0,
      top: parseInt(root.style.top, 10) || 0,
    });
  };

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    // Let the close button do its job.
    if ((event.target as HTMLElement)?.classList.contains("ika-window-close")) {
      return;
    }
    event.preventDefault();
    startX = event.clientX;
    startY = event.clientY;
    originLeft = parseInt(root.style.left, 10) || 0;
    originTop = parseInt(root.style.top, 10) || 0;
    handle.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}

export function createWindow(options: WindowOptions): GameWindow {
  installStyles();

  const positionKey = `ikaWindow_${options.id}`;
  const stored = options.store?.getJSON<WindowPosition | null>(
    positionKey,
    null,
  );
  const position = clampToViewport(stored ?? DEFAULT_POSITION);

  const root = document.createElement("div");
  root.id = options.id;
  root.className = "ika-window";
  root.hidden = true;
  root.style.left = `${position.left}px`;
  root.style.top = `${position.top}px`;
  if (options.width) root.style.width = options.width;

  root.innerHTML = `
    <div class="ika-window-header">
      <span class="ika-window-title"></span>
      <span class="ika-window-close" title="${WINDOW_CLOSE_TITLE}">&#10005;</span>
    </div>
    <div class="ika-window-body"></div>
    <div class="ika-window-footer"></div>`;

  const header = root.querySelector<HTMLElement>(".ika-window-header")!;
  const title = root.querySelector<HTMLElement>(".ika-window-title")!;
  const body = root.querySelector<HTMLElement>(".ika-window-body")!;
  title.textContent = options.title;

  // The game's own popups live in `#container`; sitting alongside them keeps
  // the stacking order sane. `body` is the fallback for a page that has none.
  (document.getElementById("container") ?? document.body).appendChild(root);

  const applyMaxHeight = () => {
    body.style.maxHeight = `${Math.max(MIN_BODY_HEIGHT, window.innerHeight - BODY_BOTTOM_MARGIN)}px`;
  };
  applyMaxHeight();
  window.addEventListener("resize", applyMaxHeight);

  const closeOnEscape = (event: KeyboardEvent) => {
    // Not while typing: every settings dialog here is full of text inputs.
    const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (event.key === "Escape" && !root.hidden) api.close();
  };

  makeDraggable(root, header, (moved) => {
    options.store?.setJSON(positionKey, moved);
  });

  const api: GameWindow = {
    root,
    content: body,
    isOpen: () => !root.hidden,
    open() {
      // Re-clamp on every open: the viewport may have changed since the
      // position was saved, or since it was last closed.
      const next = clampToViewport({
        left: parseInt(root.style.left, 10) || 0,
        top: parseInt(root.style.top, 10) || 0,
      });
      root.style.left = `${next.left}px`;
      root.style.top = `${next.top}px`;
      applyMaxHeight();
      root.hidden = false;
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      options.onClose?.();
    },
    toggle() {
      if (root.hidden) api.open();
      else api.close();
    },
    setTitle(text: string) {
      title.textContent = text;
    },
    destroy() {
      window.removeEventListener("resize", applyMaxHeight);
      document.removeEventListener("keydown", closeOnEscape);
      root.remove();
    },
  };

  root
    .querySelector<HTMLElement>(".ika-window-close")!
    .addEventListener("click", () => api.close());

  document.addEventListener("keydown", closeOnEscape);

  return api;
}

/** The footer line, used for live status. */
export function setWindowFooter(win: GameWindow, text: string): void {
  const footer = win.root.querySelector<HTMLElement>(".ika-window-footer");
  if (footer) footer.textContent = text;
}

/* ─────────────────────────────── Toasts ────────────────────────────────── */

export const TOAST_STYLE_ID = "ika-toast-style";
export const TOAST_STACK_ID = "ika-toast-stack";

/** How long a toast stays: a base, plus reading time for longer messages. */
const TOAST_BASE_MS = 4000;
const TOAST_MS_PER_CHARACTER = 50;
const TOAST_MAX_MS = 15000;

/** Length of the fade-out, matching the CSS transition. */
const TOAST_FADE_MS = 400;

/** Time a toast stays on screen before it starts to fade. */
export function toastDuration(message: string): number {
  return Math.min(
    TOAST_MAX_MS,
    TOAST_BASE_MS + message.length * TOAST_MS_PER_CHARACTER,
  );
}

function toastStyles(): string {
  return `
#${TOAST_STACK_ID} {
  position: fixed;
  z-index: 100000;
  left: 50%;
  bottom: 5em;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  max-width: 480px;
  pointer-events: none;
}
.ika-toast {
  pointer-events: auto;
  cursor: pointer;
  padding: 6px 10px;
  border: 1px solid #b79b6f;
  border-radius: 4px;
  background: #f8e7b3;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
  font-size: 11px;
  color: #3b2c1a;
  white-space: pre-line;
  opacity: 1;
  transition: opacity ${TOAST_FADE_MS}ms;
}
.ika-toast.ika-toast-hiding { opacity: 0; }
`;
}

function toastStack(): HTMLElement {
  if (!document.getElementById(TOAST_STYLE_ID)) {
    addStyle(toastStyles()).id = TOAST_STYLE_ID;
  }
  let stack = document.getElementById(TOAST_STACK_ID);
  if (!stack) {
    stack = document.createElement("div");
    stack.id = TOAST_STACK_ID;
    document.body.appendChild(stack);
  }
  return stack;
}

/**
 * Show a message at the bottom of the page that fades by itself, in place of
 * `window.alert`, which stops the page until it is dismissed. A click
 * dismisses it early. The message is plain text; line breaks are kept.
 */
export function showToast(message: string): HTMLElement {
  const toast = document.createElement("div");
  toast.className = "ika-toast";
  toast.textContent = message;
  toastStack().appendChild(toast);

  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    clearTimeout(hideTimer);
    toast.classList.add("ika-toast-hiding");
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  };
  hideTimer = setTimeout(hide, toastDuration(message));
  toast.addEventListener("click", hide, { once: true });
  return toast;
}
