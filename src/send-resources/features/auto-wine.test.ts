import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTO_WINE_LABEL,
  getState,
  initState,
  loadReceivers,
  recordRouteSeconds,
  saveReceivers,
  saveSenders,
} from "../state";
import {
  loadConsumedWine,
  measuredStats,
  saveMeasuredReceivers,
} from "./auto-wine";
import { saveTownStats } from "../town-cache";
import {
  buildWineTowns,
  enqueueWineRun,
  FALLBACK_WINE_RESERVE,
  getSourceReserve,
  getSourceSupply,
  readWineBoard,
} from "./auto-wine";

/**
 * Empire Overview board markup.
 *
 * Modelled on the template the board itself renders (see the `<td class="resource
 * {0}">` string in `src/empire-overview/render.ts`): each resource occupies TWO
 * adjacent cells — the first holds `span.current` (stock), the second holds
 * `span.production`/`span.consumption`.
 *
 * Confirm against `tools/collect-dom-report.js` output (`resTabWine`) before
 * trusting these fixtures.
 */
function boardRow(town: string, stock: string, consumption: string): string {
  return `<tr>
    <td class="city_name"><span class="clickable">${town}</span></td>
    <td class="resource wine">
      <span class="icon safeImage"></span>
      <span class="current">${stock}</span>
      <span class="incoming"></span>
    </td>
    <td class="resource wine">
      <span class="prodconssubsum production Green">+10</span>
      <span class="prodconssubsum consumption Red">${consumption}</span>
      <span class="emptytime Red"></span>
    </td>
  </tr>`;
}

function renderBoard(rows: string[]): string {
  return `<div id="ResTab"><table><tbody>${rows.join("")}</tbody></table></div>`;
}

function townDropdown(names: string[]): string {
  const items = names.map((n) => `<li><a>${n}</a></li>`).join("");
  return `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>${items}</ul></div></div>`;
}

const TOWNS = ["Athens", "Sparta", "Corinth"];

beforeEach(() => {
  // buildWineTowns/getSourceSupply consult the town cache, which lives in the
  // account store, so state has to exist.
  localStorage.clear();
  initState("tester");
});

describe("readWineBoard", () => {
  beforeEach(() => {
    document.body.innerHTML = renderBoard([
      boardRow("Athens", "32,495", "-525"),
      boardRow("Sparta", "21,657", "-350"),
    ]);
  });

  it("reads stock and consumption keyed by town name", () => {
    const board = readWineBoard();
    expect(board.get("Athens")).toEqual({ stock: 32495, consume: 525 });
    expect(board.get("Sparta")).toEqual({ stock: 21657, consume: 350 });
  });

  it("normalises the negative consumption the board renders", () => {
    expect(readWineBoard().get("Athens")!.consume).toBeGreaterThan(0);
  });

  it(
    "REGRESSION: skips rows the board has no data for — a live capture " +
      "right after installing Empire Overview showed eight of nine towns at " +
      '"0.00" with empty production/consumption spans, and recording those ' +
      "as zero stock would both be wrong and shadow the town cache",
    () => {
      document.body.innerHTML = renderBoard([
        boardRow("Athens", "28,542", "-559"),
        boardRow("Sparta", "0.00", ""),
      ]);
      const board = readWineBoard();
      expect(board.get("Athens")).toEqual({ stock: 28542, consume: 559 });
      expect(board.has("Sparta")).toBe(false);
    },
  );

  it("returns an empty map when the board is not rendered", () => {
    document.body.innerHTML = "";
    expect(readWineBoard().size).toBe(0);
  });
});

describe("buildWineTowns", () => {
  beforeEach(() => {
    document.body.innerHTML =
      townDropdown(TOWNS) + renderBoard([boardRow("Sparta", "21,657", "-350")]);
  });

  it("prefers board figures over the hand-entered rate", () => {
    const [town] = buildWineTowns([{ townNumber: "1", winePerHour: "999" }]);
    expect(town).toMatchObject({
      townName: "Sparta",
      stock: 21657,
      consume: 350,
    });
  });

  it("falls back to the hand-entered rate when the board lacks the town", () => {
    const [town] = buildWineTowns([{ townNumber: "2", winePerHour: "244" }]);
    expect(town).toMatchObject({ townName: "Corinth", stock: 0, consume: 244 });
  });

  it("takes storage capacity from the town cache even when the board has the town", () => {
    saveTownStats(getState().account, {
      Sparta: { stock: 1, consume: 1, capacity: 75_000, at: Date.now() },
    });
    const [town] = buildWineTowns([{ townNumber: "1", winePerHour: "0" }]);
    expect(town).toMatchObject({
      stock: 21657,
      consume: 350,
      capacity: 75_000,
    });
  });

  it("leaves capacity out when it has never been recorded", () => {
    const [town] = buildWineTowns([{ townNumber: "1", winePerHour: "0" }]);
    expect(town).not.toHaveProperty("capacity");
  });

  it(
    "carries the recorded time of the route from the source, so the plan " +
      "counts the wine drunk on the way",
    () => {
      // City ids are what routes are recorded by.
      document.body.innerHTML =
        `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
        TOWNS.map(
          (n, i) => `<li selectvalue="${100 + i}"><a>${n}</a></li>`,
        ).join("") +
        `</ul></div></div>` +
        renderBoard([boardRow("Sparta", "21,657", "-350")]);
      recordRouteSeconds("100", "101", 2 * 3600);

      const [fromAthens, toCorinth] = buildWineTowns(
        [
          { townNumber: "1", winePerHour: "0" },
          { townNumber: "2", winePerHour: "244" },
        ],
        undefined,
        "0",
      );

      expect(fromAthens.transitHours).toBe(2);
      // Never shipped to: no time, and nothing counted.
      expect(toCorinth).not.toHaveProperty("transitHours");
    },
  );
});

describe("getSourceReserve", () => {
  it("keeps one hour of the source town's own consumption", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([boardRow("Athens", "50,000", "-812.4")]);
    expect(getSourceReserve("0")).toBe(813);
  });

  it("uses the town cache when the board lacks the source town", () => {
    document.body.innerHTML = townDropdown(TOWNS);
    saveTownStats(getState().account, {
      Athens: { stock: 9_000, consume: 240, at: Date.now() },
    });
    expect(getSourceReserve("0")).toBe(240);
  });

  it("keeps nothing back for a source town that consumes nothing", () => {
    document.body.innerHTML = townDropdown(TOWNS);
    saveTownStats(getState().account, {
      Athens: { stock: 9_000, consume: 0, at: Date.now() },
    });
    expect(getSourceReserve("0")).toBe(0);
  });

  it("falls back to a fixed reserve when the consumption is unknown", () => {
    document.body.innerHTML = townDropdown(TOWNS);
    expect(getSourceReserve("0")).toBe(FALLBACK_WINE_RESERVE);
  });
});

describe("getSourceSupply", () => {
  it("uses the source town's own stock from the board", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([
        boardRow("Athens", "50,000", "-800"),
        boardRow("Sparta", "1,000", "-350"),
      ]);
    // Athens is index 0, holds 50,000 and keeps one hour of its 800/h.
    expect(getSourceSupply("0")).toBe(50_000 - 800);
  });

  it(
    "REGRESSION: does not fall back to the on-screen town's wine when the " +
      "source town is a different one",
    () => {
      // No board at all, and the town on screen is Corinth while the source is
      // Athens. An earlier version guarded this with a condition that compared a
      // value against itself, so it always passed and planned the entire run
      // against Corinth's 99,999 wine.
      document.body.innerHTML =
        townDropdown(TOWNS) +
        `<div id="js_cityBread">Corinth</div>
         <span id="js_GlobalMenu_wine">99,999</span>`;
      expect(getSourceSupply("0")).toBe(0);
    },
  );

  it("may use the global menu when the source IS the town on screen", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      `<div id="js_cityBread">Athens</div>
       <span id="js_GlobalMenu_wine">10,000</span>`;
    expect(getSourceSupply("0")).toBe(10_000 - FALLBACK_WINE_RESERVE);
  });

  it("never reports a negative supply", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) + renderBoard([boardRow("Athens", "100", "-500")]);
    expect(getSourceSupply("0")).toBe(0);
  });
});

describe("measuredStats", () => {
  beforeEach(() => {
    document.body.innerHTML = townDropdown(TOWNS);
  });

  it("prefers the board", () => {
    document.body.innerHTML += renderBoard([
      boardRow("Athens", "5,000", "-100"),
    ]);
    saveTownStats(getState().account, {
      Athens: { stock: 1, consume: 1, at: Date.now() },
    });
    expect(measuredStats("Athens")).toEqual({ stock: 5000, consume: 100 });
  });

  it(
    "REGRESSION: falls back to the town cache — a freshly installed Empire " +
      "Overview has no figures for a town it has not seen, so the dialog " +
      'showed "—" everywhere and the Load button filled in nothing',
    () => {
      saveTownStats(getState().account, {
        Athens: { stock: 4_000, consume: 200, at: Date.now() },
      });
      expect(measuredStats("Athens")).toMatchObject({
        stock: 4_000,
        consume: 200,
      });
    },
  );

  it("returns null when neither source knows the town", () => {
    expect(measuredStats("Athens")).toBeNull();
  });
});

describe("enqueueWineRun", () => {
  /** The global menu's ship counters, with the whole fleet at sea. */
  const noIdleShips =
    `<span id="js_GlobalMenu_freeTransporters">0</span>` +
    `<span id="js_GlobalMenu_freeFreighters">0</span>`;

  it(
    "REGRESSION: queues the run even with no idle ships — refusing to queue " +
      "threw the whole plan away, and the shipment handler already waits for " +
      "the fleet to come home",
    () => {
      document.body.innerHTML =
        townDropdown(TOWNS) +
        noIdleShips +
        renderBoard([
          boardRow("Athens", "32,495", "-525"),
          boardRow("Sparta", "100", "-300"),
        ]);
      saveReceivers([{ townNumber: "1", winePerHour: "300" }]);

      expect(enqueueWineRun("0")).toBe(1);

      const queued = getState().queue.listOfType("sendResource");
      expect(queued).toHaveLength(1);
      expect(queued[0].data).toMatchObject({
        origin: "0",
        destination: "1",
        resource: "wine",
        label: AUTO_WINE_LABEL,
      });
    },
  );

  it("hands the shipment the source town's one-hour reserve", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([
        boardRow("Athens", "32,495", "-525"),
        boardRow("Sparta", "100", "-300"),
      ]);
    saveReceivers([{ townNumber: "1", winePerHour: "300" }]);

    enqueueWineRun("0");

    const [queued] = getState().queue.listOfType("sendResource");
    // The 31,970 spare (32,495 less the 525 reserve) goes in whole ships of
    // 500 (uncalibrated): 63 of them, 31,500.
    expect(queued.data).toMatchObject({ reserve: 525, amount: 31_500 });
  });

  it(
    "leaves at the source what a receiver's storage cannot take, rather " +
      "than shipping it",
    () => {
      document.body.innerHTML =
        townDropdown(TOWNS) +
        renderBoard([
          boardRow("Athens", "32,495", "-525"),
          boardRow("Sparta", "100", "-300"),
        ]);
      saveReceivers([{ townNumber: "1", winePerHour: "300" }]);
      saveTownStats(getState().account, {
        Sparta: { stock: 100, consume: 300, capacity: 5_100, at: Date.now() },
      });

      enqueueWineRun("0");

      const [queued] = getState().queue.listOfType("sendResource");
      expect(queued.data).toMatchObject({ amount: 5_000 });
    },
  );

  it("still refuses when the source town has nothing to spare", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      noIdleShips +
      renderBoard([
        boardRow("Athens", "100", "-525"),
        boardRow("Sparta", "100", "-300"),
      ]);
    saveReceivers([{ townNumber: "1", winePerHour: "300" }]);

    expect(enqueueWineRun("0")).toBe(0);
    expect(getState().queue.length).toBe(0);
  });
});

describe("saveMeasuredReceivers", () => {
  it(
    "saves what Load then Save would: measured consumption, else the saved " +
      "Wine/h, for every town not ticked as a sender",
    () => {
      document.body.innerHTML =
        townDropdown(TOWNS) +
        renderBoard([
          boardRow("Athens", "50,000", "-600"),
          boardRow("Sparta", "2,000", "-350"),
        ]);
      saveSenders(["0"]);
      saveReceivers([
        { townNumber: "1", winePerHour: "100" },
        { townNumber: "2", winePerHour: "120" },
      ]);

      saveMeasuredReceivers();

      // In `getTownList()` order, which sorts by name: compare as a set.
      expect(loadReceivers()).toHaveLength(2);
      expect(loadReceivers()).toEqual(
        expect.arrayContaining([
          // Measured on the board: replaces the 100 saved before.
          { townNumber: "1", winePerHour: "350" },
          // Nothing measured: the saved figure stays.
          { townNumber: "2", winePerHour: "120" },
        ]),
      );
    },
  );

  it("leaves out a town with no figure above 0", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) + renderBoard([boardRow("Sparta", "2,000", "-0")]);
    saveSenders(["0"]);

    saveMeasuredReceivers();

    expect(loadReceivers()).toEqual([]);
  });
});

describe("loadConsumedWine", () => {
  it("fills the form from the cache when the board is empty", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      TOWNS.map(
        (_, i) => `<input type="text" id="txtWine_${i}" value="0"/>`,
      ).join("");
    saveTownStats(getState().account, {
      Sparta: { stock: 3_000, consume: 275, at: Date.now() },
    });

    loadConsumedWine();

    expect(
      (document.querySelector("#txtWine_1") as HTMLInputElement).value,
    ).toBe("275");
    // Untouched: nothing knows anything about Athens.
    expect(
      (document.querySelector("#txtWine_0") as HTMLInputElement).value,
    ).toBe("0");
  });
});
