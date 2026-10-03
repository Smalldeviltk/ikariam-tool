import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLAG,
  getState,
  initState,
  isFlagTrue,
  saveAutoBuild,
  setAutoStart,
  setFlag,
} from "./state";

// Silence the logger, but keep its other exports (its storage key is read by
// the data export).
vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

// Messages are toasts now. Capture them, but keep the module's real window.
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@core/ui/window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/ui/window")>()),
  showToast,
}));

// The scan is tested in `auto-build.test.ts`; here Auto Wine's Start only
// needs to know whether one ran, and what it brought back.
const { scanBuildings } = vi.hoisted(() => ({ scanBuildings: vi.fn() }));
vi.mock("./features/auto-build", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./features/auto-build")>()),
  scanBuildings,
}));

/**
 * The action handlers, captured as `start()` registers them.
 *
 * Driving the buttons through a real click would mean installing the document
 * dispatcher, and `vi.resetModules()` cannot uninstall a listener from the
 * document happy-dom shares between tests — a second `start()` would then fire
 * every handler twice. Capturing the map instead keeps each test's `start()`
 * genuinely independent.
 */
const { actions } = vi.hoisted(() => ({
  actions: {} as Record<string, (el: HTMLElement) => unknown>,
}));

vi.mock("./ui/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ui/actions")>();
  return {
    ...actual,
    installActionDispatcher: () => {},
    registerActions: (map: Record<string, never>) => {
      Object.assign(actions, map);
    },
  };
});

/** Enough of the game's page for `start()` to get through its own setup. */
const PAGE =
  `<div class="avatarName"><a class="noViewParameters" title="tester"></a></div>` +
  `<div id="js_cityBread">W-Athens</div>` +
  `<div id="container"></div>` +
  `<div id="js_viewCityMenu"><ul class="menu_slots">` +
  `<li class="expandable slot1"></li></ul></div>` +
  `<div id="footer"></div>`;

/**
 * Every live interval this page owns.
 *
 * The queue runner is one `setInterval` among several, so the tests below
 * compare the count before and after a toggle rather than naming a number:
 * a running runner is exactly one more timer than a stopped one.
 */
function timers(): number {
  return vi.getTimerCount();
}

async function startWith(flags: {
  transport?: boolean;
  build?: boolean;
}): Promise<void> {
  setFlag(FLAG.isAutoBuildStart, flags.build === true);
  setAutoStart(flags.transport === true);

  vi.resetModules();
  const app = await import("./app");
  vi.clearAllTimers();
  app.start();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllTimers();
  localStorage.clear();
  sessionStorage.clear();
  for (const key of Object.keys(actions)) delete actions[key];
  document.body.innerHTML = PAGE;
  document.head.innerHTML = "";
  // `startWith` writes flags before `start()` does its own `initState`.
  initState("tester");
});

/**
 * `timers()` is 3 while the runner is stopped and 4 while it runs: the town
 * snapshot, the summary and the status line are always up, and the queue
 * runner is the fourth. The tests compare the two rather than assert a number.
 */
const IDLE = 3;
const RUNNING = 4;

/** The app's own copy of the state module, after `startWith` reset the registry. */
async function appState(): Promise<typeof import("./state")> {
  return import("./state");
}

describe("the two Start Timer buttons share one runner", () => {
  it(
    "Transport's Stop no longer stops Auto Build — it called `runner.stop()` " +
      "unconditionally, leaving the Build button reading 'Stop Timer' over a " +
      "runner that had quietly halted",
    async () => {
      await startWith({ transport: true, build: true });
      expect(timers()).toBe(RUNNING);

      await actions["queue.toggle"](document.body);

      expect(timers()).toBe(RUNNING);
      expect(isFlagTrue(FLAG.isAutoBuildStart)).toBe(true);
    },
  );

  it("still stops the runner when Auto Build is not the one holding it up", async () => {
    await startWith({ transport: true });
    expect(timers()).toBe(RUNNING);

    await actions["queue.toggle"](document.body);

    expect(timers()).toBe(IDLE);
  });

  it(
    "Build's Stop actually stops the runner — it used to flip the flag and the " +
      "label and leave the interval running",
    async () => {
      await startWith({ build: true });
      expect(timers()).toBe(RUNNING);

      await actions["build.toggleTimer"](document.body);

      expect(timers()).toBe(IDLE);
      expect(isFlagTrue(FLAG.isAutoBuildStart)).toBe(false);
    },
  );

  it("Build's Stop leaves Transport's timer alone", async () => {
    await startWith({ transport: true, build: true });

    await actions["build.toggleTimer"](document.body);

    expect(timers()).toBe(RUNNING);
    expect((await appState()).isAutoStart()).toBe(true);
  });

  it("Build's Start does not turn Transport's switch on behind its back", async () => {
    await startWith({});
    expect(timers()).toBe(IDLE);

    await actions["build.toggleTimer"](document.body);

    expect(timers()).toBe(RUNNING);
    expect((await appState()).isAutoStart()).toBe(false);
  });

  it(
    "Build's Stop takes its own upgrades back out of the shared queue, so " +
      "Transport's timer does not carry on building",
    async () => {
      await startWith({ transport: true, build: true });
      const { getState } = await appState();
      getState().queue.push({
        type: "upgradeBuilding",
        data: {
          townName: "W-Athens",
          positionId: "js_CityPosition5Link",
          buildingName: "Warehouse 26",
        },
      });
      getState().queue.push({
        type: "sendResource",
        data: {
          origin: "0",
          destination: "1",
          resource: "wine",
          amount: 100,
        },
      });

      await actions["build.toggleTimer"](document.body);

      expect(
        getState()
          .queue.list()
          .map((task) => task.type),
      ).toEqual(["sendResource"]);
    },
  );
});

describe("the Transport settings dialog", () => {
  /** The two town pickers and the five amount fields, as the dialog draws them. */
  function installSendForm(amounts: Record<string, string>): void {
    const towns = `<option value="0">W-Athens</option><option value="1">M-Corinth</option>`;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<select id="transporterSendFromTown">${towns}</select>` +
        `<select id="transporterSendDestination">${towns}</select>` +
        ["wood", "wine", "marble", "glass", "sulfur"]
          .map(
            (resource) =>
              `<input id="transporterSendAmount_${resource}" value="${amounts[resource] ?? ""}">`,
          )
          .join(""),
    );
    document.querySelector<HTMLSelectElement>(
      "#transporterSendDestination",
    )!.value = "1";
  }

  async function queuedShipments(): Promise<string[]> {
    const { getState: appGetState } = await appState();
    return appGetState()
      .queue.listOfType("sendResource")
      .map((task) => `${task.data.resource} ${task.data.amount}`);
  }

  beforeEach(() => {
    showToast.mockClear();
  });

  it(
    "queues one row per resource filled in — the resource dropdown added " +
      "one row per Add",
    async () => {
      await startWith({});
      installSendForm({ wood: "5000", marble: "1200", sulfur: "300" });

      await actions["send.add"](document.body);

      expect(await queuedShipments()).toEqual([
        "wood 5000",
        "marble 1200",
        "sulfur 300",
      ]);
      expect(showToast).not.toHaveBeenCalled();
    },
  );

  it(
    "REGRESSION: takes 0 as none, like an empty field — it was refused as " +
      "an invalid amount",
    async () => {
      await startWith({});
      installSendForm({ wood: "5000", wine: "0", marble: "00" });

      await actions["send.add"](document.body);

      expect(await queuedShipments()).toEqual(["wood 5000"]);
      expect(showToast).not.toHaveBeenCalled();
    },
  );

  it("asks for an amount when every field is 0 or empty", async () => {
    await startWith({});
    installSendForm({ wood: "0", glass: "0" });

    await actions["send.add"](document.body);

    expect(await queuedShipments()).toEqual([]);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("at least one resource"),
    );
  });

  it("queues nothing, and says which, when an amount is not a whole number", async () => {
    await startWith({});
    installSendForm({ wood: "5000", wine: "2.5", glass: "-4" });

    await actions["send.add"](document.body);

    expect(await queuedShipments()).toEqual([]);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Wine, Crystal"),
    );
  });

  it("asks for an amount when every field is empty", async () => {
    await startWith({});
    installSendForm({});

    await actions["send.add"](document.body);

    expect(await queuedShipments()).toEqual([]);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("at least one resource"),
    );
  });

  it(
    "moves a shipment one row, past the next shipment only — upgrades in " +
      "between keep their place in the queue",
    async () => {
      await startWith({});
      const { getState: appGetState } = await appState();
      const { queue } = appGetState();
      const shipment = (amount: number) =>
        queue.push({
          type: "sendResource",
          data: { origin: "0", destination: "1", resource: "wood", amount },
        });
      const first = shipment(100);
      queue.push({
        type: "upgradeBuilding",
        data: {
          townName: "W-Athens",
          positionId: "js_CityPosition4Link",
          buildingName: "Warehouse 3",
        },
      });
      shipment(200);
      shipment(300);
      const button = document.createElement("button");
      button.dataset.ikaTask = first.id;

      await actions["send.moveDown"](button);

      expect(
        queue
          .list()
          .map((task) =>
            task.type === "sendResource"
              ? `wood ${task.data.amount}`
              : "upgrade",
          ),
      ).toEqual(["wood 200", "upgrade", "wood 100", "wood 300"]);
    },
  );
});

describe("Auto Wine", () => {
  /** A board row, as `auto-wine.test.ts` draws it. */
  function boardRow(town: string, stock: string, consumption: string): string {
    return (
      `<tr><td class="city_name"><span class="clickable">${town}</span></td>` +
      `<td class="resource wine"><span class="current">${stock}</span></td>` +
      `<td class="resource wine">` +
      `<span class="prodconssubsum consumption Red">${consumption}</span></td></tr>`
    );
  }

  /** The board as a scan leaves it: the source full, M-Corinth drinking 200/h. */
  const BOARD_AFTER_SCAN =
    `<div id="ResTab"><table><tbody>` +
    boardRow("W-Athens", "10,000", "-100") +
    boardRow("M-Corinth", "0", "-200") +
    `</tbody></table></div>`;

  const DROPDOWN =
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    `<li><a title="W-Athens"> W-Athens</a></li>` +
    `<li><a title="M-Corinth"> M-Corinth</a></li>` +
    `</ul></div></div>`;

  /** Starts with W-Athens (town 0) ticked as the only source. */
  async function startWithSource(senders = ["0"]) {
    await startWith({});
    document.body.insertAdjacentHTML("beforeend", DROPDOWN);
    const state = await appState();
    state.saveSenders(senders);
    return state;
  }

  /** Let `runAutoWine`, which the button does not await, run to its end. */
  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
  }

  function queuedWine(state: typeof import("./state")): string[] {
    return state
      .getState()
      .queue.listOfType("sendResource")
      .map(
        (task) =>
          `${task.data.origin} -> ${task.data.destination}: ${task.data.resource}`,
      );
  }

  beforeEach(() => {
    showToast.mockReset();
    scanBuildings.mockReset();
    scanBuildings.mockImplementation(async () => {
      document.body.insertAdjacentHTML("beforeend", BOARD_AFTER_SCAN);
      return true;
    });
  });

  it(
    "Start scans, waits for it, saves each town's measured consumption, " +
      "queues the run and switches Transport's timer on",
    async () => {
      const state = await startWithSource();

      await actions["wine.autoRun"](document.body);
      await settle();

      expect(scanBuildings).toHaveBeenCalledTimes(1);
      // Read from the board the scan drew, so after the scan and not before.
      expect(state.loadReceivers()).toEqual([
        { townNumber: "1", winePerHour: "200" },
      ]);
      expect(queuedWine(state)).toEqual(["0 -> 1: wine"]);
      expect(state.isAutoStart()).toBe(true);
      expect(timers()).toBe(RUNNING);
      expect(document.querySelector("#btnStartScript")!.textContent).toBe(
        "Stop Timer",
      );
    },
  );

  it("Start stops when the scan refuses to run, and queues nothing", async () => {
    scanBuildings.mockResolvedValue(false);
    const state = await startWithSource();

    await actions["wine.autoRun"](document.body);
    await settle();

    expect(queuedWine(state)).toEqual([]);
    expect(state.isAutoStart()).toBe(false);
    expect(timers()).toBe(IDLE);
  });

  it("Start says so, and does not scan, when no town is ticked as a source", async () => {
    await startWithSource([]);

    await actions["wine.autoRun"](document.body);
    await settle();

    expect(scanBuildings).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("No town is ticked"),
    );
  });

  it("Start asks which source to use when several are ticked", async () => {
    const createPopup = vi.fn();
    await startWithSource(["0", "1"]);
    Object.assign(window, { ikariam: { createPopup } });
    try {
      await actions["wine.autoRun"](document.body);
      await settle();
    } finally {
      delete window.ikariam;
    }

    expect(scanBuildings).not.toHaveBeenCalled();
    expect(String(createPopup.mock.lastCall?.[2])).toContain(
      'data-ika-action="wine.autoRunFrom"',
    );
  });

  it(
    "the settings dialog's Save also queues the run, and leaves Start Timer " +
      "to the player",
    async () => {
      const state = await startWithSource();
      document.body.insertAdjacentHTML(
        "beforeend",
        BOARD_AFTER_SCAN +
          `<table><tr class="txtWine"><td><input type="checkbox" id="cbSender_0" checked></td>` +
          `<td><input type="text" id="txtWine_0" value="0"></td></tr>` +
          `<tr class="txtWine"><td><input type="checkbox" id="cbSender_1"></td>` +
          `<td><input type="text" id="txtWine_1" value="200"></td></tr></table>`,
      );

      await actions["wine.save"](document.body);

      expect(queuedWine(state)).toEqual(["0 -> 1: wine"]);
      expect(scanBuildings).not.toHaveBeenCalled();
      expect(state.isAutoStart()).toBe(false);
      expect(timers()).toBe(IDLE);
    },
  );
});

describe("the Auto Build settings dialog", () => {
  it(
    "Save closes the dialog and starts nothing — its 'Run queue' did what " +
      "the panel's Start button does",
    async () => {
      localStorage.setItem(
        "listAutoBuild",
        JSON.stringify([
          {
            accountName: "tester",
            townList: [
              {
                townName: "W-Athens",
                queue: [
                  {
                    positionId: "js_CityPosition4Link",
                    buildingName: "Warehouse 3",
                  },
                ],
              },
            ],
          },
        ]),
      );
      await startWith({});
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="ikaMationTransporterDialog"></div>`,
      );

      await actions["build.save"](document.body);

      expect(document.querySelector("#ikaMationTransporterDialog")).toBeNull();
      const { getState: appGetState } = await appState();
      expect(appGetState().queue.listOfType("upgradeBuilding")).toEqual([]);
      expect(timers()).toBe(IDLE);
    },
  );
});

describe("Auto Build after the queue runs dry", () => {
  /** Page reloads, counted from clicks on the city link `backToCity` uses. */
  let reloads: number;

  function installCityLink(): void {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="js_cityLink"><a href="#"></a></div>`,
    );
    document
      .querySelector("#js_cityLink > a")!
      .addEventListener("click", (event) => {
        event.preventDefault();
        reloads++;
      });
  }

  /** What a reload does: the same storage, a fresh page and a fresh script. */
  async function reloadPage(): Promise<void> {
    document.body.innerHTML = PAGE;
    installCityLink();
    vi.resetModules();
    const app = await import("./app");
    vi.clearAllTimers();
    app.start();
  }

  beforeEach(() => {
    reloads = 0;
    // The keep-alive also reloads, on even minutes of the clock. An odd minute
    // keeps it out of these tests, which count only their own reloads. Passed
    // to `useFakeTimers` because `setSystemTime` left the clock on real time.
    vi.useFakeTimers({ now: new Date("2026-09-26T10:01:00Z") });
  });

  it(
    "REGRESSION: turns its timer off once nothing is left to build — the " +
      "flag stayed on, so every load drained at once and reloaded the page",
    async () => {
      installCityLink();
      await startWith({ build: true });
      await vi.advanceTimersByTimeAsync(1_100);
      expect(reloads).toBe(1);

      const state = await appState();
      expect(state.isFlagTrue(state.FLAG.isAutoBuildStart)).toBe(false);
      expect(document.querySelector("#btnStartAutoBuild")!.textContent).toBe(
        "Start Timer",
      );

      await reloadPage();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reloads).toBe(1);
      expect(timers()).toBe(IDLE);
    },
  );

  it(
    "REGRESSION: does not run again on the load that follows a run — the " +
      "original skipped it through isAutoReload, which the port only wrote",
    async () => {
      // A town the dropdown does not have: every task fails and is dropped,
      // while the saved build list keeps it.
      localStorage.setItem(
        "listAutoBuild",
        JSON.stringify([
          {
            accountName: "tester",
            townList: [
              {
                townName: "Nowhere",
                queue: [
                  {
                    positionId: "js_CityPosition4Link",
                    buildingName: "Warehouse 3",
                  },
                ],
              },
            ],
          },
        ]),
      );
      installCityLink();
      await startWith({ build: true });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(reloads).toBe(1);

      await reloadPage();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reloads).toBe(1);

      // Still switched on: the keep-alive reload brings the next run.
      const state = await appState();
      expect(state.isFlagTrue(state.FLAG.isAutoBuildStart)).toBe(true);
      expect(state.getFlag(state.FLAG.isAutoReload)).toBe("false");
    },
  );

  it(
    "REGRESSION: Build's timer passes queued shipments over — it ran them " +
      "while Transport's button still read 'Start Timer'",
    async () => {
      getState().queue.push({
        type: "sendResource",
        data: { origin: "0", destination: "1", resource: "wine", amount: 100 },
      });
      installCityLink();
      await startWith({ build: true });

      await vi.advanceTimersByTimeAsync(1_100);

      // Nothing Build may run: the queue counts as drained, as an empty one
      // would, and the shipment waits for Transport's timer.
      expect(reloads).toBe(1);
      const { getState: appGetState } = await appState();
      expect(
        appGetState()
          .queue.list()
          .map((task) => task.type),
      ).toEqual(["sendResource"]);
    },
  );

  it(
    "Build's Start runs one lap of upgrades without Build's timer, then " +
      "stops",
    async () => {
      // A town the dropdown does not have: the task runs, fails and is dropped.
      saveAutoBuild([
        {
          accountName: "tester",
          townList: [
            {
              townName: "Nowhere",
              queue: [
                {
                  positionId: "js_CityPosition4Link",
                  buildingName: "Warehouse 3",
                },
              ],
            },
          ],
        },
      ]);
      installCityLink();
      await startWith({});

      await actions["build.startNow"](document.body);
      expect(timers()).toBe(RUNNING);
      await vi.advanceTimersByTimeAsync(3_000);

      const state = await appState();
      expect(state.getState().queue.listOfType("upgradeBuilding")).toEqual([]);
      expect(state.isFlagTrue(state.FLAG.isAutoBuildStart)).toBe(false);
      expect(timers()).toBe(IDLE);
    },
  );

  it(
    "REGRESSION: a keep-alive reload in the middle of a lap carries on with " +
      "it — every load queued a fresh lap from the first town, so the last " +
      "town of a long lap was never reached",
    async () => {
      saveAutoBuild([
        {
          accountName: "tester",
          townList: ["W-Clone1", "M-Clone1", "S-Clone1"].map((townName) => ({
            townName,
            queue: [
              {
                positionId: "js_CityPosition4Link",
                buildingName: "Warehouse 3",
              },
            ],
          })),
        },
      ]);
      // W and M have had their turn; the reload came before S.
      getState().queue.push({
        type: "upgradeBuilding",
        data: {
          townName: "S-Clone1",
          positionId: "js_CityPosition4Link",
          buildingName: "Warehouse 3",
        },
      });

      await startWith({ build: true });

      const { getState: appGetState } = await appState();
      expect(
        appGetState()
          .queue.listOfType("upgradeBuilding")
          .map((task) => task.data.townName),
      ).toEqual(["S-Clone1"]);
    },
  );
});

describe("startup", () => {
  it("leaves the runner alone when neither switch is on", async () => {
    await startWith({});
    expect(timers()).toBe(IDLE);
  });

  it("starts it for Transport", async () => {
    await startWith({ transport: true });
    expect(timers()).toBe(RUNNING);
  });

  it("starts it for Auto Build on its own", async () => {
    await startWith({ build: true });
    expect(timers()).toBe(RUNNING);
  });
});

describe("the account table's build time buff", () => {
  const field = () =>
    document.querySelector<HTMLInputElement>(".js-ika-build-time-buff");
  const shown = () =>
    document.querySelector(".js-ika-build-time-buff-value")?.textContent;
  const button = () =>
    document.querySelector<HTMLElement>(".js-ika-build-time-buff-button")!;

  /** Click the ✎ / ✓ button, through the action it names. */
  function press(): void {
    const target = button();
    actions[target.dataset.ikaAction!](target);
  }

  /** ✎, type, ✓. */
  function enterBuff(text: string): void {
    press();
    field()!.value = text;
    press();
  }

  it("shows the figure as text, and a field only once ✎ is pressed", async () => {
    await startWith({});
    expect(shown()).toBe("0");
    expect(field()).toBeNull();
    expect(button().textContent).toBe("✎");

    press();

    expect(field()!.value).toBe("0");
    expect(shown()).toBeUndefined();
    expect(button().textContent).toBe("✓");
    expect(button().dataset.ikaAction).toBe("account.saveBuildTimeBuff");
  });

  it("saves on ✓, where the board reads it, and shows text again", async () => {
    await startWith({});
    enterBuff("36");

    const { accountBuildTimeBuff } = await import("@core/storage");
    expect(accountBuildTimeBuff("tester")).toBeCloseTo(0.36);
    expect(field()).toBeNull();
    expect(shown()).toBe("36");
    expect(button().textContent).toBe("✎");
  });

  it("stores nothing until ✓ is pressed", async () => {
    await startWith({});
    press();
    field()!.value = "36";
    field()!.dispatchEvent(new Event("change", { bubbles: true }));

    const { accountBuildTimeBuff } = await import("@core/storage");
    expect(accountBuildTimeBuff("tester")).toBe(0);
  });

  it(
    "refuses a figure that is not a percentage below 100, keeps the old " +
      "one, and leaves the field open to correct it",
    async () => {
      await startWith({});
      enterBuff("20");
      enterBuff("abc");

      const { accountBuildTimeBuff } = await import("@core/storage");
      expect(accountBuildTimeBuff("tester")).toBeCloseTo(0.2);
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("Build time buff"),
      );
      expect(field()!.value).toBe("abc");

      field()!.value = "100";
      press();
      expect(accountBuildTimeBuff("tester")).toBeCloseTo(0.2);
    },
  );

  it("takes an empty field as no buff", async () => {
    await startWith({});
    enterBuff("20");
    enterBuff("");

    const { accountBuildTimeBuff } = await import("@core/storage");
    expect(accountBuildTimeBuff("tester")).toBe(0);
  });

  it("is not redrawn while open, so the typed figure survives the 10 s refresh", async () => {
    await startWith({});
    press();
    field()!.value = "12";

    vi.advanceTimersByTime(10_000);

    expect(field()!.value).toBe("12");
  });
});
