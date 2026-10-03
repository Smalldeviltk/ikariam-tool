import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_LIST_KEY,
  accountBuildTimeBuff,
  accountStore,
  EMPIRE_KEY_PATTERN,
  empireKeyPrefix,
  globalStore,
} from "./storage";

beforeEach(() => localStorage.clear());

describe("globalStore", () => {
  it("round-trips strings", () => {
    globalStore.set("k", "v");
    expect(globalStore.get("k")).toBe("v");
    expect(localStorage.getItem("k")).toBe("v");
  });

  it("returns null for a missing key, or the fallback when given one", () => {
    expect(globalStore.get("missing")).toBeNull();
    expect(globalStore.get("missing", "def")).toBe("def");
  });

  it("round-trips JSON", () => {
    globalStore.setJSON("j", { a: [1, 2] });
    expect(globalStore.getJSON("j", null)).toEqual({ a: [1, 2] });
  });

  it("falls back instead of throwing on corrupt JSON", () => {
    // The original let this throw, which the outer catch turned into a page
    // reload — impossible to diagnose.
    localStorage.setItem("bad", "{not json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(globalStore.getJSON("bad", { safe: true })).toEqual({ safe: true });
    expect(warn).toHaveBeenCalled();
  });

  it("removes keys", () => {
    globalStore.set("k", "v");
    globalStore.remove("k");
    expect(globalStore.get("k")).toBeNull();
  });
});

describe("key schemes", () => {
  it("accountStore prefixes with the bare account name", () => {
    accountStore("Alice").set("resource", "x");
    expect(localStorage.getItem("Aliceresource")).toBe("x");
  });

  it("spells the Empire Overview prefix as ***<account>***", () => {
    expect(empireKeyPrefix("Alice")).toBe("***Alice***");
  });

  it("splits an Empire Overview key into account and key", () => {
    const match = (empireKeyPrefix("Alice") + "settings").match(
      EMPIRE_KEY_PATTERN,
    );
    expect(match?.slice(1)).toEqual(["Alice", "settings"]);
    expect("Alicesettings".match(EMPIRE_KEY_PATTERN)).toBeNull();
  });

  it("the two schemes never collide for the same account and key", () => {
    accountStore("Alice").set("settings", "from-account");
    localStorage.setItem(empireKeyPrefix("Alice") + "settings", "from-empire");
    expect(accountStore("Alice").get("settings")).toBe("from-account");
    expect(localStorage.getItem("***Alice***settings")).toBe("from-empire");
  });

  it("keeps different accounts separate", () => {
    accountStore("Alice").set("resource", "a");
    accountStore("Bob").set("resource", "b");
    expect(accountStore("Alice").get("resource")).toBe("a");
    expect(accountStore("Bob").get("resource")).toBe("b");
  });
});

describe("accountBuildTimeBuff", () => {
  const rows = (...list: unknown[]) =>
    localStorage.setItem(ACCOUNT_LIST_KEY, JSON.stringify(list));

  it("turns the account's percentage into a fraction", () => {
    rows(
      { account: "Alice", buildTimeBuffPercent: 36 },
      { account: "Bob", buildTimeBuffPercent: 10 },
    );
    expect(accountBuildTimeBuff("Alice")).toBeCloseTo(0.36);
    expect(accountBuildTimeBuff("Bob")).toBeCloseTo(0.1);
  });

  it("is 0 with no table, no row or no figure", () => {
    expect(accountBuildTimeBuff("Alice")).toBe(0);
    rows({ account: "Bob", buildTimeBuffPercent: 10 }, { account: "Alice" });
    expect(accountBuildTimeBuff("Alice")).toBe(0);
    expect(accountBuildTimeBuff("Carol")).toBe(0);
  });

  it("is 0 for a figure that is not a percentage from 0 to below 100", () => {
    for (const bad of [-5, 100, 150, "36", null]) {
      rows({ account: "Alice", buildTimeBuffPercent: bad });
      expect(accountBuildTimeBuff("Alice")).toBe(0);
    }
  });
});
