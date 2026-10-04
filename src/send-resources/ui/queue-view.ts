/**
 * See and edit the task queue.
 *
 * WHY
 * `TaskQueue` has had `removeById`, `replaceById` and `moveToBack` from the
 * start, and they are id-based rather than positional precisely so entries can
 * be edited while a task is running. The interface for all of that was **one
 * line of text** — `describeCurrentTransfer`, which named the task at the head
 * and nothing else.
 *
 * So there was no way to see how many orders were pending, delete one entered
 * by mistake, or reorder them. A queue stalled behind a task that kept
 * deferring looked exactly like an empty one. The API existed; only the surface
 * was missing.
 *
 * Rendering is string-built and re-rendered wholesale. That is fine at this
 * size — the queue is tens of entries, not thousands — and it means the view
 * cannot drift out of step with the queue.
 */

import { capVisibleRows, escapeHtml, qs } from "@core/dom";
import { formatInteger } from "@core/format";
import type { Task } from "@core/task-queue";
import { QUEUE_VIEW } from "../messages";
import { getTownNameFromList } from "../navigation";
import { getState } from "../state";
import { resourceLabel } from "../types";
import { action, moveButtons } from "./actions";

export const QUEUE_LIST_ID = "ikaQueueList";

/** How many entries to draw. A queue longer than this is already a problem. */
const MAX_ROWS = 50;

/** Tasks shown before the list scrolls (the user's choice). */
export const VISIBLE_ROWS = 10;

/** The box around the table that scrolls past `VISIBLE_ROWS`. */
export const QUEUE_SCROLL_CLASS = "ika-queue-scroll";

/**
 * Id of the task the runner is on, or `null` when it runs nothing. The app
 * sets this to the runner's `currentTaskId`; until then it is the head of
 * the queue, as it always was.
 */
let currentTaskId: () => string | null = () =>
  getState().queue.head()?.id ?? null;

export function setCurrentTaskSource(source: () => string | null): void {
  currentTaskId = source;
}

/** The task the runner is on, if it is still queued. */
export function currentTask(): Task | undefined {
  const id = currentTaskId();
  return id === null
    ? undefined
    : getState()
        .queue.list()
        .find((task) => task.id === id);
}

/** Plain-language description of one task. */
export function describeTask(task: Task): string {
  if (task.type === "sendResource") {
    const { amount, resource, origin, destination, label } = task.data;
    const prefix = label ? `[${label}] ` : "";
    return (
      `${prefix}${formatInteger(amount)} ${resourceLabel(resource)}: ` +
      `${getTownNameFromList(origin)} → ${getTownNameFromList(destination)}`
    );
  }
  return QUEUE_VIEW.upgrade(task.data.buildingName, task.data.townName);
}

function row(
  task: Task,
  index: number,
  isCurrent: boolean,
  isLast: boolean,
): string {
  // The task the runner is on; marking it is the difference between
  // "stalled" and "empty", which is what this view exists to show.
  const marker = isCurrent ? " ▶" : "";
  return (
    `<tr data-ika-queue-id="${escapeHtml(task.id)}"${isCurrent ? ' class="active"' : ""}>` +
    `<td>${index + 1}${marker}</td>` +
    `<td>${escapeHtml(describeTask(task))}</td>` +
    `<td>` +
    moveButtons(
      { up: "queue.moveUp", down: "queue.moveDown" },
      { "ika-task": task.id },
      { isFirst: index === 0, isLast },
    ) +
    `<button class="button" title="${QUEUE_VIEW.remove}" ` +
    `${action("queue.remove", { "ika-task": task.id })}>✕</button>` +
    `</td></tr>`
  );
}

/** The queue as HTML. Exported so the panel can embed it. */
export function renderQueue(): string {
  const queue = getState().queue;
  const tasks = queue.list();

  if (tasks.length === 0) {
    return `<p class="ika-queue-empty">${QUEUE_VIEW.empty}</p>`;
  }

  const current = currentTaskId();
  const shown = tasks.slice(0, MAX_ROWS);
  const overflow =
    tasks.length > MAX_ROWS
      ? `<p class="ika-queue-empty">${QUEUE_VIEW.more(tasks.length - MAX_ROWS)}</p>`
      : "";

  return (
    `<div class="${QUEUE_SCROLL_CLASS}">` +
    `<table class="fullTable ika-queue-table">` +
    `<tr><th>#</th><th>${QUEUE_VIEW.headerTask}</th><th></th></tr>` +
    shown
      .map((task, index) =>
        row(task, index, task.id === current, index === tasks.length - 1),
      )
      .join("") +
    `</table></div>` +
    overflow +
    `<button class="button" ${action("queue.clear")}>${QUEUE_VIEW.clearAll}</button>`
  );
}

/**
 * Redraw the list in place, showing at most `VISIBLE_ROWS` tasks and
 * scrolling the rest. Safe to call when the panel is not built yet; while it
 * is hidden the cap cannot be measured, and the next redraw with it open
 * sets it (the status tick redraws an open panel every few seconds).
 */
export function refreshQueueView(): void {
  const host = qs(`#${QUEUE_LIST_ID}`);
  if (!host) return;
  host.innerHTML = renderQueue();
  const scroll = host.querySelector<HTMLElement>(`.${QUEUE_SCROLL_CLASS}`);
  if (scroll) capVisibleRows(scroll, "tr[data-ika-queue-id]", VISIBLE_ROWS);
}
