import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);

/** `constants.ts` reaches jQuery through `game-api.ts`, so load it first. */
let Constant: any;
beforeAll(async () => {
  const mod = require_("jquery");
  (globalThis as any).jQuery =
    typeof mod.fn === "undefined" ? mod(window) : mod;
  (globalThis as any).unsafeWindow = window;
  Constant = (await import("./constants")).Constant;
});

describe("Constant.BuildingData", () => {
  it(
    "stores the levels taken from s303 as original figures: twice the time " +
      "it shows, and the cost before its 14% research discount",
    () => {
      // s303's help page, Academy level 51: 668,834,826 wood,
      // 2,905,875,866 crystal, 2M 29D, 734 scientists.
      const academy = Constant.BuildingData.academy;
      expect(academy.wood[50]).toBe(Math.round(668_834_826 / 0.86));
      expect(academy.glass[50]).toBe(Math.round(2_905_875_866 / 0.86));
      expect(academy.time[50]).toBe(2 * 89 * 86_400);
      expect(academy.maxScientists[51]).toBe(734);
    },
  );

  it("keeps the s800 figures for levels 1-50", () => {
    // s800's help page, Academy level 50.
    expect(Constant.BuildingData.academy.wood[49]).toBe(568_954_467);
    expect(Constant.BuildingData.academy.time[49]).toBe(12_873_600);
  });
});

describe("Constant.LanguageData", () => {
  it("serves the English table for its own key", () => {
    expect(Constant.LanguageData.en.economy).toBe("Economy");
  });

  it(
    "REGRESSION: falls back to English for an untranslated language " +
      "(the board threw on every label once the `@include` stopped " +
      "restricting the script to -en worlds, and the settings panel offers " +
      "languages the table never had)",
    () => {
      for (const lang of ["de", "it", "vi", "zz", ""]) {
        expect(Constant.LanguageData[lang]).toBe(Constant.LanguageData.en);
        expect(Constant.LanguageData[lang].economy).toBe("Economy");
      }
    },
  );

  it("leaves enumeration alone", () => {
    // The proxy only intercepts reads; the table is still just `{ en: ... }`,
    // which is what the settings panel iterates to build its dropdown.
    expect(Object.keys(Constant.LanguageData)).toEqual(["en"]);
  });
});
