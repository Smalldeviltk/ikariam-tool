import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SCRIPT = readFileSync(
  resolve(__dirname, "collect-dom-report.js"),
  "utf8",
);

/**
 * Run the collector the way pasting it into a console would.
 *
 * The script is executed as a statement and the result is read back off
 * `window`, rather than `return ${SCRIPT}`. The file opens with a multi-line
 * JSDoc block, and a block comment containing a newline counts as a line
 * terminator for automatic semicolon insertion — so `return` + that comment
 * parses as a bare `return;` and the IIFE never runs at all.
 */
function run(): any {
  new Function(`${SCRIPT}\nreturn window.ikaReport;`)();
  return (window as any).ikaReport;
}

afterEach(() => {
  // The collector installs a watch interval; stop it so it cannot leak between
  // tests or keep fake timers alive.
  (window as any).ikaStop?.();
});

beforeEach(() => {
  // Captures persist to localStorage, so each test must start clean.
  localStorage.clear();
  document.body.innerHTML = "";
  delete (window as any).ikaReports;
  delete (window as any).ikaReport;
  delete (window as any).ikaReportJson;
});

describe("collect-dom-report", () => {
  it(
    "REGRESSION: still publishes the report when console.table is missing " +
      "(Ikariam strips it)",
    () => {
      const original = console.table;
      // Reproduce exactly what the game page does.
      delete (console as any).table;
      try {
        expect(() => run()).not.toThrow();
        expect((window as any).ikaReport).toBeTruthy();
        expect((window as any).ikaReports).toHaveLength(1);
        // ikaDump() is what serialises everything for pasting back.
        expect(typeof (window as any).ikaDump()).toBe("string");
      } finally {
        console.table = original;
      }
    },
  );

  it("survives console being removed entirely", () => {
    const original = (globalThis as any).console;
    (globalThis as any).console = undefined;
    try {
      expect(() => run()).not.toThrow();
      expect((window as any).ikaReport).toBeTruthy();
    } finally {
      (globalThis as any).console = original;
    }
  });

  it("reports zero matches instead of throwing on an empty page", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const report = run();
    expect(report.selectors.cityBread.count).toBe(0);
    expect(report.townList).toEqual([]);
    expect(report.view.hasTownView).toBe(false);
  });

  it("collects the town list and building slots when present", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    // No whitespace inside the <ul>: see the next test for why that matters.
    document.body.innerHTML =
      `<div id="js_cityBread">Athens</div>` +
      `<div id="dropDown_js_citySelectContainer"><div class="bg">` +
      `<ul><li><a>1-Athens</a></li><li><a>2-Sparta</a></li></ul>` +
      `</div></div>` +
      `<div id="position3" class="building port">` +
      `<a class="hoverable" id="js_CityPosition3Link" title="Trading Port 5"></a>` +
      `</div>`;
    const report = run();
    expect(report.view.hasTownView).toBe(true);
    expect(report.townList.map((t: any) => t.trimmed)).toEqual([
      "1-Athens",
      "2-Sparta",
    ]);
    expect(report.buildingSlots[0]).toMatchObject({
      slotId: "position3",
      hoverableId: "js_CityPosition3Link",
      idResolves: true,
      idValidAsCssSelector: true,
    });
  });

  it("flags whitespace text nodes in the town dropdown", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    // This is the failure mode worth catching: the scripts index towns by
    // childNodes position, so stray text nodes would shift every index.
    document.body.innerHTML = `
      <div id="dropDown_js_citySelectContainer"><div class="bg"><ul>
        <li><a>1-Athens</a></li>
        <li><a>2-Sparta</a></li>
      </ul></div></div>`;
    const report = run();
    const nodeNames = report.townList.map((t: any) => t.nodeName);
    expect(nodeNames).toContain("#text");
  });
});

describe("watch mode", () => {
  it("captures a new screen automatically when the DOM changes", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      // Start on the town view — the two captures that came back as duplicates
      // were both taken here, which is exactly what watch mode is for.
      document.body.innerHTML = `<div id="js_cityBread">W-Athens</div>`;
      run();
      expect((window as any).ikaReports).toHaveLength(1);

      // Now the player opens the Trading Port shipment form.
      document.body.innerHTML =
        `<input id="textfield_wine" value="0">` +
        `<ul class="cities clearfix"><li><a>M-Corinth</a></li></ul>`;
      await vi.advanceTimersByTimeAsync(1000);

      const reports = (window as any).ikaReports;
      expect(reports).toHaveLength(2);
      expect(reports[1].screen).toContain("port-form");
      expect(reports[1].portForm.present).toBe(true);
    } finally {
      (window as any).ikaStop?.();
      vi.useRealTimers();
    }
  });

  it("does not re-capture the same screen over and over", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      document.body.innerHTML = `<input id="textfield_wine" value="0">`;
      run();
      await vi.advanceTimersByTimeAsync(10_000);
      expect((window as any).ikaReports).toHaveLength(1);
    } finally {
      (window as any).ikaStop?.();
      vi.useRealTimers();
    }
  });

  it("ikaDump serialises every capture", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = `<div id="js_cityBread">W-Athens</div>`;
    run();
    const json = (window as any).ikaDump();
    expect(JSON.parse(json)).toHaveLength(1);
    (window as any).ikaStop?.();
  });
});

describe("persistence across page loads", () => {
  it(
    "REGRESSION: captures survive a reload, so pasting again on a new screen " +
      "accumulates instead of starting over",
    () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      // Paste #1 on the town view.
      document.body.innerHTML = `<div id="js_cityBread">W-Athens</div>`;
      run();
      expect((window as any).ikaReports).toHaveLength(1);

      // Ikariam navigates with a full page load, which wipes everything the
      // console held. Simulate that: globals gone, DOM replaced.
      delete (window as any).ikaReports;
      delete (window as any).ikaReport;
      document.body.innerHTML = `<input id="textfield_wine" value="0">`;

      // Paste #2 on the port form.
      run();
      const reports = (window as any).ikaReports;
      expect(reports).toHaveLength(2);
      expect(reports.map((r: any) => r.screen).sort()).toEqual([
        "port-form",
        "town",
      ]);
      (window as any).ikaStop?.();
    },
  );

  it("re-pasting on the same screen refreshes rather than duplicating", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = `<div id="js_cityBread">W-Athens</div>`;
    run();
    delete (window as any).ikaReports;
    run();
    expect((window as any).ikaReports).toHaveLength(1);
    (window as any).ikaStop?.();
  });

  it("ikaReset clears the stored captures", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = `<div id="js_cityBread">W-Athens</div>`;
    run();
    (window as any).ikaReset();
    expect((window as any).ikaReports).toHaveLength(0);
    expect(localStorage.getItem("ikaDomReports")).toBeNull();
    (window as any).ikaStop?.();
  });
});

describe("town-switch probe", () => {
  /** Town dropdown markup as captured from a live page. */
  function townDropdown(names: string[]): string {
    const items = names
      .map(
        (n, i) =>
          `<li selectvalue="${78038 + i}" class="ownCity"><a title="${n}"> ${n}</a></li>`,
      )
      .join("");
    return `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>${items}</ul></div></div>`;
  }

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("clicks a town other than the current one and records the attempt", () => {
    document.body.innerHTML =
      `<div id="js_cityBread">W-Athens</div>` +
      townDropdown(["W-Athens", "C-Thebes"]);
    run();

    let clicked = "";
    document
      .querySelectorAll("#dropDown_js_citySelectContainer a")
      .forEach((a) =>
        a.addEventListener(
          "click",
          () => void (clicked = a.getAttribute("title") ?? ""),
        ),
      );

    (window as any).ikaTestTownSwitch();
    expect(clicked).toBe("C-Thebes");

    const pending = JSON.parse(localStorage.getItem("ikaTownSwitchTest")!);
    expect(pending).toMatchObject({ before: "W-Athens", target: "C-Thebes" });
    // No verdict yet: navigation has not happened, and it wipes the console.
    expect(pending.verdict).toBeUndefined();
    (window as any).ikaStop?.();
  });

  it("settles the verdict to WORKS on the next paste", () => {
    localStorage.setItem(
      "ikaTownSwitchTest",
      JSON.stringify({ before: "W-Athens", target: "C-Thebes" }),
    );
    // Simulate the page having navigated: console gone, new breadcrumb.
    delete (window as any).ikaReports;
    document.body.innerHTML = `<div id="js_cityBread">C-Thebes</div>`;

    const report = run();
    expect(report.townSwitchTest.verdict).toBe("WORKS");
    (window as any).ikaStop?.();
  });

  it("reports NO-CHANGE when the click did nothing", () => {
    localStorage.setItem(
      "ikaTownSwitchTest",
      JSON.stringify({ before: "W-Athens", target: "C-Thebes" }),
    );
    delete (window as any).ikaReports;
    document.body.innerHTML = `<div id="js_cityBread">W-Athens</div>`;

    // This is the outcome that would mean navigation.ts needs a different
    // fallback entirely.
    expect(run().townSwitchTest.verdict).toBe("NO-CHANGE");
    (window as any).ikaStop?.();
  });

  it("refuses to run when not on a town view", () => {
    document.body.innerHTML = townDropdown(["W-Athens", "C-Thebes"]);
    run();
    (window as any).ikaTestTownSwitch();
    expect(localStorage.getItem("ikaTownSwitchTest")).toBeNull();
    (window as any).ikaStop?.();
  });
});

describe("Empire Overview store probe", () => {
  it("reports which towns have no building data recorded", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Two towns as Empire Overview stores them: one recorded from a visit,
    // one created from relatedCityData and never filled in. Telling those
    // apart is the whole point of the probe — a scan can report every town
    // visited while the store still holds nothing for half of them.
    localStorage.setItem(
      "***Smalldevil***cities",
      JSON.stringify({
        297034: {
          _id: 297034,
          _name: "W-Athens",
          _islandID: 4413,
          knownTime: 1789841563725,
          _buildings: [
            { _position: 0, _name: "townHall" },
            { _position: 1, _name: "port" },
            { _position: 2, _name: "buildingGround" },
          ],
          _resources: { wine: { _current: 69547.5, _consumption: 350.4 } },
          _capacities: { capacity: 2985891 },
        },
        297036: {
          _id: 297036,
          _name: "M-Aegina",
          _islandID: null,
          _buildings: [{ _position: 0, _name: null }],
          _resources: { wine: { _current: 0, _consumption: 0 } },
          _capacities: { capacity: 2500 },
        },
      }),
    );

    const report = run();
    const byName = Object.fromEntries(
      report.empireStore.map((c: any) => [c.name, c]),
    );
    expect(byName["W-Athens"].buildingsKnown).toBe(2);
    expect(byName["M-Aegina"].buildingsKnown).toBe(0);
    expect(byName["M-Aegina"].islandID).toBeNull();
    (window as any).ikaStop?.();
  });

  it("survives a corrupt store instead of losing the whole capture", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    localStorage.setItem("***Smalldevil***cities", "{not json");
    const report = run();
    expect(report.empireStore[0].error).toBeTruthy();
    (window as any).ikaStop?.();
  });
});

describe("ikariam.model probe", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it(
    "tells a zero apart from a missing field — that distinction is the " +
      "whole point, since a zero beats the DOM fallback and an absent field " +
      "does not",
    () => {
      (window as any).ikariam = {
        model: {
          freeTransporters: 0,
          currentResources: { wine: 100 },
          wineSpendings: 350,
        },
      };
      const report = run();
      expect(report.modelState.freeTransporters).toEqual({
        value: 0,
        type: "number",
      });
      expect(report.modelState.freeFreighters).toEqual({
        value: undefined,
        type: "undefined",
      });
      expect(report.modelState.currentResources.value).toEqual(["wine"]);
      expect(report.modelState.keys).toContain("wineSpendings");
      (window as any).ikaStop?.();
    },
  );

  it("reports null when the game object is not there at all", () => {
    delete (window as any).ikariam;
    expect(run().modelState).toBeNull();
    (window as any).ikaStop?.();
  });
});

describe("AJAX endpoint probe", () => {
  /** `ikariam.model` as the live page shapes it. */
  function installModel(currentId = 297034) {
    (window as any).ikariam = {
      model: {
        actionRequest: "5e6cc2784134cdbd3e916598189ea410",
        relatedCityData: {
          selectedCity: `city_${currentId}`,
          [`city_${currentId}`]: { id: currentId, name: "W-Athens" },
          city_297035: { id: 297035, name: "M-Corinth" },
        },
      },
    };
  }

  /** One townHall response, shaped like the ones in the captured ajax trace. */
  const RESPONSE = [
    ["updateGlobalData", { backgroundData: { id: 297034, position: [] } }],
    ["changeView", ["city", "<div></div>"]],
    ["updateBacklink", null],
  ];

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    installModel();
    fetchMock = vi.fn(async () => ({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify(RESPONSE),
    }));
    (globalThis as any).fetch = fetchMock;
  });

  it("fires exactly one request, to the town you are already in", async () => {
    run();
    const result = await (window as any).ikaTestAjaxFetch();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("view=townHall");
    expect(url).toContain("cityId=297034");
    expect(url).toContain("currentCityId=297034");
    expect(url).toContain("ajax=1");
    expect(result.wasCurrentCity).toBe(true);
    (window as any).ikaStop?.();
  });

  it("keeps the session token out of the stored result", async () => {
    run();
    const result = await (window as any).ikaTestAjaxFetch();

    // The URL is what gets pasted back to me; the token must not ride along.
    expect(result.url).not.toContain("5e6cc278");
    expect(result.url).toContain("<actionRequest>");
    (window as any).ikaStop?.();
  });

  it("summarises the response instead of dumping it", async () => {
    run();
    const result = await (window as any).ikaTestAjaxFetch();

    expect(result.isArray).toBe(true);
    expect(result.entryCount).toBe(3);
    expect(result.entries[0]).toMatchObject({
      type: "updateGlobalData",
      hasPayload: true,
      hasPosition: true,
      cityId: 297034,
    });
    // An entry with no payload is the shape that broke the board before.
    expect(result.entries[2]).toMatchObject({
      type: "updateBacklink",
      hasPayload: false,
      hasPosition: false,
    });
    (window as any).ikaStop?.();
  });

  it("says so when asked for a town other than the current one", async () => {
    run();
    const result = await (window as any).ikaTestAjaxFetch(297035);

    expect(result.wasCurrentCity).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain("cityId=297035");
    (window as any).ikaStop?.();
  });

  it("refuses to run without a token rather than sending a broken request", async () => {
    delete (window as any).ikariam;
    run();
    await (window as any).ikaTestAjaxFetch();

    expect(fetchMock).not.toHaveBeenCalled();
    (window as any).ikaStop?.();
  });

  it("records a failure instead of throwing", async () => {
    (globalThis as any).fetch = vi.fn(async () => {
      throw new Error("NetworkError");
    });
    run();
    const result = await (window as any).ikaTestAjaxFetch();

    expect(result.error).toContain("NetworkError");
    (window as any).ikaStop?.();
  });

  it("the result reaches the next capture, so ikaDump() carries it", async () => {
    run();
    await (window as any).ikaTestAjaxFetch();
    (window as any).ikaStop?.();

    const report = run();
    expect(report.ajaxProbe).toHaveLength(1);
    expect(report.ajaxProbe[0].requestedCityId).toBe(297034);
    (window as any).ikaStop?.();
  });

  it("never runs on its own — watch mode must not touch it", async () => {
    vi.useFakeTimers();
    try {
      run();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      (window as any).ikaStop?.();
      vi.useRealTimers();
    }
  });
});
