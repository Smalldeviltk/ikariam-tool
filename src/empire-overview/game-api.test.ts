/**
 * @vitest-environment-options { "url": "https://s303-en.ikariam.gameforge.com/?view=city" }
 *
 * `constants.ts` derives the default language from the host, so the URL has
 * to look like a real world.
 */
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require_ = createRequire(import.meta.url);

let ikariam: any;

/** Ajax navigations, captured from `document.location = "javascript:..."`. */
let ajaxCalls: string[];
/** Full page loads, captured from `window.location.assign`. */
let pageLoads: string[];
/** City ids submitted through the game's change-city form. */
let formSwitches: string[];

/** The game's town dropdown, as the live page renders it. */
function townDropdown(): string {
  return (
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    `<li selectvalue="297034" class="ownCity"><a title="W-Athens"> W-Athens</a></li>` +
    `<li selectvalue="297035" class="ownCity"><a title="M-Corinth"> M-Corinth</a></li>` +
    `</ul></div></div>`
  );
}

function setBreadcrumb(name: string): void {
  document.querySelector("#js_cityBread")!.innerHTML = name;
}

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  document.body.innerHTML =
    `<div class="avatarName"><a class="noViewParameters" title="tester"></a></div>` +
    `<div id="js_cityBread">W-Athens</div>` +
    townDropdown() +
    // The form the dropdown submits to change town.
    `<form id="changeCityForm"><input id="js_cityIdOnChange" name="cityId" value="297034"/></form>`;

  const mod = require_("jquery");
  const jq = typeof mod.fn === "undefined" ? mod(window) : mod;
  (globalThis as any).jQuery = jq;
  (globalThis as any).unsafeWindow = window;
  (window as any).ikariam = {
    backgroundView: { id: "city" },
    model: {
      actionRequest: "token",
      relatedCityData: {
        selectedCity: "city_297034",
        city_297034: { id: 297034, name: "W-Athens" },
        city_297035: { id: 297035, name: "M-Corinth" },
      },
    },
  };

  ajaxCalls = [];
  pageLoads = [];
  formSwitches = [];
  (window as any).ajaxHandlerCallFromForm = (form: HTMLFormElement) => {
    if (form.id === "changeCityForm") {
      formSwitches.push(
        (form.querySelector("#js_cityIdOnChange") as HTMLInputElement).value,
      );
    }
    return false;
  };
  Object.defineProperty(document, "location", {
    configurable: true,
    get: () => window.location,
    set: (value: string) => void ajaxCalls.push(String(value)),
  });
  vi.spyOn(window.location, "assign").mockImplementation((url) => {
    pageLoads.push(String(url));
  });

  // `constants` and `game-api` import each other; entering through
  // `constants` is the order `main.ts` relies on.
  await import("./jquery-ext");
  await import("./constants");
  ikariam = (await import("./game-api")).ikariam;
  ikariam._currentCity = null;
});

afterEach(() => {
  // Tests fake an in-flight request by raising the counter; never leak it.
  (window as any).jQuery.active = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document as any).location;
});

describe("loadUrl to another town from the city view", () => {
  const sawMill = {
    cityId: 297035,
    view: "resource",
    type: "resource",
    islandId: 55,
  };

  it(
    "REGRESSION: switches town through the game's change-city form before " +
      "opening the view — changeCurrentCity over ajax moved the dropdown but " +
      "left the old town's buildings on screen",
    () => {
      ikariam.loadUrl(true, "city", sawMill);

      expect(formSwitches).toEqual(["297035"]);
      // Nothing is opened until the town has actually switched.
      expect(ajaxCalls).toEqual([]);

      setBreadcrumb("M-Corinth");
      vi.advanceTimersByTime(100);
      expect(ajaxCalls).toEqual([]);

      // ...and had time to draw.
      vi.advanceTimersByTime(1200);
      expect(ajaxCalls).toHaveLength(1);
      expect(ajaxCalls[0]).toContain("view=resource");
      expect(ajaxCalls[0]).toContain("cityId=297035");
      expect(ajaxCalls[0]).not.toContain("changeCurrentCity");
      expect(pageLoads).toEqual([]);
    },
  );

  it(
    "REGRESSION: waits for the game to finish loading before opening the " +
      "view — opening it on a flat delay let the rest of the switch arrive " +
      "afterwards and close the dialog that had just opened",
    () => {
      const pageJQuery = (window as any).jQuery;
      ikariam.loadUrl(true, "city", sawMill);

      setBreadcrumb("M-Corinth");
      pageJQuery.active = 1;
      vi.advanceTimersByTime(3_000);
      expect(ajaxCalls).toEqual([]);

      pageJQuery.active = 0;
      vi.advanceTimersByTime(1_100);
      expect(ajaxCalls).toEqual([]);
      vi.advanceTimersByTime(200);
      expect(ajaxCalls).toHaveLength(1);
      expect(ajaxCalls[0]).toContain("view=resource");
    },
  );

  it("treats a visible loading indicator as still loading", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="loadingPreview" style="display: block"></div>`,
    );
    ikariam.loadUrl(true, "city", sawMill);

    setBreadcrumb("M-Corinth");
    vi.advanceTimersByTime(3_000);
    expect(ajaxCalls).toEqual([]);

    document.getElementById("loadingPreview")!.style.display = "none";
    vi.advanceTimersByTime(1_300);
    expect(ajaxCalls).toHaveLength(1);
  });

  it(
    "opens the view without reloading when the town switched but the game " +
      "never went quiet before the timeout",
    () => {
      const pageJQuery = (window as any).jQuery;
      ikariam.loadUrl(true, "city", sawMill);

      setBreadcrumb("M-Corinth");
      pageJQuery.active = 1;
      vi.advanceTimersByTime(15_200);

      expect(pageLoads).toEqual([]);
      expect(ajaxCalls).toHaveLength(1);
      expect(ajaxCalls[0]).not.toContain("changeCurrentCity");
      pageJQuery.active = 0;
    },
  );

  it("falls back to a full page load when the switch never lands", () => {
    ikariam.loadUrl(true, "city", sawMill);

    vi.advanceTimersByTime(15_200);

    expect(ajaxCalls).toEqual([]);
    expect(pageLoads).toHaveLength(1);
    expect(pageLoads[0]).toContain("changeCurrentCity");
    expect(pageLoads[0]).toContain("cityId=297035");
  });

  it(
    "REGRESSION: does not click the dropdown entry — a click on its link " +
      "does not switch town, so every board button waited out the timeout",
    () => {
      const clicked = vi.fn();
      document
        .querySelector('li[selectvalue="297035"] > a')!
        .addEventListener("click", clicked);

      ikariam.loadUrl(true, "city", sawMill);

      expect(clicked).not.toHaveBeenCalled();
      expect(formSwitches).toEqual(["297035"]);
    },
  );

  it("keeps the original path when the page has no change-city form", () => {
    document.querySelector("#changeCityForm")!.remove();

    ikariam.loadUrl(true, "city", sawMill);

    expect(formSwitches).toEqual([]);
    expect(ajaxCalls).toHaveLength(1);
    expect(ajaxCalls[0]).toContain("changeCurrentCity");
  });

  it("keeps the original path for a town the dropdown does not list", () => {
    ikariam.loadUrl(true, "city", { ...sawMill, cityId: 999999 });

    expect(ajaxCalls).toHaveLength(1);
    expect(ajaxCalls[0]).toContain("changeCurrentCity");
  });
});

describe("loadUrl that only changes town", () => {
  it(
    "keeps the original single request for a town name, which has always " +
      "redrawn the new town — Send Resources switches town through it",
    () => {
      ikariam.loadUrl(true, "city", { cityId: 297035 });

      expect(formSwitches).toEqual([]);
      expect(ajaxCalls).toHaveLength(1);
      expect(ajaxCalls[0]).toContain("changeCurrentCity");
      expect(ajaxCalls[0]).toContain("cityId=297035");
    },
  );
});

describe("loadUrl without a town switch", () => {
  it("opens a view of the current town straight away", () => {
    const clicked = vi.fn();
    document
      .querySelector('li[selectvalue="297034"] > a')!
      .addEventListener("click", clicked);

    ikariam.loadUrl(true, "city", {
      cityId: 297034,
      view: "townHall",
      position: 0,
    });

    expect(clicked).not.toHaveBeenCalled();
    expect(ajaxCalls).toHaveLength(1);
    expect(ajaxCalls[0]).toContain("view=townHall");
    expect(ajaxCalls[0]).not.toContain("changeCurrentCity");
  });

  it("leaves a jump to another view type to the original full page load", () => {
    ikariam.loadUrl(true, "island", { cityId: 297035, view: "island" });

    expect(ajaxCalls).toEqual([]);
    expect(pageLoads).toHaveLength(1);
    expect(pageLoads[0]).toContain("backgroundView=island");
  });
});
