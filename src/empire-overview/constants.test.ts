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
