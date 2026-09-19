import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Chromium check lives in `jquery.ts`, which throws on import when jQuery is
 * absent — so a stub is installed before each dynamic import, and the module
 * registry is reset so the constant is recomputed per case.
 */
async function detectWith(navigatorPatch: Record<string, unknown>) {
  vi.resetModules();
  (window as any).jQuery = Object.assign(() => ({}), { fn: {} });
  for (const [key, value] of Object.entries(navigatorPatch)) {
    Object.defineProperty(window.navigator, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  return await import("./jquery");
}

const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const FIREFOX_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";

beforeEach(() => {
  delete (window as any).jQuery;
});

describe("isChromium", () => {
  it(
    "is true on EDGE, which is where the userscript build is deployed — the " +
      "renderer's keycode tables depend on getting this right",
    async () => {
      const mod = await detectWith({
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "131" },
            { brand: "Microsoft Edge", version: "131" },
          ],
        },
        vendor: "Google Inc.",
        userAgent: EDGE_UA,
      });
      expect(mod.isChromium).toBe(true);
      expect(mod.isChrome).toBe(true);
    },
  );

  it("is true on Chrome", async () => {
    const mod = await detectWith({
      userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }] },
      vendor: "Google Inc.",
      userAgent: EDGE_UA.replace(/ Edg\/[\d.]+/, ""),
    });
    expect(mod.isChromium).toBe(true);
  });

  it(
    "still says true on Edge when userAgentData is missing and vendor has " +
      "been emptied — vendor is deprecated and may go away",
    async () => {
      const mod = await detectWith({
        userAgentData: undefined,
        vendor: "",
        userAgent: EDGE_UA,
      });
      expect(mod.isChromium).toBe(true);
    },
  );

  it("falls back to vendor when neither brands nor a useful UA are present", async () => {
    const mod = await detectWith({
      userAgentData: undefined,
      vendor: "Google Inc.",
      userAgent: "something opaque",
    });
    expect(mod.isChromium).toBe(true);
  });

  it("is false on Firefox", async () => {
    const mod = await detectWith({
      userAgentData: undefined,
      vendor: "",
      userAgent: FIREFOX_UA,
    });
    expect(mod.isChromium).toBe(false);
  });
});
