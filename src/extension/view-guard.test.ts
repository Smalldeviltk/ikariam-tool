import { describe, expect, it } from "vitest";
import { shouldRunHere } from "./view-guard";

describe("shouldRunHere", () => {
  it("runs on the town view", () => {
    expect(shouldRunHere("?view=city&cityId=78038")).toBe(true);
  });

  it("runs when there is no view parameter at all", () => {
    expect(shouldRunHere("")).toBe(true);
    expect(shouldRunHere("?cityId=1")).toBe(true);
  });

  it(
    "skips island and world map, matching the userscript's @exclude lines " +
      "that Chrome match patterns cannot express",
    () => {
      expect(shouldRunHere("?view=island&id=1")).toBe(false);
      expect(shouldRunHere("?view=worldmap_iso")).toBe(false);
    },
  );

  it("is not fooled by a view name that merely starts the same", () => {
    expect(shouldRunHere("?view=islandSomethingElse")).toBe(true);
  });

  it("finds the parameter wherever it sits in the query", () => {
    expect(shouldRunHere("?a=1&view=island&b=2")).toBe(false);
  });
});
