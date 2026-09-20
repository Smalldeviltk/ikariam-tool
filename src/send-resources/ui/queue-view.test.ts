import { beforeEach, describe, expect, it, vi } from "vitest";
import { getState, initState } from "../state";
import {
  describeTask,
  QUEUE_LIST_ID,
  refreshQueueView,
  renderQueue,
} from "./queue-view";
import type { Task } from "@core/task-queue";

vi.mock("@core/logger", () => ({
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

/** The town dropdown, so task descriptions can name towns. */
const DROPDOWN =
  `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
  `<li><a title="W-Athens"> W-Athens</a></li>` +
  `<li><a title="M-Corinth"> M-Corinth</a></li>` +
  `</ul></div></div>`;

function shipment(amount: number, label?: string) {
  return {
    type: "sendResource" as const,
    data: {
      origin: "0",
      destination: "1",
      resource: "wine",
      amount,
      ...(label ? { label } : {}),
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = DROPDOWN + `<div id="${QUEUE_LIST_ID}"></div>`;
  initState("tester");
  getState().queue.clear();
});

describe("describeTask", () => {
  it("names both towns rather than showing dropdown indexes", () => {
    const task = { id: "t1", ...shipment(1234) } as Task;
    expect(describeTask(task)).toBe("1,234 wine: W-Athens → M-Corinth");
  });

  it("shows the label a feature tagged the task with", () => {
    const task = { id: "t1", ...shipment(500, "Auto Wine") } as Task;
    expect(describeTask(task)).toContain("[Auto Wine]");
  });

  it("describes an upgrade", () => {
    const task: Task = {
      id: "t2",
      type: "upgradeBuilding",
      data: {
        townName: "W-Athens",
        positionId: "js_CityPosition5Link",
        buildingName: "Warehouse 26",
      },
    };
    expect(describeTask(task)).toBe("Upgrade Warehouse 26 in W-Athens");
  });
});

describe("renderQueue", () => {
  it("says so when there is nothing queued", () => {
    expect(renderQueue()).toContain("queue is empty");
  });

  it("lists every task with its own remove and defer buttons", () => {
    getState().queue.push(shipment(100));
    getState().queue.push(shipment(200));

    refreshQueueView();
    const host = document.querySelector(`#${QUEUE_LIST_ID}`)!;

    expect(host.querySelectorAll("tr[data-ika-queue-id]")).toHaveLength(2);
    expect(
      host.querySelectorAll('[data-ika-action="queue.remove"]'),
    ).toHaveLength(2);
    expect(
      host.querySelectorAll('[data-ika-action="queue.moveToBack"]'),
    ).toHaveLength(2);
  });

  it(
    "marks the task at the head — the difference between a stalled queue and " +
      "an empty one, which the old one-line status could not show",
    () => {
      getState().queue.push(shipment(100));
      getState().queue.push(shipment(200));

      refreshQueueView();
      const rows = document.querySelectorAll(
        `#${QUEUE_LIST_ID} tr[data-ika-queue-id]`,
      );

      expect(rows[0].classList.contains("active")).toBe(true);
      expect(rows[1].classList.contains("active")).toBe(false);
    },
  );

  it("carries each task's id, so editing is by identity and not position", () => {
    const first = getState().queue.push(shipment(100));
    getState().queue.push(shipment(200));

    refreshQueueView();
    const ids = [
      ...document.querySelectorAll(`#${QUEUE_LIST_ID} tr[data-ika-queue-id]`),
    ].map((row) => row.getAttribute("data-ika-queue-id"));

    expect(ids[0]).toBe(first.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("caps the list and says how many were left out", () => {
    for (let i = 0; i < 55; i++) getState().queue.push(shipment(i + 1));

    refreshQueueView();
    const host = document.querySelector(`#${QUEUE_LIST_ID}`)!;

    expect(host.querySelectorAll("tr[data-ika-queue-id]")).toHaveLength(50);
    expect(host.textContent).toContain("+ 5 more");
  });

  it("escapes a town name rather than letting it build markup", () => {
    document.body.innerHTML =
      `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
      `<li><a title="&lt;img src=x onerror=1&gt;"> x</a></li>` +
      `<li><a title="M-Corinth"> M-Corinth</a></li>` +
      `</ul></div></div><div id="${QUEUE_LIST_ID}"></div>`;
    getState().queue.push(shipment(1));

    refreshQueueView();
    const host = document.querySelector(`#${QUEUE_LIST_ID}`)!;

    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=1>");
  });
});

describe("refreshQueueView", () => {
  it("does nothing when the panel has not been built", () => {
    document.body.innerHTML = DROPDOWN;
    expect(() => refreshQueueView()).not.toThrow();
  });

  it("redraws after the queue changes", () => {
    const task = getState().queue.push(shipment(100));
    refreshQueueView();
    expect(
      document.querySelectorAll(`#${QUEUE_LIST_ID} tr[data-ika-queue-id]`),
    ).toHaveLength(1);

    getState().queue.removeById(task.id);
    refreshQueueView();
    expect(document.querySelector(`#${QUEUE_LIST_ID}`)!.textContent).toContain(
      "queue is empty",
    );
  });
});
