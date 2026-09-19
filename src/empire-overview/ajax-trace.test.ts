import { beforeEach, describe, expect, it } from "vitest";
import { clearTrace, describeEntry, readTrace, trace } from "./ajax-trace";

beforeEach(() => {
  localStorage.clear();
  (globalThis as any).unsafeWindow = window;
});

describe("ajax trace", () => {
  it("survives Ikariam's full page loads by living in localStorage", () => {
    trace("ajaxResponse", { viewIsCity: true });
    expect(readTrace()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("ikaAjaxTrace")!)).toHaveLength(1);
  });

  it("stays bounded", () => {
    for (let i = 0; i < 60; i++) trace("ajaxResponse", { i });
    const records = readTrace();
    expect(records).toHaveLength(40);
    // Oldest dropped, newest kept.
    expect(records[records.length - 1].i).toBe(59);
  });

  it("never throws when storage refuses", () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() => trace("ajaxResponse", {})).not.toThrow();
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  it("clears", () => {
    trace("ajaxResponse", {});
    clearTrace();
    expect(readTrace()).toEqual([]);
  });
});

describe("describeEntry", () => {
  it("reads the building layout out of updateBackgroundData", () => {
    expect(
      describeEntry(["updateBackgroundData", { id: 297036, position: [1, 2] }]),
    ).toEqual({
      type: "updateBackgroundData",
      hasPayload: true,
      hasPosition: true,
      cityId: 297036,
    });
  });

  it("reads it out of updateGlobalData's nested backgroundData", () => {
    expect(
      describeEntry([
        "updateGlobalData",
        { backgroundData: { id: 297036, position: [1] }, headerData: {} },
      ]),
    ).toMatchObject({ hasPosition: true, cityId: 297036 });
  });

  it("flags a response that carried no layout — the interesting case", () => {
    expect(
      describeEntry(["updateBackgroundData", { id: 297036 }]),
    ).toMatchObject({ hasPosition: false, cityId: 297036 });
  });

  it("describes a malformed entry instead of throwing on it", () => {
    expect(describeEntry(["updateBackgroundData"])).toMatchObject({
      type: "updateBackgroundData",
      hasPayload: false,
      hasPosition: false,
    });
    expect(describeEntry(null)).toEqual({ raw: "null" });
  });
});
