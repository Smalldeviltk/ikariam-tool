import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore, empireStore, globalStore } from "./storage";

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

  it("empireStore uses the *** scheme", () => {
    empireStore("Alice").set("settings", "x");
    expect(localStorage.getItem("***Alice***settings")).toBe("x");
  });

  it("the two schemes never collide for the same account and key", () => {
    accountStore("Alice").set("settings", "from-account");
    empireStore("Alice").set("settings", "from-empire");
    expect(accountStore("Alice").get("settings")).toBe("from-account");
    expect(empireStore("Alice").get("settings")).toBe("from-empire");
  });

  it("keeps different accounts separate", () => {
    accountStore("Alice").set("resource", "a");
    accountStore("Bob").set("resource", "b");
    expect(accountStore("Alice").get("resource")).toBe("a");
    expect(accountStore("Bob").get("resource")).toBe("b");
  });
});
