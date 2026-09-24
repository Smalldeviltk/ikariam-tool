/**
 * @vitest-environment-options { "url": "https://s303-en.ikariam.gameforge.com/?view=city&cityId=297034" }
 *
 * The URL is load-bearing: `ikariam.Language()` slices it out of the host to
 * pick the translation table, so a default `localhost` URL would exercise a
 * language that does not exist rather than the boot path.
 */
/**
 * Startup smoke test: does the script survive its own boot sequence?
 *
 * Every other test here exercises one function. This one answers the question
 * the user actually asks when the board does not appear — "did anything run at
 * all?" — by evaluating `main.ts` against a synthetic Ikariam page with a real
 * jQuery, jQuery UI stubbed out, and the Tampermonkey grants in place.
 */
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** jQuery UI methods the renderer calls; absent from plain jQuery. */
const UI_METHODS = ["button", "tabs", "sortable", "draggable"] as const;

const require_ = createRequire(import.meta.url);

function installJQuery(): void {
  // A fresh copy per test on purpose. jQuery caches its DOM-ready deferred in
  // a closure, so a module-cached instance would arrive already resolved and
  // fire `$(fn)` handlers synchronously — defeating `setReadyState` below.
  delete require_.cache[require_.resolve("jquery")];
  const mod = require_("jquery");
  // jquery's entry auto-binds when a global `window` exists (it does, under
  // happy-dom); otherwise it exports a factory.
  const jq = typeof mod.fn === "undefined" ? mod(window) : mod;
  for (const name of UI_METHODS) {
    (jq.fn as any)[name] = function () {
      return this;
    };
  }
  (jq as any).ui = { version: "stub" };
  (globalThis as any).jQuery = jq;
  (globalThis as any).$ = jq;
  (window as any).jQuery = jq;
}

function installGrants(): void {
  const store = new Map<string, unknown>();
  Object.assign(globalThis as any, {
    unsafeWindow: window,
    GM_addStyle: (css: string) => {
      const el = document.createElement("style");
      el.textContent = css;
      document.head.appendChild(el);
      return el;
    },
    GM_getValue: (k: string, d?: unknown) => (store.has(k) ? store.get(k) : d),
    GM_setValue: (k: string, v: unknown) => void store.set(k, v),
    GM_deleteValue: (k: string) => void store.delete(k),
    GM_registerMenuCommand: () => 0,
    GM_xmlhttpRequest: () => undefined,
    GM_openInTab: () => undefined,
  });
}

/** The parts of the live page the boot sequence reads. */
function installPage(): void {
  document.body.id = "city";
  document.body.innerHTML = `
    <div class="avatarName"><a class="noViewParameters" title="Smalldevil"> Smalldevil</a></div>
    <div id="js_viewCityMenu">
      <ul class="menu_slots">
        <li class="expandable slot1"></li>
        <li class="expandable slot2"></li>
      </ul>
    </div>
    <div id="js_cityLink"><a href="?view=city&cityId=297034"></a></div>
    <div id="js_islandLink"><a></a></div>
    <div id="js_worldMapLink"><a></a></div>
    <div id="js_cityBread">W-Athens</div>
    <div id="container"></div>`;

  (window as any).ikariam = {
    backgroundView: { id: "city" },
    templateView: { id: "city" },
    model: {
      actionRequest: "x",
      relatedCityData: {
        selectedCity: "city_297034",
        city_297034: {
          id: 297034,
          name: "W-Athens",
          coords: "[10:20] ",
          relationship: "ownCity",
        },
      },
      currentResources: { 1: 100, 2: 100, 3: 100, 4: 100 },
      resourceProduction: 100,
      producedTradegood: 1,
    },
    controller: { executeAjaxRequest: () => undefined },
    getClass: (_c: unknown, r: unknown) => ({ responseArray: r }),
  };
  // Shape mirrors the live object: `getLocalizationStrings` flattens
  // `timeunits.short` into the top level and then drops the containers.
  (window as any).LocalizationStrings = {
    timeunits: { short: { d: "d", h: "h", m: "m", s: "s" } },
    warnings: {},
  };
  (window as any).ajaxHandlerCallFromForm = () => undefined;
  (window as any).dataSetForView = {};
}

/**
 * Pin `document.readyState` so jQuery queues `$(fn)` handlers instead of
 * running them.
 *
 * This is not cosmetic. In the browser the whole bundle is one synchronous
 * script, so every ready handler is registered before any of them runs — which
 * is what lets `resource-production.ts` assume `database.Init()` has already
 * happened. Vitest's module runner awaits each import, so without this the
 * ready timer fires part-way through the graph and the order silently differs
 * from production.
 */
function setReadyState(value: "loading" | "complete"): void {
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => value,
  });
}

/** Evaluate the entry point, then release the DOM-ready handlers. */
async function boot(): Promise<void> {
  await import("./main");
  setReadyState("complete");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Empire Overview startup", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setReadyState("loading");
    installPage();
    installJQuery();
    installGrants();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it(
    "REGRESSION: boots without throwing and injects the side-panel button " +
      "(the side-effect modules were missing from the import graph, so " +
      "`render.LoadCSS` did not exist and Init died before drawing anything)",
    async () => {
      await boot();
      expect(document.querySelectorAll("li.empire_Menu")).toHaveLength(1);
    },
  );

  it("installs the jQuery extensions the boot sequence calls", async () => {
    await boot();
    const $ = (globalThis as any).jQuery;
    expect(typeof $.mergeValues).toBe("function");
    expect(typeof $.exclusive).toBe("function");
    expect(typeof $.decodeUrlParam).toBe("function");
  });

  it("draws the board container", async () => {
    await boot();
    expect(document.querySelectorAll("#empireBoard").length).toBeGreaterThan(0);
  });

  it("renders the Resource tab", async () => {
    await boot();
    // `#ResTab` is the tab the board opens on, and the reason this script
    // exists: one row per town, wine stock and consumption among the columns.
    expect(document.querySelectorAll("#ResTab").length).toBe(1);
    expect(document.querySelectorAll("#ResTab tr").length).toBeGreaterThan(0);
  });

  it(
    "REGRESSION: still boots when the avatar block is missing (reading the " +
      "account name used to throw while the module graph was still " +
      "evaluating, i.e. before the diagnostics were installed)",
    async () => {
      document.querySelector(".avatarName")?.remove();
      await boot();
      expect(document.querySelectorAll("li.empire_Menu")).toHaveLength(1);
    },
  );

  it(
    "REGRESSION: one malformed ajax entry no longer takes down the whole " +
      "response — jQuery.Callbacks does not isolate subscribers, so a throw " +
      "here skipped every remaining entry plus parseViewData and " +
      "cityChanged, and the town that response described was never recorded",
    async () => {
      await boot();
      const { events } = await import("./events");

      const seen: unknown[] = [];
      events("updateCityData").sub((cityId: unknown) => seen.push(cityId));

      // Entries are processed from the END backwards, so the malformed one
      // goes last in the array to be hit FIRST — proving the good entry
      // after it still runs.
      expect(() =>
        events("ajaxResponse").pub([
          [
            "updateGlobalData",
            { backgroundData: { id: 297034 }, headerData: {} },
          ],
          ["updateBackgroundData"],
        ]),
      ).not.toThrow();

      expect(seen).toContain(297034);

      const reports = JSON.parse(localStorage.getItem("ikaBugReports") ?? "[]");
      expect(
        reports.some((r: any) =>
          String(r.message).includes("Malformed ajaxResponse entry"),
        ),
      ).toBe(true);
    },
  );
  it("records nothing in the bug reporter", async () => {
    await boot();
    const raw = localStorage.getItem("ikaBugReports");
    const reports = raw ? JSON.parse(raw) : [];
    expect(reports).toEqual([]);
  });
});

describe("responses to the game's own requests", () => {
  /**
   * The game's `executeAjaxRequest`, de-minified from the live page's source.
   *
   * With no callback it keeps ONE responder: the first response creates it and
   * every later one goes to its `parseResponse`. That singleton is what the
   * old hook broke by installing a fresh responder on every response.
   */
  function installGameController(jq: any) {
    const parsed: string[] = [];
    const responder = {
      parseResponse: (body: string) => void parsed.push(body),
    };
    const controller: any = {
      ajaxResponder: null,
      executeAjaxRequest(
        url: string,
        callback?: any,
        data?: unknown,
        async?: boolean,
      ) {
        const self = this;
        jq.ajax({
          async: async ?? true,
          type: "POST",
          url,
          data: data ?? null,
          success(body: string) {
            if (callback === undefined || callback === null) {
              if (self.ajaxResponder === null) {
                self.ajaxResponder = responder;
                parsed.push(body);
              } else {
                self.ajaxResponder.parseResponse(body);
              }
            } else {
              new callback(body);
            }
          },
        });
      },
    };
    (window as any).ikariam.controller = controller;
    return { controller, responder, parsed };
  }

  /** Answer every jQuery request with `body`, without touching the network. */
  function answerAllRequestsWith(jq: any, body: string): void {
    jq.ajaxTransport("+*", () => ({
      send: (_headers: unknown, complete: any) =>
        complete(200, "OK", { text: body }),
      abort: () => undefined,
    }));
  }

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setReadyState("loading");
    installPage();
    installJQuery();
    installGrants();
  });

  it(
    "REGRESSION: leave the game's own responder in charge — the hook used to " +
      "swap in a fresh responder on every response, so the game's singleton " +
      "never parsed another one and the header kept the old resource and " +
      "idle-ship counts after a manual shipment",
    async () => {
      const jq = (globalThis as any).jQuery;
      const game = installGameController(jq);
      await boot();

      const body = JSON.stringify([
        [
          "updateGlobalData",
          { headerData: {}, backgroundData: { id: 297034 } },
        ],
      ]);
      answerAllRequestsWith(jq, body);

      // What a submitted form does: `ajaxHandlerCallFromForm` passes `null`.
      (window as any).ikariam.controller.executeAjaxRequest(
        "index.php",
        null,
        "a=1&ajax=1",
        true,
      );
      (window as any).ikariam.controller.executeAjaxRequest(
        "index.php",
        null,
        "a=2&ajax=1",
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(game.controller.ajaxResponder).toBe(game.responder);
      expect(game.parsed).toEqual([body, body]);
    },
  );

  it("still hand every response array to the board", async () => {
    const jq = (globalThis as any).jQuery;
    installGameController(jq);
    await boot();
    const { events } = await import("./events");

    const seen: unknown[] = [];
    events("updateCityData").sub((cityId: unknown) => seen.push(cityId));

    answerAllRequestsWith(
      jq,
      JSON.stringify([
        [
          "updateGlobalData",
          { headerData: {}, backgroundData: { id: 297034 } },
        ],
      ]),
    );
    (window as any).ikariam.controller.executeAjaxRequest(
      "index.php?view=city&ajax=1",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toContain(297034);
  });

  it("ignores a response that is not a game response array", async () => {
    const jq = (globalThis as any).jQuery;
    installGameController(jq);
    await boot();
    const { events } = await import("./events");

    const published: unknown[] = [];
    events("ajaxResponse").sub((entries: unknown) => published.push(entries));

    answerAllRequestsWith(jq, "<html>login</html>");
    (window as any).ikariam.controller.executeAjaxRequest("index.php");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(published).toEqual([]);
  });
});

describe("the wrapper around the game's updateGlobalData", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setReadyState("loading");
    installPage();
    installJQuery();
    installGrants();
  });

  it(
    "REGRESSION: hands the game every argument and its return value — the " +
      "wrapper forwarded only the first and returned nothing, and the header " +
      "stopped refreshing after a manual shipment",
    async () => {
      const gameUpdate = vi.fn(() => "game result");
      (window as any).ikariam.model.updateGlobalData = gameUpdate;
      await boot();

      const dataSet = { producedTradegood: 1 };
      const result = (window as any).ikariam.model.updateGlobalData(
        dataSet,
        "second",
        "third",
      );

      expect(gameUpdate).toHaveBeenCalledWith(dataSet, "second", "third");
      expect(result).toBe("game result");
    },
  );

  it("still runs the game's update when there is no data set", async () => {
    const gameUpdate = vi.fn();
    (window as any).ikariam.model.updateGlobalData = gameUpdate;
    await boot();

    expect(() =>
      (window as any).ikariam.model.updateGlobalData(undefined),
    ).not.toThrow();
    expect(gameUpdate).toHaveBeenCalledTimes(1);
  });

  it("calls the game's update on the model", async () => {
    let receiver: unknown;
    (window as any).ikariam.model.updateGlobalData = function (this: unknown) {
      receiver = this;
    };
    await boot();

    const detached = (window as any).ikariam.model.updateGlobalData;
    detached({ producedTradegood: 1 });

    expect(receiver).toBe((window as any).ikariam.model);
  });
});

describe("responses fetched over http", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setReadyState("loading");
    installPage();
    installJQuery();
    installGrants();
  });

  it(
    "reach the board recorder even though the fetch happens in the other " +
      "script's bundle - the board records from the ajaxResponse event, which " +
      "the game's own ajax hook publishes, and a plain fetch does not go " +
      "through that hook",
    async () => {
      await boot();

      const { events } = await import("./events");

      // Send Resources is a SEPARATE BUNDLE with its own copy of the http
      // module, and it is the only thing that calls `fetchTown`. Resetting the
      // registry here reproduces that: without it this test shared one module
      // instance between subscriber and caller, passed, and said nothing about
      // the shipped code — where the two copies never met and a scan updated
      // nothing.
      vi.resetModules();
      const { fetchTown, resetHttpState } = await import("@core/ikariam/http");
      resetHttpState();

      const seen: unknown[] = [];
      events("updateCityData").sub((cityId: unknown) => seen.push(cityId));

      // Shaped like the response the live probe returned.
      (globalThis as any).fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html; charset=UTF-8" },
        text: async () =>
          JSON.stringify([
            [
              "updateGlobalData",
              {
                actionRequest: "x",
                headerData: {},
                backgroundData: { id: 297034, position: [] },
              },
            ],
          ]),
      }));

      await fetchTown(297034);

      expect(seen).toContain(297034);
    },
  );
});
