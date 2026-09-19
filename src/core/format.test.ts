import { describe, expect, it } from "vitest";
import {
  compareValues,
  formatNumToStr,
  formatTimeLengthToStr,
  minBy,
} from "./format";

describe("formatTimeLengthToStr", () => {
  it("returns the literal 'Finished.' for negative durations", () => {
    // Several call sites compare against this exact string.
    expect(formatTimeLengthToStr(-1)).toBe("Finished.");
  });

  it("formats hours and minutes at the default precision", () => {
    expect(formatTimeLengthToStr(3600_000 + 5 * 60_000)).toBe("1h 5m");
  });

  it("honours the precision limit", () => {
    const ms = 2 * 86400_000 + 3 * 3600_000 + 4 * 60_000 + 5000;
    expect(formatTimeLengthToStr(ms, 1)).toBe("2D");
    expect(formatTimeLengthToStr(ms, 2)).toBe("2D 3h");
  });

  it("treats undefined as zero", () => {
    expect(formatTimeLengthToStr(undefined)).toBe("");
  });
});

describe("formatNumToStr", () => {
  it("inserts thousand separators", () => {
    expect(formatNumToStr(1234567)).toBe("1,234,567");
  });

  it("returns the NUMBER zero for zero input", () => {
    // Quirk carried over from the original; some call sites rely on it.
    expect(formatNumToStr(0)).toBe(0);
  });

  it("can prefix an explicit sign", () => {
    expect(formatNumToStr(1234, true)).toBe("+1,234");
    expect(formatNumToStr(-1234, true)).toBe("-1,234");
  });

  it("renders non-finite input as an infinity sign", () => {
    expect(formatNumToStr(Infinity)).toBe("∞");
    expect(formatNumToStr(NaN)).toBe("∞");
  });
});

describe("compareValues", () => {
  it("sorts ascending by key and supports descending", () => {
    const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
    expect([...rows].sort(compareValues("n")).map((r) => r.n)).toEqual([
      1, 2, 3,
    ]);
    expect([...rows].sort(compareValues("n", "desc")).map((r) => r.n)).toEqual([
      3, 2, 1,
    ]);
  });

  it("compares strings case-insensitively", () => {
    const rows = [{ s: "beta" }, { s: "Alpha" }];
    expect([...rows].sort(compareValues("s")).map((r) => r.s)).toEqual([
      "Alpha",
      "beta",
    ]);
  });
});

describe("minBy", () => {
  it("finds the smallest item and respects the filter", () => {
    const rows = [
      { t: 5, ok: false },
      { t: 3, ok: true },
      { t: 9, ok: true },
    ];
    expect(minBy(rows, "t")?.t).toBe(3);
    expect(minBy(rows, "t", (r) => r.ok)?.t).toBe(3);
    expect(minBy(rows, "t", (r) => !r.ok)?.t).toBe(5);
  });

  it("returns null when nothing matches", () => {
    expect(minBy([], "t" as never)).toBeNull();
    expect(minBy([{ t: 1 }], "t", () => false)).toBeNull();
  });
});
