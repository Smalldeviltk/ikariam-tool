import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLAG, initState, isFlagTrue, setAutoStart, setFlag } from "./state";

// Silence the logger, but keep its other exports (its storage key is read by
// the data export).
vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
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

      expect(getState().queue.list().map((task) => task.type)).toEqual([
        "sendResource",
      ]);
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
