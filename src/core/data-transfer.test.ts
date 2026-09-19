import { beforeEach, describe, expect, it } from "vitest";
import {
  accountsInBundle,
  classifyKey,
  DEFAULT_GROUPS,
  describeBundle,
  exportData,
  importData,
  parseBundle,
  TRANSFER_FORMAT,
} from "./data-transfer";

const ACCOUNT = "Smalldevil";

/** Seed a realistic spread of the keys this project actually writes. */
function seedStorage(): void {
  // config
  localStorage.setItem(`${ACCOUNT}listSender`, '["0"]');
  localStorage.setItem(`${ACCOUNT}listReceiver`, '[{"townNumber":"1"}]');
  localStorage.setItem("listAutoBuild", '[{"accountName":"Smalldevil"}]');
  localStorage.setItem("ika_perShipCapacity", "620");
  localStorage.setItem("ika_freighterCapacity", "53000");
  localStorage.setItem(`***${ACCOUNT}***settings`, '{"onTop":true}');
  // measurements
  localStorage.setItem(`${ACCOUNT}ikaTownStats`, '{"W-Athens":{"stock":1}}');
  localStorage.setItem("listAccount", '[{"account":"Smalldevil"}]');
  // runtime
  localStorage.setItem(`${ACCOUNT}ikaGlobalTaskQueue`, '[{"id":"x"}]');
  localStorage.setItem(`${ACCOUNT}resource`, '{"isStart":true}');
  localStorage.setItem("isAutoBuildStart", "true");
  // diagnostics
  localStorage.setItem("loggerInfo", "some log");
  localStorage.setItem("ikaBugReports", "[]");
  // not ours
  localStorage.setItem("someGameKey", "leave me alone");
}

beforeEach(() => {
  localStorage.clear();
  seedStorage();
});

describe("classifyKey", () => {
  it("recognises global keys", () => {
    expect(classifyKey("listAutoBuild")).toMatchObject({
      group: "config",
      account: null,
    });
  });

  it("splits an account prefix off a suffix key", () => {
    expect(classifyKey(`${ACCOUNT}listSender`)).toMatchObject({
      group: "config",
      account: ACCOUNT,
      suffix: "listSender",
    });
  });

  it("recognises the Empire Overview *** scheme", () => {
    expect(classifyKey(`***${ACCOUNT}***settings`)).toMatchObject({
      group: "config",
      account: ACCOUNT,
      suffix: "settings",
    });
  });

  it("matches the longest suffix, so listReceiver is not mistaken", () => {
    // A shorter accidental match would file this under the wrong group.
    expect(classifyKey(`${ACCOUNT}listReceiver`)?.suffix).toBe("listReceiver");
  });

  it("ignores keys that are not ours", () => {
    expect(classifyKey("someGameKey")).toBeNull();
    expect(classifyKey("")).toBeNull();
  });

  it("does not treat a bare suffix as account-scoped", () => {
    // `resource` with nothing in front has no account, so it is not ours.
    expect(classifyKey("resource")).toBeNull();
  });
});

describe("exportData", () => {
  it("includes config and measurements by default", () => {
    const groups = new Set(exportData().entries.map((e) => e.group));
    expect(groups).toEqual(new Set(["config", "measurements"]));
  });

  it(
    "EXCLUDES runtime state by default — two browsers sharing one queue would " +
      "both drive a single game account",
    () => {
      const keys = exportData().entries.map((e) => e.key);
      expect(keys).not.toContain(`${ACCOUNT}ikaGlobalTaskQueue`);
      expect(keys).not.toContain("isAutoBuildStart");
    },
  );

  it("excludes diagnostics by default", () => {
    const keys = exportData().entries.map((e) => e.key);
    expect(keys).not.toContain("loggerInfo");
    expect(keys).not.toContain("ikaBugReports");
  });

  it("never touches keys belonging to the game", () => {
    const keys = exportData({
      groups: ["config", "measurements", "runtime", "diagnostics"],
    }).entries.map((e) => e.key);
    expect(keys).not.toContain("someGameKey");
  });

  it("can include runtime when explicitly asked", () => {
    const keys = exportData({ groups: ["runtime"] }).entries.map((e) => e.key);
    expect(keys).toContain(`${ACCOUNT}ikaGlobalTaskQueue`);
  });

  it("filters to one account but keeps global keys", () => {
    localStorage.setItem("OtherGuylistSender", '["9"]');
    const keys = exportData({ account: ACCOUNT }).entries.map((e) => e.key);
    expect(keys).toContain(`${ACCOUNT}listSender`);
    expect(keys).not.toContain("OtherGuylistSender");
    expect(keys).toContain("listAutoBuild");
  });

  it("stamps a format tag and a version", () => {
    const bundle = exportData();
    expect(bundle.format).toBe(TRANSFER_FORMAT);
    expect(bundle.version).toBeGreaterThan(0);
  });
});

describe("parseBundle", () => {
  it("rejects non-JSON", () => {
    expect(() => parseBundle("{not json")).toThrow(/valid JSON/);
  });

  it("rejects a file from somewhere else", () => {
    expect(() => parseBundle('{"hello":"world"}')).toThrow(/not produced/);
  });

  it("rejects a newer format than this build understands", () => {
    expect(() =>
      parseBundle(
        JSON.stringify({ format: TRANSFER_FORMAT, version: 999, entries: [] }),
      ),
    ).toThrow(/Unsupported export version/);
  });

  it("rejects a bundle with no entries array", () => {
    expect(() =>
      parseBundle(JSON.stringify({ format: TRANSFER_FORMAT, version: 1 })),
    ).toThrow(/no entries/);
  });
});

describe("importData", () => {
  it("round-trips config and measurements into an empty store", () => {
    const json = JSON.stringify(exportData());
    localStorage.clear();

    const result = importData(json);
    expect(result.imported).toBeGreaterThan(0);
    expect(localStorage.getItem(`${ACCOUNT}listSender`)).toBe('["0"]');
    expect(localStorage.getItem("ika_perShipCapacity")).toBe("620");
    expect(localStorage.getItem(`${ACCOUNT}ikaTownStats`)).toContain(
      "W-Athens",
    );
  });

  it("does not resurrect runtime state that was never exported", () => {
    const json = JSON.stringify(exportData());
    localStorage.clear();
    importData(json);
    expect(localStorage.getItem(`${ACCOUNT}ikaGlobalTaskQueue`)).toBeNull();
  });

  it("overwrites by default", () => {
    const json = JSON.stringify(exportData());
    localStorage.setItem(`${ACCOUNT}listSender`, '["999"]');
    importData(json);
    expect(localStorage.getItem(`${ACCOUNT}listSender`)).toBe('["0"]');
  });

  it("can preserve what is already there", () => {
    const json = JSON.stringify(exportData());
    localStorage.setItem(`${ACCOUNT}listSender`, '["999"]');
    const result = importData(json, { overwrite: false });
    expect(localStorage.getItem(`${ACCOUNT}listSender`)).toBe('["999"]');
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("remaps account-scoped keys onto a different account", () => {
    const json = JSON.stringify(exportData());
    localStorage.clear();

    importData(json, { remapAccountTo: "OtherGuy" });
    expect(localStorage.getItem("OtherGuylistSender")).toBe('["0"]');
    expect(localStorage.getItem(`${ACCOUNT}listSender`)).toBeNull();
    // Global keys carry no account and must be left alone.
    expect(localStorage.getItem("ika_perShipCapacity")).toBe("620");
  });

  it("remaps the Empire Overview *** scheme correctly", () => {
    const json = JSON.stringify(exportData());
    localStorage.clear();
    importData(json, { remapAccountTo: "OtherGuy" });
    expect(localStorage.getItem("***OtherGuy***settings")).toBe(
      '{"onTop":true}',
    );
  });

  it("honours a narrower group selection on import", () => {
    const json = JSON.stringify(
      exportData({ groups: ["config", "measurements"] }),
    );
    localStorage.clear();
    importData(json, { groups: ["config"] });
    expect(localStorage.getItem(`${ACCOUNT}listSender`)).toBe('["0"]');
    expect(localStorage.getItem(`${ACCOUNT}ikaTownStats`)).toBeNull();
  });
});

describe("describeBundle", () => {
  it("summarises counts and accounts", () => {
    const bundle = exportData();
    const text = describeBundle(bundle);
    expect(text).toContain("entries");
    expect(text).toContain(ACCOUNT);
  });

  it("lists the accounts present", () => {
    expect(accountsInBundle(exportData())).toEqual([ACCOUNT]);
  });

  it("copes with a bundle of global data only", () => {
    localStorage.clear();
    localStorage.setItem("ika_perShipCapacity", "620");
    expect(accountsInBundle(exportData())).toEqual([]);
    expect(describeBundle(exportData())).toContain("global data only");
  });
});

describe("DEFAULT_GROUPS", () => {
  it("is config plus measurements, and nothing riskier", () => {
    expect(DEFAULT_GROUPS).toEqual(["config", "measurements"]);
  });
});
