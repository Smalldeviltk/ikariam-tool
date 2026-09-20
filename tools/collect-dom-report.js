/* eslint-disable */
/**
 * Ikariam DOM report — paste into the browser DevTools console on a game page.
 *
 * WHY THIS EXISTS
 * The port was written against the original script's selectors, but nothing has
 * been verified against a live page. This checks every selector the userscripts
 * rely on and dumps the surrounding markup, so the assumptions can be confirmed
 * (or corrected) without guessing.
 *
 * It is READ-ONLY by default: it clicks nothing, changes nothing and sends
 * nothing. The single exception is `ikaTestTownSwitch()`, which you have to
 * invoke by hand and which does click one town in the game's own dropdown.
 *
 * HOW TO USE
 *   1. Open the game, press F12, go to the Console tab.
 *   2. Paste this whole file, press Enter. It captures the current screen and
 *      prints what is still missing.
 *   3. Go to a screen from that list and PASTE AGAIN. Repeat until the list is
 *      empty. Screens worth covering:
 *        - Trading Port -> pick another town so the shipment form appears
 *        - Trading Port main view (for `transportConfig`)
 *        - Shipyard
 *        - The Empire Overview board, Resource tab
 *   4. Then run:  ikaDump()
 *      That copies EVERY capture to the clipboard as one JSON array.
 *
 * Why paste more than once: Ikariam navigates with full page loads, which wipes
 * anything pasted into the console. Captures are therefore kept in
 * localStorage, so they survive reloads and accumulate across pastes. Watch mode
 * still picks up ajax-only transitions automatically while a page stays put.
 *
 * Other commands:
 *   ikaCapture()  capture the current screen right now
 *   ikaDump()     copy everything captured so far
 *   ikaReset()    throw the stored captures away and start over
 *   ikaStop()     stop watching this page
 *   ikaReports    the captures so far
 *
 *   ikaTestAjaxFetch()   ask the game for a town's data over ajax instead of
 *                        navigating, and dump the response shape. Defaults to
 *                        the town you are already in, so nothing changes.
 *                        Pass a city id to test switching as well.
 *
 *   ikaTestTownSwitch()  click a town in the dropdown to confirm that doing so
 *                        actually switches town (the one command that acts).
 *                        Navigation wipes the console, so paste this file again
 *                        afterwards to read the verdict.
 */
(() => {
  const MAX_HTML = 1500;
  const WATCH_INTERVAL_MS = 700;
  const WATCH_TIMEOUT_MS = 30 * 60 * 1000;
  const MAX_CAPTURES = 40;

  const snip = (html) =>
    typeof html === "string" && html.length > MAX_HTML
      ? html.slice(0, MAX_HTML) + ` …[+${html.length - MAX_HTML} chars]`
      : html;

  /** Probe one selector: how many matches, and what the first one looks like. */
  function probe(selector, opts = {}) {
    try {
      const nodes = document.querySelectorAll(selector);
      const first = nodes[0];
      const out = { selector, count: nodes.length };
      if (!first) return out;
      out.text = (first.textContent || "").trim().slice(0, 120);
      if (opts.html !== false) out.html = snip(first.outerHTML);
      if (first.id) out.id = first.id;
      if (first.className) out.class = String(first.className);
      if (first.title) out.title = first.title;
      return out;
    } catch (e) {
      // A malformed selector throws rather than returning null — worth knowing.
      return { selector, error: String(e && e.message) };
    }
  }

  function collect() {
    /* ── Which screen are we on? ─────────────────────────────────────────── */
    const view = {
      url: location.href,
      bodyId: document.body && document.body.id,
      title: document.title,
      hasTownView: !!document.querySelector("#js_cityBread"),
      hasEmpireBoard: !!document.querySelector("#empireBoard"),
      hasResTab: !!document.querySelector("#ResTab table"),
      hasPortForm: !!document.querySelector("#textfield_wine"),
      hasShipyard: !!document.querySelector("div.units.clearboth"),
    };

    /* ── Every selector the scripts depend on ────────────────────────────── */
    const selectors = {
      accountName: probe(".avatarName > a.noViewParameters"),
      townListContainer: probe(
        "#dropDown_js_citySelectContainer > div.bg > ul",
      ),
      cityBread: probe("#js_cityBread"),
      cityLink: probe("#js_cityLink > a"),

      globalMenu_maxActionPoints: probe("#js_GlobalMenu_maxActionPoints"),
      globalMenu_freeTransporters: probe("#js_GlobalMenu_freeTransporters"),
      globalMenu_freeFreighters: probe("#js_GlobalMenu_freeFreighters"),
      globalMenu_wine: probe("#js_GlobalMenu_wine"),

      position1: probe("#position1", { html: false }),
      position2: probe("#position2", { html: false }),
      cityPosition0Link: probe("#js_CityPosition0Link", { html: false }),
      buildings: probe("div[id^='position'].building:not(.buildingGround)"),
      constructionSite: probe(".constructionSite", { html: false }),
      buildingUpgradeButton: probe("#js_buildingUpgradeButton"),

      dockCities: probe(".cities.clearfix > li > a"),
      wineField: probe("#textfield_wine"),
      submit: probe("#submit"),
      freightersMaxButton: probe("#slider_freighters_max"),

      buildTabTownNames: probe("#BuildTab .city_name > span.clickable"),
      resTabRows: probe("#ResTab > table > tbody > tr", { html: false }),
      currentWood: probe("#t_currentwood"),
      woodIncome: probe("#t_woodincome > span.Green"),

      unitBlocks: probe("div.units.clearboth", { html: false }),
      merchantShipTitle: probe('[title="Merchant Ships"]', { html: false }),
      freighterTitle: probe('[title="Freighter"]', { html: false }),

      // Empire Overview hooks. `menuSlotsExpandable` is the anchor its side-panel
      // button is injected after; if that is 0 the board has no way in, however
      // healthy the rest of the script is.
      viewCityMenu: probe("#js_viewCityMenu", { html: false }),
      menuSlotsExpandable: probe(".menu_slots > .expandable", { html: false }),
      empireMenuButton: probe("li.empire_Menu", { html: false }),
      empireBoard: probe("#empireBoard", { html: false }),

      container: probe("#container", { html: false }),
      footer: probe("#footer", { html: false }),
      closeButton: probe(".close", { html: false }),
    };

    /* ── Town list: the index -> name mapping everything else keys off ───── */
    const townList = [];
    const townContainer = document.querySelector(
      "#dropDown_js_citySelectContainer > div.bg > ul",
    );
    if (townContainer) {
      Array.from(townContainer.childNodes).forEach((node, index) => {
        const first = node.childNodes && node.childNodes[0];
        townList.push({
          index,
          nodeName: node.nodeName,
          firstChildTag: first && first.nodeName,
          innerHTML: first && first.innerHTML,
          trimmed: first && String(first.innerHTML || "").trim(),
        });
      });
    }

    /* ── Town dropdown anchors: the fallback navigation path ─────────────── */
    const townAnchors = [];
    if (townContainer) {
      Array.from(townContainer.querySelectorAll("li")).forEach((li, i) => {
        const a = li.querySelector("a");
        townAnchors.push({
          i,
          selectvalue: li.getAttribute("selectvalue"),
          liClass: String(li.className || ""),
          title: a && a.getAttribute("title"),
          innerHTML: a && a.innerHTML,
          href: a && a.getAttribute("href"),
          hasOnclick: !!(a && a.getAttribute("onclick")),
          // Clicking these is how the script switches town when the Empire
          // Overview board is not open. Nothing is clicked here.
          tag: a && a.tagName,
        });
      });
    }

    /* ── ResTab wine cells: THE critical one for Auto Wine ───────────────── */
    const resTabWine = [];
    document.querySelectorAll("#ResTab > table > tbody > tr").forEach((row) => {
      const nameEl = row.querySelector("td.city_name > .clickable");
      const wineCells = row.querySelectorAll("td.resource.wine");
      resTabWine.push({
        townName: nameEl && nameEl.textContent.trim(),
        wineCellCount: wineCells.length,
        // The port reads stock from span.current and consumption from
        // span.consumption. Confirm both resolve and what they contain.
        current: (() => {
          const el = row.querySelector("td.resource.wine span.current");
          return el && el.textContent.trim();
        })(),
        consumption: (() => {
          const el = row.querySelector("td.resource.wine span.consumption");
          return el && el.textContent.trim();
        })(),
        firstRedSpan: (() => {
          const el = row.querySelector("td.resource.wine > span.Red");
          return el && el.textContent.trim();
        })(),
        cellsHtml: Array.from(wineCells).map((c) => snip(c.outerHTML)),
      });
    });

    /* ── Building slots: confirm the ids used for click targets ──────────── */
    const buildingSlots = [];
    document
      .querySelectorAll("div[id^='position'].building:not(.buildingGround)")
      .forEach((el) => {
        const hover = el.querySelector(".hoverable");
        const positionId = hover && hover.id && hover.id.trim();
        buildingSlots.push({
          slotId: el.id,
          classes: String(el.className),
          hoverableId: positionId,
          hoverableTitle: hover && hover.title,
          // The scripts do document.getElementById(positionId).click().
          // Confirm the id is unique and also valid as a CSS "#id" selector.
          idResolves: positionId ? !!document.getElementById(positionId) : null,
          idValidAsCssSelector: (() => {
            if (!positionId) return null;
            try {
              document.querySelector("#" + positionId);
              return true;
            } catch (e) {
              return false;
            }
          })(),
        });
      });

    /* ── Shipyard: how cargo capacity is calibrated ──────────────────────── */
    const shipyard = [];
    document.querySelectorAll("div.units.clearboth").forEach((block) => {
      const isMerchant = !!block.querySelector('[title="Merchant Ships"]');
      const isFreighter = !!block.querySelector('[title="Freighter"]');
      if (!isMerchant && !isFreighter) return;
      const desc = block.querySelector(".upgrade_desc");
      shipyard.push({
        unit: isMerchant ? "Merchant Ships" : "Freighter",
        upgradeDescText: desc && desc.textContent.trim(),
        // The script parses the level out of a "(N)" in that text.
        parenMatch:
          desc && (desc.textContent.trim().match(/\((\d+)\)/) || null),
      });
    });

    /* ── Port shipment form ──────────────────────────────────────────────── */
    const portForm = {
      present: !!document.querySelector("#textfield_wine"),
      fields: {},
      dockCityLinks: Array.from(
        document.querySelectorAll(".cities.clearfix > li > a"),
      ).map((a, i) => ({ i, text: a.textContent.trim() })),
    };
    ["wood", "wine", "marble", "glass", "sulfur"].forEach((r) => {
      const el = document.querySelector("#textfield_" + r);
      portForm.fields[r] = el
        ? { exists: true, value: el.value }
        : { exists: false };
    });

    /* ── Browser identity ────────────────────────────────────────────────────
     * The Empire Overview renderer switches keycode tables on a Chromium check.
     * The userscript build is deployed on EDGE, which reports
     * `navigator.vendor === "Google Inc."` for compatibility — so the flag should
     * come out true there. This captures the raw values so that can be confirmed
     * rather than assumed.
     */
    const browser = {
      vendor: navigator.vendor,
      userAgent: navigator.userAgent,
      brands:
        (navigator.userAgentData && navigator.userAgentData.brands) || null,
      isEdge: / Edg\//.test(navigator.userAgent),
      language: navigator.language,
      // Exactly what src/empire-overview/jquery.ts computes.
      vendorSaysGoogle: /Google/.test(navigator.vendor || ""),
    };

    /* ── Page globals the scripts reach for ──────────────────────────────── */
    const w = window;
    const pageGlobals = {
      hasIkariam: typeof w.ikariam !== "undefined",
      ikariamKeys:
        typeof w.ikariam === "object" && w.ikariam
          ? Object.keys(w.ikariam).slice(0, 40)
          : null,
      hasCreatePopup: !!(
        w.ikariam && typeof w.ikariam.createPopup === "function"
      ),
      templateViewId:
        w.ikariam && w.ikariam.templateView && w.ikariam.templateView.id,
      hasTransportConfig: typeof w.transportConfig !== "undefined",
      transportConfig:
        typeof w.transportConfig === "object" && w.transportConfig
          ? w.transportConfig
          : null,
      hasJQuery: typeof w.jQuery !== "undefined",
      jQueryVersion: w.jQuery && w.jQuery.fn && w.jQuery.fn.jquery,
      jQueryUiVersion: w.jQuery && w.jQuery.ui && w.jQuery.ui.version,
      hasLocalizationStrings: typeof w.LocalizationStrings !== "undefined",
    };

    /* ── ikariam.model ────────────────────────────────────────────────────
     * The scripts read these instead of scraping. They are captured with
     * their TYPES as well as their values, because the distinction that
     * matters is absent-vs-zero: a missing field lets the DOM fallback run,
     * a zero does not. Not capturing this is what turned one live bug
     * ("Not enough ships!" with 227 idle) into an inference rather than a
     * reading.
     */
    const model = (w.ikariam && w.ikariam.model) || null;
    const describe = (value) => ({
      value:
        value && typeof value === "object"
          ? Object.keys(value).slice(0, 20)
          : value,
      type: value === null ? "null" : typeof value,
    });
    const modelState = !model
      ? null
      : {
          keys: Object.keys(model).slice(0, 60),
          freeTransporters: describe(model.freeTransporters),
          freeFreighters: describe(model.freeFreighters),
          maxActionPoints: describe(model.maxActionPoints),
          wineSpendings: describe(model.wineSpendings),
          currentResources: describe(model.currentResources),
          relatedCityData: describe(model.relatedCityData),
          isOwnCity: describe(model.isOwnCity),
          producedTradegood: describe(model.producedTradegood),
        };

    /* ── Empire Overview's own city store ─────────────────────────────────
     * The board renders from this, not from the DOM. It is the only place
     * that says whether a town's data was actually RECORDED, as opposed to
     * merely visited — a scan can report every town visited while the store
     * still holds nothing for half of them.
     */
    const empireStore = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!/^\*\*\*.*\*\*\*cities$/.test(key || "")) continue;
      try {
        const cities = JSON.parse(localStorage.getItem(key) || "{}");
        Object.keys(cities).forEach((id) => {
          const city = cities[id] || {};
          const buildings = Array.isArray(city._buildings)
            ? city._buildings
            : [];
          const wine = (city._resources || {}).wine || {};
          empireStore.push({
            id,
            name: city._name,
            // The figure that matters: 0 means nothing was ever recorded.
            buildingsKnown: buildings.filter(
              (b) => b && b._name && b._name !== "buildingGround",
            ).length,
            buildingSlots: buildings.length,
            islandID: city._islandID,
            knownTime: city.knownTime
              ? new Date(city.knownTime).toISOString()
              : null,
            wineCurrent: Math.round(wine._current || 0),
            wineConsumption: wine._consumption,
            capacity: (city._capacities || {}).capacity,
          });
        });
      } catch (e) {
        empireStore.push({ key, error: String(e && e.message) });
      }
    }

    /* ── Empire Overview's ajax trace ─────────────────────────────────────
     * Written by src/empire-overview/ajax-trace.ts. Says, for each response
     * the game sent, which entry types arrived and whether they carried a
     * `position` array — and, at the moment the recorder ran, whether it
     * accepted or dropped it. This is what distinguishes "the town was never
     * navigated to" from "the data arrived and was thrown away".
     */
    let ajaxTrace = [];
    try {
      const raw = localStorage.getItem("ikaAjaxTrace");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) ajaxTrace = parsed;
    } catch (e) {
      ajaxTrace = [{ error: String(e && e.message) }];
    }

    /* ── Results of ikaTestAjaxFetch(), if it has been run ──────────────── */
    let ajaxProbe = [];
    try {
      const raw = localStorage.getItem("ikaAjaxProbe");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) ajaxProbe = parsed;
    } catch (e) {
      ajaxProbe = [{ error: String(e && e.message) }];
    }

    /* ── localStorage keys the scripts own ───────────────────────────────── */
    const interesting =
      /resource|listSender|listReceiver|listAccount|listAutoBuild|ikaGlobalTaskQueue|ika_perShipCapacity|ika_freighterCapacity|isAutoBuildStart|isAutoReload|isSendResourceHidden|reloadedMinute|loggerInfo|\*\*\*/;
    const storageKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!interesting.test(key)) continue;
      const value = localStorage.getItem(key) || "";
      storageKeys.push({
        key,
        length: value.length,
        preview: value.slice(0, 200),
      });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      view,
      browser,
      selectors,
      townList,
      townAnchors,
      resTabWine,
      buildingSlots,
      shipyard,
      portForm,
      pageGlobals,
      modelState,
      empireStore,
      ajaxTrace,
      ajaxProbe,
      storageKeys,
    };

    return report;
  }

  /** Console methods may be missing or stubbed; never let logging throw. */
  const say = (method, ...args) => {
    try {
      const fn = typeof console !== "undefined" && console && console[method];
      if (typeof fn === "function") fn.apply(console, args);
    } catch (e) {
      /* logging must never break the capture */
    }
  };

  /* ── Watch mode ─────────────────────────────────────────────────────────
   * A single paste cannot cover every screen, because the port form, the
   * shipyard and the Empire Overview board only exist while you are looking at
   * them. Rather than asking for a perfectly timed paste (which is how the
   * first two attempts both came back as the town view), capture whenever the
   * screen changes into one that is still missing.
   */

  /** Short description of the current screen, used to detect changes. */
  function screenSignature() {
    const parts = [];
    if (document.querySelector("#textfield_wine")) parts.push("port-form");
    if (document.querySelector("#ResTab table")) parts.push("empire-restab");
    if (document.querySelector("div.units.clearboth")) parts.push("shipyard");
    if (typeof window.transportConfig !== "undefined")
      parts.push("transport-config");
    if (document.querySelector("#empireBoard")) parts.push("empire-board");
    if (document.querySelector("#js_cityBread")) parts.push("town");
    return parts.join("+") || "unknown";
  }

  /** The screens still worth capturing. */
  const WANTED = {
    "port-form": "Trading Port shipment form (pick another town)",
    "empire-restab": "Empire Overview board, Resource tab",
    shipyard: "Shipyard",
    "transport-config": "Trading Port main view (transportConfig)",
  };

  /* Captures are PERSISTED to localStorage.
   *
   * Ikariam navigates with full page loads (`?view=city&...&dialog=...`), and a
   * reload wipes anything pasted into the console — which is why three separate
   * attempts at this all came back holding only the town view. Keeping the
   * captures in storage means you can paste again on each screen, or let watch
   * mode catch an ajax-only transition, and nothing is ever lost.
   */
  const STORAGE_KEY = "ikaDomReports";

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      say("log", "Could not persist captures (storage full?): " + e.message);
    }
  }

  const reports = (window.ikaReports = load());
  const seen = new Set(reports.map((r) => r.screen));

  function capture(reason) {
    const report = collect();
    report.screen = screenSignature();
    report.reason = reason || "manual";

    // Re-pasting on a screen already captured refreshes it rather than piling
    // up duplicates.
    const existing = reports.findIndex((r) => r.screen === report.screen);
    if (existing >= 0) reports[existing] = report;
    else reports.push(report);

    seen.add(report.screen);
    window.ikaReport = report;
    while (reports.length > MAX_CAPTURES) reports.shift();
    save(reports);
    return report;
  }

  function outstanding() {
    return Object.keys(WANTED).filter(
      (key) => ![...seen].some((sig) => sig.split("+").includes(key)),
    );
  }

  function printChecklist() {
    const left = outstanding();
    if (!left.length) {
      say("log", "All wanted screens captured. Run ikaDump() to copy them.");
      return;
    }
    const lines = ["Still needed:"]
      .concat(left.map((k) => "  - " + WANTED[k]))
      .concat(["Navigate there; capture happens automatically."]);
    say("log", lines.join(String.fromCharCode(10)));
  }

  let timer = null;
  let lastSignature = "";
  const startedAt = Date.now();

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
      say("log", "Stopped watching.");
    }
  }

  function tick() {
    if (Date.now() - startedAt > WATCH_TIMEOUT_MS) return stop();
    let signature;
    try {
      signature = screenSignature();
    } catch (e) {
      return;
    }
    if (signature === lastSignature) return;
    lastSignature = signature;

    const isNew = !seen.has(signature);
    const isWanted = Object.keys(WANTED).some((k) =>
      signature.split("+").includes(k),
    );
    if (!isNew || !isWanted) return;

    capture("auto");
    say("log", "captured: " + signature);
    printChecklist();
  }

  function dump() {
    const json = JSON.stringify(reports, null, 2);
    window.ikaReportsJson = json;
    let copied = false;
    try {
      if (typeof copy === "function") {
        copy(json);
        copied = true;
      }
    } catch (e) {
      /* clipboard unavailable */
    }
    say(
      "log",
      copied
        ? `Copied ${reports.length} capture(s) to the clipboard.`
        : `Clipboard unavailable. Run: copy(ikaReportsJson)  (${reports.length} capture(s))`,
    );
    return json;
  }

  /* ── AJAX endpoint probe ─────────────────────────────────────────────────
   * Step 1.1 of docs/improvement-plan.md, and the gate on the rest of it.
   *
   * IkaEasy loads a town's data without navigating, by asking the game
   * directly (js/data/city.js:52):
   *
   *   GET /?view=townHall&cityId=<id>&position=0&backgroundView=city
   *       &currentCityId=<id>&actionRequest=<token>&ajax=1
   *
   * Doing the same here would replace a 21-second town-by-town walk with a
   * handful of requests. Before any of that is written the response has to be
   * SEEN rather than assumed — guessing at things invisible from outside the
   * page is what cost four rounds on the last bug.
   *
   * SAFETY, by design:
   *   - Hand-invoked only. Never called from watch mode.
   *   - Exactly ONE request per call. No loop, no retry.
   *   - Defaults to the town you are already in, so nothing changes
   *     server-side. Pass another id only to test the switch; it says so first.
   *   - The response is NOT applied to the page. This observes the mechanism;
   *     it does not drive the game.
   */
  const AJAX_PROBE_KEY = "ikaAjaxProbe";

  /** The per-session token the game requires on every ajax request. */
  function currentActionRequest() {
    const model = window.ikariam && window.ikariam.model;
    return (model && model.actionRequest) || null;
  }

  /** The city currently selected, read from the game's own model. */
  function currentCityId() {
    const model = window.ikariam && window.ikariam.model;
    const related = model && model.relatedCityData;
    const selected = related && related.selectedCity;
    if (selected && related[selected]) {
      return parseInt(related[selected].id, 10) || null;
    }
    return null;
  }

  /** Summarise one response entry without dumping the whole payload. */
  function describeAjaxEntry(entry) {
    if (!Array.isArray(entry)) return { raw: String(entry).slice(0, 60) };
    const payload = entry[1];
    const background = payload && payload.backgroundData;
    const id =
      payload &&
      (payload.id != null ? payload.id : background && background.id);
    return {
      type: String(entry[0]),
      hasPayload: payload != null,
      // The position array is the building layout - the point of the exercise.
      hasPosition: !!(
        payload &&
        (payload.position || (background && background.position))
      ),
      cityId: id == null ? null : id,
      payloadKeys:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? Object.keys(payload).slice(0, 15)
          : null,
      backgroundKeys:
        background && typeof background === "object"
          ? Object.keys(background).slice(0, 30)
          : null,
      // Does the FETCHED town carry its own wine figures, or would they be
      // inherited from whatever town the page is actually showing? The
      // response handler deep-merges dataSetForView underneath this payload,
      // so a missing field here means the current town's number leaks into
      // every town the scan touches.
      wineSpendings: (function () {
        if (payload && payload.wineSpendings !== undefined)
          return { from: "payload", value: payload.wineSpendings };
        if (background && background.wineSpendings !== undefined)
          return { from: "backgroundData", value: background.wineSpendings };
        return { from: null, value: null };
      })(),
      // For comparison: what the page currently believes it is spending.
      pageWineSpendings: (function () {
        try {
          return window.ikariam.model.wineSpendings;
        } catch (e) {
          return null;
        }
      })(),
    };
  }

  window.ikaTestAjaxFetch = async (cityId) => {
    const actionRequest = currentActionRequest();
    const here = currentCityId();

    if (!actionRequest) {
      say("log", "No actionRequest in ikariam.model - open a town view first.");
      return;
    }
    if (!here) {
      say("log", "Could not read the current city id from ikariam.model.");
      return;
    }

    const target = typeof cityId === "number" ? cityId : here;
    if (target !== here) {
      say(
        "log",
        "NOTE: " +
          target +
          " is not the town you are in (" +
          here +
          "). " +
          "This request selects it server-side, exactly as clicking would.",
      );
    }

    const params = new URLSearchParams({
      view: "townHall",
      cityId: String(target),
      position: "0",
      backgroundView: "city",
      currentCityId: String(target),
      actionRequest: actionRequest,
      ajax: "1",
    });
    const url = "/index.php?" + params.toString();

    const startedAt = Date.now();
    const result = {
      at: new Date().toISOString(),
      requestedCityId: target,
      wasCurrentCity: target === here,
      // The token is per-session; keep it out of anything that gets pasted.
      url: url.replace(actionRequest, "<actionRequest>"),
    };

    try {
      const response = await fetch(url, { credentials: "same-origin" });
      result.httpStatus = response.status;
      result.contentType = response.headers.get("content-type");

      const text = await response.text();
      result.bodyLength = text.length;

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        result.parseError = String(e && e.message);
        result.bodyHead = text.slice(0, 300);
      }

      if (parsed !== undefined) {
        result.isArray = Array.isArray(parsed);
        result.entryCount = Array.isArray(parsed) ? parsed.length : null;
        result.entries = Array.isArray(parsed)
          ? parsed.map(describeAjaxEntry)
          : null;
        // Does a fresh token come back? If it does, every caller has to re-read
        // it or the NEXT request silently does nothing.
        result.actionRequestRotated = currentActionRequest() !== actionRequest;
      }
    } catch (e) {
      result.error = String(e && e.message);
    }

    result.elapsedMs = Date.now() - startedAt;

    try {
      const stored = JSON.parse(localStorage.getItem(AJAX_PROBE_KEY) || "[]");
      const list = Array.isArray(stored) ? stored : [];
      list.push(result);
      while (list.length > 5) list.shift();
      localStorage.setItem(AJAX_PROBE_KEY, JSON.stringify(list));
    } catch (e) {
      /* storage full or blocked; the copy on window still stands */
    }

    window.ikaAjaxProbe = result;
    say(
      "log",
      "AJAX probe finished in " +
        result.elapsedMs +
        "ms - see ikaAjaxProbe, then ikaDump()",
    );
    return result;
  };

  /* ── Town-switch probe ───────────────────────────────────────────────────
   * The ONLY part of this file that changes anything: it clicks a town in the
   * game's own dropdown to confirm that doing so actually switches town. That
   * click is the fallback `navigation.ts` relies on when the Empire Overview
   * board is absent, and it has never been verified.
   *
   * Must be invoked by hand (`ikaTestTownSwitch()`), never automatically.
   *
   * Clicking navigates, and Ikariam navigates with a full page load, which
   * destroys everything pasted into the console. The verdict therefore cannot
   * be produced in one go: the attempt is written to storage first, and the
   * NEXT paste reads it back and decides.
   */
  const SWITCH_KEY = "ikaTownSwitchTest";

  function currentTownName() {
    const el = document.querySelector("#js_cityBread");
    return el ? el.textContent.trim() : null;
  }

  function townAnchorAt(index) {
    const container = document.querySelector(
      "#dropDown_js_citySelectContainer > div.bg > ul",
    );
    if (!container) return null;
    const li = container.querySelectorAll("li")[index];
    return li ? li.querySelector("a") : null;
  }

  /** Read back a pending attempt and decide whether it worked. */
  function resolvePendingSwitchTest() {
    let pending = null;
    try {
      const raw = localStorage.getItem(SWITCH_KEY);
      pending = raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
    if (!pending || pending.verdict) return pending;

    const now = currentTownName();
    pending.after = now;
    pending.verdict =
      now && now === pending.target
        ? "WORKS"
        : now && now !== pending.before
          ? "CHANGED-BUT-NOT-TO-TARGET"
          : "NO-CHANGE";
    try {
      localStorage.setItem(SWITCH_KEY, JSON.stringify(pending));
    } catch (e) {
      /* ignore */
    }
    return pending;
  }

  window.ikaTestTownSwitch = (index) => {
    const before = currentTownName();
    if (!before) {
      say("log", "Not on a town view - open a town first.");
      return;
    }

    // Default to any town that is not the current one.
    let targetIndex = index;
    if (typeof targetIndex !== "number") {
      const container = document.querySelector(
        "#dropDown_js_citySelectContainer > div.bg > ul",
      );
      const items = container ? container.querySelectorAll("li") : [];
      targetIndex = -1;
      for (let i = 0; i < items.length; i++) {
        const a = items[i].querySelector("a");
        const name = a && (a.getAttribute("title") || a.innerHTML || "").trim();
        if (name && name !== before) {
          targetIndex = i;
          break;
        }
      }
    }

    const anchor = townAnchorAt(targetIndex);
    if (!anchor) {
      say("log", "No town anchor at index " + targetIndex);
      return;
    }
    const target = (
      anchor.getAttribute("title") ||
      anchor.innerHTML ||
      ""
    ).trim();

    try {
      localStorage.setItem(
        SWITCH_KEY,
        JSON.stringify({ before, target, targetIndex, startedAt: Date.now() }),
      );
    } catch (e) {
      /* ignore */
    }

    say("log", `Clicking "${target}" (was "${before}")...`);
    say("log", "When the page settles, PASTE THIS FILE AGAIN for the verdict.");
    anchor.click();
  };

  window.ikaCapture = () => {
    const r = capture("manual");
    say("log", "captured: " + r.screen);
    printChecklist();
    return r;
  };
  window.ikaStop = stop;
  window.ikaDump = dump;
  window.ikaReset = () => {
    reports.length = 0;
    seen.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
    say("log", "Cleared all stored captures.");
  };

  /* ── First run ─────────────────────────────────────────────────────────── */
  const first = capture("initial");
  lastSignature = first.screen;

  // If a town-switch probe was left pending by a previous paste, settle it now.
  const switchTest = resolvePendingSwitchTest();
  if (switchTest && switchTest.verdict) {
    first.townSwitchTest = switchTest;
    reports[reports.length - 1] = first;
    save(reports);
    say(
      "log",
      `Town-switch probe: ${switchTest.verdict} ` +
        `(before "${switchTest.before}", target "${switchTest.target}", now "${switchTest.after}")`,
    );
  }

  say("log", "=== Ikariam DOM report ===");
  say("log", "Captured screen: " + first.screen);

  const missing = Object.entries(first.selectors)
    .filter(([, v]) => !v.error && !v.count)
    .map(([k]) => k);
  const broken = Object.entries(first.selectors)
    .filter(([, v]) => v.error)
    .map(([k, v]) => `${k}: ${v.error}`);
  if (missing.length) say("log", "Matched nothing here:", missing.join(", "));
  if (broken.length) say("log", "Selectors that THREW:", broken.join(" | "));
  say(
    "log",
    `towns: ${first.townList.length}, anchors: ${first.townAnchors.length}, ` +
      `ResTab wine rows: ${first.resTabWine.length}, building slots: ${first.buildingSlots.length}`,
  );
  const unrecorded = first.empireStore.filter((c) => !c.buildingsKnown);
  say(
    "log",
    `Empire Overview store: ${first.empireStore.length} towns, ` +
      (unrecorded.length
        ? `NO building data for ${unrecorded.map((c) => c.name).join(", ")}`
        : "building data present for all of them"),
  );

  printChecklist();
  say("log", "Watching. When done: ikaDump()   (ikaStop() to stop early)");
  if (!first.ajaxProbe.length) {
    say(
      "log",
      "AJAX endpoint not probed yet. Run ikaTestAjaxFetch() on a town view - " +
        "one request, to the town you are already in.",
    );
  }
  if (!switchTest) {
    say(
      "log",
      "Town-switch not verified yet. Run ikaTestTownSwitch() on a town view, " +
        "then paste this file again.",
    );
  }

  timer = setInterval(tick, WATCH_INTERVAL_MS);

  return first;
})();
