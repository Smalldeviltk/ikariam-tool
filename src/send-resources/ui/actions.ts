/**
 * UI event dispatch.
 *
 * The original wired buttons to functions with inline
 * `onclick="addSendResource();"`, which only worked because every function was
 * assigned onto `window` in page context. After bundling, functions live in
 * module scope, so `window.addSendResource` no longer exists and an inline
 * handler would throw a ReferenceError.
 *
 * Instead there is one dispatcher: buttons declare `data-ika-action="..."` and
 * a single listener on `document` handles them all. A useful side effect is
 * that string-built HTML keeps working after being re-rendered — which the
 * game's popups do constantly, and which directly attached listeners would not
 * survive.
 */

import { escapeHtml } from "@core/dom";
import { MOVE_BUTTON } from "../messages";

export type ActionHandler = (
  element: HTMLElement,
  event: MouseEvent,
) => void | Promise<void>;

const handlers = new Map<string, ActionHandler>();

export function registerActions(map: Record<string, ActionHandler>): void {
  for (const [name, handler] of Object.entries(map)) {
    handlers.set(name, handler);
  }
}

/** Build the HTML attributes for an action button. */
export function action(
  name: string,
  data?: Record<string, string | number>,
): string {
  const extra = data
    ? Object.entries(data)
        .map(([key, value]) => ` data-${key}="${escapeHtml(String(value))}"`)
        .join("")
    : "";
  return `data-ika-action="${name}"${extra}`;
}

/**
 * The ↑ and ↓ buttons of one row of a reorderable list. Each moves the row
 * one place; the first row's ↑ and the last row's ↓ are disabled.
 */
export function moveButtons(
  names: { up: string; down: string },
  data: Record<string, string | number>,
  position: { isFirst: boolean; isLast: boolean },
): string {
  const button = (
    name: string,
    title: string,
    label: string,
    disabled: boolean,
  ) =>
    `<button class="button ika-move" title="${title}"${disabled ? " disabled" : ""} ` +
    `${action(name, data)}>${label}</button>`;
  return (
    button(names.up, MOVE_BUTTON.up, "↑", position.isFirst) +
    button(names.down, MOVE_BUTTON.down, "↓", position.isLast)
  );
}

let installed = false;

export function installActionDispatcher(): void {
  if (installed) return;
  installed = true;

  document.addEventListener(
    "click",
    (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-ika-action]",
      );
      if (!target) return;

      const name = target.dataset.ikaAction;
      if (!name) return;

      const handler = handlers.get(name);
      if (!handler) {
        console.warn(`[ika] No handler registered for action "${name}"`);
        return;
      }
      event.preventDefault();
      void handler(target, event as MouseEvent);
    },
    // Capture phase so this runs before the game's own handlers.
    true,
  );
}
