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

export type ActionHandler = (
  element: HTMLElement,
  event: MouseEvent,
) => void | Promise<void>;

const handlers = new Map<string, ActionHandler>();

export function registerAction(name: string, handler: ActionHandler): void {
  handlers.set(name, handler);
}

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
        .map(
          ([key, value]) => ` data-${key}="${escapeAttribute(String(value))}"`,
        )
        .join("")
    : "";
  return `data-ika-action="${name}"${extra}`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
