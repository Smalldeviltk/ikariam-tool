import { beforeEach, describe, expect, it, vi } from "vitest";
import { initState, getState } from "../state";
import { saveTownStats } from "../town-cache";
import {
  CRITICAL_HOURS,
  formatHours,
  townsNeedingWine,
  wineStatus,
  wineWarningSummary,
  WARNING_HOURS,
} from "./wine-warning";

vi.mock("@core/logger", () => ({
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

const TOWNS = ["W-Athens", "M-Corinth", "M-Aegina"];

function dropdown(): string {
  return (
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    TOWNS.map((name) => `<li><a title="${name}"> ${name}</a></li>`).join("") +
    `</ul></div></div>`
  );
}

/** Board markup, matching the live capture: two wine cells per row. */
function boardRow(town: string, stock: string, consumption: string): string {
  return (
    `<tr>` +
    `<td class="city_name"><span class="clickable">${town}</span></td>` +
    `<td class="resource wine"><span class="current">${stock}</span></td>` +
    `<td class="resource wine">` +
    `<span class="prodconssubsum consumption Red">${consumption}</span>` +
    `</td></tr>`
  );
}

function board(rows: string[]): string {
  return `<div id="ResTab"><table><tbody>${rows.join("")}</tbody></table></div>`;
}

beforeEach(() => {
  localStorage.clear();
  initState("tester");
  document.body.innerHTML = dropdown();
});

describe("wineStatus", () => {
  it("works out hours left from stock and consumption", () => {
    document.body.innerHTML =
      dropdown() + board([boardRow("W-Athens", "3,600", "-300")]);

    const athens = wineStatus().find((t) => t.townName === "W-Athens")!;
    expect(athens.hoursLeft).toBe(12);
    expect(athens.stock).toBe(3600);
    expect(athens.consume).toBe(300);
  });

  it(
    "reports nothing rather than infinity for a town that drinks nothing — " +
      "seen live on a town whose tavern was mid-upgrade",
    () => {
      document.body.innerHTML =
        dropdown() + board([boardRow("W-Athens", "17", "")]);

      const athens = wineStatus().find((t) => t.townName === "W-Athens")!;
      expect(athens.hoursLeft).toBeNull();
      expect(athens.severity).toBe("ok");
    },
  );

  it("falls back to the town cache when the board is not open", () => {
    saveTownStats(getState().account, {
      "M-Corinth": { stock: 1000, consume: 500, at: Date.now() },
    });

    const corinth = wineStatus().find((t) => t.townName === "M-Corinth")!;
    expect(corinth.hoursLeft).toBe(2);
    expect(corinth.severity).toBe("critical");
  });

  it("says nothing about a town no source knows", () => {
    const aegina = wineStatus().find((t) => t.townName === "M-Aegina")!;
    expect(aegina.hoursLeft).toBeNull();
    expect(aegina.severity).toBe("ok");
  });
});

describe("severity", () => {
  it("is critical below the critical threshold", () => {
    document.body.innerHTML =
      dropdown() +
      board([boardRow("W-Athens", String((CRITICAL_HOURS - 1) * 100), "-100")]);
    expect(wineStatus().find((t) => t.townName === "W-Athens")!.severity).toBe(
      "critical",
    );
  });

  it("is a warning between the two thresholds", () => {
    document.body.innerHTML =
      dropdown() +
      board([boardRow("W-Athens", String((WARNING_HOURS - 1) * 100), "-100")]);
    expect(wineStatus().find((t) => t.townName === "W-Athens")!.severity).toBe(
      "warning",
    );
  });

  it("is fine above both", () => {
    document.body.innerHTML =
      dropdown() +
      board([boardRow("W-Athens", String((WARNING_HOURS + 1) * 100), "-100")]);
    expect(wineStatus().find((t) => t.townName === "W-Athens")!.severity).toBe(
      "ok",
    );
  });
});

describe("townsNeedingWine", () => {
  it("lists only the towns that need something, worst first", () => {
    document.body.innerHTML =
      dropdown() +
      board([
        boardRow("W-Athens", "100000", "-100"), // fine
        boardRow("M-Corinth", "2400", "-100"), // 24h, warning
        boardRow("M-Aegina", "300", "-100"), // 3h, critical
      ]);

    const needing = townsNeedingWine();
    expect(needing.map((t) => t.townName)).toEqual(["M-Aegina", "M-Corinth"]);
  });

  it("is empty when every town is comfortable", () => {
    document.body.innerHTML =
      dropdown() + board([boardRow("W-Athens", "100000", "-100")]);
    expect(townsNeedingWine()).toEqual([]);
  });
});

describe("formatHours", () => {
  it("reads as a person would write it", () => {
    expect(formatHours(null)).toBe("—");
    expect(formatHours(0.4)).toBe("<1h");
    expect(formatHours(7.9)).toBe("7h");
    expect(formatHours(24)).toBe("1d");
    expect(formatHours(54)).toBe("2d 6h");
  });
});

describe("wineWarningSummary", () => {
  it("is null when there is nothing to say", () => {
    document.body.innerHTML =
      dropdown() + board([boardRow("W-Athens", "100000", "-100")]);
    expect(wineWarningSummary()).toBeNull();
  });

  it("names the worst town and counts the rest", () => {
    document.body.innerHTML =
      dropdown() +
      board([
        boardRow("W-Athens", "300", "-100"),
        boardRow("M-Corinth", "2400", "-100"),
      ]);

    expect(wineWarningSummary()).toBe("W-Athens: 3h of wine left (+1 more)");
  });

  it("drops the tail when only one town needs anything", () => {
    document.body.innerHTML =
      dropdown() + board([boardRow("W-Athens", "300", "-100")]);
    expect(wineWarningSummary()).toBe("W-Athens: 3h of wine left");
  });
});
