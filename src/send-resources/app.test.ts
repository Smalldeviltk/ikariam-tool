import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLAG,
  getState,
  initState,
  isFlagTrue,
  saveAutoBuild,
  setAutoStart,
  setFlag,
} from "./state";
import type { CrawlError } from "./diagnostics";

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

// Files the app saves (Bug Report). Captured instead of downloaded; the other
// exports of the module stay real.
const { downloadJson, downloadText } = vi.hoisted(() => ({
  downloadJson: vi.fn<(filename: string, json: string) => void>(),
  downloadText:
    vi.fn<(filename: string, text: string, mimeType: string) => void>(),
}));
vi.mock("./ui/data-transfer-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ui/data-transfer-ui")>()),
  downloadJson,
  downloadText,
}));

// The scan is tested in `auto-build.test.ts`; here Auto Wine's Start only
// needs to know whether one ran, and what it brought back.
// Reading another town's buildings is a request, tested in
// `auto-build.test.ts`; here only what the dialog does with its answer.
const { scanBuildings, fetchTownSlots } = vi.hoisted(() => ({
  scanBuildings: vi.fn(),
  fetchTownSlots: vi.fn(),
}));
vi.mock("./features/auto-build", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./features/auto-build")>()),
  scanBuildings,
  fetchTownSlots,
}));

// The fortress request is tested in `pirate.test.ts`; here only what the
// dialog and the crawl make of its answer.
const { fetchFortressView, pirateCapture } = vi.hoisted(() => ({
  fetchFortressView: vi.fn(),
  pirateCapture: {
    inFlight: false,
    /** What the app handed Pirate as its hold check. */
    holdCheck: null as (() => boolean) | null,
  },
}));
// What the app hands the keep-alive as its reload guard.
const keepAlive = vi.hoisted(() => ({
  guard: null as (() => boolean) | null,
}));
vi.mock("./features/summary-account", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./features/summary-account")>();
  return {
    ...actual,
    setReloadGuard: (guard: () => boolean) => {
      keepAlive.guard = guard;
      actual.setReloadGuard(guard);
    },
  };
});

vi.mock("./features/pirate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./features/pirate")>();
  return {
    ...actual,
    fetchFortressView,
    isPirateCaptureInFlight: () => pirateCapture.inFlight,
    setPirateHoldCheck: (check: () => boolean) => {
      pirateCapture.holdCheck = check;
      actual.setPirateHoldCheck(check);
    },
  };
});

// The notepad copy is tested in `queue-note.test.ts`; here only how the app
// drives it. Its debounce timer would also throw off the timer counts below.
const queueNote = vi.hoisted(() => ({
  allowsRunning: true,
  queueChanged: vi.fn(),
  startQueueNoteSync: vi.fn(async () => ({
    status: "failed" as const,
    reason: "not in tests",
  })),
  syncQueueNoteFromScan: vi.fn(async () => ({
    status: "failed" as const,
    reason: "not in tests",
  })),
  setChangeSyncHold: vi.fn(),
}));
vi.mock("./queue-note", () => ({
  setChangeSyncHold: queueNote.setChangeSyncHold,
  queueChanged: queueNote.queueChanged,
  queueNoteAllowsRunning: () => queueNote.allowsRunning,
  startQueueNoteSync: queueNote.startQueueNoteSync,
  syncQueueNoteFromScan: queueNote.syncQueueNoteFromScan,
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
  queueNote.allowsRunning = true;
  queueNote.queueChanged.mockClear();
  queueNote.startQueueNoteSync.mockClear();
  queueNote.syncQueueNoteFromScan.mockClear();
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

  describe("stock beside each amount", () => {
    /** Two towns in the dropdown, as the game draws it. */
    const DROPDOWN =
      `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
      `<li selectvalue="297034" class="ownCity"><a title="W-Athens"> W-Athens</a></li>` +
      `<li selectvalue="297035" class="ownCity"><a title="M-Corinth"> M-Corinth</a></li>` +
      `</ul></div></div>`;

    /** Open the dialog as the game's popup would draw it. */
    async function openDialog(): Promise<void> {
      document.body.insertAdjacentHTML("beforeend", DROPDOWN);
      const createPopup = (id: string, _title: string, html: string) =>
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="${id}">${html}</div>`,
        );
      Object.assign(window, { ikariam: { createPopup } });
      await actions["send.settings"](document.body);
      delete window.ikariam;
    }

    function stockBeside(resource: string): string {
      return document.querySelector(`#transporterSendStock_${resource}`)!
        .textContent!;
    }

    function pickFrom(townNumber: string): void {
      const select = document.querySelector<HTMLSelectElement>(
        "#transporterSendFromTown",
      )!;
      select.value = townNumber;
      select.dispatchEvent(new Event("change"));
    }

    beforeEach(() => {
      // Empire Overview's saved towns after a Scan.
      localStorage.setItem(
        "***tester***cities",
        JSON.stringify({
          "297034": {
            _resources: {
              wood: { _current: 1834 },
              wine: { _current: 12000 },
            },
          },
          "297035": { _resources: { wood: { _current: 700 } } },
        }),
      );
    });

    it("shows the source town's saved stock of each resource, and a dash when it has none", async () => {
      await startWith({});
      await openDialog();
      pickFrom("0");

      expect(stockBeside("wood")).toBe("1,834");
      expect(stockBeside("wine")).toBe("12,000");
      expect(stockBeside("marble")).toBe("—");
    });

    it("follows the From picker, from the town it opens on", async () => {
      await startWith({});
      await openDialog();
      // The picker lists towns by name: M-Corinth (1) comes first.
      expect(stockBeside("wood")).toBe("700");

      pickFrom("0");
      expect(stockBeside("wood")).toBe("1,834");

      pickFrom("1");
      expect(stockBeside("wood")).toBe("700");
      expect(stockBeside("wine")).toBe("—");
    });

    it("takes off what the queue already ships of it from that town, and shows each row", async () => {
      await startWith({});
      const { getState: appGetState } = await appState();
      const { queue } = appGetState();
      queue.push({
        type: "sendResource",
        data: { origin: "0", destination: "1", resource: "wood", amount: 500 },
      });
      // Another resource, and another source town: neither counts for wood here.
      queue.push({
        type: "sendResource",
        data: { origin: "0", destination: "1", resource: "wine", amount: 300 },
      });
      queue.push({
        type: "sendResource",
        data: { origin: "1", destination: "0", resource: "wood", amount: 200 },
      });
      queue.push({
        type: "sendResource",
        data: { origin: "0", destination: "1", resource: "wood", amount: 100 },
      });
      await openDialog();
      pickFrom("0");

      expect(stockBeside("wood")).toBe("1,234 (1,834-500-100)");
      expect(stockBeside("wine")).toBe("11,700 (12,000-300)");
    });

    it("updates when a row is added or removed", async () => {
      await startWith({});
      await openDialog();
      pickFrom("0");
      (
        document.querySelector(
          "#transporterSendDestination",
        ) as HTMLSelectElement
      ).value = "1";
      (
        document.querySelector(
          "#transporterSendAmount_wood",
        ) as HTMLInputElement
      ).value = "500";

      await actions["send.add"](document.body);
      expect(stockBeside("wood")).toBe("1,334 (1,834-500)");

      await actions["send.removeLast"](document.body);
      expect(stockBeside("wood")).toBe("1,834");
    });
  });

  describe("form on the left, queued shipments on the right", () => {
    /** Open the dialog as the game's popup would draw it. */
    async function openDialog(): Promise<void> {
      const createPopup = (id: string, _title: string, html: string) =>
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="${id}">${html}</div>`,
        );
      Object.assign(window, { ikariam: { createPopup } });
      await actions["send.settings"](document.body);
      delete window.ikariam;
    }

    async function queueShipments(count: number): Promise<void> {
      const { getState: appGetState } = await appState();
      for (let i = 0; i < count; i++) {
        appGetState().queue.push({
          type: "sendResource",
          data: { origin: "0", destination: "1", resource: "wine", amount: i },
        });
      }
    }

    /** happy-dom has no layout: give the form a height of its own. */
    function withFormHeight<T>(height: number, run: () => T): T {
      const spy = vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: HTMLElement) {
          const tall = this.id === "transporterSendForm" ? height : 0;
          return { top: 0, bottom: tall, height: tall } as DOMRect;
        });
      try {
        return run();
      } finally {
        spy.mockRestore();
      }
    }

    function tableBox(): HTMLElement {
      return document.querySelector<HTMLElement>("#resourceTableScroll")!;
    }

    it("puts the table to the right of the form, in one row", async () => {
      await startWith({});
      await openDialog();

      const layout = document.querySelector<HTMLElement>(".ika-send-layout")!;
      expect(Array.from(layout.children).map((child) => child.id)).toEqual([
        "transporterSendForm",
        "resourceTableScroll",
      ]);
      const form = layout.children[0];
      expect(form.querySelector("#transporterSendFromTown")).not.toBeNull();
      expect(form.querySelector("#transporterSendDestination")).not.toBeNull();
      expect(form.querySelector('[data-ika-action="send.add"]')).not.toBeNull();
      expect(
        form.querySelector('[data-ika-action="dialog.close"]'),
      ).not.toBeNull();
      expect(tableBox().querySelector("#resourceTable")).not.toBeNull();

      const sheet = document.getElementById(
        "ika-send-amounts-style",
      )!.textContent!;
      expect(sheet).toMatch(/\.ika-send-layout \{\s*display: flex;/);
      // Below the popup header's floats, not beside them.
      expect(sheet).toMatch(/\.ika-send-layout \{[^}]*clear: both;/);
      expect(sheet).toMatch(
        /\.ika-send-layout > #resourceTableScroll \{\s*overflow-y: auto;/,
      );
    });

    it("Clear All empties the shipments, Auto Wine's too, and leaves other tasks", async () => {
      await startWith({});
      await queueShipments(3);
      const { getState: appGetState } = await appState();
      appGetState().queue.push({
        type: "sendResource",
        data: {
          origin: "0",
          destination: "1",
          resource: "wine",
          amount: 50,
          label: "Auto Wine",
        },
      });
      appGetState().queue.push({
        type: "upgradeBuilding",
        data: {
          townName: "W-Athens",
          positionId: "js_CityPosition5Link",
          buildingName: "Warehouse 26",
        },
      });
      await openDialog();
      expect(document.querySelectorAll("#resourceTableBody > tr")).toHaveLength(
        4,
      );
      const clearAll = document.querySelector<HTMLElement>(
        '#transporterSendForm [data-ika-action="send.clearAll"]',
      )!;
      expect(clearAll.textContent).toBe("Clear All");

      await actions["send.clearAll"](clearAll);

      expect(appGetState().queue.listOfType("sendResource")).toEqual([]);
      expect(
        appGetState()
          .queue.listOfType("upgradeBuilding")
          .map((task) => task.data.buildingName),
      ).toEqual(["Warehouse 26"]);
      expect(document.querySelectorAll("#resourceTableBody > tr")).toHaveLength(
        0,
      );
    });

    it("caps the Amount block at twice its narrowest and cuts a long sum with ...", async () => {
      await startWith({});
      await openDialog();

      const sheet = document.getElementById(
        "ika-send-amounts-style",
      )!.textContent!;
      const rule = (selector: string): string =>
        sheet.match(new RegExp(`\\${selector} \\{([^}]*)\\}`))![1];
      expect(rule(".ika-send-amounts")).toContain("min-width: 260px;");
      expect(rule(".ika-send-amounts")).toContain("max-width: 520px;");
      expect(rule(".ika-send-amounts-row")).toContain(
        "grid-template-columns: 65px 150px minmax(0, 1fr);",
      );
      const stock = rule(".ika-send-stock");
      expect(stock).toContain("white-space: nowrap;");
      expect(stock).toContain("overflow: hidden;");
      expect(stock).toContain("text-overflow: ellipsis;");
    });

    it("caps the table at the form's height, so a long queue scrolls", async () => {
      await startWith({});
      await queueShipments(30);
      await openDialog();
      const { renderResourceTable } = await import("./ui/dialogs");

      withFormHeight(312.4, () => renderResourceTable());

      expect(tableBox().style.maxHeight).toBe("313px");
      expect(document.querySelectorAll("#resourceTableBody > tr")).toHaveLength(
        30,
      );
    });

    it("caps it the same with one shipment: the cap is the form's, not the queue's", async () => {
      await startWith({});
      await queueShipments(1);
      await openDialog();
      const { renderResourceTable } = await import("./ui/dialogs");

      withFormHeight(300, () => renderResourceTable());

      expect(tableBox().style.maxHeight).toBe("300px");
    });

    it("leaves the table uncapped while the form has no height yet", async () => {
      await startWith({});
      await queueShipments(30);
      await openDialog();

      expect(tableBox().style.maxHeight).toBe("");
    });
  });

  it("names the resources in its table as the game does, not by DOM id", async () => {
    await startWith({});
    installSendForm({ glass: "500" });
    document.body.insertAdjacentHTML(
      "beforeend",
      `<table><tbody id="resourceTableBody"></tbody></table>`,
    );

    await actions["send.add"](document.body);

    const table = document.querySelector("#resourceTableBody")!.textContent;
    expect(table).toContain("Crystal");
    expect(table).not.toContain("glass");
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
  /**
   * A board row, as `auto-wine.test.ts` draws it. Production is blank, as the
   * board leaves it off a wine island, unless given ("+605").
   */
  function boardRow(
    town: string,
    stock: string,
    consumption: string,
    production = "",
  ): string {
    return (
      `<tr><td class="city_name"><span class="clickable">${town}</span></td>` +
      `<td class="resource wine"><span class="current">${stock}</span></td>` +
      `<td class="resource wine">` +
      `<span class="prodconssubsum production Green">${production}</span>` +
      `<span class="prodconssubsum consumption Red">${consumption}</span></td></tr>`
    );
  }

  /** Make the scan draw this board instead of `BOARD_AFTER_SCAN`. */
  function scanDraws(rows: string[]): void {
    scanBuildings.mockImplementation(async () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="ResTab"><table><tbody>${rows.join("")}</tbody></table></div>`,
      );
      return true;
    });
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

  it(
    "REGRESSION: Start with Transport's timer already on lifts Pirate's " +
      "captcha hold — the queue stood still while the button read Stop " +
      "Timer (bug report of 11/11)",
    async () => {
      // Pirate stopped for the security word on an earlier page.
      localStorage.setItem(
        "testerikaPirateRun",
        JSON.stringify({
          running: false,
          nextAt: 0,
          failingSince: null,
          captchaPending: true,
        }),
      );
      await startWith({ transport: true });
      document.body.insertAdjacentHTML("beforeend", DROPDOWN);
      const state = await appState();
      state.saveSenders(["0"]);
      const pirate = await import("./features/pirate");
      const holdLine = () =>
        document.querySelector<HTMLElement>("#ikaPirateHold")!;
      expect(holdLine().hidden).toBe(false);

      await actions["wine.autoRun"](document.body);
      await settle();

      expect(queuedWine(state)).toEqual(["0 -> 1: wine"]);
      expect(state.isAutoStart()).toBe(true);
      expect(pirate.isPirateCaptchaPending()).toBe(false);
      expect(pirate.isPirateRunning()).toBe(false);
      expect(holdLine().hidden).toBe(true);
      expect(
        showToast.mock.calls.some(([text]) =>
          String(text).includes("starting it lifted the hold"),
        ),
      ).toBe(true);
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

  it(
    "Start with no source ticked scans first, then ticks the town making the " +
      "most wine from what the scan measured, and runs from it",
    async () => {
      // Nothing on the page before the scan: a pick made before it finds
      // nothing to go by.
      scanDraws([
        boardRow("W-Athens", "10,000", "-100", "+605"),
        boardRow("M-Corinth", "0", "-200"),
      ]);
      const state = await startWithSource([]);

      await actions["wine.autoRun"](document.body);
      await settle();

      expect(scanBuildings).toHaveBeenCalledTimes(1);
      expect(state.loadSenders()).toEqual(["0"]);
      expect(state.loadReceivers()).toEqual([
        { townNumber: "1", winePerHour: "200" },
      ]);
      expect(queuedWine(state)).toEqual(["0 -> 1: wine"]);
      expect(state.isAutoStart()).toBe(true);
      expect(timers()).toBe(RUNNING);
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("W-Athens makes the most wine (605/h)"),
      );
    },
  );

  it(
    "Start with no source ticked and no town making wine runs from the town " +
      "whose wine lasts longest, not the one holding the most",
    async () => {
      // W-Athens holds more but lasts 2 hours; M-Corinth lasts 60.
      scanDraws([
        boardRow("W-Athens", "10,000", "-5,000"),
        boardRow("M-Corinth", "6,000", "-100"),
      ]);
      const state = await startWithSource([]);

      await actions["wine.autoRun"](document.body);
      await settle();

      expect(state.loadSenders()).toEqual(["1"]);
      expect(queuedWine(state)).toEqual(["1 -> 0: wine"]);
      expect(state.isAutoStart()).toBe(true);
    },
  );

  it(
    "Start with no source ticked says so after the scan, and queues and " +
      "ticks nothing, when no town's figures are known",
    async () => {
      scanDraws([]);
      const state = await startWithSource([]);

      await actions["wine.autoRun"](document.body);
      await settle();

      expect(scanBuildings).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("No town is ticked"),
      );
      expect(state.loadSenders()).toEqual([]);
      expect(queuedWine(state)).toEqual([]);
      expect(state.isAutoStart()).toBe(false);
      expect(timers()).toBe(IDLE);
    },
  );

  it(
    "Start sends nothing to a town whose island makes more wine than it " +
      "drinks — it is no receiver",
    async () => {
      scanDraws([
        boardRow("W-Athens", "10,000", "-100", "+605"),
        // Another wine town: drinks 300, makes 500.
        boardRow("M-Corinth", "0", "-300", "+500"),
      ]);
      const state = await startWithSource();

      await actions["wine.autoRun"](document.body);
      await settle();

      expect(state.loadReceivers()).toEqual([]);
      expect(queuedWine(state)).toEqual([]);
      expect(state.isAutoStart()).toBe(false);
      // Says why, naming the town — not the old "ticked as Sender" message.
      expect(showToast).toHaveBeenLastCalledWith(
        expect.stringContaining("so they get none: M-Corinth."),
      );
    },
  );

  it(
    "Start ships a town on a wine island only what it is short by, levelled " +
      "on that",
    async () => {
      scanDraws([
        boardRow("W-Athens", "10,000", "-100", "+605"),
        // Drinks 800, makes 500: short by 300 an hour.
        boardRow("M-Corinth", "0", "-800", "+500"),
      ]);
      const state = await startWithSource();

      await actions["wine.autoRun"](document.body);
      await settle();

      expect(state.loadReceivers()).toEqual([
        { townNumber: "1", winePerHour: "800" },
      ]);
      const [task] = state.getState().queue.listOfType("sendResource");
      // The source's 9,900 spare in whole ships of 500 is 9,500: one
      // receiver takes all of it, whatever it drinks. What the net figure
      // changes is the hours it reaches, so read the plan the run used.
      expect(task.data).toMatchObject({ destination: "1", amount: 9_500 });
      const { planWineRun } = await import("./features/auto-wine");
      expect(planWineRun("0").allocations[0]).toMatchObject({
        consume: 300,
      });
    },
  );

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
    // A plain popup with no extra class: the game's source reads the fourth
    // argument as a TYPE_* constant and the fifth as a class name.
    expect(createPopup.mock.lastCall?.slice(3)).toEqual([null, null]);
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

  it(
    "the settings dialog's Save with no source ticked ticks the town making " +
      "the most wine, from the figures on the page, and queues the run",
    async () => {
      const state = await startWithSource([]);
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="ResTab"><table><tbody>` +
          boardRow("W-Athens", "10,000", "-100", "+605") +
          boardRow("M-Corinth", "0", "-200") +
          `</tbody></table></div>` +
          `<table><tr class="txtWine"><td><input type="checkbox" id="cbSender_0"></td>` +
          `<td><input type="text" id="txtWine_0" value="0"></td></tr>` +
          `<tr class="txtWine"><td><input type="checkbox" id="cbSender_1"></td>` +
          `<td><input type="text" id="txtWine_1" value="200"></td></tr></table>`,
      );

      await actions["wine.save"](document.body);

      expect(scanBuildings).not.toHaveBeenCalled();
      expect(state.loadSenders()).toEqual(["0"]);
      expect(queuedWine(state)).toEqual(["0 -> 1: wine"]);
      expect(state.isAutoStart()).toBe(false);
    },
  );

  it(
    "Preview with no source ticked previews from the town a run would pick, " +
      "without ticking it — the dialog's Save writes the ticks back",
    async () => {
      const state = await startWithSource([]);
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="ResTab"><table><tbody>` +
          boardRow("W-Athens", "10,000", "-100", "+605") +
          boardRow("M-Corinth", "0", "-200") +
          `</tbody></table></div><div id="winePlanPreview"></div>`,
      );
      state.saveReceivers([{ townNumber: "1", winePerHour: "200" }]);

      await actions["wine.preview"](document.body);

      expect(state.loadSenders()).toEqual([]);
      expect(document.querySelector("#winePlanPreview")!.textContent).toContain(
        "M-Corinth",
      );
    },
  );

  describe("Import of a wine transport file", () => {
    /** A wine transport file as tools/wine-transport.js writes it, for `account`. */
    function transportFile(
      account: string,
      shipments = [{ town: "M-Corinth", wine: 1234 }],
    ): string {
      return JSON.stringify({
        kind: "ikariam-wine-transport",
        version: 1,
        account,
        createdAt: "2026-11-05T10:07:46.885Z",
        crawlFile: `ikariam-wine-${account}-2026-11-05-09-48-43.js`,
        targetHours: 1980.73,
        shipments,
      });
    }

    /** Answer the file picker with `content`, as a player choosing it would. */
    function pickFile(content: string) {
      return vi
        .spyOn(HTMLInputElement.prototype, "click")
        .mockImplementation(function (this: HTMLInputElement) {
          Object.defineProperty(this, "files", {
            value: [new File([content], "transport.json")],
          });
          this.dispatchEvent(new Event("change"));
        });
    }

    it("lifts Pirate's captcha hold, even with Transport's timer already on", async () => {
      localStorage.setItem(
        "testerikaPirateRun",
        JSON.stringify({
          running: false,
          nextAt: 0,
          failingSince: null,
          captchaPending: true,
        }),
      );
      await startWith({ transport: true });
      document.body.insertAdjacentHTML("beforeend", DROPDOWN);
      const state = await appState();
      state.saveSenders(["0"]);
      const pirate = await import("./features/pirate");
      const picker = pickFile(transportFile("tester"));
      try {
        await actions["wine.import"](document.body);
        await vi.waitFor(() => expect(queuedWine(state)).toHaveLength(1));
      } finally {
        picker.mockRestore();
      }

      expect(pirate.isPirateCaptchaPending()).toBe(false);
    });

    it("Auto Wine Settings has an Import button that runs it", async () => {
      await startWithSource();
      const createPopup = (id: string, _title: string, html: string) =>
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="${id}">${html}</div>`,
        );
      Object.assign(window, { ikariam: { createPopup } });
      await actions["wine.settings"](document.body);
      delete window.ikariam;

      expect(
        document.querySelector('[data-ika-action="wine.import"]')?.textContent,
      ).toBe("Import");
    });

    it(
      "queues the file's shipments from the ticked source and switches " +
        "Transport's timer on",
      async () => {
        const state = await startWithSource();
        const picker = pickFile(transportFile("tester"));
        try {
          await actions["wine.import"](document.body);
          await vi.waitFor(() => expect(queuedWine(state)).toHaveLength(1));
        } finally {
          picker.mockRestore();
        }

        expect(queuedWine(state)).toEqual(["0 -> 1: wine"]);
        // 1,234 is two ships and more at 500: rounded down to whole ships.
        expect(
          state.getState().queue.listOfType("sendResource")[0].data.amount,
        ).toBe(1000);
        expect(scanBuildings).not.toHaveBeenCalled();
        expect(state.isAutoStart()).toBe(true);
      },
    );

    it("refuses another account's file, and queues and starts nothing", async () => {
      const state = await startWithSource();
      const picker = pickFile(transportFile("Saigon"));
      try {
        await actions["wine.import"](document.body);
        await vi.waitFor(() => expect(showToast).toHaveBeenCalled());
      } finally {
        picker.mockRestore();
      }

      expect(String(showToast.mock.calls[0][0])).toContain(
        'for the account "Saigon", not "tester"',
      );
      expect(queuedWine(state)).toEqual([]);
      expect(state.isAutoStart()).toBe(false);
    });

    it(
      "with several towns ticked, asks which one, then ships from the town " +
        "picked in the popup",
      async () => {
        const state = await startWithSource(["0", "1"]);
        const createPopup = (id: string, _title: string, html: string) =>
          document.body.insertAdjacentHTML(
            "beforeend",
            `<div id="${id}">${html}</div>`,
          );
        Object.assign(window, { ikariam: { createPopup } });
        const picker = pickFile(
          transportFile("tester", [{ town: "W-Athens", wine: 300 }]),
        );
        let button: HTMLElement | null = null;
        try {
          await actions["wine.import"](document.body);
          await vi.waitFor(() => {
            button = document.querySelector<HTMLElement>(
              '[data-ika-action="wine.importFrom"][data-ika-town="1"]',
            );
            expect(button).not.toBeNull();
          });
        } finally {
          picker.mockRestore();
          delete window.ikariam;
        }
        expect(queuedWine(state)).toEqual([]);

        await actions["wine.importFrom"](button!);
        await settle();

        expect(queuedWine(state)).toEqual(["1 -> 0: wine"]);
        expect(state.isAutoStart()).toBe(true);
      },
    );

    it("with nothing to ship in the file, neither scans nor ticks a source", async () => {
      const state = await startWithSource([]);
      const picker = pickFile(transportFile("tester", []));
      try {
        await actions["wine.import"](document.body);
        await vi.waitFor(() => expect(showToast).toHaveBeenCalled());
      } finally {
        picker.mockRestore();
      }

      expect(String(showToast.mock.calls[0][0])).toContain(
        "Nothing to queue from this wine transport file",
      );
      expect(scanBuildings).not.toHaveBeenCalled();
      expect(state.loadSenders()).toEqual([]);
      expect(queuedWine(state)).toEqual([]);
      expect(state.isAutoStart()).toBe(false);
    });

    it(
      "with no source ticked, scans first, then ships from the town Start " +
        "would pick",
      async () => {
        const state = await startWithSource([]);
        const picker = pickFile(transportFile("tester"));
        try {
          await actions["wine.import"](document.body);
          await vi.waitFor(() => expect(queuedWine(state)).toHaveLength(1));
        } finally {
          picker.mockRestore();
        }

        expect(scanBuildings).toHaveBeenCalledTimes(1);
        expect(state.loadSenders()).toEqual(["0"]);
        expect(queuedWine(state)).toEqual(["0 -> 1: wine"]);
        expect(state.isAutoStart()).toBe(true);
      },
    );
  });

  describe("Crawl with Wine picked", () => {
    /** The Crawl dialog as the game's popup would draw it, Wine picked. */
    function pickWineInCrawlDialog(): void {
      const createPopup = (id: string, _title: string, html: string) =>
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="${id}">${html}</div>`,
        );
      Object.assign(window, { ikariam: { createPopup } });
      actions["crawl.open"](document.body);
      delete window.ikariam;
      (document.querySelector("#ikaCrawl_wine") as HTMLInputElement).checked =
        true;
    }

    beforeEach(() => {
      downloadText.mockClear();
    });

    it("a scan that refuses to start saves why, as the scan said it", async () => {
      await startWithSource();
      scanBuildings.mockImplementation(
        async (
          _maxTowns?: number,
          _queueIsRunning?: () => boolean,
          onRefused?: (reason: string) => void,
        ) => {
          onRefused?.("A scan is already walking the towns.");
          return false;
        },
      );
      downloadJson.mockClear();
      pickWineInCrawlDialog();

      await actions["crawl.run"](document.body);
      await settle();

      const file = savedCrawlFailure("wine");
      expect(file.error).toMatchObject({
        stage: "scan",
        name: "CrawlStopped",
        message: "A scan is already walking the towns.",
      });
      expect(file.error.stack).toBeTypeOf("string");
      expect(downloadText).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining(
          "Could not crawl: A scan is already walking the towns.",
        ),
      );
    });

    it("a scan that refuses without a reason still saves a file", async () => {
      await startWithSource();
      scanBuildings.mockResolvedValue(false);
      downloadJson.mockClear();
      pickWineInCrawlDialog();

      await actions["crawl.run"](document.body);
      await settle();

      expect(savedCrawlFailure("wine").error).toMatchObject({
        stage: "scan",
        message: "The scan of every town did not start.",
      });
    });

    it("no source town to ship from saves why", async () => {
      await startWithSource([]);
      scanBuildings.mockResolvedValue(true);
      downloadJson.mockClear();
      pickWineInCrawlDialog();

      await actions["crawl.run"](document.body);
      await settle();

      expect(savedCrawlFailure("wine").error).toMatchObject({
        stage: "source",
        name: "CrawlStopped",
      });
      expect(downloadText).not.toHaveBeenCalled();
    });

    it("from the source picked in the popup, a failure saves a file too", async () => {
      await startWithSource();
      scanBuildings.mockResolvedValue(false);
      downloadJson.mockClear();
      const button = document.createElement("button");
      button.dataset.ikaTown = "0";

      await actions["crawl.wineFrom"](button);
      await settle();

      expect(savedCrawlFailure("wine").error.stage).toBe("scan");
    });

    it(
      "REGRESSION: scans, takes each town's measured consumption as Load " +
        "then Save would, then saves the receiving towns' figures as a " +
        "`const csv` snippet — a town never loaded into Auto Wine Settings " +
        "was missing from the file although the scan had measured it",
      async () => {
        // Nothing saved as a receiver yet: only the scan knows M-Corinth drinks.
        const state = await startWithSource();
        pickWineInCrawlDialog();

        await actions["crawl.run"](document.body);
        await settle();

        expect(scanBuildings).toHaveBeenCalledTimes(1);
        expect(downloadText).toHaveBeenCalledTimes(1);
        const [filename, text, mimeType] = downloadText.mock.calls[0];
        expect(filename).toMatch(
          /^ikariam-wine-tester-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.js$/,
        );
        expect(mimeType).toBe("text/javascript");
        // Figures from the board the scan drew: the source holds 10,000 and
        // keeps one hour (100), so 9,900 can go.
        expect(text).toBe(
          "const csv = `\n" +
            "account,town,stock,consume,maxSupply\n" +
            "tester, M-Corinth    , 0    , 200    , 9900\n" +
            "`;\n",
        );
        // Saved as Auto Wine Settings' Load then Save would have, so the
        // dialog's Wine/h shows the scan's figure without a Load.
        expect(state.loadReceivers()).toEqual([
          { townNumber: "1", winePerHour: "200" },
        ]);
        expect(document.querySelector("#ikaCrawl_wine")).toBeNull();
      },
    );

    it(
      "with no source ticked, ticks the town making the most wine and " +
        "saves the file from it",
      async () => {
        const state = await startWithSource([]);
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="ResTab"><table><tbody>` +
            boardRow("W-Athens", "10,000", "-100", "+605") +
            `</tbody></table></div>`,
        );
        pickWineInCrawlDialog();

        await actions["crawl.run"](document.body);
        await settle();

        expect(state.loadSenders()).toEqual(["0"]);
        expect(scanBuildings).toHaveBeenCalledTimes(1);
        expect(downloadText).toHaveBeenCalledTimes(1);
        expect(downloadText.mock.calls[0][1]).toContain(
          "tester, M-Corinth    , 0    , 200    , 9900",
        );
      },
    );

    it("saves nothing, and changes no setting, when the scan refuses to run", async () => {
      scanBuildings.mockResolvedValue(false);
      const state = await startWithSource();
      state.saveReceivers([{ townNumber: "1", winePerHour: "50" }]);
      pickWineInCrawlDialog();

      await actions["crawl.run"](document.body);
      await settle();

      expect(downloadText).not.toHaveBeenCalled();
      expect(state.loadReceivers()).toEqual([
        { townNumber: "1", winePerHour: "50" },
      ]);
    });

    it("still saves every town but the source when no town drinks wine, with consume 0", async () => {
      scanBuildings.mockImplementation(async () => {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="ResTab"><table><tbody>` +
            boardRow("W-Athens", "10,000", "-100") +
            boardRow("M-Corinth", "500", "0") +
            `</tbody></table></div>`,
        );
        return true;
      });
      await startWithSource();
      pickWineInCrawlDialog();

      await actions["crawl.run"](document.body);
      await settle();

      expect(scanBuildings).toHaveBeenCalledTimes(1);
      expect(downloadText).toHaveBeenCalledTimes(1);
      expect(downloadText.mock.calls[0][1]).toContain(
        "tester, M-Corinth    , 500    , 0    , 9900\n",
      );
    });

    it(
      "with no source ticked, picks the source after the scan, from the " +
        "figures it has just measured, as Start does",
      async () => {
        // Before the scan M-Corinth looks like the wine maker; the scan shows
        // it is W-Athens.
        scanBuildings.mockImplementation(async () => {
          document.querySelector("#ResTab")?.remove();
          document.body.insertAdjacentHTML(
            "beforeend",
            `<div id="ResTab"><table><tbody>` +
              boardRow("W-Athens", "10,000", "-100", "+605") +
              boardRow("M-Corinth", "0", "-200") +
              `</tbody></table></div>`,
          );
          return true;
        });
        const state = await startWithSource([]);
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="ResTab"><table><tbody>` +
            boardRow("W-Athens", "10,000", "-100") +
            boardRow("M-Corinth", "0", "-200", "+900") +
            `</tbody></table></div>`,
        );
        pickWineInCrawlDialog();

        await actions["crawl.run"](document.body);
        await settle();

        expect(state.loadSenders()).toEqual(["0"]);
        expect(downloadText).toHaveBeenCalledTimes(1);
        const text = downloadText.mock.calls[0][1] as string;
        expect(text).toContain("tester, M-Corinth    , 0    , 200    , 9900\n");
        expect(text).not.toContain("W-Athens");
      },
    );
  });
});

/**
 * A crawl's file as these tests read it: every field one of the crawls
 * writes, typed as it is read here, so a misspelt field does not compile.
 */
interface SavedCrawlFile {
  ok: boolean;
  crawl: string;
  mode: string;
  savedAt: string;
  url: string;
  target: string;
  matches: number;
  html: string;
  elements: {
    element: string;
    depth: number;
    style: Record<string, string>;
    rules: number[];
    error: CrawlError;
  }[];
  elementsCut: boolean;
  rules: string[];
  unreadableSheets: { sheet: string; error: CrawlError }[];
  code: string;
  result: unknown;
  error: CrawlError;
}

/** The one error file a failed crawl saved, parsed. */
function savedCrawlFailure(crawl: string): SavedCrawlFile {
  expect(downloadJson).toHaveBeenCalledTimes(1);
  const [filename, json] = downloadJson.mock.calls[0];
  expect(filename).toMatch(
    new RegExp(
      `^ikariam-crawl-${crawl}-failed-tester-\\d{4}-\\d{2}-\\d{2}-\\d{2}-\\d{2}-\\d{2}\\.json$`,
    ),
  );
  const file = JSON.parse(json);
  expect(file).toMatchObject({ ok: false, crawl });
  expect(file.savedAt).toBeTypeOf("string");
  expect(file.url).toBeTypeOf("string");
  return file;
}

describe("the Crawl dialog", () => {
  /** Draw the dialog the way the game's popup would. */
  async function openCrawl(): Promise<void> {
    await startWith({});
    const createPopup = (id: string, _title: string, html: string) =>
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="${id}">${html}</div>`,
      );
    Object.assign(window, { ikariam: { createPopup } });
    try {
      actions["crawl.open"](document.body);
    } finally {
      delete window.ikariam;
    }
  }

  beforeEach(() => {
    showToast.mockClear();
    scanBuildings.mockReset();
    // Reset, not clear: a one-off implementation a test left unused would
    // otherwise answer the next test's download.
    downloadJson.mockReset();
    downloadText.mockClear();
  });

  it(
    "the panel's Crawl button opens it with one radio button per crawl, " +
      "all in one group, none picked",
    async () => {
      await openCrawl();

      expect(
        document.querySelector('[data-ika-action="crawl.open"]')?.textContent,
      ).toBe("Crawl");
      // Every crawl the messages declare, so a new one is covered too.
      const { CRAWL_DIALOG } = await import("./messages");
      const kinds = Object.keys(CRAWL_DIALOG.kinds);
      expect(kinds).toEqual(["building", "wine", "pirate", "element"]);
      const choices = kinds.map((kind) =>
        document.querySelector<HTMLInputElement>(`#ikaCrawl_${kind}`)!,
      );
      // REGRESSION: one group of radio buttons, not checkboxes — two crawls
      // from one press ran side by side.
      expect(choices.map((input) => input.type)).toEqual(
        kinds.map(() => "radio"),
      );
      expect(new Set(choices.map((input) => input.name)).size).toBe(1);
      expect(choices.some((input) => input.checked)).toBe(false);
      expect(
        document.querySelector('[data-ika-action="crawl.run"]'),
      ).not.toBeNull();
    },
  );

  it("with nothing picked, says so and crawls nothing", async () => {
    await openCrawl();

    await actions["crawl.run"](document.body);

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Pick what to crawl"),
    );
    expect(scanBuildings).not.toHaveBeenCalled();
    expect(downloadJson).not.toHaveBeenCalled();
    expect(downloadText).not.toHaveBeenCalled();
  });

  it("with Building picked, saves the building open in the game's help", async () => {
    await openCrawl();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="buildingDetail"><h3 class="header">Academy</h3>` +
        `<div class="content"><table class="table01">` +
        `<tr><th>Level</th></tr><tr><td>1</td></tr><tr><td>2</td></tr>` +
        `</table></div></div>`,
    );
    (document.querySelector("#ikaCrawl_building") as HTMLInputElement).checked =
      true;

    await actions["crawl.run"](document.body);

    expect(downloadJson).toHaveBeenCalledTimes(1);
    expect(JSON.parse(downloadJson.mock.calls[0][1])).toMatchObject({
      name: "Academy",
      rows: [["1"], ["2"]],
    });
    expect(scanBuildings).not.toHaveBeenCalled();
  });

  it("with Building picked and no help dialog open, saves why", async () => {
    await openCrawl();
    (document.querySelector("#ikaCrawl_building") as HTMLInputElement).checked =
      true;

    await actions["crawl.run"](document.body);
    await vi.advanceTimersByTimeAsync(0);

    const file = savedCrawlFailure("building");
    expect(file.error).toMatchObject({
      stage: "find",
      name: "CrawlStopped",
    });
    expect(file.error.message).toContain("Open Help > building details first");
    expect(file.error.stack).toBeTypeOf("string");
    expect(showToast.mock.calls[0][0]).toContain(
      "Could not crawl: Open Help > building details first",
    );
  });

  it("an error nobody planned for is saved too, with what was thrown", async () => {
    await openCrawl();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="buildingDetail"><h3 class="header">Academy</h3>` +
        `<div class="content"><table class="table01">` +
        `<tr><th>Level</th></tr><tr><td>1</td></tr></table></div></div>`,
    );
    (document.querySelector("#ikaCrawl_building") as HTMLInputElement).checked =
      true;
    // The building's own file is refused; the error file is not.
    downloadJson.mockImplementationOnce(() => {
      throw new TypeError("quota exceeded");
    });

    await actions["crawl.run"](document.body);
    await vi.advanceTimersByTimeAsync(0);

    expect(downloadJson).toHaveBeenCalledTimes(2);
    const [filename, json] = downloadJson.mock.calls[1];
    expect(filename).toContain("ikariam-crawl-building-failed");
    expect(JSON.parse(json).error).toMatchObject({
      stage: "unexpected",
      name: "TypeError",
      message: "quota exceeded",
    });
  });

  it("a failed crawl's file does not carry a token from the page's address", async () => {
    await openCrawl();
    (document.querySelector("#ikaCrawl_building") as HTMLInputElement).checked =
      true;
    const before = location.href;
    history.replaceState(
      null,
      "",
      "/?view=city&actionRequest=f3c9a1b2e7d64400",
    );
    try {
      await actions["crawl.run"](document.body);
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      history.replaceState(null, "", before);
    }

    const file = savedCrawlFailure("building");
    expect(file.url).toContain("actionRequest=<actionRequest>");
    expect(downloadJson.mock.calls[0][1]).not.toContain("f3c9a1b2e7d64400");
  });

  it("an error file the browser will not take is reported on screen", async () => {
    await openCrawl();
    (document.querySelector("#ikaCrawl_building") as HTMLInputElement).checked =
      true;
    downloadJson.mockImplementationOnce(() => {
      throw new Error("blocked");
    });

    await actions["crawl.run"](document.body);
    await vi.advanceTimersByTimeAsync(0);

    expect(showToast).toHaveBeenCalledWith(
      "Could not save the crawl's file: blocked",
    );
  });

  describe("Crawl by id", () => {
    /** A tool dialog open in the game's popup, and a sheet styling it. */
    const GAME_DIALOG =
      `<style id="probeSheet">#probe .inner { color: red; } ` +
      `#elsewhere { color: blue; } #probe::before { content: "x"; }</style>` +
      `<div id="ikaMationTransporterDialog"><div id="probe" style="float: left">` +
      `<span class="inner">one</span><span class="inner">two</span>` +
      `</div></div>`;

    /** Crawl > By id > Crawl, as the player picks it. */
    async function openBox(): Promise<void> {
      await openCrawl();
      (
        document.querySelector("#ikaCrawl_element") as HTMLInputElement
      ).checked = true;
      await actions["crawl.run"](document.body);
    }

    function box(): HTMLElement | null {
      return document.querySelector<HTMLElement>("#ikaElementCrawl");
    }

    /** Type into the box, pick the mode and press its own Crawl button. */
    async function crawl(text: string, mode: "html" | "js"): Promise<void> {
      box()!.querySelector<HTMLTextAreaElement>("textarea")!.value = text;
      box()!.querySelector<HTMLInputElement>(
        `input[type="radio"][value="${mode}"]`,
      )!.checked = true;
      // The app's dispatcher is stubbed here; it listens on `document`, so
      // the box's buttons reach it from outside the panel and the popup.
      const run = box()!.querySelector<HTMLElement>(
        '[data-ika-action="crawl.element.run"]',
      )!;
      await actions["crawl.element.run"](run);
      await vi.advanceTimersByTimeAsync(0);
    }

    function savedFile(): SavedCrawlFile {
      expect(downloadJson).toHaveBeenCalledTimes(1);
      return JSON.parse(downloadJson.mock.calls[0][1]);
    }

    afterEach(() => {
      box()?.remove();
    });

    it("opens a box of its own, outside the game's popup, HTML picked", async () => {
      await openBox();

      expect(document.querySelector("#ikaMationTransporterDialog")).toBeNull();
      expect(box()).not.toBeNull();
      expect(box()!.parentElement).toBe(document.body);
      expect(box()!.querySelector("textarea")).not.toBeNull();
      const modes = Array.from(
        box()!.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
      );
      expect(modes.map((input) => input.value)).toEqual(["html", "js"]);
      expect(
        modes.filter((input) => input.checked).map((i) => i.value),
      ).toEqual(["html"]);
    });

    it(
      "HTML: saves the element's HTML, each element's style, and the rules " +
        "that match it, leaving the dialog open",
      async () => {
        await openBox();
        document.body.insertAdjacentHTML("beforeend", GAME_DIALOG);

        await crawl("probe", "html");

        const file = savedFile();
        expect(downloadJson.mock.calls[0][0]).toContain("ikariam-crawl-html");
        expect(file.ok).toBe(true);
        expect(file.mode).toBe("html");
        expect(file.target).toBe("probe");
        expect(file.matches).toBe(1);
        expect(file.html).toBe(document.querySelector("#probe")!.outerHTML);
        expect(
          file.elements.map((e: { element: string; depth: number }) => [
            e.element,
            e.depth,
          ]),
        ).toEqual([
          ["div#probe", 0],
          ["span.inner", 1],
          ["span.inner", 1],
        ]);
        expect(file.elements[0].style.float).toBe("left");
        // Each rule once, and only those that match an element itself.
        expect(file.rules).toEqual(["#probe .inner { color: red; }"]);
        expect(file.elements[0].rules).toEqual([]);
        expect(file.elements[1].rules).toEqual([0]);
        expect(file.elements[2].rules).toEqual([0]);
        expect(file.unreadableSheets).toEqual([]);
        expect(file.elementsCut).toBe(false);
        // The dialog looked at, and the box, are both still open.
        expect(
          document.querySelector("#ikaMationTransporterDialog"),
        ).not.toBeNull();
        expect(box()).not.toBeNull();
      },
    );

    it("HTML: takes a CSS selector too, and says how many it matched", async () => {
      await openBox();
      document.body.insertAdjacentHTML("beforeend", GAME_DIALOG);

      await crawl("#ikaMationTransporterDialog .inner", "html");

      const file = savedFile();
      expect(file.matches).toBe(2);
      expect(file.html).toBe('<span class="inner">one</span>');
    });

    it(
      "HTML: nothing matching, or not a selector, still saves a file with " +
        "the error in full",
      async () => {
        await openBox();

        await crawl("noSuchElement", "html");
        await crawl("[[", "html");

        expect(downloadJson).toHaveBeenCalledTimes(2);
        const [missing, invalid] = downloadJson.mock.calls.map((call) =>
          JSON.parse(call[1]),
        );
        expect(missing).toMatchObject({
          ok: false,
          mode: "html",
          target: "noSuchElement",
          error: {
            stage: "find",
            name: "NotFound",
            message:
              'No element has the id "noSuchElement", and no element ' +
              "matches it as a CSS selector.",
          },
        });
        expect(invalid).toMatchObject({
          ok: false,
          target: "[[",
          error: { stage: "selector" },
        });
        expect(invalid.error.name).toBeTruthy();
        expect(invalid.error.message).toBeTruthy();
        expect(showToast.mock.calls[0][0]).toContain(
          "Could not crawl: No element has the id",
        );
        expect(showToast.mock.calls[0][0]).toContain("ikariam-crawl-html");
      },
    );

    it("an empty box says so and saves nothing", async () => {
      await openBox();

      await crawl("   ", "html");

      expect(downloadJson).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        "Type an element id, a CSS selector or some JS first.",
      );
    });

    it(
      "HTML: an element that cannot be read gets its error, and the rest " +
        "is still read",
      async () => {
        await openBox();
        document.body.insertAdjacentHTML("beforeend", GAME_DIALOG);
        const realComputed = window.getComputedStyle;
        const spy = vi
          .spyOn(window, "getComputedStyle")
          .mockImplementation((element, pseudo) => {
            if ((element as Element).textContent === "two") {
              throw new TypeError("cannot read this one");
            }
            return realComputed.call(window, element, pseudo);
          });
        try {
          await crawl("probe", "html");
        } finally {
          spy.mockRestore();
        }

        const file = savedFile();
        expect(file.ok).toBe(true);
        expect(file.elements[1].style).toBeDefined();
        expect(file.elements[2]).toMatchObject({
          element: "span.inner",
          depth: 1,
          error: {
            stage: "element",
            name: "TypeError",
            message: "cannot read this one",
          },
        });
        expect(file.elements[2].error.stack).toBeTypeOf("string");
        expect(file.elements[2].style).toBeUndefined();
      },
    );

    it("HTML: a stylesheet the page will not hand over is listed with its error", async () => {
      await openBox();
      document.body.insertAdjacentHTML("beforeend", GAME_DIALOG);
      const sheet = (document.getElementById("probeSheet") as HTMLStyleElement)
        .sheet!;
      Object.defineProperty(sheet, "cssRules", {
        configurable: true,
        get() {
          throw new DOMException("not this origin", "SecurityError");
        },
      });

      await crawl("probe", "html");

      const file = savedFile();
      expect(file.ok).toBe(true);
      expect(file.rules).toEqual([]);
      expect(file.unreadableSheets).toEqual([
        {
          sheet: "(inline sheet)",
          error: expect.objectContaining({
            stage: "sheet",
            name: "SecurityError",
            message: "not this origin",
          }),
        },
      ]);
    });

    it("a file the browser will not take is reported on screen", async () => {
      await openBox();
      document.body.insertAdjacentHTML("beforeend", GAME_DIALOG);
      downloadJson.mockImplementationOnce(() => {
        throw new Error("blocked");
      });

      await crawl("probe", "html");

      expect(showToast).toHaveBeenCalledWith(
        "Could not save the crawl's file: blocked",
      );
    });

    it("JS: saves what the code returns", async () => {
      await openBox();
      document.body.insertAdjacentHTML("beforeend", GAME_DIALOG);

      await crawl("document.querySelectorAll('#probe .inner').length;", "js");

      const file = savedFile();
      expect(downloadJson.mock.calls[0][0]).toContain("ikariam-crawl-js");
      expect(file).toMatchObject({
        mode: "js",
        code: "document.querySelectorAll('#probe .inner').length;",
        ok: true,
        result: 2,
      });
    });

    it("JS: saves the error when the code throws", async () => {
      await openBox();

      await crawl("null.missing", "js");

      const file = savedFile();
      expect(file.ok).toBe(false);
      expect(file.error).toMatchObject({ stage: "run", name: "TypeError" });
      expect(file.error.message).toBeTruthy();
      expect(file.error.stack).toBeTypeOf("string");
      expect(showToast.mock.calls[0][0]).toContain("Could not crawl: ");
      expect(showToast.mock.calls[0][0]).toContain("ikariam-crawl-js");
    });

    describe("what the JS mode writes", () => {
      async function run(code: string) {
        const { crawlCode } = await import("./diagnostics");
        return crawlCode(code);
      }

      it("one expression, with or without a trailing ;", async () => {
        expect(await run("1 + 2")).toMatchObject({ ok: true, result: 3 });
        expect(await run("1 + 2;  ")).toMatchObject({ ok: true, result: 3 });
      });

      it("statements, with their own return", async () => {
        expect(await run("const a = 2;\nreturn a * 3;")).toMatchObject({
          ok: true,
          result: 6,
        });
      });

      it("awaits a promise, and await works", async () => {
        expect(await run("Promise.resolve('done')")).toMatchObject({
          result: "done",
        });
        expect(
          await run("const v = await Promise.resolve(4); return v + 1;"),
        ).toMatchObject({ result: 5 });
      });

      it("an error, thrown or rejected, is kept with its name and message", async () => {
        const thrown = await run("throw new RangeError('too far')");
        expect(thrown).toMatchObject({
          ok: false,
          error: { stage: "run", name: "RangeError", message: "too far" },
        });
        expect("error" in thrown && thrown.error.stack).toBeTypeOf("string");
        expect(await run("Promise.reject(new Error('no'))")).toMatchObject({
          ok: false,
          error: { stage: "run", message: "no" },
        });
        expect(await run("Promise.reject('plain text')")).toMatchObject({
          ok: false,
          error: { stage: "run", name: "string", message: "plain text" },
        });
        expect(await run("const = ;")).toMatchObject({
          ok: false,
          error: { stage: "compile", name: "SyntaxError" },
        });
      });

      it("a result that cannot be written out is a save error", async () => {
        const saved = await run(
          "new Proxy({}, { ownKeys() { throw new Error('no keys'); } })",
        );
        expect(saved).toMatchObject({
          ok: false,
          error: { stage: "save", message: "no keys" },
        });
      });

      it(
        "makes the result safe to save: repeats, elements, functions, " +
          "throwing getters, long lists and deep nesting",
        async () => {
          document.body.insertAdjacentHTML(
            "beforeend",
            `<div id="probeResult" class="a">text</div>`,
          );
          const crawled = await run(`(() => {
            const loop = { name: "loop" };
            loop.self = loop;
            const shared = { x: 1 };
            const tricky = {};
            Object.defineProperty(tricky, "bad", {
              enumerable: true,
              get() { throw new Error("getter"); },
            });
            let deep = { end: true };
            for (let i = 0; i < 10; i++) deep = { deep };
            return {
              loop,
              both: [shared, shared],
              element: document.getElementById("probeResult"),
              fn: function named() {},
              tricky,
              long: Array.from({ length: 502 }, (_, i) => i),
              deep,
              nothing: undefined,
              notANumber: NaN,
              map: new Map([["k", 1]]),
            };
          })()`);
          const saved = ("result" in crawled ? crawled.result : null) as Record<
            string,
            unknown
          >;
          expect(saved.loop).toEqual({ name: "loop", self: "[Circular]" });
          // The same object twice is not a loop.
          expect(saved.both).toEqual([{ x: 1 }, { x: 1 }]);
          expect(saved.element).toEqual({
            element: "div#probeResult.a",
            html: '<div id="probeResult" class="a">text</div>',
          });
          expect(saved.fn).toBe("[Function named]");
          expect(saved.tricky).toEqual({ bad: "[Threw: getter]" });
          expect(saved.long).toHaveLength(501);
          expect((saved.long as unknown[])[500]).toBe("… [2 more]");
          expect(JSON.stringify(saved.deep)).toContain('"[Too deep]"');
          expect(saved.nothing).toBe("[undefined]");
          expect(saved.notANumber).toBe("NaN");
          expect(saved.map).toEqual([["k", 1]]);
          // And it survives JSON as written.
          expect(() => JSON.stringify(saved)).not.toThrow();
        },
      );
    });

    describe("session tokens in the files", () => {
      const TOKEN = "f3c9a1b2e7d64400";
      /** A town switch form as the game draws it, inside the dialog. */
      const FORM_WITH_TOKEN =
        `<div id="ikaMationTransporterDialog"><div id="probe">` +
        `<form id="changeCityForm"><input type="hidden" name="actionRequest" ` +
        `id="js_ChangeCityActionRequest" value="${TOKEN}"></form>` +
        `</div></div>`;

      it("HTML: the token in a form field is taken out of the file", async () => {
        await openBox();
        document.body.insertAdjacentHTML("beforeend", FORM_WITH_TOKEN);

        await crawl("probe", "html");

        const json = downloadJson.mock.calls[0][1];
        expect(json).not.toContain(TOKEN);
        expect(savedFile().html).toContain('value="<actionRequest>"');
      });

      it("JS: a token the code returns is taken out of the file", async () => {
        await openBox();
        document.body.insertAdjacentHTML("beforeend", FORM_WITH_TOKEN);

        await crawl(
          "document.getElementById('js_ChangeCityActionRequest').value",
          "js",
        );

        expect(downloadJson.mock.calls[0][1]).not.toContain(TOKEN);
        expect(savedFile().result).toBe("<actionRequest>");
      });
    });

    it("Close removes the box and leaves the game's popup alone", async () => {
      await openBox();
      document.body.insertAdjacentHTML("beforeend", GAME_DIALOG);

      await actions["crawl.element.close"](
        box()!.querySelector<HTMLElement>(
          '[data-ika-action="crawl.element.close"]',
        )!,
      );

      expect(box()).toBeNull();
      expect(
        document.querySelector("#ikaMationTransporterDialog"),
      ).not.toBeNull();
    });
  });
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

  it("has a Close button next to Save", async () => {
    const createPopup = vi.fn();
    await startWith({});
    Object.assign(window, { ikariam: { createPopup } });
    try {
      await actions["build.settings"](document.body);
    } finally {
      delete window.ikariam;
    }

    const html = String(createPopup.mock.lastCall?.[2]);
    expect(html).toContain('data-ika-action="build.save"');
    expect(html).toContain('data-ika-action="dialog.close"');
  });

  it(
    "REGRESSION: shows the saved list of a town whose name has an " +
      "ampersand - the board's name was read as HTML, `A &amp; B`, so the " +
      "dialog looked up a town that was never saved",
    async () => {
      const createPopup = vi.fn();
      await startWith({});
      document.getElementById("js_cityBread")!.textContent = "A & B";
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
          `<li selectvalue="297034" class="ownCity"><a title="A &amp; B"> A &amp; B</a></li>` +
          `</ul></div></div>`,
      );
      const { addBuildingToQueue } = await import("./features/auto-build");
      addBuildingToQueue("5", "Academy 4", "A & B");

      Object.assign(window, { ikariam: { createPopup } });
      try {
        await actions["build.settings"](document.body);
      } finally {
        delete window.ikariam;
      }

      const html = String(createPopup.mock.lastCall?.[2]);
      expect(html).toContain('data-ika-town-cell="A &amp; B"');
      expect(html).not.toContain("&amp;amp;");
      expect(html).toContain("1.Academy 5");
    },
  );

  describe("one town at a time", () => {
    const DROPDOWN =
      `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
      `<li selectvalue="297034" class="ownCity"><a title="W-Athens"> W-Athens</a></li>` +
      `<li selectvalue="297035" class="ownCity"><a title="M-Corinth"> M-Corinth</a></li>` +
      `</ul></div></div>`;

    /**
     * The open town, W-Athens, has two warehouses of the same level on
     * screen; only the one in slot 5 has an upgrade saved.
     */
    const CITY_VIEW =
      `<div id="position5" class="building">` +
      `<a class="hoverable" id="js_CityPosition5Link" title="Warehouse (25)"></a></div>` +
      `<div id="position6" class="building">` +
      `<a class="hoverable" id="js_CityPosition6Link" title="Warehouse (25)"></a></div>`;

    const TOWN_SELECT = "#autoBuildTown";

    function savedQueues(): Record<string, string[]> {
      const list = JSON.parse(localStorage.getItem("listAutoBuild") ?? "[]");
      const towns: { townName: string; queue: { buildingName: string }[] }[] =
        list[0]?.townList ?? [];
      return Object.fromEntries(
        towns.map((town) => [
          town.townName,
          town.queue.map((entry) => entry.buildingName),
        ]),
      );
    }

    /** Open the dialog as the game's popup would draw it. */
    /** A slot as `fetchTownSlots` reports it. */
    function slotState(slot: number, name: string, level: number) {
      return {
        positionId: `js_CityPosition${slot}Link`,
        name,
        level,
        upgrading: false,
      };
    }

    /** Saved upgrades by town: `[slot, label]` pairs. */
    type SavedQueues = Record<string, [number, string][]>;

    const DEFAULT_QUEUES: SavedQueues = {
      "W-Athens": [[5, "Warehouse 26"]],
      "M-Corinth": [[9, "Academy 8"]],
    };

    async function openDialog(queues = DEFAULT_QUEUES): Promise<void> {
      await startWith({});
      localStorage.setItem(
        "listAutoBuild",
        JSON.stringify([
          {
            accountName: "tester",
            townList: Object.entries(queues).map(([townName, queue]) => ({
              townName,
              queue: queue.map(([slot, buildingName]) => ({
                positionId: `js_CityPosition${slot}Link`,
                buildingName,
              })),
            })),
          },
        ]),
      );
      document.body.insertAdjacentHTML("beforeend", DROPDOWN + CITY_VIEW);
      const createPopup = (id: string, _title: string, html: string) =>
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="${id}">${html}</div>`,
        );
      Object.assign(window, { ikariam: { createPopup } });
      try {
        await actions["build.settings"](document.body);
      } finally {
        delete window.ikariam;
      }
    }

    function pickTown(townNumber: string): void {
      const select = document.querySelector<HTMLSelectElement>(TOWN_SELECT)!;
      select.value = townNumber;
      select.dispatchEvent(new Event("change"));
    }

    function buildingListText(): string {
      return document.querySelector("#tdListBuilding")!.textContent ?? "";
    }

    function queueCells(): HTMLElement[] {
      return Array.from(
        document.querySelectorAll<HTMLElement>("[data-ika-town-cell]"),
      );
    }

    beforeEach(() => {
      fetchTownSlots.mockReset();
    });

    it("offers every town in a dropdown, with the open town picked", async () => {
      await openDialog();

      const select = document.querySelector<HTMLSelectElement>(TOWN_SELECT)!;
      expect(
        Array.from(select.options)
          .map((option) => option.textContent)
          .sort(),
      ).toEqual(["M-Corinth", "W-Athens"]);
      expect(select.selectedOptions[0].textContent).toBe("W-Athens");
      expect(buildingListText()).toContain("Warehouse 25");
    });

    it("shows the saved queue of the picked town only", async () => {
      await openDialog();

      expect(queueCells().map((cell) => cell.dataset.ikaTownCell)).toEqual([
        "W-Athens",
      ]);
      expect(queueCells()[0].textContent).toContain("1.Warehouse 26");
      expect(queueCells()[0].textContent).not.toContain("Academy 8");
    });

    describe("Clear All", () => {
      function clearAllButton(): HTMLElement {
        return document.querySelector<HTMLElement>(
          '[data-ika-action="build.clearTown"]',
        )!;
      }

      it("empties the open town's saved list only", async () => {
        await openDialog();
        expect(clearAllButton().textContent).toBe("Clear All");

        await actions["build.clearTown"](clearAllButton());

        expect(savedQueues()).toEqual({
          "W-Athens": [],
          "M-Corinth": ["Academy 8"],
        });
        expect(queueCells()[0].textContent).toBe("-empty-");
        // The planned level beside the building goes with it.
        expect(
          document.querySelector('#tdListBuilding span[style="color:red"]'),
        ).toBeNull();
      });

      it("empties the town picked in the dropdown, not the town on screen", async () => {
        fetchTownSlots.mockResolvedValue([slotState(9, "Academy", 7)]);
        await openDialog();
        pickTown("1");
        await vi.advanceTimersByTimeAsync(0);

        await actions["build.clearTown"](clearAllButton());

        expect(savedQueues()).toEqual({
          "W-Athens": ["Warehouse 26"],
          "M-Corinth": [],
        });
        expect(queueCells().map((cell) => cell.dataset.ikaTownCell)).toEqual([
          "M-Corinth",
        ]);
        expect(queueCells()[0].textContent).toBe("-empty-");
      });

      it(
        "empties the dropdown's town even when the table still shows " +
          "another",
        async () => {
          await openDialog();
          // The dropdown moved without its change being handled: the table
          // still shows W-Athens.
          document.querySelector<HTMLSelectElement>(TOWN_SELECT)!.value = "1";
          expect(queueCells().map((cell) => cell.dataset.ikaTownCell)).toEqual([
            "W-Athens",
          ]);

          await actions["build.clearTown"](clearAllButton());

          expect(savedQueues()).toEqual({
            "W-Athens": ["Warehouse 26"],
            "M-Corinth": [],
          });
        },
      );

      it("does nothing with the dialog closed", async () => {
        await openDialog();
        document.querySelector("#ikaMationTransporterDialog")!.remove();

        await actions["build.clearTown"](document.body);

        expect(savedQueues()).toEqual({
          "W-Athens": ["Warehouse 26"],
          "M-Corinth": ["Academy 8"],
        });
      });
    });

    it(
      "picking another town shows its buildings, read from the game, " +
        "and its saved queue",
      async () => {
        fetchTownSlots.mockResolvedValue([slotState(9, "Academy", 7)]);
        await openDialog();

        pickTown("1");
        await vi.advanceTimersByTimeAsync(0);

        expect(fetchTownSlots).toHaveBeenCalledWith("297035");
        expect(buildingListText()).toContain("Academy 7");
        expect(buildingListText()).not.toContain("Warehouse 25");
        expect(queueCells().map((cell) => cell.dataset.ikaTownCell)).toEqual([
          "M-Corinth",
        ]);
        expect(queueCells()[0].textContent).toContain("1.Academy 8");
      },
    );

    it(
      "+ on another town's building saves it to that town, not to the " +
        "town on screen",
      async () => {
        fetchTownSlots.mockResolvedValue([slotState(9, "Academy", 7)]);
        await openDialog();
        pickTown("1");
        await vi.advanceTimersByTimeAsync(0);

        const plus = document.querySelector<HTMLElement>(
          '#tdListBuilding [data-ika-action="build.add"]',
        )!;
        await actions["build.add"](plus);

        expect(savedQueues()).toEqual({
          "W-Athens": ["Warehouse 26"],
          "M-Corinth": ["Academy 8", "Academy 9"],
        });
        expect(queueCells()[0].textContent).toContain("2.Academy 9");
      },
    );

    it("does not show an answer for a town that is no longer picked", async () => {
      let answer: (slots: unknown[]) => void = () => {};
      fetchTownSlots.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      await openDialog();

      pickTown("1");
      pickTown("0");
      answer([slotState(9, "Academy", 7)]);
      await vi.advanceTimersByTimeAsync(0);

      expect(buildingListText()).toContain("Warehouse 25");
      expect(buildingListText()).not.toContain("Academy 7");
      expect(queueCells()[0].dataset.ikaTownCell).toBe("W-Athens");
    });

    it("says so when the town's buildings could not be read", async () => {
      fetchTownSlots.mockRejectedValue(new Error("HTTP 500"));
      await openDialog();

      pickTown("1");
      await vi.advanceTimersByTimeAsync(0);

      expect(buildingListText()).toContain("HTTP 500");
      expect(queueCells()[0].textContent).toContain("1.Academy 8");
    });

    describe("the level each building will reach", () => {
      interface ListedLine {
        position: string;
        text: string;
        /** The bracketed level, or null when nothing is saved for the slot. */
        planned: string | null;
        plannedColor: string | null;
      }

      function listedLines(): ListedLine[] {
        return Array.from(
          document.querySelectorAll<HTMLElement>("#tdListBuilding > span"),
        ).map((line) => {
          const button = line.querySelector<HTMLElement>(
            '[data-ika-action="build.add"]',
          )!;
          const planned = line.querySelector<HTMLElement>("span");
          return {
            position: button.dataset.ikaPosition!,
            text: Array.from(line.childNodes)
              .filter((node) => node.nodeName !== "BUTTON")
              .map((node) => node.textContent)
              .join("")
              .trim(),
            planned: planned?.textContent ?? null,
            plannedColor: planned?.style.color ?? null,
          };
        });
      }

      function line(position: string): ListedLine {
        return listedLines().find((entry) => entry.position === position)!;
      }

      function plusOn(position: string): HTMLElement {
        return document.querySelector<HTMLElement>(
          `#tdListBuilding [data-ika-action="build.add"][data-ika-position="${position}"]`,
        )!;
      }

      function minusOn(position: string): HTMLButtonElement {
        return document.querySelector<HTMLButtonElement>(
          `#tdListBuilding [data-ika-action="build.decrease"][data-ika-position="${position}"]`,
        )!;
      }

      it("lays out name, planned level, + then - on one row per building", async () => {
        await openDialog({ "W-Athens": [[5, "Warehouse 26"]] });

        const lines = Array.from(
          document.querySelectorAll<HTMLElement>("#tdListBuilding > span"),
        );
        expect(lines.length).toBeGreaterThan(0);
        expect(document.querySelectorAll("#tdListBuilding br")).toHaveLength(0);
        for (const listed of lines) {
          expect(listed.style.display).toBe("flex");
          expect(listed.style.whiteSpace).toBe("nowrap");
          // The dialog's sheet floats a cell's lines; floated lines with no
          // <br/> between them widened the column to thousands of px.
          expect(listed.getAttribute("style")).toContain("float:none");
          const actionsInOrder = Array.from(
            listed.querySelectorAll<HTMLElement>("button"),
          ).map((button) => button.dataset.ikaAction);
          expect(actionsInOrder).toEqual(["build.add", "build.decrease"]);
          // + takes the free space, so + and - sit at the right edge.
          const [plus, minus] = Array.from(
            listed.querySelectorAll<HTMLElement>("button"),
          );
          expect(plus.style.marginLeft).toBe("auto");
          expect(minus.style.marginLeft).toBe("");
        }
        const warehouse = line("js_CityPosition5Link");
        expect(warehouse.planned).toBe("(26)");
      });

      it(
        "- beside + takes off the highest saved level: 26 27, and (26) " +
          "is shown",
        async () => {
          await openDialog({
            "W-Athens": [
              [5, "Warehouse 26"],
              [5, "Warehouse 27"],
            ],
          });

          await actions["build.decrease"](minusOn("js_CityPosition5Link"));

          expect(savedQueues()["W-Athens"]).toEqual(["Warehouse 26"]);
          expect(line("js_CityPosition5Link").text).toBe("Warehouse 25 (26)");
          expect(queueCells()[0].textContent).not.toContain("Warehouse 27");
        },
      );

      it("- on the last saved level takes the brackets away", async () => {
        await openDialog();

        await actions["build.decrease"](minusOn("js_CityPosition5Link"));

        expect(savedQueues()["W-Athens"]).toEqual([]);
        expect(line("js_CityPosition5Link").text).toBe("Warehouse 25");
      });

      it(
        "- is greyed out on a building with nothing saved, and saves " +
          "nothing if pressed anyway",
        async () => {
          await openDialog();

          const minus = minusOn("js_CityPosition6Link");
          expect(minus.disabled).toBe(true);
          expect(minusOn("js_CityPosition5Link").disabled).toBe(false);
          await actions["build.decrease"](minus);

          expect(savedQueues()["W-Athens"]).toEqual(["Warehouse 26"]);
        },
      );

      it("- in a town read from the game saves to that town", async () => {
        fetchTownSlots.mockResolvedValue([slotState(9, "Academy", 7)]);
        await openDialog();
        pickTown("1");
        await vi.advanceTimersByTimeAsync(0);

        await actions["build.decrease"](minusOn("js_CityPosition9Link"));

        expect(savedQueues()).toEqual({
          "W-Athens": ["Warehouse 26"],
          "M-Corinth": [],
        });
        expect(line("js_CityPosition9Link").text).toBe("Academy 7");
      });

      it(
        "shows it in red beside a building with upgrades saved, by slot: " +
          "the other warehouse of the same level gets none",
        async () => {
          await openDialog();

          expect(line("js_CityPosition5Link")).toEqual({
            position: "js_CityPosition5Link",
            text: "Warehouse 25 (26)",
            planned: "(26)",
            plannedColor: "red",
          });
          expect(line("js_CityPosition6Link").text).toBe("Warehouse 25");
          expect(line("js_CityPosition6Link").planned).toBeNull();
        },
      );

      it("shows it for a town read from the game too", async () => {
        fetchTownSlots.mockResolvedValue([
          slotState(9, "Academy", 7),
          slotState(6, "Tavern", 3),
        ]);
        await openDialog();
        pickTown("1");
        await vi.advanceTimersByTimeAsync(0);

        expect(line("js_CityPosition9Link").text).toBe("Academy 7 (8)");
        expect(line("js_CityPosition6Link").planned).toBeNull();
      });

      it(
        "goes up as soon as + is pressed, and + still saves the next " +
          "level, not the bracketed one",
        async () => {
          await openDialog();

          await actions["build.add"](plusOn("js_CityPosition5Link"));
          expect(line("js_CityPosition5Link").text).toBe("Warehouse 25 (27)");
          await actions["build.add"](plusOn("js_CityPosition5Link"));

          expect(line("js_CityPosition5Link").text).toBe("Warehouse 25 (28)");
          expect(savedQueues()["W-Athens"]).toEqual([
            "Warehouse 26",
            "Warehouse 27",
            "Warehouse 28",
          ]);
        },
      );

      it(
        "goes up on + in a town read from the game, without asking the " +
          "game again",
        async () => {
          fetchTownSlots.mockResolvedValue([slotState(9, "Academy", 7)]);
          await openDialog();
          pickTown("1");
          await vi.advanceTimersByTimeAsync(0);

          await actions["build.add"](plusOn("js_CityPosition9Link"));
          await vi.advanceTimersByTimeAsync(0);

          expect(line("js_CityPosition9Link").text).toBe("Academy 7 (9)");
          expect(fetchTownSlots).toHaveBeenCalledTimes(1);
        },
      );

      it("goes away when the slot's last saved upgrade is removed", async () => {
        await openDialog();

        const minus = document.querySelector<HTMLElement>(
          '[data-ika-town-cell] [data-ika-action="build.remove"]',
        )!;
        await actions["build.remove"](minus);

        expect(line("js_CityPosition5Link").text).toBe("Warehouse 25");
        expect(line("js_CityPosition5Link").planned).toBeNull();
      });

      it(
        "- on a level also removes the later levels of that building: " +
          "26 27 28, remove 27, and 26 is left",
        async () => {
          await openDialog({
            "W-Athens": [
              [5, "Warehouse 26"],
              [5, "Warehouse 27"],
              [6, "Warehouse 26"],
              [5, "Warehouse 28"],
            ],
          });

          const minus = Array.from(
            document.querySelectorAll<HTMLElement>(
              '[data-ika-town-cell] [data-ika-action="build.remove"]',
            ),
          ).find(
            (button) =>
              button.dataset.ikaBuilding === "Warehouse 27" &&
              button.dataset.ikaPosition === "js_CityPosition5Link",
          )!;
          await actions["build.remove"](minus);

          expect(savedQueues()["W-Athens"]).toEqual([
            "Warehouse 26",
            "Warehouse 26",
          ]);
          expect(line("js_CityPosition5Link").text).toBe("Warehouse 25 (26)");
          expect(queueCells()[0].textContent).not.toContain("Warehouse 28");
        },
      );
    });

    describe("saved levels already reached", () => {
      it(
        "are removed when the town on screen is shown: the warehouse is " +
          "at 25, so the saved 24 and 25 go and 26 stays",
        async () => {
          await openDialog({
            "W-Athens": [
              [5, "Warehouse 24"],
              [5, "Warehouse 25"],
              [5, "Warehouse 26"],
            ],
          });

          expect(savedQueues()["W-Athens"]).toEqual(["Warehouse 26"]);
          expect(queueCells()[0].textContent).toContain("1.Warehouse 26");
          expect(queueCells()[0].textContent).not.toContain("Warehouse 24");
        },
      );

      it("are removed when a town read from the game is shown", async () => {
        fetchTownSlots.mockResolvedValue([slotState(9, "Academy", 8)]);
        await openDialog({
          "W-Athens": [[5, "Warehouse 26"]],
          "M-Corinth": [
            [9, "Academy 8"],
            [9, "Academy 9"],
          ],
        });

        pickTown("1");
        await vi.advanceTimersByTimeAsync(0);

        expect(savedQueues()["M-Corinth"]).toEqual(["Academy 9"]);
        expect(queueCells()[0].textContent).toContain("1.Academy 9");
        expect(buildingListText()).toContain("Academy 8 (9)");
      });

      it("are kept when the town's buildings could not be read", async () => {
        fetchTownSlots.mockRejectedValue(new Error("HTTP 500"));
        await openDialog();

        pickTown("1");
        await vi.advanceTimersByTimeAsync(0);

        expect(savedQueues()["M-Corinth"]).toEqual(["Academy 8"]);
      });
    });
  });
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

  it("Build's Start lifts Pirate's captcha hold", async () => {
    localStorage.setItem(
      "testerikaPirateRun",
      JSON.stringify({
        running: false,
        nextAt: 0,
        failingSince: null,
        captchaPending: true,
      }),
    );
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
    const pirate = await import("./features/pirate");
    expect(pirate.isPirateCaptchaPending()).toBe(true);

    await actions["build.startNow"](document.body);

    expect(pirate.isPirateCaptchaPending()).toBe(false);
  });

  it(
    "REGRESSION: Build's Start carries its lap across a page load - every " +
      "town switch reloads the page, and the run was held in memory only, " +
      "so the lap ended at its first switch with its upgrades left queued",
    async () => {
      saveAutoBuild([
        {
          accountName: "tester",
          townList: ["Nowhere-1", "Nowhere-2"].map((townName) => ({
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
      installCityLink();
      await startWith({});
      await actions["build.startNow"](document.body);
      expect(timers()).toBe(RUNNING);

      // A town switch: the page loads again, Build's timer still off.
      await startWith({});

      expect(timers()).toBe(RUNNING);
      // The lap still drains and ends the run.
      await vi.advanceTimersByTimeAsync(5_000);
      const state = await appState();
      expect(state.getState().queue.listOfType("upgradeBuilding")).toEqual([]);
      expect(timers()).toBe(IDLE);
      expect(sessionStorage.getItem("ika_oneOffRunTypes")).toBeNull();
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

  it(
    "REGRESSION: shows a stored figure as text, never as markup - the " +
      "account table comes from storage, which an imported file fills",
    async () => {
      localStorage.setItem(
        "listAccount",
        JSON.stringify([
          { account: "tester", buildTimeBuffPercent: '<img id="planted">' },
        ]),
      );
      await startWith({});

      expect(document.getElementById("planted")).toBeNull();
      expect(shown()).toBe('<img id="planted">');
    },
  );

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

describe("Bug Report", () => {
  beforeEach(() => {
    downloadJson.mockClear();
    showToast.mockClear();
    (window as unknown as { ikariam?: unknown }).ikariam = {
      createPopup: function createPopup(id: string, title: string) {
        return `${id}:${title}`;
      },
    };
  });

  /** Press it, and read back the file it saved. */
  async function pressBugReport(): Promise<Record<string, any>> {
    await actions["bug.report"](document.body);
    expect(downloadJson).toHaveBeenCalledTimes(1);
    return JSON.parse(downloadJson.mock.calls[0][1]);
  }

  it("saves the report as a JSON file named for the account and the time", async () => {
    await startWith({});
    await pressBugReport();

    const filename = downloadJson.mock.calls[0][0];
    expect(filename).toMatch(
      /^ikariam-bug-report-tester-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/,
    );
    expect(showToast.mock.lastCall![0]).toContain(
      `Saved the bug report as ${filename}`,
    );
  });

  it(
    "carries the newest log lines, newest first — the order of events " +
      "across reloads that a bug record cannot show",
    async () => {
      await startWith({});
      const lines = Array.from({ length: 250 }, (_, i) => `line ${250 - i}`);
      localStorage.setItem("loggerInfo", lines.join("\n") + "\n");

      const report = await pressBugReport();

      expect(report.log).toHaveLength(200);
      expect(report.log[0]).toBe("line 250");
      expect(report.log[199]).toBe("line 51");
    },
  );

  it(
    "REGRESSION: carries a log line as it was written, not HTML-escaped " +
      "by a round trip through the log box's markup",
    async () => {
      await startWith({});
      // This file silences `logInfo`; the real one writes the log box and
      // the stored copy that Bug Report reads.
      const { logInfo } =
        await vi.importActual<typeof import("@core/logger")>("@core/logger");
      logInfo('Going to town "A & B" <1>');
      logInfo("next line");

      const report = await pressBugReport();

      expect(report.log[1]).toContain('Going to town "A & B" <1>');
    },
  );

  it(
    "clears the recorded bugs once they are in the file, so the next " +
      "report holds only new ones",
    async () => {
      await startWith({});
      const { getBugs, reportBug } = await import("@core/bug-report");
      reportBug("manual", new Error("Town switch did not land"));

      const first = await pressBugReport();
      expect(first.bugs.map((bug: { message: string }) => bug.message)).toEqual(
        ["Town switch did not land"],
      );
      expect(getBugs()).toEqual([]);
      expect(showToast.mock.lastCall![0]).toContain("then cleared them");

      downloadJson.mockClear();
      const second = await pressBugReport();
      expect(second.bugs).toEqual([]);
    },
  );

  /**
   * The game's shipment screen: a form around the wine field, and one
   * control that is not showing. happy-dom has no layout, so which one is
   * hidden is stated with `offsetParent`.
   */
  function showShipmentForm(): void {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<form id="transportForm"><input id="textfield_wine" name="cargo_tradegood1" value="0">` +
        `<input id="submit" type="submit" value="Transport!"></form>` +
        `<input id="hiddenControl" name="notShown">`,
    );
    Object.defineProperty(
      document.getElementById("hiddenControl")!,
      "offsetParent",
      { value: null },
    );
  }

  it(
    "saves even with no bug recorded, with the game's createPopup source, " +
      "and says the shipment form was not on screen",
    async () => {
      await startWith({});
      const report = await pressBugReport();

      expect(report.bugs).toEqual([]);
      expect(report.gameData.createPopupSource).toContain(
        "function createPopup",
      );
      expect(report.gameData.shipmentForm.present).toBe(false);

      const toast = showToast.mock.lastCall![0] as string;
      expect(toast).toContain("no bugs recorded");
      expect(toast).toContain("createPopup) included");
      expect(toast).toContain("Shipment form not on screen");
    },
  );

  it("captures the shipment form and its visible controls when it is on screen", async () => {
    await startWith({});
    showShipmentForm();
    const report = await pressBugReport();

    const form = report.gameData.shipmentForm;
    expect(form.present).toBe(true);
    expect(form.wineFieldForm).toContain('id="transportForm"');
    expect(form.wineFieldForm).toContain("cargo_tradegood1");
    // Only the game's controls: the hidden one is left out, and so is every
    // button of this script's own window (Bug Report among them), which used
    // to be most of the list.
    const ids = form.visibleControls.map((c: { id: string }) => c.id);
    expect(ids).toEqual(["transportForm", "textfield_wine", "submit"]);
    expect(showToast.mock.lastCall![0]).toContain("Shipment form captured.");
  });

  it(
    "carries the board's quick upgrades with what the game answered, and " +
      "says how many",
    async () => {
      await startWith({});
      const trace = {
        at: "2026-10-04T10:00:00.000Z",
        cityId: "297034",
        buildingView: "academy",
        position: "5",
        viewResponse: '[["changeView",["academy","..."]]]',
        upgradeButton: '<a id="js_buildingUpgradeButton" href="?x">Up</a>',
        upgradeLink: "?x",
        upgradeResponse: '[["provideFeedback",[{"type":10}]]]',
        outcome: { started: true, reason: null },
        error: null,
      };
      localStorage.setItem("ikaQuickUpgradeTrace", JSON.stringify([trace]));

      const report = await pressBugReport();

      expect(report.gameData.quickUpgrades).toEqual([trace]);
      expect(showToast.mock.lastCall![0]).toContain(
        "Quick upgrades from the board: 1 included.",
      );
    },
  );

  it(
    "carries the town switches that did not land and the tool's own " +
      "requests before them",
    async () => {
      await startWith({});
      const switchTrace = {
        at: "2026-11-02T08:03:10.000Z",
        kind: "answered without a reload",
        target: "city id 297034",
        pageTown: "C-Thebes",
        answer: "city id 297034 -> [provideFeedback] (no custom)",
        tokens: "sent #a, page #a, tool #b",
        toolRequests: [],
      };
      const requestTrace = "15:03:08 view=townHall&cityId=297038 #a>#b";
      localStorage.setItem("ikaTownSwitchTrace", JSON.stringify([switchTrace]));
      localStorage.setItem(
        "ikaToolRequestTrace",
        JSON.stringify([requestTrace]),
      );

      const report = await pressBugReport();

      expect(report.gameData.townSwitches).toEqual([switchTrace]);
      expect(report.gameData.toolRequests).toEqual([requestTrace]);
    },
  );

  it("says nothing of quick upgrades when there were none", async () => {
    await startWith({});
    const report = await pressBugReport();
    expect(report.gameData.quickUpgrades).toEqual([]);
    expect(showToast.mock.lastCall![0]).not.toContain("Quick upgrades");
  });

  it("says so when the game's createPopup cannot be read", async () => {
    await startWith({});
    delete (window as unknown as { ikariam?: unknown }).ikariam;
    const report = await pressBugReport();

    expect(report.gameData.createPopupSource).toBeNull();
    expect(showToast.mock.lastCall![0]).toContain("not readable");
  });

  it("gives the same full report from the console's ikaBugReport()", async () => {
    await startWith({});
    const fromConsole = JSON.parse(
      (window as unknown as { ikaBugReport: () => string }).ikaBugReport(),
    );
    expect(fromConsole.gameData.createPopupSource).toContain(
      "function createPopup",
    );
  });
});

describe("hotkeys", () => {
  it(
    "leaves Space to Empire Overview — both scripts toggled their window on " +
      "it, so one press opened or closed both",
    async () => {
      await startWith({});
      const win = document.querySelector<HTMLElement>(
        "#ikaSendResourcesWindow",
      )!;
      const before = win.hidden;

      document.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
      );

      expect(win.hidden).toBe(before);
    },
  );
});

describe("the game's notepad", () => {
  it("is synced once on page load", async () => {
    await startWith({ transport: true });
    expect(queueNote.startQueueNoteSync).toHaveBeenCalledTimes(1);
  });

  it("holds the runner back until it allows running - nothing runs, not even the drain", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-26T10:01:00Z") });
    let reloads = 0;
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
    queueNote.allowsRunning = false;

    await startWith({ build: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reloads).toBe(0);

    queueNote.allowsRunning = true;
    await vi.advanceTimersByTimeAsync(1_100);
    expect(reloads).toBe(1);
  });

  it("hears of every write to the queue and to the build list", async () => {
    await startWith({});
    const state = await appState();
    queueNote.queueChanged.mockClear();

    state.getState().queue.push({
      type: "sendResource",
      data: { origin: "0", destination: "1", resource: "wood", amount: 500 },
    });
    expect(queueNote.queueChanged).toHaveBeenCalledTimes(1);

    state.saveAutoBuild([]);
    expect(queueNote.queueChanged).toHaveBeenCalledTimes(2);
  });

  it("is synced after a Scan that ran, and not after one that refused", async () => {
    await startWith({});

    scanBuildings.mockResolvedValueOnce(false);
    actions["build.scan"](document.body);
    await vi.advanceTimersByTimeAsync(0);
    expect(queueNote.syncQueueNoteFromScan).not.toHaveBeenCalled();

    scanBuildings.mockResolvedValueOnce(true);
    actions["build.scan"](document.body);
    await vi.advanceTimersByTimeAsync(0);
    expect(queueNote.syncQueueNoteFromScan).toHaveBeenCalledTimes(1);
  });
});

describe("Pirate", () => {
  const DROPDOWN =
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    `<li selectvalue="297057"><a title="Saigon-A"> Saigon-A</a></li>` +
    `<li selectvalue="297058"><a title="Saigon-B"> Saigon-B</a></li>` +
    `</ul></div></div>`;

  /** The fortress view of a level-3 fortress, as `readFortressView` gives it. */
  const LEVEL_3_FORTRESS = {
    fortressLevel: 3,
    levels: [
      {
        buildingLevel: 1,
        durationSeconds: 150,
        name: "Smugglers",
        gold: 40,
        capturePoints: 115,
      },
      {
        buildingLevel: 3,
        durationSeconds: 450,
        name: "Fishing Boat",
        gold: 96,
        capturePoints: 276,
      },
      {
        buildingLevel: 5,
        durationSeconds: 900,
        name: "Wine Transport",
        gold: 173,
        capturePoints: 442,
      },
    ],
    ongoingMission: null,
    capturePoints: 345,
  };

  /** Start the app with Saigon-A known to the board as the fortress town. */
  async function startWithFortress(): Promise<void> {
    localStorage.setItem(
      "***tester***cities",
      JSON.stringify({
        "297057": {
          _buildings: [{ _name: "pirateFortress", _position: 17, _level: 3 }],
        },
      }),
    );
    await startWith({});
    document.body.insertAdjacentHTML("beforeend", DROPDOWN);
  }

  function drawPopups(): void {
    const createPopup = (id: string, _title: string, html: string) =>
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="${id}">${html}</div>`,
      );
    Object.assign(window, { ikariam: { createPopup } });
  }

  beforeEach(() => {
    fetchFortressView.mockReset();
    downloadJson.mockClear();
    showToast.mockReset();
  });

  afterEach(async () => {
    (await import("./features/pirate")).stopPirate();
    delete window.ikariam;
    vi.unstubAllGlobals();
  });

  it(
    "Start Pirate ticks its notice, starts and reads Stop Pirate; pressed " +
      "again, it stops",
    async () => {
      await startWithFortress();
      vi.stubGlobal("Notification", {
        permission: "default",
        requestPermission: async () => "granted",
      });
      const pirate = await import("./features/pirate");
      const { isNotificationEnabled } = await import("@core/notifications");
      const button = () => document.querySelector("#btnStartPirate")!;
      const noticeBox = () =>
        document.querySelector<HTMLInputElement>(
          '[data-ika-notification="pirateCaptureFailed"]',
        )!;
      expect(button().textContent).toBe("Start Pirate");
      expect(noticeBox().checked).toBe(false);

      await actions["pirate.toggle"](document.body);

      expect(isNotificationEnabled("pirateCaptureFailed")).toBe(true);
      expect(noticeBox().checked).toBe(true);
      expect(pirate.isPirateRunning()).toBe(true);
      expect(button().textContent).toBe("Stop Pirate");
      const toasts = showToast.mock.calls;
      expect(String(toasts[toasts.length - 1][0])).toContain(
        "level 1 captures from Saigon-A",
      );

      await actions["pirate.toggle"](document.body);

      expect(pirate.isPirateRunning()).toBe(false);
      expect(button().textContent).toBe("Start Pirate");
    },
  );

  it("redraws the capture points line when Pirate reads them", async () => {
    await startWithFortress();
    const line = () =>
      document.querySelector("#ikaPirateCapturePoints")!.textContent;
    expect(line()).toBe("Capture Points: —");

    const pirate = await import("./features/pirate");
    const { getState } = await appState();
    getState().account.setJSON("ikaPirateCapturePoints", {
      points: 1035,
      at: Date.now(),
    });
    // Any change Pirate reports goes to the same listener.
    pirate.stopPirate();

    expect(line()).toContain("Capture Points: 1,035");
  });

  it("starts even when notices are refused, and says why", async () => {
    await startWithFortress();
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission: async () => "denied",
    });
    const pirate = await import("./features/pirate");

    await actions["pirate.toggle"](document.body);

    expect(pirate.isPirateRunning()).toBe(true);
    expect(
      showToast.mock.calls.some(([text]) =>
        String(text).includes("notifications"),
      ),
    ).toBe(true);
  });

  it("does not start, and says so, with no town known to have a fortress", async () => {
    await startWith({});
    const pirate = await import("./features/pirate");

    await actions["pirate.toggle"](document.body);

    expect(pirate.isPirateRunning()).toBe(false);
    expect(String(showToast.mock.calls[0][0])).toContain(
      "No town with a Pirate Fortress",
    );
  });

  it(
    "Settings offers the towns and the levels the fortress allows, and Save " +
      "keeps the choice",
    async () => {
      await startWithFortress();
      fetchFortressView.mockResolvedValue(LEVEL_3_FORTRESS);
      drawPopups();

      await actions["pirate.settings"](document.body);
      const levels = () =>
        [
          ...document.querySelectorAll<HTMLOptionElement>(
            "#ikaPirateLevel option",
          ),
        ].map((option) => option.value);
      await vi.waitFor(() => expect(levels()).toEqual(["1", "3"]));

      expect(fetchFortressView).toHaveBeenCalledWith("297057", 17);
      const town = document.querySelector<HTMLSelectElement>("#ikaPirateTown")!;
      expect(town.value).toBe("297057");
      expect(town.selectedOptions[0].textContent).toContain(
        "(Pirate Fortress)",
      );
      // A fixed width, so the long help text wraps instead of stretching
      // the popup across the screen; no fixed height any more.
      const body = document.querySelector<HTMLElement>("#ikaPirateDialogBody")!;
      expect(body.style.width).toBe("400px");
      const help = body.querySelector<HTMLElement>("#ikaPirateHelp")!;
      expect(help.textContent).toContain("Start Pirate sends the crew");
      expect(help.style.height).toBe("");
      expect(
        document.querySelector("#ikaPirateLevel option")?.textContent,
      ).toBe("1 — Smugglers (2m 30s)");

      document.querySelector<HTMLSelectElement>("#ikaPirateLevel")!.value = "3";
      await actions["pirate.save"](document.body);

      const pirate = await import("./features/pirate");
      expect(pirate.loadPirateSettings()).toEqual({
        cityId: "297057",
        position: 17,
        level: 3,
      });
      expect(document.querySelector("#ikaPirateTown")).toBeNull();
    },
  );

  it("Settings says so for a town without a fortress, and Save keeps nothing", async () => {
    await startWithFortress();
    fetchFortressView.mockResolvedValue(null);
    drawPopups();

    await actions["pirate.settings"](document.body);
    await vi.waitFor(() =>
      expect(document.querySelector("#ikaPirateLevelNote")?.textContent).toBe(
        "No Pirate Fortress in this town.",
      ),
    );
    await actions["pirate.save"](document.body);

    const pirate = await import("./features/pirate");
    expect(pirate.loadPirateSettings()).toBeNull();
  });

  it("holds the task runner back while a capture is out - nothing runs, not even the drain", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-26T10:01:00Z") });
    let reloads = 0;
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
    pirateCapture.inFlight = true;
    try {
      await startWith({ build: true });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(reloads).toBe(0);

      pirateCapture.inFlight = false;
      await vi.advanceTimersByTimeAsync(1_100);
      expect(reloads).toBe(1);
    } finally {
      pirateCapture.inFlight = false;
    }
  });

  it("holds the task runner back while another tab's capture is out, until its mark is cleared", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-26T10:01:00Z") });
    let reloads = 0;
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
    // Written by the tab that sends the captures.
    localStorage.setItem("testerikaPirateCaptureOut", String(Date.now()));

    await startWith({ build: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reloads).toBe(0);

    localStorage.removeItem("testerikaPirateCaptureOut");
    await vi.advanceTimersByTimeAsync(1_100);
    expect(reloads).toBe(1);
  });

  it("a capture mark left by a closed tab stops holding the runner once too old", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-26T10:01:00Z") });
    let reloads = 0;
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
    const { PIRATE_CAPTURE_MARK_MAX_AGE_MS } =
      await import("./features/pirate");
    localStorage.setItem(
      "testerikaPirateCaptureOut",
      String(Date.now() - PIRATE_CAPTURE_MARK_MAX_AGE_MS - 1),
    );

    await startWith({ build: true });
    await vi.advanceTimersByTimeAsync(1_100);
    expect(reloads).toBe(1);
  });

  it("Pirate waits for a task runner on a task in another tab, as the notepad sync does", async () => {
    await startWith({});
    expect(pirateCapture.holdCheck).not.toBeNull();
    expect(pirateCapture.holdCheck!()).toBe(false);

    // Another tab's runner marks the account busy.
    localStorage.setItem(
      "testerikaRunnerBusy",
      JSON.stringify({ since: Date.now() }),
    );
    expect(pirateCapture.holdCheck!()).toBe(true);
  });

  describe("a page the tool has just clicked away from", () => {
    /** The town view link, counting the clicks (each a reload on the game). */
    function cityLink(): { reloads: () => number } {
      let reloads = 0;
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
      return { reloads: () => reloads };
    }

    it(
      "starts nothing on it until the reload - a town switch sent in that " +
        "second was lost to it, four times in the bug report of 23/11",
      async () => {
        // An odd minute: no keep-alive.
        vi.useFakeTimers({ now: new Date("2026-09-26T10:01:00Z") });
        const link = cityLink();
        await startWith({ build: true });
        const navigation = await import("./navigation");

        navigation.backToCity("shipment sent");
        expect(link.reloads()).toBe(1);

        // The queue is empty: once the runner may run, it drains and
        // goes back to the town view itself.
        await vi.advanceTimersByTimeAsync(5_000);
        expect(link.reloads()).toBe(1);

        await vi.advanceTimersByTimeAsync(
          navigation.PAGE_LEAVING_HOLD_MS - 5_000 + 1_100,
        );
        expect(link.reloads()).toBe(2);
      },
    );

    it("holds the keep-alive reload too - it clicked a second time a second after a shipment's", async () => {
      cityLink();
      await startWith({});
      const navigation = await import("./navigation");
      expect(keepAlive.guard).not.toBeNull();
      expect(keepAlive.guard!()).toBe(true);

      navigation.backToCity("shipment sent");

      expect(keepAlive.guard!()).toBe(false);
    });

    it(
      "holds the notepad sync too - a finished task's change armed one that " +
        "would land as the page reloads",
      async () => {
        cityLink();
        queueNote.setChangeSyncHold.mockClear();
        await startWith({});
        const navigation = await import("./navigation");
        const hold = queueNote.setChangeSyncHold.mock
          .calls[0][0] as () => boolean;
        expect(hold()).toBe(false);

        navigation.backToCity("shipment sent");

        expect(hold()).toBe(true);
      },
    );

    it("Pirate waits too: a capture sent then would die with the reload", async () => {
      cityLink();
      await startWith({});
      const navigation = await import("./navigation");
      expect(pirateCapture.holdCheck!()).toBe(false);

      navigation.backToCity("shipment sent");

      expect(pirateCapture.holdCheck!()).toBe(true);
    });
  });

  it(
    "after a captcha, holds the queue and the keep-alive reload until Start " +
      "Pirate",
    async () => {
      // An even minute: the keep-alive would reload at once.
      vi.useFakeTimers({ now: new Date("2026-09-26T10:02:00Z") });
      let reloads = 0;
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
      // The page before stopped Pirate for the security word.
      localStorage.setItem(
        "testerikaPirateRun",
        JSON.stringify({
          running: false,
          nextAt: 0,
          failingSince: null,
          captchaPending: true,
        }),
      );
      localStorage.setItem(
        "***tester***cities",
        JSON.stringify({
          "297057": {
            _buildings: [{ _name: "pirateFortress", _position: 17, _level: 3 }],
          },
        }),
      );

      await startWith({ build: true });
      document.body.insertAdjacentHTML("beforeend", DROPDOWN);
      await vi.advanceTimersByTimeAsync(3 * 60_000);
      expect(reloads).toBe(0);

      vi.stubGlobal("Notification", {
        permission: "granted",
        requestPermission: async () => "granted",
      });
      await actions["pirate.toggle"](document.body);
      await vi.advanceTimersByTimeAsync(1_100);
      expect(reloads).toBeGreaterThan(0);
    },
  );

  describe("starting the queue by hand lifts the captcha hold", () => {
    function holdForCaptcha(): void {
      localStorage.setItem(
        "testerikaPirateRun",
        JSON.stringify({
          running: false,
          nextAt: 0,
          failingSince: null,
          captchaPending: true,
        }),
      );
    }

    it("Transport's Start Timer: the hold goes and the runner runs", async () => {
      vi.useFakeTimers({ now: new Date("2026-09-26T10:01:00Z") });
      let reloads = 0;
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
      holdForCaptcha();
      await startWith({});
      const pirate = await import("./features/pirate");

      await actions["queue.toggle"](document.body);
      await vi.advanceTimersByTimeAsync(1_100);

      expect(pirate.isPirateCaptchaPending()).toBe(false);
      // The empty queue drained, which reloads: the runner was let through.
      expect(reloads).toBeGreaterThan(0);
      expect(String(showToast.mock.calls[0][0])).toContain(
        "starting it lifted the hold",
      );
    });

    it("Build's Start Timer", async () => {
      holdForCaptcha();
      await startWith({});
      const pirate = await import("./features/pirate");

      await actions["build.toggleTimer"](document.body);

      expect(pirate.isPirateCaptchaPending()).toBe(false);
    });

    it("not a Stop: switching a timer off keeps the hold", async () => {
      holdForCaptcha();
      await startWith({ transport: true, build: true });
      const pirate = await import("./features/pirate");

      await actions["queue.toggle"](document.body);
      await actions["build.toggleTimer"](document.body);

      expect(pirate.isPirateCaptchaPending()).toBe(true);
      expect(showToast).not.toHaveBeenCalled();
    });
  });

  it(
    "on the page a captcha's town switch loaded, opens the Pirate Fortress " +
      "for the security word",
    async () => {
      const ajaxHandlerCall = vi.fn();
      sessionStorage.setItem(
        "ika_pirateOpenFortress",
        JSON.stringify({ cityId: "297057", position: 17, at: Date.now() }),
      );
      Object.assign(window, {
        ajaxHandlerCall,
        ikariam: {
          model: { relatedCityData: { selectedCity: "city_297057" } },
        },
      });
      try {
        await startWith({});
      } finally {
        delete (window as { ajaxHandlerCall?: unknown }).ajaxHandlerCall;
        delete window.ikariam;
      }

      expect(ajaxHandlerCall).toHaveBeenCalledWith(
        "?view=pirateFortress&activeTab=tabBootyQuest&cityId=297057&position=17",
      );
      expect(sessionStorage.getItem("ika_pirateOpenFortress")).toBeNull();
    },
  );

  it("Crawl with Pirate picked and no fortress town known saves why", async () => {
    await startWith({});
    drawPopups();
    actions["crawl.open"](document.body);
    (document.querySelector("#ikaCrawl_pirate") as HTMLInputElement).checked =
      true;

    await actions["crawl.run"](document.body);
    await vi.waitFor(() => expect(downloadJson).toHaveBeenCalledTimes(1));

    expect(savedCrawlFailure("pirate").error).toMatchObject({
      stage: "settings",
      name: "CrawlStopped",
      message: expect.stringContaining("No town with a Pirate Fortress"),
    });
    expect(fetchFortressView).not.toHaveBeenCalled();
  });

  it(
    "Crawl with Pirate picked saves the game's error, stack included, " +
      "when the fortress cannot be read",
    async () => {
      await startWithFortress();
      const timeout = new Error("request timed out");
      fetchFortressView.mockRejectedValue(timeout);
      drawPopups();
      actions["crawl.open"](document.body);
      (document.querySelector("#ikaCrawl_pirate") as HTMLInputElement).checked =
        true;

      await actions["crawl.run"](document.body);
      await vi.waitFor(() => expect(downloadJson).toHaveBeenCalledTimes(1));

      const { error } = savedCrawlFailure("pirate");
      expect(error).toMatchObject({
        stage: "fetch",
        name: "CrawlStopped",
        message: "Could not read the Pirate Fortress: request timed out",
        cause: {
          stage: "fetch",
          name: "Error",
          message: "request timed out",
          stack: timeout.stack,
        },
      });
    },
  );

  it("Crawl with Pirate picked saves the fortress view and the failed captures", async () => {
    await startWithFortress();
    fetchFortressView.mockResolvedValue(LEVEL_3_FORTRESS);
    drawPopups();
    actions["crawl.open"](document.body);
    (document.querySelector("#ikaCrawl_pirate") as HTMLInputElement).checked =
      true;

    await actions["crawl.run"](document.body);
    await vi.waitFor(() => expect(downloadJson).toHaveBeenCalledTimes(1));

    const [filename, json] = downloadJson.mock.calls[0];
    expect(filename).toMatch(
      /^ikariam-pirate-tester-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/,
    );
    expect(JSON.parse(json)).toMatchObject({
      account: "tester",
      cityId: "297057",
      town: "Saigon-A",
      position: 17,
      level: 1,
      fortress: { fortressLevel: 3 },
      failedCaptures: [],
    });
  });
});

describe("the notepad sync and the runner", () => {
  it(
    "gives the notepad sync a hold check, which lets a sync through " +
      "while the runner is idle",
    async () => {
      queueNote.setChangeSyncHold.mockClear();
      await startWith({});

      expect(queueNote.setChangeSyncHold).toHaveBeenCalledTimes(1);
      const hold = queueNote.setChangeSyncHold.mock
        .calls[0][0] as () => boolean;
      expect(hold()).toBe(false);
    },
  );

  /** This account's "a runner is on a task" mark, as every tab stores it. */
  const RUNNER_BUSY_STORAGE_KEY = "testerikaRunnerBusy";

  async function startAndTakeHold(): Promise<() => boolean> {
    queueNote.setChangeSyncHold.mockClear();
    await startWith({});
    return queueNote.setChangeSyncHold.mock.calls[0][0] as () => boolean;
  }

  it(
    "holds the sync in a tab with no runner while another tab's runner " +
      "is on a task - a dialog edit there moved the token under the " +
      "building the other tab had open",
    async () => {
      const hold = await startAndTakeHold();

      localStorage.setItem(
        RUNNER_BUSY_STORAGE_KEY,
        JSON.stringify({ since: Date.now() }),
      );

      expect(hold()).toBe(true);
    },
  );

  it(
    "lets the sync through when that mark is too old - the tab was " +
      "closed in the middle of a task",
    async () => {
      const hold = await startAndTakeHold();
      const { RUNNER_BUSY_MAX_AGE_MS } = await appState();

      localStorage.setItem(
        RUNNER_BUSY_STORAGE_KEY,
        JSON.stringify({ since: Date.now() - RUNNER_BUSY_MAX_AGE_MS - 1 }),
      );

      expect(hold()).toBe(false);
    },
  );

  it(
    "the runner marks the account busy while it is on a task, and clears " +
      "the mark when the task is over",
    async () => {
      // A town the dropdown does not have: the task runs and is dropped.
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
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="js_cityLink"><a href="#"></a></div>`,
      );
      document
        .querySelector("#js_cityLink > a")!
        .addEventListener("click", (event) => event.preventDefault());
      await startWith({});
      const writes = vi.spyOn(localStorage, "setItem");
      try {
        await actions["build.startNow"](document.body);
        await vi.advanceTimersByTimeAsync(3_000);

        expect(
          writes.mock.calls.some(([key]) => key === RUNNER_BUSY_STORAGE_KEY),
        ).toBe(true);
        expect(localStorage.getItem(RUNNER_BUSY_STORAGE_KEY)).toBeNull();
      } finally {
        writes.mockRestore();
      }
    },
  );

  it(
    "a page left in the middle of a task clears its own mark, never " +
      "another tab's",
    async () => {
      await startWith({});
      const { markRunnerBusy } = await appState();

      markRunnerBusy(true);
      window.dispatchEvent(new Event("pagehide"));
      expect(localStorage.getItem(RUNNER_BUSY_STORAGE_KEY)).toBeNull();

      localStorage.setItem(
        RUNNER_BUSY_STORAGE_KEY,
        JSON.stringify({ since: Date.now() }),
      );
      window.dispatchEvent(new Event("pagehide"));
      expect(localStorage.getItem(RUNNER_BUSY_STORAGE_KEY)).not.toBeNull();
    },
  );
});
