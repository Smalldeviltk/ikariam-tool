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

import { escapeHtml, qs } from "@core/dom";
import { formatInteger } from "@core/format";
import type { Task } from "@core/task-queue";
import { QUEUE_VIEW } from "../messages";
import { getTownNameFromList } from "../navigation";
import { getState } from "../state";
import { action } from "./actions";

export const QUEUE_LIST_ID = "ikaQueueList";

/** How many entries to draw. A queue longer than this is already a problem. */
const MAX_ROWS = 50;

/** Plain-language description of one task. */
export function describeTask(task: Task): string {
  if (task.type === "sendResource") {
    const { amount, resource, origin, destination, label } = task.data;
    const prefix = label ? `[${label}] ` : "";
    return (
      `${prefix}${formatInteger(amount)} ${resource}: ` +
      `${getTownNameFromList(origin)} → ${getTownNameFromList(destination)}`
    );
  }
  return QUEUE_VIEW.upgrade(task.data.buildingName, task.data.townName);
}

function row(task: Task, index: number, isHead: boolean): string {
  // The head is the one the runner is working on; marking it is the difference
  // between "stalled" and "empty", which is what this view exists to show.
  const marker = isHead ? " ▶" : "";
  return (
    `<tr data-ika-queue-id="${escapeHtml(task.id)}"${isHead ? ' class="active"' : ""}>` +
    `<td>${index + 1}${marker}</td>` +
    `<td>${escapeHtml(describeTask(task))}</td>` +
    `<td>` +
    `<button class="button" title="${QUEUE_VIEW.moveToBack}" ` +
    `${action("queue.moveToBack", { "ika-task": task.id })}>↓</button>` +
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

  const head = queue.head();
  const shown = tasks.slice(0, MAX_ROWS);
  const overflow =
    tasks.length > MAX_ROWS
      ? `<p class="ika-queue-empty">${QUEUE_VIEW.more(tasks.length - MAX_ROWS)}</p>`
      : "";

  return (
    `<table class="fullTable ika-queue-table">` +
    `<tr><th>#</th><th>${QUEUE_VIEW.headerTask}</th><th></th></tr>` +
    shown
      .map((task, index) => row(task, index, head?.id === task.id))
      .join("") +
    `</table>` +
    overflow +
    `<button class="button" ${action("queue.clear")}>${QUEUE_VIEW.clearAll}</button>`
  );
}

/** Redraw the list in place. Safe to call when the panel is not built yet. */
export function refreshQueueView(): void {
  const host = qs(`#${QUEUE_LIST_ID}`);
  if (host) host.innerHTML = renderQueue();
}
