/**
 * The single task queue shared by every automated action.
 *
 * ── Problem being solved ────────────────────────────────────────────────────
 * The old script ran two independent loops against the same DOM:
 *   - `checkAndProcess`          — setInterval 1s, sending resources
 *   - `autoCheckFinishedAccount` — setInterval 10s, upgrading buildings
 * They drove the game UI concurrently. The consequence is visible in the old
 * code itself: with the upgrade popup open, a send would click the wrong thing,
 * fail, and still decrement the queue -> the order was silently lost. The old
 * patch was an `isAutoSendResourceRunning` flag checked at the top of
 * `checkAndProcessAutoBuild`, but it only guarded one direction: sending
 * blocked auto build, while auto build never blocked sending.
 *
 * ── Solution ────────────────────────────────────────────────────────────────
 * One queue, one runner, exactly one task touching the DOM at a time. Tasks are
 * persisted to localStorage so they survive a page reload, which is mandatory
 * because the script reloads the page periodically to keep the session alive.
 *
 * This module is a REDESIGN, not a mechanical port. The business logic inside
 * each handler still mirrors the original.
 */

import { reportBug } from "./bug-report";
import { logInfo } from "./logger";
import type { Store } from "./storage";

/* ────────────────────────────── Task shapes ────────────────────────────── */

export interface SendResourceTaskData {
  /** Index of the source town in the town dropdown. */
  origin: string;
  /** Index of the destination town. */
  destination: string;
  /** `wood` | `wine` | `marble` | `glass` | `sulfur`. */
  resource: string;
  /** Amount STILL to send. Decreases after every shipment. */
  amount: number;
  /**
   * Amount to keep at the source town.
   * Auto Wine uses this so a run never drains the sending town dry.
   */
  reserve?: number;
  /** Tag shown in the log, e.g. `"Auto Wine"`. Also used to group tasks. */
  label?: string;
}

export interface UpgradeBuildingTaskData {
  townName: string;
  positionId: string;
  buildingName: string;
}

/**
 * Sending wine has no dedicated task type: it is just `sendResource` with
 * `resource: "wine"` plus a `reserve`. The original carried two nearly
 * identical code paths (`sendResources`/`enterValue` and
 * `sendWine`/`enterValueWine`); merging them removes the duplicate so every
 * fix only has to be made once.
 */
export type Task =
  | { id: string; type: "sendResource"; data: SendResourceTaskData }
  | { id: string; type: "upgradeBuilding"; data: UpgradeBuildingTaskData };

export type TaskType = Task["type"];

/**
 * `Omit` over a union collapses to the shared keys, which would break the link
 * between `type` and `data` and let `{type: "sendResource", data: <building>}`
 * type-check. Distributing over the union preserves the correlation.
 */
type DistributiveOmit<T, K extends keyof any> = T extends unknown
  ? Omit<T, K>
  : never;

/** A task as supplied by callers: same shape as `Task` but `id` is optional. */
export type NewTask = DistributiveOmit<Task, "id"> & { id?: string };

/**
 * Outcome of one handler run; decides what happens to the task.
 *
 * The distinction between `retry` and `defer` matters. `retry` is for blockers
 * that stop every task OF THIS TYPE (no ships at all, no action points for a
 * shipment) — the task holds its place among its own type, because rotating
 * them would only burn navigations, while tasks of another type queued behind
 * it still run (see `TaskRunner.nextTask`). `defer` is for blockers specific to
 * THIS task (this town is already building, this town has no port) where other
 * queued tasks could still succeed.
 *
 * Getting that wrong causes head-of-line blocking: the original moved on to the
 * next town when one was mid-construction, and a plain `retry` here would instead
 * stall every other town's upgrade until that build finished — possibly hours.
 */
export type TaskResult =
  /** Fully complete — drop from the queue. */
  | { status: "done" }
  /** Partial progress (e.g. ships filled but the amount is not covered yet). */
  | { status: "progress"; task: Task }
  /**
   * Blocked for every task of this type — keep its place, run other types
   * meanwhile, and retry once nothing else can run.
   */
  | { status: "retry"; reason?: string }
  /** Blocked for this task only — move to the back so others can run. */
  | { status: "defer"; reason?: string }
  /** Unrecoverable — drop from the queue and log. */
  | { status: "failed"; reason: string };

export type TaskHandler<T extends Task = Task> = (
  task: T,
) => Promise<TaskResult>;

/* ─────────────────────────── Persistent queue ──────────────────────────── */

let idCounter = 0;

/** Session-stable id. Global uniqueness is not required. */
export function makeTaskId(type: TaskType): string {
  idCounter += 1;
  return `${type}-${Date.now().toString(36)}-${idCounter}`;
}

export class TaskQueue {
  constructor(
    private readonly store: Store,
    /**
     * Storage key, required on purpose: the data export classifies the real
     * one (`ikaGlobalTaskQueue`), and a default would write somewhere it
     * never looks.
     */
    private readonly key: string,
  ) {}

  list(): Task[] {
    return this.store.getJSON<Task[]>(this.key, []);
  }

  private write(tasks: Task[]): void {
    this.store.setJSON(this.key, tasks);
  }

  get length(): number {
    return this.list().length;
  }

  head(): Task | undefined {
    return this.list()[0];
  }

  /** Tasks of one type only — used to render each feature's own table. */
  listOfType<T extends TaskType>(type: T): Extract<Task, { type: T }>[] {
    return this.list().filter((t) => t.type === type) as Extract<
      Task,
      { type: T }
    >[];
  }

  push(task: NewTask): Task {
    const full = { ...task, id: task.id ?? makeTaskId(task.type) } as Task;
    const tasks = this.list();
    tasks.push(full);
    this.write(tasks);
    return full;
  }

  /**
   * Replace a task by id.
   *
   * Deliberately id-based rather than positional: the user can delete queue
   * entries from the settings dialog while a task is running, so "the task at
   * index 0" may no longer be the task that just finished.
   */
  replaceById(id: string, task: Task): void {
    const tasks = this.list();
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) return;
    tasks[index] = task;
    this.write(tasks);
  }

  removeById(id: string): void {
    this.write(this.list().filter((t) => t.id !== id));
  }

  /** Move a task to the back of the queue, preserving everything else's order. */
  moveToBack(id: string): void {
    const tasks = this.list();
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) return;
    const [task] = tasks.splice(index, 1);
    tasks.push(task);
    this.write(tasks);
  }

  removeType(type: TaskType): void {
    this.write(this.list().filter((t) => t.type !== type));
  }

  /** Drop every `sendResource` task carrying the given label. */
  removeByLabel(label: string): void {
    this.write(
      this.list().filter(
        (t) => !(t.type === "sendResource" && t.data.label === label),
      ),
    );
  }

  clear(): void {
    this.write([]);
  }
}

/* ─────────────────────────── Cross-tab lock ─────────────────────────────── */

/**
 * One tab at a time per account drives the queue.
 *
 * The queue is in localStorage, which every tab of the game's origin shares,
 * while the runner's `busy` flag is per page. Two tabs of one account would
 * each run the same head task — two town switches fighting over the same
 * account, or the same shipment sent twice.
 *
 * Built on the Web Locks API, as IkaEasy V4 does (`js/helper/syncLock.js`):
 * the browser grants the lock to one page at a time and takes it back by
 * itself when that page closes or reloads, so a crashed or reloading tab can
 * never leave it stuck. A tab that asks while another holds it waits in the
 * browser's queue and gets it as soon as it is free.
 *
 * Where the API is missing, `acquire` grants at once — no protection, but the
 * runner works exactly as it did before the lock existed.
 */
export class TabLock {
  private requested = false;
  private held = false;
  private releaseHeld: (() => void) | null = null;
  private abortWait: AbortController | null = null;

  constructor(
    private readonly name: string,
    /** Injected for tests; the page's own `navigator.locks` by default. */
    private readonly locks: LockManager | null = navigator.locks ?? null,
    /** Called with `true` when the lock is granted, `false` when given up. */
    private readonly onChange?: (held: boolean) => void,
  ) {}

  get isHeld(): boolean {
    return this.held;
  }

  /** Ask for the lock. Does nothing if already held or already asked for. */
  acquire(): void {
    if (this.requested) return;
    this.requested = true;
    if (!this.locks) {
      this.held = true;
      return;
    }

    const abort = new AbortController();
    this.abortWait = abort;
    this.locks
      .request(this.name, { signal: abort.signal }, () => {
        // Released between the grant and this callback: hand it straight back.
        if (abort.signal.aborted) return;
        this.abortWait = null;
        this.held = true;
        this.onChange?.(true);
        // Held for as long as this promise is pending.
        return new Promise<void>((resolve) => {
          this.releaseHeld = resolve;
        });
      })
      // An abort while still waiting rejects the request; nothing to do.
      .catch(() => {});
  }

  /** Give the lock back, or stop waiting for it. */
  release(): void {
    if (!this.requested) return;
    this.requested = false;
    this.abortWait?.abort();
    this.abortWait = null;
    const wasHeld = this.held;
    this.held = false;
    this.releaseHeld?.();
    this.releaseHeld = null;
    if (wasHeld && this.locks) this.onChange?.(false);
  }
}

/* ─────────────────────────────── Runner ─────────────────────────────────── */

/**
 * Consecutive throws before a task is given up on.
 *
 * High enough that a slow page render never reaches it — the DOM waits inside
 * the handlers time out at `DEFAULT_TIMEOUT_MS` (15 s, `core/async.ts`) each,
 * so five in a row is over a minute of the same failure.
 */
const DEFAULT_MAX_ERRORS = 5;

/** Queue poll interval when none is given; the original's send loop used 1 s. */
const DEFAULT_INTERVAL_MS = 1000;

/** Pause after every queued task has deferred in a row, when none is given. */
const DEFAULT_DEFER_COOLDOWN_MS = 60_000;

export interface TaskRunnerOptions {
  /** Queue poll interval in ms. The original used 1000 for sending. */
  intervalMs?: number;
  /**
   * Whether this page may drive the queue at all — `false` while another tab
   * of the same account holds the `TabLock`.
   *
   * Checked before anything else, the drain included: the queue lives in
   * localStorage, so a waiting tab sees the driving tab's queue empty out and
   * would otherwise run `onDrain` (and reload) for a run it took no part in.
   */
  canRun?: () => boolean;
  /**
   * Whether the UI is idle (no popup, not loading).
   * Returning `false` makes the runner skip this tick without consuming a task.
   */
  isUiReady?: () => boolean;
  /** Called when the queue empties. The original used this to stop the timer. */
  onDrain?: () => void;
  /**
   * How many times one task may throw in a row before it is given up on.
   *
   * A throw keeps the task (see the catch in `tick`), which is right for a DOM
   * that is merely not ready yet and wrong for one that is never going to be.
   * With no cap the two are indistinguishable and the second case becomes an
   * endless loop: a stale selector had the shipment handler open the game's
   * trading-port panel, wait 15s for a destination list that no longer exists,
   * throw, and do it again a second later — visible to the player as the panel
   * opening and closing by itself, forever, with a bug record filed each lap.
   */
  maxConsecutiveErrors?: number;
  /**
   * How long to pause after every queued task has deferred in a row.
   *
   * Without this the runner would rotate the whole queue once per tick, and each
   * rotation costs a real town navigation. When every town is mid-construction
   * there is nothing to gain from checking again a second later.
   */
  deferCooldownMs?: number;
}

export class TaskRunner {
  private readonly handlers = new Map<TaskType, TaskHandler<any>>();
  private timer: number | null = null;
  /**
   * The core guarantee of the whole design: one task touching the DOM at a
   * time. Deliberately in memory rather than localStorage — a reload must reset
   * it, otherwise one mid-task crash would wedge the queue permanently.
   */
  private busy = false;
  private drained = false;
  /** Consecutive `defer` results, used to detect "nothing is runnable". */
  private deferStreak = 0;
  /**
   * Consecutive throws per task id.
   *
   * In memory for the same reason as `busy`: a reload is the player's way out
   * of a wedged queue, and a count that survived one would keep punishing a
   * task whose real problem was fixed by the reload.
   */
  private readonly errorStreaks = new Map<string, number>();
  /** Epoch ms before which ticks are skipped, set when the whole queue defers. */
  private pausedUntil = 0;
  /**
   * Task types whose last run returned `retry`, skipped while a task of
   * another type can run.
   *
   * Shipments and upgrades share this runner, and a shipment waiting for the
   * fleet to come home used to hold the head of the queue: every upgrade
   * behind it waited too, although an upgrade needs no ships. In memory like
   * `busy`: a reload starts from the head again.
   */
  private readonly blockedTypes = new Set<TaskType>();

  constructor(
    private readonly queue: TaskQueue,
    private readonly options: TaskRunnerOptions = {},
  ) {}

  register<T extends TaskType>(
    type: T,
    handler: TaskHandler<Extract<Task, { type: T }>>,
  ): this {
    this.handlers.set(type, handler as TaskHandler);
    return this;
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  start(): void {
    if (this.timer !== null) return;
    this.drained = false;
    this.timer = window.setInterval(
      () => void this.tick(),
      this.options.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Run exactly one tick, bypassing the timer. */
  async runOnce(): Promise<void> {
    await this.tick();
  }

  /**
   * The task to run this tick: the first one whose type is not blocked by a
   * `retry`. When every queued type is blocked, the blocks are forgotten and
   * the head runs, so a blocker that has cleared (the fleet is back) is
   * noticed on the next tick, as before any type was skipped.
   */
  private nextTask(): Task | undefined {
    const tasks = this.queue.list();
    const runnable = tasks.find((task) => !this.blockedTypes.has(task.type));
    if (runnable) return runnable;
    this.blockedTypes.clear();
    return tasks[0];
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    if (this.options.canRun && !this.options.canRun()) return;
    if (Date.now() < this.pausedUntil) return;

    const task = this.nextTask();
    if (!task) {
      if (!this.drained) {
        this.drained = true;
        this.deferStreak = 0;
        this.options.onDrain?.();
      }
      return;
    }
    this.drained = false;

    if (this.options.isUiReady && !this.options.isUiReady()) return;

    const handler = this.handlers.get(task.type);
    if (!handler) {
      logInfo(`No handler registered for task "${task.type}", dropping it`);
      this.queue.removeById(task.id);
      return;
    }

    this.busy = true;
    try {
      const result = await handler(task);
      if (result.status !== "defer") this.deferStreak = 0;
      // It returned rather than threw, so whatever was wrong before is over.
      this.errorStreaks.delete(task.id);
      if (result.status === "retry") this.blockedTypes.add(task.type);
      else this.blockedTypes.delete(task.type);

      switch (result.status) {
        case "done":
          this.queue.removeById(task.id);
          break;
        case "progress":
          this.queue.replaceById(task.id, result.task);
          break;
        case "retry":
          // Leave the task in place. Its type is skipped while another type
          // can run, then it is tried again.
          break;
        case "defer": {
          this.queue.moveToBack(task.id);
          this.deferStreak += 1;
          // A full lap with nothing runnable: back off instead of spinning.
          if (this.deferStreak >= this.queue.length) {
            const cooldown =
              this.options.deferCooldownMs ?? DEFAULT_DEFER_COOLDOWN_MS;
            this.pausedUntil = Date.now() + cooldown;
            this.deferStreak = 0;
            logInfo(
              `Nothing in the queue can run right now (${result.reason ?? "deferred"}); ` +
                `pausing for ${Math.round(cooldown / 1000)}s`,
            );
          }
          break;
        }
        case "failed":
          logInfo(`Task ${task.type} failed: ${result.reason}`);
          // A dropped task is silent data loss from the user's point of view,
          // so it is worth a bug record even though nothing threw.
          reportBug("task-failed", new Error(result.reason), {
            taskType: task.type,
            taskData: task.data,
          });
          this.queue.removeById(task.id);
          break;
      }
    } catch (e) {
      // A thrown handler does NOT drop the task: most throws here are the DOM
      // not being ready yet, and the next tick will succeed. A genuinely broken
      // task must return `failed` explicitly.
      const message = (e as Error)?.message ?? String(e);
      logInfo(`Error while running task ${task.type}: ${message}`);
      reportBug("task-error", e, { taskType: task.type, taskData: task.data });
      console.error(e);

      // ...but "the next tick will succeed" has to stop being assumed at some
      // point. A task that has thrown this many times in a row is not waiting
      // on the DOM, it is broken, and every further lap repeats whatever the
      // handler did before it threw — which for a shipment means driving the
      // game's UI. Drop it, the same way an explicit `failed` is dropped.
      const streak = (this.errorStreaks.get(task.id) ?? 0) + 1;
      const limit = this.options.maxConsecutiveErrors ?? DEFAULT_MAX_ERRORS;
      if (streak >= limit) {
        logInfo(
          `Task ${task.type} threw ${streak} times in a row, giving up on it: ${message}`,
        );
        this.errorStreaks.delete(task.id);
        this.queue.removeById(task.id);
      } else {
        this.errorStreaks.set(task.id, streak);
      }
    } finally {
      this.busy = false;
    }
  }
}
