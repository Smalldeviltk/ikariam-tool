import { beforeEach, describe, expect, it, vi } from "vitest";
import { initState } from "../state";
import { handleSendResource } from "./send-resources";
import type { Task } from "@core/task-queue";

vi.mock("@core/logger", () => ({
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

const TOWNS = ["W-Athens", "M-Corinth"];

function shipment(amount: number, extra: Record<string, unknown> = {}) {
  return {
    id: "t1",
    type: "sendResource",
    data: {
      origin: "0",
      destination: "1",
      resource: "wine",
      amount,
      ...extra,
    },
  } as Extract<Task, { type: "sendResource" }>;
}

/** The game's header, present on every view. */
const HEADER =
  `<span id="js_GlobalMenu_freeTransporters">10</span>` +
  `<span id="js_GlobalMenu_freeFreighters">0</span>` +
  `<li id="js_GlobalMenu_maxActionPoints">11</li>` +
  `<span id="js_GlobalMenu_wine">50,000</span>` +
  `<div id="js_cityLink"><a></a></div>` +
  `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
  TOWNS.map(
    (n, i) => `<li selectvalue="${297034 + i}"><a title="${n}"> ${n}</a></li>`,
  ).join("") +
  `</ul></div></div>`;

/**
 * A miniature Ikariam that moves between the four views the handler drives.
 *
 * `afterSubmit` is the interesting knob: the game may or may not have the
 * port's town list back by the time the handler looks.
 */
function installGame(options: { afterSubmit: "port-list" | "elsewhere" }) {
  const state = { view: "", submitted: 0, sentWine: "" };

  function render(view: string) {
    state.view = view;
    let body = HEADER + `<div id="js_cityBread">${TOWNS[0]}</div>`;
    if (view === "town") {
      body +=
        `<div id="position1" class="position1 building port">` +
        `<a class="hoverable" id="js_CityPosition1Link"></a></div>`;
    } else if (view === "port-list") {
      body += `<ul class="cities clearfix"><li><a>${TOWNS[1]}</a></li></ul>`;
    } else if (view === "form") {
      body +=
        `<ul class="cities clearfix"><li><a>${TOWNS[1]}</a></li></ul>` +
        `<input type="text" id="textfield_wine" value="0"/>` +
        `<div id="submit"></div>`;
    }
    // "elsewhere" is the transport confirmation: no `.cities.clearfix` at all.
    document.body.innerHTML = body;
    wire();
  }

  function wire() {
    document
      .querySelector("#js_CityPosition1Link")
      ?.addEventListener("click", () => render("port-list"));
    document
      .querySelector(".cities.clearfix > li > a")
      ?.addEventListener("click", () => {
        if (state.view === "port-list") render("form");
      });
    document.querySelector("#submit")?.addEventListener("click", () => {
      state.submitted++;
      state.sentWine =
        (document.querySelector("#textfield_wine") as HTMLInputElement)
          ?.value ?? "";
      render(options.afterSubmit);
    });
    document
      .querySelector("#js_cityLink > a")
      ?.addEventListener("click", () => render("town"));
  }

  return { state, render };
}

/** Drive the handler to completion while fake timers are in charge. */
async function run(task: Extract<Task, { type: "sendResource" }>) {
  const promise = handleSendResource(task);
  await vi.advanceTimersByTimeAsync(60_000);
  return promise;
}

beforeEach(() => {
  localStorage.clear();
  initState("tester");
  vi.useFakeTimers();
});

describe("handleSendResource", () => {
  it("sends from the town view and reports done", async () => {
    const game = installGame({ afterSubmit: "port-list" });
    game.render("town");

    await expect(run(shipment(1000))).resolves.toEqual({ status: "done" });
    expect(game.state.submitted).toBe(1);
    expect(game.state.sentWine).toBe("1000");
  });

  it(
    "REGRESSION: starts from the port list too — `openPort` needs " +
      "`#position1`, which only exists on the town view, and the previous " +
      "shipment leaves the page on the port list. `gotoTown` returns early " +
      "when the town is already selected, so nothing navigated back and the " +
      "queue deferred every tick until a town was opened by hand",
    async () => {
      const game = installGame({ afterSubmit: "port-list" });
      game.render("port-list");

      await expect(run(shipment(1000))).resolves.toEqual({ status: "done" });
      expect(game.state.submitted).toBe(1);
    },
  );

  it(
    "REGRESSION: does not throw when the port list is not back after the " +
      "submit — the cargo is already gone, and the runner keeps a thrown " +
      "task queued, so throwing here would ship it twice",
    async () => {
      const game = installGame({ afterSubmit: "elsewhere" });
      game.render("town");

      await expect(run(shipment(1000))).resolves.toEqual({ status: "done" });
      expect(game.state.submitted).toBe(1);
    },
  );

  it("carries the remainder forward when one convoy cannot hold it all", async () => {
    const game = installGame({ afterSubmit: "port-list" });
    game.render("town");

    // 10 merchants at the 500 uncalibrated base = 5000 per convoy.
    const result = await run(shipment(10_000));
    expect(result).toMatchObject({ status: "progress" });
    expect((result as any).task.data.amount).toBe(10_000 - 5000);
    expect(game.state.sentWine).toBe("5000");
  });

  it("retries rather than consuming the order when no ship is idle", async () => {
    const game = installGame({ afterSubmit: "port-list" });
    game.render("town");
    document.querySelector("#js_GlobalMenu_freeTransporters")!.innerHTML = "0";

    await expect(run(shipment(1000))).resolves.toMatchObject({
      status: "retry",
    });
    expect(game.state.submitted).toBe(0);
  });
});
