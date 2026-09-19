import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TaskQueue,
  TaskRunner,
  type NewTask,
  type Task,
  type TaskResult,
} from "./task-queue";
import type { Store } from "./storage";

vi.mock("./logger", () => ({
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

const build = (townName: string): NewTask => ({
  type: "upgradeBuilding",
  data: { townName, positionId: "p1", buildingName: "Warehouse 2" },
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
    queue.replaceById(a.id, {
      ...(queue.head() as Task),
      data: { ...(a as any).data, amount: 40 },
    } as Task);
    const list = queue.list();
    expect(list[0].id).toBe(a.id);
    expect((list[0] as any).data.amount).toBe(40);
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
      task: { ...t, data: { ...(t as any).data, amount: 200 } } as Task,
    }));
    runner.start();
    await tick();
    expect(queue.length).toBe(1);
    expect((queue.head() as any).data.amount).toBe(200);
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
