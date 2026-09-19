import { beforeEach, describe, expect, it } from "vitest";
import { getActionPoints, getFreeShips } from "./game-state";

/** The game's header, as captured live. */
function globalMenu(merchants: string, freighters: string, points: string) {
  return (
    `<span id="js_GlobalMenu_freeTransporters">${merchants}</span>` +
    `<span id="js_GlobalMenu_freeFreighters">${freighters}</span>` +
    `<li id="js_GlobalMenu_maxActionPoints">${points}</li>`
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
  delete (window as any).ikariam;
});

describe("getFreeShips", () => {
  it(
    "REGRESSION: trusts the rendered header over the model — with 227 " +
      "merchants idle and shown correctly, a city view's model reported 0, " +
      "and 0 is a finite number so it won through the `??`. Auto Wine " +
      'refused to start with "Not enough ships!"',
    () => {
      document.body.innerHTML = globalMenu("227", "5", "11");
      (window as any).ikariam = {
        model: { freeTransporters: 0, freeFreighters: 0, maxActionPoints: 0 },
      };

      expect(getFreeShips()).toEqual({ merchants: 227, freighters: 5 });
      expect(getActionPoints()).toBe(11);
    },
  );

  it("parses the thousands separator the header uses", () => {
    document.body.innerHTML = globalMenu("1,227", "5", "11");
    expect(getFreeShips().merchants).toBe(1227);
  });

  it("falls back to the model when the header is not rendered", () => {
    (window as any).ikariam = {
      model: { freeTransporters: 12, freeFreighters: 3, maxActionPoints: 7 },
    };
    expect(getFreeShips()).toEqual({ merchants: 12, freighters: 3 });
    expect(getActionPoints()).toBe(7);
  });

  it("reports zero rather than NaN when neither source is there", () => {
    expect(getFreeShips()).toEqual({ merchants: 0, freighters: 0 });
    expect(getActionPoints()).toBe(0);
  });

  it("keeps a genuine zero from the header", () => {
    document.body.innerHTML = globalMenu("0", "0", "0");
    (window as any).ikariam = { model: { freeTransporters: 99 } };
    expect(getFreeShips()).toEqual({ merchants: 0, freighters: 0 });
  });
});
