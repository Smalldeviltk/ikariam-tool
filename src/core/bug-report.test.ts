import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBugReport,
  clearBugs,
  clearContextProviders,
  exportBugReport,
  getBugs,
  installErrorHandlers,
  registerContextProvider,
  getBuildInfo,
  setBuildInfo,
  reportBug,
  reportSelectorMiss,
  summariseBugs,
} from "./bug-report";

beforeEach(() => {
  localStorage.clear();
  clearContextProviders();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("recording", () => {
  it("stores message, stack and kind", () => {
    reportBug("manual", new Error("boom"));
    const [bug] = getBugs();
    expect(bug).toMatchObject({ kind: "manual", message: "boom", count: 1 });
    expect(bug.stack).toContain("boom");
  });

  it("survives a page reload, because it persists", () => {
    reportBug("manual", new Error("boom"));
    expect(JSON.parse(localStorage.getItem("ikaBugReports")!)).toHaveLength(1);
  });

  it("accepts a non-Error value without losing it", () => {
    reportBug("unhandled-rejection", "just a string");
    expect(getBugs()[0].message).toBe("just a string");
  });

  it("handles null and undefined, folding them together", () => {
    reportBug("manual", null);
    reportBug("manual", undefined);
    // Neither carries a message or a stack, so they share a fingerprint and
    // aggregate — which is the point of aggregating.
    const bugs = getBugs();
    expect(bugs).toHaveLength(1);
    expect(bugs[0]).toMatchObject({ message: "unknown", count: 2 });
  });

  it("reportSelectorMiss names the selector", () => {
    reportSelectorMiss("#js_cityBread");
    expect(getBugs()[0].message).toContain("#js_cityBread");
  });
});

describe("deduplication", () => {
  it("aggregates repeats instead of flooding", () => {
    for (let i = 0; i < 5; i++) reportBug("manual", new Error("same"));
    const bugs = getBugs();
    expect(bugs).toHaveLength(1);
    expect(bugs[0].count).toBe(5);
  });

  it("moves lastAt forward but keeps firstAt", () => {
    reportBug("manual", new Error("same"));
    const first = getBugs()[0].firstAt;
    reportBug("manual", new Error("same"));
    const bug = getBugs()[0];
    expect(bug.firstAt).toBe(first);
    expect(bug.lastAt).toBeGreaterThanOrEqual(first);
  });

  it("keeps distinct messages apart", () => {
    reportBug("manual", new Error("a"));
    reportBug("manual", new Error("b"));
    expect(getBugs()).toHaveLength(2);
  });

  it("keeps the same message under different kinds apart", () => {
    reportBug("task-error", new Error("a"));
    reportBug("selector-miss", new Error("a"));
    expect(getBugs()).toHaveLength(2);
  });

  it("caps the buffer so localStorage cannot grow without bound", () => {
    for (let i = 0; i < 80; i++) reportBug("manual", new Error(`e${i}`));
    const bugs = getBugs();
    expect(bugs.length).toBeLessThanOrEqual(50);
    // Oldest-first eviction: the newest must survive.
    expect(bugs[bugs.length - 1].message).toBe("e79");
  });

  it("keeps at most three context snapshots per bug", () => {
    for (let i = 0; i < 10; i++) reportBug("manual", new Error("same"));
    expect(getBugs()[0].contexts.length).toBeLessThanOrEqual(3);
  });
});

describe("context providers", () => {
  it("merges provider output into the record", () => {
    registerContextProvider(() => ({ town: "W-Athens", queueLength: 3 }));
    reportBug("manual", new Error("boom"));
    expect(getBugs()[0].contexts[0]).toMatchObject({
      town: "W-Athens",
      queueLength: 3,
    });
  });

  it("still records the bug when a provider itself throws", () => {
    registerContextProvider(() => {
      throw new Error("provider exploded");
    });
    reportBug("manual", new Error("boom"));
    const bug = getBugs()[0];
    expect(bug.message).toBe("boom");
    expect(bug.contexts[0].providerError).toContain("provider exploded");
  });
});

describe("robustness", () => {
  it("never throws, whatever it is handed", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => reportBug("manual", circular)).not.toThrow();
    expect(() => reportBug("manual", Symbol("x") as unknown)).not.toThrow();
  });

  it("does not blow up when storage is unavailable", () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() => reportBug("manual", new Error("boom"))).not.toThrow();
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  it("recovers from a corrupt store instead of failing", () => {
    localStorage.setItem("ikaBugReports", "{not json");
    expect(getBugs()).toEqual([]);
    expect(() => reportBug("manual", new Error("boom"))).not.toThrow();
    expect(getBugs()).toHaveLength(1);
  });

  it(
    "REGRESSION: a provider that itself reports a bug cannot recurse — a " +
      "reporter that loops while reporting is worse than none",
    () => {
      let depth = 0;
      registerContextProvider(() => {
        depth++;
        // Exactly the pathological case the re-entrancy guard exists for.
        reportBug("manual", new Error("from inside the provider"));
        return {};
      });
      expect(() => reportBug("manual", new Error("outer"))).not.toThrow();
      expect(depth).toBe(1);
      // The nested call was refused, so only the outer bug was stored.
      expect(getBugs()).toHaveLength(1);
    },
  );
});

describe("global handlers", () => {
  it("records an uncaught error", () => {
    installErrorHandlers();
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "page blew up",
        filename: "game.js",
        lineno: 42,
      }),
    );
    const bug = getBugs().find((b) => b.kind === "uncaught");
    expect(bug?.message).toBe("page blew up");
    expect(bug?.contexts[0]).toMatchObject({ source: "game.js", line: 42 });
  });

  it("installs only once, however many times it is called", () => {
    installErrorHandlers();
    installErrorHandlers();
    installErrorHandlers();
    clearBugs();
    window.dispatchEvent(new ErrorEvent("error", { message: "once" }));
    // Duplicate listeners would still dedupe by fingerprint, so assert on the
    // occurrence count rather than the record count.
    expect(getBugs()[0].count).toBe(1);
  });
});

describe("build stamping", () => {
  it(
    "stamps the build onto EVERY record, not just the export envelope — on " +
      "Edge both scripts share one storage key and must stay distinguishable",
    () => {
      setBuildInfo({
        packaging: "userscript",
        script: "empire-overview",
        version: "2.1.0",
      });
      reportBug("task-error", new Error("from the board"));
      expect(getBugs()[0].contexts[0].build).toMatchObject({
        script: "empire-overview",
        packaging: "userscript",
      });
    },
  );

  it("leaves the stamp undefined before any entry has declared one", () => {
    setBuildInfo(undefined as never);
    expect(getBuildInfo()).toBeUndefined();
  });
});

describe("export", () => {
  it("includes the environment and an occurrence total", () => {
    // The SAME error object reported twice: two `new Error("a")` on different
    // lines are genuinely different faults, because the fingerprint includes
    // the originating stack frame.
    const repeated = new Error("a");
    reportBug("manual", repeated);
    reportBug("manual", repeated);
    reportBug("manual", new Error("b"));
    const report = buildBugReport();
    expect(report.bugs).toHaveLength(2);
    expect(report.totalOccurrences).toBe(3);
    expect(report.environment).toHaveProperty("url");
    expect(report.environment).toHaveProperty("hasIkariamModel");
  });

  it("records which build produced the report", () => {
    // Not detectable at runtime: an extension PAGE-world script has no access to
    // chrome.runtime, so it looks identical to a userscript. Each entry declares it.
    setBuildInfo({
      packaging: "extension",
      script: "send-resources",
      version: "9.9.9",
    });
    reportBug("manual", new Error("a"));
    expect(buildBugReport().environment.build).toMatchObject({
      packaging: "extension",
      version: "9.9.9",
    });
  });

  it("exports valid JSON", () => {
    reportBug("manual", new Error("a"));
    expect(() => JSON.parse(exportBugReport())).not.toThrow();
  });

  it("summarises for display, newest first", () => {
    expect(summariseBugs()).toBe("No bugs recorded.");
    reportBug("manual", new Error("boom"));
    expect(summariseBugs()).toContain("[manual] boom");
  });

  it("clearBugs empties the store", () => {
    reportBug("manual", new Error("a"));
    clearBugs();
    expect(getBugs()).toEqual([]);
  });
});

describe("repeat throttling", () => {
  it(
    "REGRESSION: logs the first occurrence then only at 10, 100 ... " +
      "(a fault inside a 3s timer filled a live console and buried " +
      "everything else)",
    () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      for (let i = 0; i < 100; i++) reportBug("uncaught", new Error("loop"));
      expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
        "[ika] bug recorded (uncaught): loop",
        "[ika] bug recorded (uncaught): loop [x10]",
        "[ika] bug recorded (uncaught): loop [x100]",
      ]);
    },
  );

  it("still counts every occurrence", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 25; i++) reportBug("uncaught", new Error("loop"));
    expect(getBugs()[0].count).toBe(25);
  });

  it("does not re-snapshot the page on every repeat", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = vi.fn(() => ({ probe: 1 }));
    registerContextProvider(provider);
    for (let i = 0; i < 25; i++) reportBug("uncaught", new Error("loop"));
    // Once for the first occurrence; the rest land inside the re-snapshot
    // interval. The providers walk the DOM, so this is the expensive part.
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
