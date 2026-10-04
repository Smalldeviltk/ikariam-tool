import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initState, routeSeconds } from "../state";
import { describeCurrentTransfer, handleSendResource } from "./send-resources";
import type { Task } from "@core/task-queue";

// Silence the logger, but keep its other exports (its storage key is read by
// the data export).
vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
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
 * A miniature Ikariam that moves between the views the handler drives: the
 * town view (with a port in slot 1), the shipment form, and anything else.
 *
 * The shipment form is opened the way the game's transport panel opens it:
 * `ajaxHandlerCall("?view=transport&destinationCityId=<id>")` draws
 * `form#transportForm` with that id in a hidden field (captured 03/10).
 * `afterSubmit` is where the game leaves the page once the goods are sent.
 */
function installGame(options: {
  afterSubmit: "town" | "form" | "elsewhere";
  /** Idle ships once the form is up, when they changed on the way there. */
  shipsAtForm?: { merchants: number; freighters: number };
  /** Draw a town view without a port. */
  noPort?: boolean;
  /** Draw the only sea slot as a building site (port or shipyard?). */
  seaSlotUnderConstruction?: boolean;
  /** The game does not draw the form when asked. */
  formDoesNotOpen?: boolean;
  /** Loading and sailing times the form shows, as the game prints them. */
  times?: { loading: string; journey: string };
  /** Action points the header shows in the source town (11 by default). */
  actionPoints?: number;
  /** Draw the form without the cargo field for the resource. */
  noCargoField?: boolean;
  /** Draw the form without its submit button. */
  noSubmit?: boolean;
}) {
  const state = {
    view: "",
    submitted: 0,
    sentWine: "",
    sentTo: "",
    ajaxCalls: [] as string[],
  };
  let destination = "";

  function render(view: string) {
    state.view = view;
    let body = HEADER + `<div id="js_cityBread">${TOWNS[0]}</div>`;
    if (options.actionPoints !== undefined) {
      body = body.replace(
        `maxActionPoints">11<`,
        `maxActionPoints">${options.actionPoints}<`,
      );
    }
    if (view === "form" && options.shipsAtForm) {
      const { merchants, freighters } = options.shipsAtForm;
      body = body
        .replace(`freeTransporters">10<`, `freeTransporters">${merchants}<`)
        .replace(`freeFreighters">0<`, `freeFreighters">${freighters}<`);
    }
    if (view === "town") {
      body += options.noPort
        ? `<div id="position1" class="position1 building shipyard"></div>`
        : options.seaSlotUnderConstruction
          ? `<div id="position1" class="position1 building constructionSite"></div>`
          : `<div id="position1" class="position1 building port">` +
            `<a class="hoverable" id="js_CityPosition1Link"></a></div>`;
    } else if (view === "form") {
      body +=
        `<form id="transportForm">` +
        `<input type="hidden" name="destinationCityId" value="${destination}">` +
        (options.noCargoField
          ? ""
          : `<input type="text" id="textfield_wine" value="0"/>`) +
        (options.noSubmit ? "" : `<div id="submit"></div>`) +
        `</form>` +
        (options.times
          ? `<span id="loadingTime">${options.times.loading}</span>` +
            `<span id="journeyTime">${options.times.journey}</span>`
          : "");
    }
    document.body.innerHTML = body;
    wire();
  }

  function wire() {
    document.querySelector("#submit")?.addEventListener("click", () => {
      state.submitted++;
      state.sentTo = destination;
      state.sentWine =
        (document.querySelector("#textfield_wine") as HTMLInputElement)
          ?.value ?? "";
      render(options.afterSubmit);
    });
    document
      .querySelector("#js_cityLink > a")
      ?.addEventListener("click", () => render("town"));
  }

  Object.assign(window, {
    ajaxHandlerCall: (url: string) => {
      state.ajaxCalls.push(url);
      destination =
        new URLSearchParams(url.split("?")[1]).get("destinationCityId") ?? "";
      if (!options.formDoesNotOpen) render("form");
    },
  });

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

afterEach(() => {
  delete (window as { ajaxHandlerCall?: unknown }).ajaxHandlerCall;
});

describe("handleSendResource", () => {
  it(
    "opens the shipment form for the destination's city id, fills it and " +
      "reports done — the port's town list is gone from the game",
    async () => {
      const game = installGame({ afterSubmit: "town" });
      game.render("town");

      await expect(run(shipment(1000))).resolves.toEqual({ status: "done" });
      // Destination "1" is M-Corinth, whose dropdown entry is 297035.
      expect(game.state.ajaxCalls).toEqual([
        "?view=transport&destinationCityId=297035",
      ]);
      expect(game.state.submitted).toBe(1);
      expect(game.state.sentTo).toBe("297035");
      expect(game.state.sentWine).toBe("1000");
    },
  );

  it(
    "REGRESSION: defers, opening nothing, when the source town is out of " +
      "action points - a `retry` blocked shipments only in memory, so after " +
      "an upgrade elsewhere switched town (a page load) the shipment ran " +
      "again and switched back, a reload loop for as long as the town had " +
      "no action points",
    async () => {
      const game = installGame({ afterSubmit: "town", actionPoints: 0 });
      game.render("town");

      await expect(run(shipment(1000))).resolves.toMatchObject({
        status: "defer",
        reason: expect.stringContaining("action points"),
      });
      expect(game.state.ajaxCalls).toEqual([]);
    },
  );

  it(
    "defers rather than retries when the form has no field for the " +
      "resource - it is past a town switch, and a retry would loop the same way",
    async () => {
      const game = installGame({ afterSubmit: "town", noCargoField: true });
      game.render("town");

      await expect(run(shipment(1000))).resolves.toMatchObject({
        status: "defer",
      });
      expect(game.state.submitted).toBe(0);
    },
  );

  it(
    "REGRESSION: keeps the order when the form has no submit button - the " +
      "click went through `?.`, did nothing, and the shipment was still " +
      "counted as sent",
    async () => {
      const game = installGame({ afterSubmit: "town", noSubmit: true });
      game.render("town");

      await expect(run(shipment(1000))).resolves.toMatchObject({
        status: "defer",
        reason: expect.stringContaining("submit"),
      });
    },
  );

  it("defers, opening nothing, when the source town has no port", async () => {
    const game = installGame({ afterSubmit: "town", noPort: true });
    game.render("town");

    await expect(run(shipment(1000))).resolves.toMatchObject({
      status: "defer",
    });
    expect(game.state.ajaxCalls).toEqual([]);
  });

  it(
    "REGRESSION: starts from another view too — the port check needs " +
      "`#position1`, which only exists on the town view, and the previous " +
      "shipment leaves the page elsewhere. `gotoTown` returns early when " +
      "the town is already selected, so nothing navigated back and the queue " +
      "deferred every tick until a town was opened by hand",
    async () => {
      const game = installGame({ afterSubmit: "town" });
      game.render("elsewhere");

      await expect(run(shipment(1000))).resolves.toEqual({ status: "done" });
      expect(game.state.submitted).toBe(1);
    },
  );

  it(
    "REGRESSION: does not throw when the form is still up after the submit " +
      "— the cargo is already gone, and the runner keeps a thrown task " +
      "queued, so throwing here would ship it twice",
    async () => {
      const game = installGame({ afterSubmit: "form" });
      game.render("town");

      await expect(run(shipment(1000))).resolves.toEqual({ status: "done" });
      expect(game.state.submitted).toBe(1);
    },
  );

  it("carries the remainder forward when one convoy cannot hold it all", async () => {
    const game = installGame({ afterSubmit: "town" });
    game.render("town");

    // 10 merchants at the 500 uncalibrated base = 5000 per convoy.
    const result = await run(shipment(10_000));
    expect(result).toMatchObject({ status: "progress" });
    expect((result as any).task.data.amount).toBe(10_000 - 5000);
    expect(game.state.sentWine).toBe("5000");
  });

  it(
    "REGRESSION: waits rather than ship a few units when the source holds " +
      "less than the order and less than one ship's cargo — every convoy " +
      "used to send whatever had come in since the last, a ship at a time",
    async () => {
      const game = installGame({ afterSubmit: "town" });
      game.render("town");
      // One merchant ship carries 500 until calibrated.
      document.querySelector("#js_GlobalMenu_wine")!.innerHTML = "499";

      await expect(run(shipment(10_000))).resolves.toMatchObject({
        status: "defer",
      });
      expect(game.state.submitted).toBe(0);
    },
  );

  it("ships what the source holds once that fills at least one ship", async () => {
    const game = installGame({ afterSubmit: "town" });
    game.render("town");
    document.querySelector("#js_GlobalMenu_wine")!.innerHTML = "700";

    const result = await run(shipment(10_000));

    expect(game.state.sentWine).toBe("700");
    expect(result).toMatchObject({ status: "progress" });
    expect((result as any).task.data.amount).toBe(10_000 - 700);
  });

  it("ships an order smaller than one ship when the stock covers it", async () => {
    const game = installGame({ afterSubmit: "town" });
    game.render("town");
    document.querySelector("#js_GlobalMenu_wine")!.innerHTML = "400";

    await expect(run(shipment(300))).resolves.toEqual({ status: "done" });
    expect(game.state.sentWine).toBe("300");
  });

  it("keeps Auto Wine's reserve out of what counts as the stock", async () => {
    const game = installGame({ afterSubmit: "town" });
    game.render("town");
    document.querySelector("#js_GlobalMenu_wine")!.innerHTML = "1,000";

    // 1000 held, 600 kept back: 400 to spare, under one ship's 500.
    await expect(
      run(shipment(10_000, { reserve: 600 })),
    ).resolves.toMatchObject({ status: "defer" });
    expect(game.state.submitted).toBe(0);
  });

  /** Only freighters idle: none of the merchant ships the header normally shows. */
  function onlyFreighters(count: string): void {
    document.querySelector("#js_GlobalMenu_freeTransporters")!.innerHTML = "0";
    document.querySelector("#js_GlobalMenu_freeFreighters")!.innerHTML = count;
  }

  it("with only freighters idle, waits for one freighter's cargo", async () => {
    const game = installGame({ afterSubmit: "town" });
    game.render("town");
    onlyFreighters("2");
    // Twenty merchant ships' worth, but under one freighter's 50,000.
    document.querySelector("#js_GlobalMenu_wine")!.innerHTML = "10,000";

    await expect(run(shipment(100_000))).resolves.toMatchObject({
      status: "defer",
    });
    expect(game.state.submitted).toBe(0);
  });

  it("with only freighters idle, ships once the stock fills one", async () => {
    const game = installGame({
      afterSubmit: "town",
      shipsAtForm: { merchants: 0, freighters: 2 },
    });
    game.render("town");
    onlyFreighters("2");
    document.querySelector("#js_GlobalMenu_wine")!.innerHTML = "60,000";

    await run(shipment(100_000));

    expect(game.state.sentWine).toBe("60000");
  });

  it(
    "checks again at the form when the merchant ships sailed on the way — " +
      "the freighters left are the bar then",
    async () => {
      const game = installGame({
        afterSubmit: "town",
        shipsAtForm: { merchants: 0, freighters: 2 },
      });
      game.render("town");
      // Enough for merchant ships, which are idle when the task starts.
      document.querySelector("#js_GlobalMenu_wine")!.innerHTML = "10,000";

      await expect(run(shipment(100_000))).resolves.toMatchObject({
        status: "defer",
      });
      expect(game.state.submitted).toBe(0);
    },
  );

  it("retries rather than consuming the order when no ship is idle", async () => {
    const game = installGame({ afterSubmit: "town" });
    game.render("town");
    document.querySelector("#js_GlobalMenu_freeTransporters")!.innerHTML = "0";

    await expect(run(shipment(1000))).resolves.toMatchObject({
      status: "retry",
    });
    expect(game.state.submitted).toBe(0);
  });

  it("records the route's loading and sailing time for Auto Wine, by city ids", async () => {
    const game = installGame({
      afterSubmit: "town",
      times: { loading: "3m 20s", journey: "1h 2m" },
    });
    game.render("town");

    await run(shipment(1000));

    // W-Athens (297034) to M-Corinth (297035): 200 s + 3,720 s.
    expect(routeSeconds("297034", "297035")).toBe(3_920);
  });

  it("records nothing when the form shows no time it can read", async () => {
    const game = installGame({ afterSubmit: "town" });
    game.render("town");

    await run(shipment(1000));

    expect(game.state.submitted).toBe(1);
    expect(routeSeconds("297034", "297035")).toBeNull();
  });

  it(
    "defers rather than throw when the only sea slot is a building site and " +
      "no form comes — a shipyard under construction looks the same as a " +
      "port being upgraded",
    async () => {
      const game = installGame({
        afterSubmit: "town",
        seaSlotUnderConstruction: true,
        formDoesNotOpen: true,
      });
      game.render("town");

      await expect(run(shipment(1000))).resolves.toMatchObject({
        status: "defer",
      });
      expect(game.state.submitted).toBe(0);
    },
  );

  it("still throws when a built port's form does not come", async () => {
    const game = installGame({ afterSubmit: "town", formDoesNotOpen: true });
    game.render("town");

    const sending = handleSendResource(shipment(1000));
    const failed = expect(sending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(60_000);
    await failed;
  });
});

describe("describeCurrentTransfer", () => {
  it(
    "names an upgrade the runner is on, as the queue does — it read " +
      "'Nothing is transferring'",
    () => {
      expect(
        describeCurrentTransfer({
          id: "u1",
          type: "upgradeBuilding",
          data: {
            townName: "W-Athens",
            positionId: "js_CityPosition4Link",
            buildingName: "Warehouse 3",
          },
        }),
      ).toBe("Upgrade Warehouse 3 in W-Athens");
    },
  );

  it(
    "names a shipment the way the queue does - it wrote the resource's id " +
      "and an ungrouped amount, `1000 glass`, in the status line and in the " +
      "'task dropped' notification",
    () => {
      document.body.innerHTML =
        `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
        `<li><a title="W-Athens"> W-Athens</a></li>` +
        `<li><a title="M-Corinth"> M-Corinth</a></li></ul></div></div>`;
      expect(
        describeCurrentTransfer({
          id: "s1",
          type: "sendResource",
          data: {
            origin: "0",
            destination: "1",
            resource: "glass",
            amount: 12000,
          },
        }),
      ).toBe("12,000 Crystal: W-Athens → M-Corinth");
    },
  );

  it("says nothing is transferring when the runner is on nothing", () => {
    expect(describeCurrentTransfer(undefined)).toBe("Nothing is transferring");
  });
});
