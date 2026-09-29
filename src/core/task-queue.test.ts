import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TabLock,
  TaskQueue,
  TaskRunner,
  type NewTask,
  type Task,
  type TaskResult,
} from "./task-queue";
import type { Store } from "./storage";

// Silence the logger, but keep its other exports (its storage key is read by
// the data export).
vi.mock("./logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./logger")>()),
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

/** In-memory `Store`, so the queue can be tested without a DOM. */
function memoryStore(): Store {
  const data = new Map<string, string>();
  function get(key: string): string | null;
  function get(key: string, fallback: string): string;
  function get(key: string, fallback?: string): string | null {
    const raw = data.get(key);
    if (raw === undefined) return fallback ?? null;
    return raw;
  }
  return {
    get,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
    getJSON: <T>(k: string, fallback: T): T => {
      const raw = data.get(k);
      return raw === undefined ? fallback : (JSON.parse(raw) as T);
    },
    setJSON: (k, v) => void data.set(k, JSON.stringify(v)),
  };
}

const ship = (destination: string, amount = 100, label?: string): NewTask => ({
  type: "sendResource",
  data: { origin: "0", destination, resource: "wood", amount, label },
});

/** The shipment amount of a task, or `undefined` for any other kind. */
function amountOf(task: Task | undefined): number | undefined {
  return task?.type === "sendResource" ? task.data.amount : undefined;
}

/** A copy of a shipment with a different amount. */
function withAmount(task: Task, amount: number): Task {
  if (task.type !== "sendResource") throw new Error("not a shipment");
  return { ...task, data: { ...task.data, amount } };
}

const build = (townName: string): NewTask => ({
  type: "upgradeBuilding",
  data: { townName, positionId: "p1", buildingName: "Warehouse 2" },
});

/**
 * A Web Locks manager shared by every "tab" given it, as the browser's is
 * shared by every page of one origin: one holder per name, the others queued
 * in order, and an abort taking a waiter out of the queue.
 */
function fakeLockManager(): LockManager {
  const held = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();

  function request(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<unknown>,
    maybeCallback?: LockGrantedCallback<unknown>,
  ): Promise<unknown> {
    const options =
      typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
    const callback =
      typeof optionsOrCallback === "function"
        ? optionsOrCallback
        : maybeCallback!;
    return new Promise((resolve, reject) => {
      const grant = () => {
        held.add(name);
        Promise.resolve()
          .then(() => callback({ name, mode: "exclusive" } as Lock))
          .then(resolve, reject)
          .finally(() => {
            held.delete(name);
            waiting.get(name)?.shift()?.();
          });
      };
      if (!held.has(name)) {
        grant();
        return;
      }
      const queue = waiting.get(name) ?? [];
      waiting.set(name, queue);
      queue.push(grant);
      options.signal?.addEventListener("abort", () => {
        const index = queue.indexOf(grant);
        if (index < 0) return;
        queue.splice(index, 1);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }

  return {
    request,
    query: async () => ({ held: [], pending: [] }),
  } as unknown as LockManager;
}

/** Let the lock manager's promise chains settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("TabLock", () => {
  it("grants the lock to one tab at a time, then to the one waiting", async () => {
    const locks = fakeLockManager();
    const first = new TabLock("ika-task-runner:tester", locks);
    const second = new TabLock("ika-task-runner:tester", locks);

    first.acquire();
    second.acquire();
    await settle();
    expect(first.isHeld).toBe(true);
    expect(second.isHeld).toBe(false);

    first.release();
    await settle();
    expect(first.isHeld).toBe(false);
    expect(second.isHeld).toBe(true);
  });

  it("a tab that stops waiting is never granted the lock", async () => {
    const locks = fakeLockManager();
    const first = new TabLock("ika-task-runner:tester", locks);
    const second = new TabLock("ika-task-runner:tester", locks);
    const third = new TabLock("ika-task-runner:tester", locks);

    first.acquire();
    second.acquire();
    third.acquire();
    await settle();
    second.release();
    first.release();
    await settle();

    expect(second.isHeld).toBe(false);
    expect(third.isHeld).toBe(true);
  });

  it("does not stand in the way of another account", async () => {
    const locks = fakeLockManager();
    const one = new TabLock("ika-task-runner:tester", locks);
    const other = new TabLock("ika-task-runner:SClone1", locks);

    one.acquire();
    other.acquire();
    await settle();

    expect(one.isHeld).toBe(true);
    expect(other.isHeld).toBe(true);
  });

  it("reports each grant and each release", async () => {
    const onChange = vi.fn();
    const lock = new TabLock(
      "ika-task-runner:tester",
      fakeLockManager(),
      onChange,
    );

    lock.acquire();
    await settle();
    lock.release();

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("grants at once where the browser has no Web Locks", () => {
    const lock = new TabLock("ika-task-runner:tester", null);
    lock.acquire();
    expect(lock.isHeld).toBe(true);
  });
});

describe("TaskQueue", () => {
  let queue: TaskQueue;
  beforeEach(() => {
    queue = new TaskQueue(memoryStore(), "q");
  });

  it("assigns unique ids and preserves insertion order", () => {
    const a = queue.push(ship("1"));
    const b = queue.push(ship("2"));
    expect(a.id).not.toBe(b.id);
    expect(queue.list().map((t) => t.id)).toEqual([a.id, b.id]);
    expect(queue.head()?.id).toBe(a.id);
  });

  it("persists through a fresh instance over the same store", () => {
    const store = memoryStore();
    new TaskQueue(store, "q").push(ship("1"));
    expect(new TaskQueue(store, "q").length).toBe(1);
  });

  it("removes by id, not by position", () => {
    const a = queue.push(ship("1"));
    const b = queue.push(ship("2"));
    queue.removeById(a.id);
    expect(queue.list().map((t) => t.id)).toEqual([b.id]);
  });

  it("replaceById leaves the task in place", () => {
    const a = queue.push(ship("1", 100));
    const b = queue.push(ship("2", 100));
    queue.replaceById(a.id, withAmount(a, 40));
    const list = queue.list();
    expect(list[0].id).toBe(a.id);
    expect(amountOf(list[0])).toBe(40);
    expect(list[1].id).toBe(b.id);
  });

  it("moveToBack rotates one task without disturbing the rest", () => {
    const a = queue.push(ship("1"));
    const b = queue.push(ship("2"));
    const c = queue.push(ship("3"));
    queue.moveToBack(a.id);
    expect(queue.list().map((t) => t.id)).toEqual([b.id, c.id, a.id]);
  });

  it("removeByLabel only drops labelled shipments", () => {
    queue.push(ship("1", 10, "Auto Wine"));
    const manual = queue.push(ship("2", 10));
    queue.push(ship("3", 10, "Auto Wine"));
    queue.removeByLabel("Auto Wine");
    expect(queue.list().map((t) => t.id)).toEqual([manual.id]);
  });

  it("removeByLabel never touches upgrade tasks", () => {
    const upgrade = queue.push(build("Athens"));
    queue.push(ship("1", 10, "Auto Wine"));
    queue.removeByLabel("Auto Wine");
    expect(queue.list().map((t) => t.id)).toEqual([upgrade.id]);
  });

  it("listOfType filters by discriminant", () => {
    queue.push(ship("1"));
    queue.push(build("Athens"));
    expect(queue.listOfType("sendResource")).toHaveLength(1);
    expect(queue.listOfType("upgradeBuilding")).toHaveLength(1);
  });

  it("ignores removal and replacement of unknown ids", () => {
    queue.push(ship("1"));
    queue.removeById("nope");
    queue.moveToBack("nope");
    expect(queue.length).toBe(1);
  });
});

describe("TaskRunner", () => {
  let queue: TaskQueue;
  beforeEach(() => {
    vi.useFakeTimers();
    queue = new TaskQueue(memoryStore(), "q");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Advance the interval and let the handler's promise settle. */
  async function tick(times = 1) {
    for (let i = 0; i < times; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    }
  }

  function runnerWith(
    result: TaskResult | ((t: Task) => TaskResult),
    options = {},
  ) {
    const calls: Task[] = [];
    const runner = new TaskRunner(queue, { intervalMs: 1000, ...options })
      .register("sendResource", async (t) => {
        calls.push(t);
        return typeof result === "function" ? result(t) : result;
      })
      .register("upgradeBuilding", async (t) => {
        calls.push(t);
        return typeof result === "function" ? result(t) : result;
      });
    return { runner, calls };
  }

  it("`done` removes the task", async () => {
    queue.push(ship("1"));
    const { runner } = runnerWith({ status: "done" });
    runner.start();
    await tick();
    expect(queue.length).toBe(0);
  });

  it("`retry` keeps the task at the head and reruns it", async () => {
    queue.push(ship("1"));
    queue.push(ship("2"));
    const { runner, calls } = runnerWith({ status: "retry" });
    runner.start();
    await tick(2);
    expect(queue.length).toBe(2);
    // Same task both times — a global blocker must not rotate the queue.
    expect(calls[0].id).toBe(calls[1].id);
  });

  describe("a `retry` blocks its own type only", () => {
    /** Shipments wait for the fleet; upgrades need no ships. */
    function fleetAtSea(ship: () => TaskResult = () => ({ status: "retry" })) {
      return runnerWith((task) =>
        task.type === "sendResource" ? ship() : { status: "done" },
      );
    }

    it(
      "REGRESSION: upgrades queued behind a shipment waiting for ships still " +
        "run — the shipment held the head and every upgrade waited with it",
      async () => {
        const first = queue.push(ship("1"));
        const second = queue.push(ship("2"));
        queue.push(build("W-1"));
        queue.push(build("M-1"));
        const { runner, calls } = fleetAtSea();
        runner.start();

        await tick(3);

        expect(calls.map((task) => task.type)).toEqual([
          "sendResource",
          "upgradeBuilding",
          "upgradeBuilding",
        ]);
        // The shipments keep their place and their order.
        expect(queue.list().map((task) => task.id)).toEqual([
          first.id,
          second.id,
        ]);
      },
    );

    it("goes back to the waiting shipment every tick once nothing else can run", async () => {
      const first = queue.push(ship("1"));
      queue.push(ship("2"));
      queue.push(build("W-1"));
      const { runner, calls } = fleetAtSea();
      runner.start();

      await tick(4);

      expect(calls.map((task) => task.id)).toEqual([
        first.id,
        calls[1].id,
        first.id,
        first.id,
      ]);
      expect(calls[1].type).toBe("upgradeBuilding");
    });

    it("sends the shipment as soon as the fleet is back", async () => {
      queue.push(ship("1"));
      queue.push(build("W-1"));
      let fleetHome = false;
      const { runner } = fleetAtSea(() =>
        fleetHome ? { status: "done" } : { status: "retry" },
      );
      runner.start();

      await tick(2);
      expect(queue.list().map((task) => task.type)).toEqual(["sendResource"]);

      fleetHome = true;
      await tick();
      expect(queue.length).toBe(0);
    });

    it("takes turns when every type is waiting, and drops nothing", async () => {
      queue.push(ship("1"));
      queue.push(build("W-1"));
      const { runner, calls } = runnerWith({ status: "retry" });
      runner.start();

      await tick(4);

      expect(calls.map((task) => task.type)).toEqual([
        "sendResource",
        "upgradeBuilding",
        "sendResource",
        "upgradeBuilding",
      ]);
      expect(queue.length).toBe(2);
    });
  });

  it("`defer` rotates so a different task runs next", async () => {
    const a = queue.push(ship("1"));
    const b = queue.push(ship("2"));
    const { runner, calls } = runnerWith({ status: "defer" });
    runner.start();
    await tick(2);
    expect(queue.length).toBe(2);
    expect(calls[0].id).toBe(a.id);
    // This is the head-of-line fix: a blocked town must not stall the others.
    expect(calls[1].id).toBe(b.id);
  });

  it("pauses once every task in the queue has deferred", async () => {
    queue.push(ship("1"));
    queue.push(ship("2"));
    const { runner, calls } = runnerWith(
      { status: "defer" },
      { deferCooldownMs: 60_000 },
    );
    runner.start();
    await tick(2); // both tasks deferred -> a full lap
    const afterLap = calls.length;
    await tick(3); // still inside the cooldown
    expect(calls.length).toBe(afterLap);

    await vi.advanceTimersByTimeAsync(60_000);
    await tick();
    expect(calls.length).toBeGreaterThan(afterLap);
  });

  it("`progress` writes the remainder back in place", async () => {
    queue.push(ship("1", 500));
    const { runner } = runnerWith((t) => ({
      status: "progress",
      task: withAmount(t, 200),
    }));
    runner.start();
    await tick();
    expect(queue.length).toBe(1);
    expect(amountOf(queue.head())).toBe(200);
  });

  it("`failed` drops the task", async () => {
    queue.push(ship("1"));
    const { runner } = runnerWith({ status: "failed", reason: "boom" });
    runner.start();
    await tick();
    expect(queue.length).toBe(0);
  });

  it("a thrown handler keeps the task (the DOM may just not be ready)", async () => {
    queue.push(ship("1"));
    const runner = new TaskRunner(queue, { intervalMs: 1000 }).register(
      "sendResource",
      async () => {
        throw new Error("DOM not ready");
      },
    );
    runner.start();
    await tick();
    expect(queue.length).toBe(1);
  });

  it(
    "REGRESSION: gives up on a task that keeps throwing — a stale port " +
      "selector had the shipment handler reopen the game's transport panel " +
      "every second forever, and file a bug record each lap",
    async () => {
      queue.push(ship("1"));
      let attempts = 0;
      const runner = new TaskRunner(queue, {
        intervalMs: 1000,
        maxConsecutiveErrors: 3,
      }).register("sendResource", async () => {
        attempts++;
        throw new Error("selector gone");
      });

      runner.start();
      await tick(2);
      // Still trying: two throws is not yet evidence of a broken task.
      expect(queue.length).toBe(1);

      await tick();
      expect(queue.length).toBe(0);

      // And it really stops — no further laps against an empty queue.
      await tick(3);
      expect(attempts).toBe(3);
    },
  );

  it("a throw followed by a normal result clears the error streak", async () => {
    queue.push(ship("1"));
    let attempts = 0;
    const runner = new TaskRunner(queue, {
      intervalMs: 1000,
      maxConsecutiveErrors: 3,
    }).register("sendResource", async () => {
      attempts++;
      // Throw, recover, throw, recover: never three in a row, so the task
      // must survive indefinitely rather than being counted out.
      if (attempts % 2 === 1) throw new Error("DOM not ready");
      return { status: "retry" };
    });

    runner.start();
    await tick(6);
    expect(queue.length).toBe(1);
  });

  it("runs one task at a time even when a handler is slow", async () => {
    queue.push(ship("1"));
    queue.push(ship("2"));
    let active = 0;
    let maxActive = 0;
    const runner = new TaskRunner(queue, { intervalMs: 1000 }).register(
      "sendResource",
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5000));
        active--;
        return { status: "done" } as TaskResult;
      },
    );
    runner.start();
    await vi.advanceTimersByTimeAsync(12_000);
    // The whole point of the unified queue.
    expect(maxActive).toBe(1);
  });

  it("skips the tick while the UI is busy, without consuming the task", async () => {
    queue.push(ship("1"));
    let ready = false;
    const { runner, calls } = runnerWith(
      { status: "done" },
      { isUiReady: () => ready },
    );
    runner.start();
    await tick(2);
    expect(calls).toHaveLength(0);
    expect(queue.length).toBe(1);

    ready = true;
    await tick();
    expect(calls).toHaveLength(1);
  });

  it("fires onDrain once when the queue empties, not on every tick", async () => {
    queue.push(ship("1"));
    const onDrain = vi.fn();
    const { runner } = runnerWith({ status: "done" }, { onDrain });
    runner.start();
    await tick(4);
    expect(onDrain).toHaveBeenCalledTimes(1);
  });

  it("drops a task with no registered handler instead of looping", async () => {
    queue.push(build("Athens"));
    const runner = new TaskRunner(queue, { intervalMs: 1000 }).register(
      "sendResource",
      async () => ({ status: "done" }) as TaskResult,
    );
    runner.start();
    await tick();
    expect(queue.length).toBe(0);
  });

  it(
    "does nothing while `canRun` says no — not even the drain, which would " +
      "reload a waiting tab for a run it took no part in",
    async () => {
      const onDrain = vi.fn();
      let allowed = false;
      const { runner, calls } = runnerWith(
        { status: "done" },
        { onDrain, canRun: () => allowed },
      );
      runner.start();
      await tick(3);
      expect(onDrain).not.toHaveBeenCalled();

      queue.push(ship("1"));
      await tick(2);
      expect(calls).toHaveLength(0);

      allowed = true;
      await tick();
      expect(calls).toHaveLength(1);
    },
  );

  it(
    "REGRESSION: two tabs of one account no longer run the same task — the " +
      "queue is shared through localStorage and nothing kept a second tab " +
      "from driving it too",
    async () => {
      const store = memoryStore();
      const locks = fakeLockManager();
      queue = new TaskQueue(store, "q");
      queue.push(ship("1"));

      const runs: string[] = [];
      function tab(name: string): TaskRunner {
        const lock = new TabLock("ika-task-runner:tester", locks);
        lock.acquire();
        return new TaskRunner(new TaskQueue(store, "q"), {
          intervalMs: 1000,
          canRun: () => lock.isHeld,
        }).register("sendResource", async () => {
          runs.push(name);
          // Slow enough that the other tab's tick lands while it runs.
          await new Promise((resolve) => setTimeout(resolve, 2500));
          return { status: "done" } as TaskResult;
        });
      }

      tab("first").start();
      tab("second").start();
      await vi.advanceTimersByTimeAsync(6000);

      expect(runs).toEqual(["first"]);
    },
  );

  it("stop() halts processing and isBusy is false when idle", async () => {
    queue.push(ship("1"));
    const { runner, calls } = runnerWith({ status: "done" });
    runner.start();
    expect(runner.isRunning).toBe(true);
    runner.stop();
    expect(runner.isRunning).toBe(false);
    await tick(3);
    expect(calls).toHaveLength(0);
    expect(runner.isBusy).toBe(false);
  });
});
