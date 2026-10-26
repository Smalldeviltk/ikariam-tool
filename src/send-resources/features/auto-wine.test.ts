import { beforeEach, describe, expect, it, vi } from "vitest";
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
  chooseWineSource,
  loadConsumedWine,
  measuredStats,
  pickWineSource,
  saveMeasuredReceivers,
} from "./auto-wine";
import { loadSenders } from "../state";
import { saveTownStats } from "../town-cache";
import {
  buildWineCsv,
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
function boardRow(
  town: string,
  stock: string,
  consumption: string,
  // Blank, as the board draws it for a town whose island makes another good;
  // a wine town reads like "+605".
  production = "",
): string {
  return `<tr>
    <td class="city_name"><span class="clickable">${town}</span></td>
    <td class="resource wine">
      <span class="icon safeImage"></span>
      <span class="current">${stock}</span>
      <span class="incoming"></span>
    </td>
    <td class="resource wine">
      <span class="prodconssubsum production Green">${production}</span>
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

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@core/ui/window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/ui/window")>()),
  showToast,
}));

const TOWNS = ["Athens", "Sparta", "Corinth"];

beforeEach(() => {
  // buildWineTowns/getSourceSupply consult the town cache, which lives in the
  // account store, so state has to exist.
  localStorage.clear();
  initState("tester");
  showToast.mockReset();
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
    expect(board.get("Athens")).toEqual({
      stock: 32495,
      consume: 525,
      production: 0,
    });
    expect(board.get("Sparta")).toEqual({
      stock: 21657,
      consume: 350,
      production: 0,
    });
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
      expect(board.get("Athens")).toEqual({
        stock: 28542,
        consume: 559,
        production: 0,
      });
      expect(board.has("Sparta")).toBe(false);
    },
  );

  it("returns an empty map when the board is not rendered", () => {
    document.body.innerHTML = "";
    expect(readWineBoard().size).toBe(0);
  });

  it(
    "reads what a wine island makes, as the board writes it, and a blank " +
      "production cell as 0",
    () => {
      document.body.innerHTML = renderBoard([
        boardRow("Athens", "32,495", "-525", "+1,605"),
        boardRow("Sparta", "21,657", "-350", ""),
      ]);
      expect(readWineBoard().get("Athens")!.production).toBe(1605);
      expect(readWineBoard().get("Sparta")!.production).toBe(0);
    },
  );
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
    expect(measuredStats("Athens")).toEqual({
      stock: 5000,
      consume: 100,
      production: 0,
    });
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

  it("takes production from the town cache when the board lacks the town", () => {
    saveTownStats(getState().account, {
      Athens: { stock: 4_000, consume: 200, production: 605, at: Date.now() },
    });
    expect(measuredStats("Athens")).toMatchObject({ production: 605 });
  });

  it("reads a snapshot from before production was recorded as making none", () => {
    saveTownStats(getState().account, {
      Athens: { stock: 4_000, consume: 200, at: Date.now() },
    });
    expect(measuredStats("Athens")).toEqual({
      stock: 4_000,
      consume: 200,
      production: 0,
    });
  });
});

describe("only a town drinking more than its island makes gets wine", () => {
  beforeEach(() => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([
        // Athens: makes 605, drinks 300 — more than it drinks.
        boardRow("Athens", "5,000", "-300", "+605"),
        // Sparta: makes 500, drinks 800 — short by 300.
        boardRow("Sparta", "3,000", "-800", "+500"),
        // Corinth: another good's island, drinks 200.
        boardRow("Corinth", "1,000", "-200", ""),
      ]);
  });

  it("leaves out a town that makes at least what it drinks", () => {
    const towns = buildWineTowns([
      { townNumber: "0", winePerHour: "300" },
      { townNumber: "2", winePerHour: "200" },
    ]);
    expect(towns.map((town) => town.townName)).toEqual(["Corinth"]);
  });

  it("leaves out a town that makes exactly what it drinks", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([boardRow("Athens", "5,000", "-300", "+300")]);
    expect(buildWineTowns([{ townNumber: "0", winePerHour: "300" }])).toEqual(
      [],
    );
  });

  it("levels a town on a wine island on what it is short by", () => {
    const [sparta] = buildWineTowns([{ townNumber: "1", winePerHour: "800" }]);
    expect(sparta).toMatchObject({ townName: "Sparta", consume: 300 });
  });

  it("leaves a town off a wine island levelled on all it drinks", () => {
    const [corinth] = buildWineTowns([{ townNumber: "2", winePerHour: "0" }]);
    expect(corinth).toMatchObject({ townName: "Corinth", consume: 200 });
  });

  it(
    "counts a town with no figures as making none, and keeps its " +
      "hand-entered rate",
    () => {
      document.body.innerHTML = townDropdown(TOWNS);
      const [corinth] = buildWineTowns([
        { townNumber: "2", winePerHour: "150" },
      ]);
      expect(corinth).toMatchObject({ townName: "Corinth", consume: 150 });
    },
  );

  it("takes production from the town cache when there is no board", () => {
    document.body.innerHTML = townDropdown(TOWNS);
    saveTownStats(getState().account, {
      Corinth: { stock: 900, consume: 250, production: 400, at: Date.now() },
    });
    expect(buildWineTowns([{ townNumber: "2", winePerHour: "250" }])).toEqual(
      [],
    );
  });

  it("queues nothing for a town that makes more than it drinks", () => {
    saveReceivers([
      { townNumber: "0", winePerHour: "300" },
      { townNumber: "2", winePerHour: "200" },
    ]);
    // Sparta sends: 3,000 less its 800 reserve.
    expect(enqueueWineRun("1")).toBe(1);
    const queued = getState().queue.listOfType("sendResource");
    expect(queued.map((task) => task.data.destination)).toEqual(["2"]);
  });

  it("writes no wine-crawl row for a town that makes more than it drinks", () => {
    saveReceivers([
      { townNumber: "0", winePerHour: "300" },
      { townNumber: "2", winePerHour: "200" },
    ]);
    const { text, rows } = buildWineCsv("1", "tester");
    expect(rows).toBe(1);
    expect(text).toContain("tester, Corinth    ,");
    expect(text).not.toContain("Athens");
  });

  it(
    "says which towns make their own wine when they were the only " +
      "receivers, and queues nothing",
    () => {
      // Athens makes 605 and drinks 300; Corinth is the source.
      saveReceivers([{ townNumber: "0", winePerHour: "300" }]);

      expect(enqueueWineRun("2")).toBe(0);

      expect(getState().queue.length).toBe(0);
      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast.mock.calls[0][0]).toContain(
        "These make at least as much wine as they drink, so they get none: " +
          "Athens.",
      );
    },
  );

  it(
    "says which towns make their own wine when none is set to receive, " +
      "leaving out the source and the ticked senders",
    () => {
      document.body.innerHTML =
        townDropdown(TOWNS) +
        renderBoard([
          boardRow("Athens", "5,000", "-300", "+605"),
          boardRow("Sparta", "5,000", "-100", "+605"),
          boardRow("Corinth", "5,000", "-100", "+605"),
        ]);
      saveSenders(["1"]);
      saveReceivers([]);

      expect(enqueueWineRun("0")).toBe(0);

      expect(showToast.mock.calls[0][0]).toContain("they get none: Corinth.");
    },
  );

  it(
    "keeps the old message when no town is set to receive and none makes " +
      "its own wine",
    () => {
      document.body.innerHTML =
        townDropdown(TOWNS) +
        renderBoard([boardRow("Athens", "5,000", "-300", "+605")]);
      saveReceivers([]);

      expect(enqueueWineRun("0")).toBe(0);

      expect(showToast.mock.calls[0][0]).toContain(
        "No town is set to receive wine",
      );
    },
  );

  it("still counts a receiver it has no figures for, by its Wine/h", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([
        boardRow("Athens", "5,000", "-300", "+605"),
        boardRow("Sparta", "3,000", "-100", "+605"),
      ]);
    saveReceivers([
      { townNumber: "1", winePerHour: "100" },
      { townNumber: "2", winePerHour: "150" },
    ]);

    expect(enqueueWineRun("0")).toBe(1);

    const queued = getState().queue.listOfType("sendResource");
    expect(queued.map((task) => task.data.destination)).toEqual(["2"]);
  });

  it("does not save a town that makes at least what it drinks as a receiver", () => {
    saveSenders(["2"]);

    saveMeasuredReceivers();

    // Sparta drinks 800 and makes 500: saved, with what it drinks.
    expect(loadReceivers()).toEqual([{ townNumber: "1", winePerHour: "800" }]);
  });
});

describe("choosing a source when none is ticked", () => {
  it("picks the town that makes the most wine", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([
        boardRow("Athens", "90,000", "-300", "+200"),
        boardRow("Sparta", "1,000", "-800", "+605"),
        boardRow("Corinth", "50,000", "-100", ""),
      ]);
    expect(chooseWineSource()).toMatchObject({
      townNumber: "1",
      townName: "Sparta",
      by: "production",
      production: 605,
    });
  });

  it("gives a tie to the first town in the list", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([
        boardRow("Athens", "1,000", "-300", "+605"),
        boardRow("Sparta", "9,000", "-300", "+605"),
      ]);
    expect(chooseWineSource()?.townName).toBe("Athens");
  });

  it("finds a wine island in the town cache when there is no board", () => {
    document.body.innerHTML = townDropdown(TOWNS);
    saveTownStats(getState().account, {
      Athens: { stock: 9_000, consume: 300, production: 0, at: Date.now() },
      Corinth: { stock: 100, consume: 100, production: 605, at: Date.now() },
    });
    expect(chooseWineSource()).toMatchObject({
      townName: "Corinth",
      by: "production",
    });
  });

  it(
    "with no town making wine, picks the one whose stock lasts longest at " +
      "its own consumption, not the one holding the most",
    () => {
      document.body.innerHTML =
        townDropdown(TOWNS) +
        renderBoard([
          // 20 hours.
          boardRow("Athens", "10,000", "-500"),
          // 60 hours, with less wine.
          boardRow("Sparta", "6,000", "-100"),
          // 5 hours.
          boardRow("Corinth", "1,000", "-200"),
        ]);
      expect(chooseWineSource()).toMatchObject({
        townNumber: "1",
        townName: "Sparta",
        by: "hoursLeft",
      });
    },
  );

  it(
    "takes a town that drinks none as lasting forever, and the larger stock " +
      "among those",
    () => {
      document.body.innerHTML =
        townDropdown(TOWNS) +
        renderBoard([
          boardRow("Athens", "90,000", "-10"),
          // The town list sorts by name, so Corinth comes first: the larger
          // stock has to win over that order.
          boardRow("Corinth", "500", "-0"),
          boardRow("Sparta", "2,000", "-0"),
        ]);
      expect(chooseWineSource()?.townName).toBe("Sparta");
    },
  );

  it("never picks a town holding no wine by its hours", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([
        boardRow("Athens", "0", "-0"),
        boardRow("Sparta", "0", "-100"),
      ]);
    expect(chooseWineSource()).toBeNull();
  });

  it("finds nothing when no town's figures are known", () => {
    document.body.innerHTML = townDropdown(TOWNS);
    expect(chooseWineSource()).toBeNull();
  });

  it("ticks the town it picks as the source, and says so", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) +
      renderBoard([
        boardRow("Athens", "1,000", "-300", ""),
        boardRow("Sparta", "1,000", "-300", "+604.8"),
      ]);

    expect(pickWineSource()).toBe("1");

    expect(loadSenders()).toEqual(["1"]);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Sparta makes the most wine (605/h)"),
    );
  });

  it("says why when it picks by hours of wine left", () => {
    document.body.innerHTML =
      townDropdown(TOWNS) + renderBoard([boardRow("Athens", "6,000", "-100")]);

    expect(pickWineSource()).toBe("0");

    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("Athens holds the most hours of it (6000, 60h"),
    );
  });

  it("ticks nothing when it finds nothing", () => {
    document.body.innerHTML = townDropdown(TOWNS);
    saveSenders([]);

    expect(pickWineSource()).toBeNull();

    expect(loadSenders()).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
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

  it(
    "queues the town with the fewest hours of wine left first, not in the " +
      "configured order",
    () => {
      // Sparta holds more hours (10h) but less wine than Corinth (2h), so
      // this tells hours left apart from the stock alone.
      document.body.innerHTML =
        townDropdown(TOWNS) +
        renderBoard([
          boardRow("Athens", "50,000", "-525"),
          boardRow("Sparta", "1,000", "-100"),
          boardRow("Corinth", "2,000", "-1,000"),
        ]);
      saveReceivers([
        { townNumber: "1", winePerHour: "100" },
        { townNumber: "2", winePerHour: "1000" },
      ]);

      expect(enqueueWineRun("0")).toBe(2);

      const queued = getState().queue.listOfType("sendResource");
      expect(queued.map((task) => task.data.destination)).toEqual(["2", "1"]);
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

describe("buildWineCsv", () => {
  it(
    "writes one row per receiving town, with what the source can spare on " +
      "every row, spaced like the player's sample",
    () => {
      document.body.innerHTML =
        townDropdown(TOWNS) +
        renderBoard([
          boardRow("Athens", "50,000", "-525"),
          boardRow("Sparta", "1,000", "-100"),
          boardRow("Corinth", "2,000", "-1,000"),
        ]);
      // Athens is also configured as a receiver: as the source it is left out.
      saveReceivers([
        { townNumber: "0", winePerHour: "525" },
        { townNumber: "1", winePerHour: "100" },
        { townNumber: "2", winePerHour: "1000" },
      ]);

      const csv = buildWineCsv("0", "Smalldevil1");

      // 50,000 less one hour of Athens' own 525 per hour.
      expect(csv).toEqual({
        rows: 2,
        text:
          "const csv = `\n" +
          "account,town,stock,consume,maxSupply\n" +
          "Smalldevil1, Sparta    , 1000    , 100    , 49475\n" +
          "Smalldevil1, Corinth    , 2000    , 1000    , 49475\n" +
          "`;\n",
      });
    },
  );

  it("keeps a backtick in a town name from ending the template literal", () => {
    document.body.innerHTML =
      townDropdown(["Athens", "Spar`ta"]) +
      renderBoard([
        boardRow("Athens", "5,000", "-100"),
        boardRow("Spar`ta", "10", "-50"),
      ]);
    saveReceivers([{ townNumber: "1", winePerHour: "50" }]);

    const { text } = buildWineCsv("0", "tester");

    expect(text).toContain("tester, Spar\\`ta    , 10    , 50    , 4900");
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
