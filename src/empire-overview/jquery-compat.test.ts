import { describe, expect, it } from "vitest";
import { installJQueryCompat } from "./jquery-compat";

/** A minimal stand-in for jQuery 4, which dropped these helpers. */
function jquery4(): any {
  const jq: any = () => ({});
  jq.fn = { jquery: "4.0.0" };
  jq.each = () => {};
  jq.extend = () => ({});
  return jq;
}

/** jQuery 2.2.4 still had everything. */
function jquery2(): any {
  const jq: any = jquery4();
  jq.fn.jquery = "2.2.4";
  jq.now = () => 1234;
  jq.isNumeric = () => true;
  jq.isArray = () => true;
  jq.isFunction = () => true;
  jq.isWindow = () => true;
  jq.trim = () => "";
  jq.parseJSON = () => ({});
  jq.proxy = () => () => {};
  jq.type = () => "";
  return jq;
}

describe("installJQueryCompat", () => {
  it(
    "restores $.now on jQuery 4 — it is called 45 times here, including in " +
      "the City constructor, so the board would die on load without it",
    () => {
      const jq = jquery4();
      expect(jq.now).toBeUndefined();

      const added = installJQueryCompat(jq);
      expect(added).toContain("now");
      expect(typeof jq.now()).toBe("number");
      expect(jq.now()).toBeGreaterThan(1_600_000_000_000);
    },
  );

  it("leaves an older jQuery completely alone", () => {
    const jq = jquery2();
    expect(installJQueryCompat(jq)).toEqual([]);
    // The original implementation must survive, not be replaced.
    expect(jq.now()).toBe(1234);
  });

  it("restores the other helpers removed in the same sweep", () => {
    const jq = jquery4();
    const added = installJQueryCompat(jq);
    expect(added).toEqual(
      expect.arrayContaining([
        "now",
        "isNumeric",
        "isArray",
        "isFunction",
        "trim",
        "parseJSON",
        "proxy",
        "type",
      ]),
    );
  });

  it("the isNumeric shim behaves like jQuery's did", () => {
    const jq = jquery4();
    installJQueryCompat(jq);
    // render.ts guards a for-in over resource movements with this.
    expect(jq.isNumeric("42")).toBe(true);
    expect(jq.isNumeric(42)).toBe(true);
    expect(jq.isNumeric("getResources")).toBe(false);
    expect(jq.isNumeric("")).toBe(false);
    expect(jq.isNumeric(Infinity)).toBe(false);
    expect(jq.isNumeric(null)).toBe(false);
  });

  it("the trim shim tolerates null, as jQuery's did", () => {
    const jq = jquery4();
    installJQueryCompat(jq);
    expect(jq.trim(null)).toBe("");
    expect(jq.trim("  x  ")).toBe("x");
  });

  it("the proxy shim binds context", () => {
    const jq = jquery4();
    installJQueryCompat(jq);
    const context = { value: 7 };
    expect(
      jq.proxy(function (this: any) {
        return this.value;
      }, context)(),
    ).toBe(7);
  });

  it("is idempotent", () => {
    const jq = jquery4();
    installJQueryCompat(jq);
    expect(installJQueryCompat(jq)).toEqual([]);
  });
});
