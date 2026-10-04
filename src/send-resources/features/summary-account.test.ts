import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLAG, initState, loadAccounts, setAutoStart, setFlag } from "../state";
import {
  parseRemainingFromTitle,
  renderSummary,
  setBuildTimeBuff,
  setReloadGuard,
  updateCurrentAccount,
} from "./summary-account";

// Each keep-alive reload goes through `backToCity`; counted here instead.
const backToCity = vi.hoisted(() => vi.fn());
vi.mock("../navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../navigation")>()),
  backToCity,
}));

vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
  logInfo: () => {},
}));

const ACCOUNT = "tester";

/** A minute of the clock, UTC, on an arbitrary day. */
function atMinute(minute: number, second = 0): void {
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 5, 10, minute, second)));
}

beforeEach(() => {
  localStorage.clear();
  document.title = "Ikariam";
  document.body.innerHTML = `<div id="summaryAccountList"></div>`;
  initState(ACCOUNT);
  setReloadGuard(() => true);
  backToCity.mockClear();
  vi.useFakeTimers();
  atMinute(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseRemainingFromTitle", () => {
  it("reads the time left from the tab title", () => {
    document.title = "Ikariam - 1d 3h 20m 5s";
    expect(parseRemainingFromTitle()).toBe(
      ((24 + 3) * 3600 + 20 * 60 + 5) * 1000,
    );
  });

  it("is 0 when the title carries no time", () => {
    document.title = "Ikariam";
    expect(parseRemainingFromTitle()).toBe(0);
  });
});

describe("updateCurrentAccount", () => {
  it("adds a row for the account, with when its time runs out", () => {
    document.title = "Ikariam - 2h";
    updateCurrentAccount();

    const [row] = loadAccounts();
    expect(row.account).toBe(ACCOUNT);
    expect(row.time).toBe(Date.now() + 2 * 3600 * 1000);
  });

  it("records the wood figures while the Empire Overview board shows them", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<span id="t_currentwood">12,345</span>` +
        `<span id="t_woodincome"><span class="Green">+678</span></span>`,
    );
    updateCurrentAccount();

    const [row] = loadAccounts();
    expect(row.totalWood).toBe("12345");
    expect(row.woodIncome).toBe("678");
    expect(row.timeWood).toBe(Date.now());
  });

  it("updates the account's row rather than adding a second", () => {
    updateCurrentAccount();
    updateCurrentAccount();
    expect(loadAccounts()).toHaveLength(1);
  });
});

describe("setBuildTimeBuff", () => {
  beforeEach(() => updateCurrentAccount());

  const buff = () => loadAccounts()[0].buildTimeBuffPercent;

  it("stores a percentage, and an empty field as none", () => {
    expect(setBuildTimeBuff(ACCOUNT, " 36 ")).toBe(true);
    expect(buff()).toBe(36);
    expect(setBuildTimeBuff(ACCOUNT, "")).toBe(true);
    expect(buff()).toBe(0);
  });

  it("refuses what is not a percentage below 100, keeping the figure", () => {
    setBuildTimeBuff(ACCOUNT, "36");
    for (const text of ["abc", "-1", "100", "1e9"]) {
      expect(setBuildTimeBuff(ACCOUNT, text), text).toBe(false);
    }
    expect(buff()).toBe(36);
  });

  it("refuses an account the table does not have", () => {
    expect(setBuildTimeBuff("someone else", "10")).toBe(false);
  });
});

describe("the keep-alive reload", () => {
  it("does nothing while no automation is switched on", () => {
    renderSummary();
    expect(backToCity).not.toHaveBeenCalled();
  });

  it("reloads on an even minute while a timer is on, once in that minute", () => {
    setAutoStart(true);
    renderSummary();
    atMinute(0, 30);
    renderSummary();

    expect(backToCity).toHaveBeenCalledTimes(1);
    // The reload is not taken for the end of a run.
    expect(localStorage.getItem(FLAG.isAutoReload)).toBe("false");
  });

  it("waits out an odd minute, and goes again on the next even one", () => {
    setFlag(FLAG.isAutoBuildStart, true);
    atMinute(1);
    renderSummary();
    expect(backToCity).not.toHaveBeenCalled();

    atMinute(0);
    renderSummary();
    atMinute(2);
    renderSummary();
    expect(backToCity).toHaveBeenCalledTimes(2);
  });

  it("does not reload while the task runner says it is unsafe", () => {
    setAutoStart(true);
    setReloadGuard(() => false);
    renderSummary();
    expect(backToCity).not.toHaveBeenCalled();
  });
});
