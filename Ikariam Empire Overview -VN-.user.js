// ==UserScript==
// @name         Ikariam Empire Overview -VN-
// @namespace    Smalldevil
// @version      2.1.0
// @author       Smalldevil
// @description  Empire-wide overview of towns, resources, army, buildings and research. Adapted from Empire Overview for the -VN- alliance.
// @license      GPL version 3 or any later version
// @include      *://*.ikariam.gameforge.*/*
// @exclude      *://board.*.ikariam.gameforge.*/*
// @exclude      *://*.ikariam.gameforge.*/board*
// @require      https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js
// @require      https://ajax.googleapis.com/ajax/libs/jqueryui/1.9.2/jquery-ui.min.js
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  "use strict";
  function installJQueryCompat(jq) {
    const legacy = jq;
    const added = [];
    const ensure = (name, value) => {
      if (typeof legacy[name] !== "function") {
        legacy[name] = value;
        added.push(String(name));
      }
    };
    ensure("now", () => Date.now());
    ensure(
      "isNumeric",
      (value) =>
        (typeof value === "number" || typeof value === "string") &&
        !isNaN(value - parseFloat(value)),
    );
    ensure("isArray", (value) => Array.isArray(value));
    ensure("isFunction", (value) => typeof value === "function");
    ensure("isWindow", (value) => value != null && value === value.window);
    ensure("trim", (value) => (value == null ? "" : String(value).trim()));
    ensure("parseJSON", (value) => JSON.parse(value));
    ensure("proxy", (fn, context) => fn.bind(context));
    ensure("type", (value) => {
      if (value === null) return "null";
      if (value === void 0) return "undefined";
      if (Array.isArray(value)) return "array";
      return typeof value;
    });
    return added;
  }
  var jq = typeof jQuery !== "undefined" ? jQuery : window.jQuery;
  if (!jq)
    throw new Error(
      "jQuery not found — check the @require lines in the userscript header",
    );
  installJQueryCompat(jq);
  function pageJQuery() {
    const candidate = unsafeWindow.jQuery || unsafeWindow.$;
    return typeof candidate === "function" ? candidate : void 0;
  }
  function detectChromium() {
    const nav = window.navigator;
    const brands = nav.userAgentData?.brands;
    if (Array.isArray(brands) && brands.length)
      return brands.some((entry) =>
        /Chromium|Google Chrome|Edge/i.test(entry?.brand ?? ""),
      );
    if (/Google/.test(nav.vendor ?? "")) return true;
    return /Chrome|Chromium|Edg\//.test(nav.userAgent ?? "");
  }
  var isChromium = detectChromium();
  var isChrome = isChromium;
  jq.extend({
    exclusive: function (arr) {
      return jq.grep(arr, function (v, k) {
        return jq.inArray(v, arr) === k;
      });
    },
    mergeValues: function (a, b, c) {
      var length = arguments.length;
      if (
        length == 1 ||
        typeof arguments[0] !== "object" ||
        typeof arguments[1] !== "object"
      )
        return arguments[0];
      var args = jQuery.makeArray(arguments);
      var i = 1;
      var target = args[0];
      for (; i < length; i++) {
        var copy = args[i];
        for (var name in copy) {
          if (!target.hasOwnProperty(name)) {
            target[name] = copy[name];
            continue;
          }
          if (typeof target[name] == "object" && typeof copy[name] == "object")
            target[name] = jQuery.mergeValues(target[name], copy[name]);
          else if (copy.hasOwnProperty(name) && copy[name] !== void 0)
            target[name] = copy[name];
        }
      }
      return target;
    },
    decodeUrlParam: function (string) {
      var str = string.split("?").pop().split("&");
      var obj = {};
      for (var i = 0; i < str.length; i++) {
        var param = str[i].split("=");
        if (param.length !== 2) continue;
        obj[param[0]] = decodeURIComponent(param[1].replace(/\+/g, " "));
      }
      return obj;
    },
  });
  function errorMessage(error) {
    if (error instanceof Error) return error.message;
    return String(error);
  }
  var DEFAULT_TIMEOUT_MS = 15e3;
  function waitFor(predicate, options = {}) {
    const {
      intervalMs = 200,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      label = "waitFor",
    } = options;
    const deadline = timeoutMs === Infinity ? Infinity : Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      let lastError;
      const tick = () => {
        let value;
        try {
          value = predicate();
          lastError = void 0;
        } catch (error) {
          value = null;
          lastError = error;
        }
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() >= deadline) {
          const reason =
            lastError === void 0
              ? ""
              : ` (last check threw: ${errorMessage(lastError)})`;
          reject(
            new Error(`${label}: timed out after ${timeoutMs}ms${reason}`),
          );
          return;
        }
        setTimeout(tick, intervalMs);
      };
      setTimeout(tick, intervalMs);
    });
  }
  function qs(selector, root = document) {
    return root.querySelector(selector);
  }
  var SEL = {
    accountName: ".avatarName > a.noViewParameters",
    accountBlock: ".avatarName",
    townListContainer: "#dropDown_js_citySelectContainer > div.bg > ul",
    cityBread: "#js_cityBread",
    changeCityForm: "#changeCityForm",
    changeCityInput: "#js_cityIdOnChange",
    loadingIndicator: "#loadingPreview",
    cityLink: "#js_cityLink > a",
    backlinkButton: "#js_backlinkButton",
    globalMenu: {
      maxActionPoints: "#js_GlobalMenu_maxActionPoints",
      freeTransporters: "#js_GlobalMenu_freeTransporters",
      freeFreighters: "#js_GlobalMenu_freeFreighters",
      wine: "#js_GlobalMenu_wine",
      resource: (resource) =>
        `#js_GlobalMenu_${resource === "glass" ? "crystal" : resource}`,
    },
    position: (n) => `#position${n}`,
    cityPositionLink: (n) => `#js_CityPosition${n}Link`,
    buildings: "div[id^='position'].building:not(.buildingGround)",
    winePress: "div[id^='position'].building.vineyard",
    buildingHover: ".hoverable",
    constructionSite: ".constructionSite",
    safehouse: "div.building.safehouse > a",
    buildingUpgradeButton: "#js_buildingUpgradeButton",
    dockCities: ".cities.clearfix > li > a",
    resourceField: (resource) => `#textfield_${resource}`,
    wineField: "#textfield_wine",
    submit: "#submit",
    freightersMaxButton: "#slider_freighters_max",
    setMax: ".setMax",
    buildTabTownNames: "#BuildTab .city_name > span.clickable",
    resTabRows: "#ResTab > table > tbody > tr",
    resTabTownName: "td.city_name > .clickable",
    resTabWineStock: "td.resource.wine span.current",
    resTabWineConsumption: "td.resource.wine span.consumption",
    resTabWineConsumed: "td.resource.wine > span.Red",
    currentWood: "#t_currentwood",
    woodIncome: "#t_woodincome > span.Green",
    barbarianVillageResources: "#barbarianVillage ul.resources",
    barbarianFleetResources: "#barbarianFleet ul.resources",
    unitBlocks: "div.units.clearboth",
    merchantShipTitle: '[title="Merchant Ships"]',
    freighterTitle: '[title="Freighter"]',
    upgradeDesc: ".upgrade_desc",
    container: "#container",
    footer: "#footer",
    closeButton: ".close",
  };
  var pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  function readAccountName() {
    const anchor = qs(SEL.accountName);
    if (anchor) return anchor.title || anchor.textContent?.trim() || "";
    return qs(SEL.accountBlock)?.textContent?.trim() ?? "";
  }
  function getCurrentTownName() {
    return qs(SEL.cityBread)?.textContent?.trim() ?? "";
  }
  var BUG_REPORT_STORAGE_KEY = "ikaBugReports";
  var MAX_RECORDS = 50;
  var MAX_STACK = 2e3;
  var MAX_MESSAGE = 500;
  var MAX_FINGERPRINT = 300;
  var RESNAPSHOT_INTERVAL_MS = 6e4;
  function isLogWorthy(count) {
    if (count < 1) return false;
    let n = count;
    while (n % 10 === 0) n /= 10;
    return n === 1;
  }
  var buildInfo = null;
  function setBuildInfo(info) {
    buildInfo = info;
  }
  var providers = [];
  function registerContextProvider(provider) {
    providers.push(provider);
  }
  function collectContext(extra) {
    const context = {
      at: Date.now(),
      build: buildInfo ?? void 0,
      ...extra,
    };
    for (const provider of providers)
      try {
        Object.assign(context, provider());
      } catch (e) {
        context.providerError = String(e?.message ?? e);
      }
    return context;
  }
  function load$1() {
    try {
      const raw = localStorage.getItem(BUG_REPORT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function save(records) {
    try {
      localStorage.setItem(BUG_REPORT_STORAGE_KEY, JSON.stringify(records));
    } catch {}
  }
  function fingerprintOf(kind, message, stack) {
    return `${kind}|${message}|${(stack?.split("\n").find((line) => /\s+at\s+/.test(line)) ?? "").trim()}`.slice(
      0,
      MAX_FINGERPRINT,
    );
  }
  var reporting = false;
  function reportBug(kind, error, extra) {
    if (reporting) return;
    reporting = true;
    try {
      const isError = error instanceof Error;
      const message = String(
        (isError ? error.message : error?.message) ?? error ?? "unknown",
      ).slice(0, MAX_MESSAGE);
      const stack = isError ? error.stack?.slice(0, MAX_STACK) : void 0;
      const fingerprint = fingerprintOf(kind, message, stack);
      const records = load$1();
      const existing = records.find((r) => r.fingerprint === fingerprint);
      if (existing) {
        const now = Date.now();
        existing.count += 1;
        existing.lastAt = now;
        const newest = existing.contexts[existing.contexts.length - 1];
        if (!newest || now - newest.at >= RESNAPSHOT_INTERVAL_MS)
          existing.contexts = [
            existing.contexts[0],
            ...existing.contexts.slice(1),
            collectContext(extra),
          ]
            .filter(Boolean)
            .slice(-3);
      } else {
        const context = collectContext(extra);
        records.push({
          fingerprint,
          kind,
          message,
          stack,
          count: 1,
          firstAt: context.at,
          lastAt: context.at,
          contexts: [context],
        });
        while (records.length > MAX_RECORDS) records.shift();
      }
      save(records);
      const count = existing ? existing.count : 1;
      if (isLogWorthy(count))
        console.warn(
          `[ika] bug recorded (${kind}): ${message}` +
            (count > 1 ? ` [x${count}]` : ""),
        );
    } catch {
    } finally {
      reporting = false;
    }
  }
  var handlersInstalled = false;
  function installErrorHandlers() {
    if (handlersInstalled) return;
    handlersInstalled = true;
    window.addEventListener("error", (event) => {
      reportBug("uncaught", event.error ?? new Error(event.message), {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      reportBug("unhandled-rejection", event.reason);
    });
  }
  var RESPONSE_EVENT = "ika:ajaxResponse";
  var listeners = [];
  function onResponse(handler) {
    const listener = (event) => {
      const detail = event.detail;
      if (!Array.isArray(detail)) return;
      try {
        handler(detail);
      } catch {}
    };
    listeners.push(listener);
    document.addEventListener(RESPONSE_EVENT, listener);
    return () => {
      document.removeEventListener(RESPONSE_EVENT, listener);
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }
  function boardHealth() {
    const has = (selector) => jq(selector).length;
    return {
      menuButton: has(".empire_Menu"),
      board: has("#empireBoard"),
      tabs: has("#empire_Tabs"),
      resTabRows: has("#ResTab > table > tbody > tr"),
      buildTab: has("#BuildTab"),
      armyTab: has("#ArmyTab"),
    };
  }
  function empireContext() {
    const page = pageWindow;
    return {
      board: boardHealth(),
      isChromium,
      jQuery: jq.fn?.jquery ?? null,
      jQueryUi: jq.ui?.version ?? null,
      hasIkariamModel: !!page.ikariam?.model,
      hasLocalizationStrings: typeof page.LocalizationStrings !== "undefined",
      templateView: page.ikariam?.templateView?.id ?? null,
      bodyId: document.body?.id ?? null,
    };
  }
  var installed = false;
  function installEmpireDiagnostics(packaging, version) {
    if (installed) return;
    installed = true;
    setBuildInfo({
      packaging,
      script: "empire-overview",
      version,
    });
    registerContextProvider(empireContext);
    installErrorHandlers();
  }
  function getModel() {
    const model = pageWindow.ikariam?.model;
    return model && typeof model === "object" ? model : null;
  }
  function numberOrNull(value) {
    const parsed = typeof value === "string" ? Number(value) : value;
    return typeof parsed === "number" && Number.isFinite(parsed)
      ? parsed
      : null;
  }
  function winePressLevel() {
    if (!qs(SEL.buildings)) return null;
    const press = qs(SEL.winePress);
    if (!press) return 0;
    const match = /\blevel(\d+)\b/.exec(press.className);
    return match ? Number(match[1]) : 0;
  }
  function modelWineConsumption() {
    const spendings = numberOrNull(getModel()?.wineSpendings);
    if (spendings === null) return null;
    const press = winePressLevel();
    if (press === null) return null;
    return (
      (Math.abs(spendings) * (100 - Math.min(50, Math.max(0, press)))) / 100
    );
  }
  function modelCityName(cityId) {
    const city = getModel()?.relatedCityData?.[`city_${cityId}`];
    if (typeof city !== "object" || city === null) return null;
    const name = city.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }
  var TRACE_STORAGE_KEY = "ikaAjaxTrace";
  var MAX_ENTRIES = 40;
  function load() {
    try {
      const raw = localStorage.getItem(TRACE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function trace(kind, data) {
    try {
      const records = load();
      records.push({
        at: Date.now(),
        kind,
        ...data,
      });
      while (records.length > MAX_ENTRIES) records.shift();
      localStorage.setItem(TRACE_STORAGE_KEY, JSON.stringify(records));
      unsafeWindow.ikaAjaxTrace = records;
    } catch {}
  }
  function describeEntry(entry) {
    if (!Array.isArray(entry)) return { raw: String(entry).slice(0, 60) };
    const payload = entry[1];
    const background = payload && payload.backgroundData;
    return {
      type: String(entry[0]),
      hasPayload: payload != null,
      hasPosition: !!(
        payload &&
        (payload.position || (background && background.position))
      ),
      cityId:
        (payload && (payload.id ?? (background && background.id))) ?? null,
    };
  }
  var events = (function () {
    var _events = {};
    var retEvents = function (id) {
      var callbacks,
        topic = id && _events[id];
      if (!topic) {
        callbacks = jq.Callbacks("");
        topic = {
          pub: callbacks.fire,
          sub: callbacks.add,
          unsub: callbacks.remove,
        };
        if (id) _events[id] = topic;
      }
      return topic;
    };
    retEvents.scheduleAction = function (callback, time) {
      return clearTimeout.bind(void 0, setTimeout(callback, time || 0));
    };
    retEvents.scheduleActionAtTime = function (callback, time) {
      return retEvents.scheduleAction(
        callback,
        time - jq.now() > 0 ? time - jq.now() : 0,
      );
    };
    retEvents.scheduleActionAtInterval = function (callback, time) {
      return clearInterval.bind(void 0, setInterval(callback, time));
    };
    return retEvents;
  })();
  function Building(city, pos) {
    this._position = pos;
    this._level = 0;
    this._name = null;
    this.city = Utils.wrapInClosure(city);
    this._updateTimer = null;
    this._statusPoll = null;
  }
  Building.prototype = {
    startUpgradeTimer: function () {
      if (this._updateTimer) {
        this._updateTimer();
        delete this._updateTimer;
      }
      if (this._statusPoll) {
        this._statusPoll();
        delete this._statusPoll;
      }
      if (this._completionTime)
        if (this._completionTime - jq.now() < 5e3) this.completeUpgrade();
        else
          this._updateTimer = events.scheduleActionAtTime(
            this.completeUpgrade.bind(this),
            this._completionTime - 4e3,
          );
      this._statusPoll = function (a, b) {
        return events.scheduleActionAtInterval(
          function () {
            if (a != this.isUpgradable || b != this.isUpgrading) {
              var changes = {
                position: this._position,
                name: this.getName,
                upgraded: this.isUpgrading != b,
              };
              events(Constant.Events.BUILDINGS_UPDATED).pub([changes]);
              a = this.isUpgradable;
              b = this.isUpgrading;
            }
          }.bind(this),
          3e3,
        );
      }.call(this, this.isUpgradable, this.isUpgrading);
    },
    update: function (data) {
      var changes;
      var name = data.building.split(" ")[0];
      var level = parseInt(data.level) || 0;
      database.getGlobalData.addLocalisedString(name, data.name);
      var completion =
        "undefined" !== typeof data.completed ? parseInt(data.completed) : 0;
      var changed =
        name !== this._name ||
        level !== this._level ||
        !!completion != this.isUpgrading;
      if (changed)
        changes = {
          position: this._position,
          name: this.getName,
          upgraded: this.isUpgrading != !completion,
        };
      if (completion) {
        this._completionTime = completion * 1e3;
        this.startUpgradeTimer();
      } else if (this._completionTime) delete this._completionTime;
      this._name = name;
      this._level = level;
      if (changed) return changes;
      return false;
    },
    get getUrlParams() {
      return {
        view: this.getName,
        cityId: this.city().getId,
        position: this.getPosition,
      };
    },
    get getUpgradeCost() {
      var level = this._level + this.isUpgrading;
      if (this.isEmpty)
        return {
          wood: Infinity,
          glass: 0,
          marble: 0,
          sulfur: 0,
          wine: 0,
          time: 0,
        };
      var time = Constant.BuildingData[this._name].time;
      var bon = 1;
      var bonTime =
        1 +
        Constant.GovernmentData[database.getGlobalData.getGovernmentType]
          .buildingTime;
      bon -= database.getGlobalData.getResearchTopicLevel(
        Constant.Research.Economy.PULLEY,
      )
        ? 0.02
        : 0;
      bon -= database.getGlobalData.getResearchTopicLevel(
        Constant.Research.Economy.GEOMETRY,
      )
        ? 0.04
        : 0;
      bon -= database.getGlobalData.getResearchTopicLevel(
        Constant.Research.Economy.SPIRIT_LEVEL,
      )
        ? 0.08
        : 0;
      const reductionBy = (buildingName) => {
        const building = this.city().getBuildingFromName(buildingName);
        return building ? Math.min(building.getLevel, 50) / 100 : 0;
      };
      const reducedCost = (resource, buildingName) =>
        Math.round(
          (Constant.BuildingData[this._name][resource][level] || 0) *
            (bon - reductionBy(buildingName)),
        );
      return {
        wood: reducedCost("wood", Constant.Buildings.CARPENTER),
        wine: reducedCost("wine", Constant.Buildings.VINEYARD),
        marble: reducedCost("marble", Constant.Buildings.ARCHITECT),
        glass: reducedCost("glass", Constant.Buildings.OPTICIAN),
        sulfur: reducedCost("sulfur", Constant.Buildings.FIREWORK_TEST_AREA),
        time: (time[level] || 0) * 1e3 * bonTime,
      };
    },
    get getName() {
      return this._name;
    },
    get getType() {
      return Constant.BuildingData[this.getName].type;
    },
    get getLevel() {
      return this._level;
    },
    get isEmpty() {
      return this._name == "buildingGround" || this._name === null;
    },
    get isUpgrading() {
      return this._completionTime > jq.now();
    },
    subtractUpgradeResourcesFromCity: function () {
      var cost = this.getUpgradeCost;
      jq.each(
        Constant.Resources,
        function (key, resourceName) {
          this.city()
            .getResource(resourceName)
            .increment(cost[resourceName] * -1);
        }.bind(this),
      );
      this._completionTime = jq.now() + cost.time;
    },
    get isUpgradable() {
      if (this.isEmpty || this.isMaxLevel) return false;
      var cost = this.getUpgradeCost;
      var upgradable = true;
      jq.each(
        Constant.Resources,
        function (key, value) {
          upgradable =
            upgradable &&
            (!cost[value] ||
              cost[value] <= this.city().getResource(value).getCurrent);
        }.bind(this),
      );
      return upgradable;
    },
    get getCompletionTime() {
      return this._completionTime;
    },
    get getCompletionDate() {},
    get isMaxLevel() {
      var maxLevel = Constant.BuildingData[this.getName].maxLevel;
      return maxLevel > 0 && this.getLevel >= maxLevel;
    },
    get getPosition() {
      return this._position;
    },
    completeUpgrade: function () {
      this._level++;
      delete this._completionTime;
      delete this._updateTimer;
      events(Constant.Events.BUILDINGS_UPDATED).pub(this.city().getId, [
        {
          position: this._position,
          name: this.getName,
          upgraded: true,
        },
      ]);
    },
  };
  function CityResearch(city) {
    this._researchersLastUpdate = 0;
    this._researchers = 0;
    this._researchCostLastUpdate = 0;
    this._researchCost = 0;
    this.city = Utils.wrapInClosure(city);
  }
  CityResearch.prototype = {
    updateResearchers: function (researchers) {
      var changed = this._researchers !== researchers;
      this._researchers = researchers;
      this._researchersLastUpdate = jq.now();
      this._researchCost = this.getResearchCost;
      return changed;
    },
    updateCost: function (cost) {
      var changed = this._researchCost !== cost;
      this._researchCost = cost;
      this._researchCostLastUpdate = jq.now();
      this._researchers = this.getResearchers;
      return changed;
    },
    get getResearchers() {
      if (this._researchersLastUpdate < this._researchCostLastUpdate)
        return Math.floor(this._researchCost / this._researchCostModifier);
      else return this._researchers;
    },
    get getResearch() {
      return this.researchData.total;
    },
    get researchData() {
      if (!this._researchData)
        this._researchData = Utils.cacheFunction(
          this.researchDataCached.bind(this),
          1e3,
        );
      return this._researchData();
    },
    researchDataCached: function () {
      var resBon =
        0 +
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Science.PAPER,
        ) *
          0.02 +
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Science.INK,
        ) *
          0.04 +
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Science.MECHANICAL_PEN,
        ) *
          0.08 +
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Science.SCIENTIFIC_FUTURE,
        ) *
          0.02;
      var premBon = database.getGlobalData.hasPremiumFeature(
        Constant.Premium.RESEARCH_POINTS_BONUS_EXTREME_LENGTH,
      )
        ? 0 +
          Constant.PremiumData[
            Constant.Premium.RESEARCH_POINTS_BONUS_EXTREME_LENGTH
          ].bonus
        : database.getGlobalData.hasPremiumFeature(
              Constant.Premium.RESEARCH_POINTS_BONUS,
            )
          ? 0 +
            Constant.PremiumData[Constant.Premium.RESEARCH_POINTS_BONUS].bonus
          : 0;
      var goods =
        Constant.GovernmentData[database.getGlobalData.getGovernmentType]
          .researchPerCulturalGood * this.city()._culturalGoods;
      var researchers = this.getResearchers;
      var corruptionSpend = researchers * this.city().getCorruption;
      var nonCorruptedResearchers =
        researchers * (1 - this.city().getCorruption);
      var premiumResBonus = nonCorruptedResearchers * premBon;
      var researchBonus = nonCorruptedResearchers * resBon;
      var premiumGoodsBonus = goods * premBon;
      var serverTyp = 1;
      if (ikariam.Server() == "s201" || ikariam.Server() == "s202")
        serverTyp = 3;
      return {
        scientists: researchers,
        researchBonus,
        premiumScientistBonus: premiumResBonus,
        premiumResearchBonus: researchBonus * premBon,
        culturalGoods: goods,
        premiumCulturalGoodsBonus: premiumGoodsBonus,
        corruption: corruptionSpend,
        total:
          (nonCorruptedResearchers +
            researchBonus +
            premiumResBonus +
            goods +
            premiumGoodsBonus +
            researchBonus * premBon) *
          Constant.GovernmentData[database.getGlobalData.getGovernmentType]
            .researchBonus *
          serverTyp,
      };
    },
    get _researchCostModifier() {
      var serverTyp = 1;
      if (ikariam.Server() == "s201" || ikariam.Server() == "s202")
        serverTyp = 3;
      return (
        (6 +
          Constant.GovernmentData[database.getGlobalData.getGovernmentType]
            .researcherCost -
          database.getGlobalData.getResearchTopicLevel(
            Constant.Research.Science.LETTER_CHUTE,
          ) *
            3) *
        serverTyp
      );
    },
    get getResearchCost() {
      return this.getResearchers * this._researchCostModifier;
    },
  };
  function Population(city) {
    this._population = 0;
    this._citizens = 0;
    this._resourceWorkers = 0;
    this._tradeWorkers = 0;
    this._priests = 0;
    this._culturalGoods = 0;
    this._popChanged = jq.now();
    this._citizensChanged = jq.now();
    this._culturalGoodsChanged = jq.now();
    this._priestsChanged = jq.now();
    this.city = Utils.wrapInClosure(city);
  }
  Population.prototype = {
    updatePopulationData: function (
      population,
      citizens,
      priests,
      culturalGoods,
    ) {
      var changes = [];
      if (population && population != this._population) {
        changes.push({ population: true });
        this.population = population;
      }
      if (citizens && citizens != this._priests) {
        changes.push({ citizens: true });
        this.citizens = citizens;
      }
      if (priests && priests != this._priests) {
        changes.push({ priests: true });
        this.priests = priests;
      }
    },
    updateWorkerData: function (resourceName, workers) {},
    updatePriests: function (newCount) {},
    updateCulturalGoods: function (newCount) {},
    get population() {
      return this._population;
    },
    set population(newVal) {
      this._population = newVal;
      this._popChanged = jq.now();
    },
    get citizens() {
      return this._citizens;
    },
    set citizens(newVal) {
      this._citizens = newVal;
      this._citizensChanged = jq.now();
    },
    get priests() {
      return this._priests;
    },
    set priests(newVal) {
      this._priests = newVal;
      this._priestsChanged = jq.now();
    },
  };
  function Resource(city, name) {
    this._current = 0;
    this._production = 0;
    this._consumption = 0;
    this._currentChangedDate = jq.now();
    this.city = Utils.wrapInClosure(city);
    this._name = name;
  }
  Resource.prototype = {
    get name() {
      return this._name;
    },
    update: function (current, production, consumption) {
      var changed =
        current % this._current > 10 ||
        production != this._production ||
        consumption != this._consumption;
      this._current = current;
      this._production = production;
      this._consumption = consumption;
      this._currentChangedDate = jq.now();
      return changed;
    },
    project: function () {
      var limit = Math.floor(jq.now() / 1e3);
      var start = Math.floor(this._currentChangedDate / 1e3);
      while (limit > start) {
        this._current += this._production;
        if (Math.floor(start / 3600) != Math.floor((start + 1) / 3600))
          if (this._current > this._consumption)
            this._current -= this._consumption;
          else {
            this.city().projectPopData(start * 1e3);
            this._consumption = 0;
          }
        start++;
      }
      this._currentChangedDate = limit * 1e3;
      this.city().projectPopData(limit * 1e3);
    },
    increment: function (amount) {
      if (amount !== 0) {
        this._current += amount;
        return true;
      }
      return false;
    },
    get getEmptyTime() {
      var net = this.getProduction * 3600 - this.getConsumption;
      return net < 0 ? (this.getCurrent / net) * -1 : Infinity;
    },
    get getFullTime() {
      var net = this.getProduction * 3600 - this.getConsumption;
      return net > 0
        ? (this.city().maxResourceCapacities.capacity - this.getCurrent) / net
        : 0;
    },
    get getCurrent() {
      return Math.floor(this._current);
    },
    get getProduction() {
      return this._production || 0;
    },
    get getConsumption() {
      return this._consumption || 0;
    },
  };
  function empireKeyPrefix(accountName) {
    return `***${accountName}***`;
  }
  jq(".menu_slots > .expandable:last").after(
    '<li class="expandable slot99 empire_Menu" onclick=""><div class="empire_Menu image" style="background-image: url(cdn/all/both/minimized/weltinfo.png); background-position: 0px 0px; background-size:33px auto"></div></div><div class="name"><span class="namebox">Empire Overview</span></div></li>',
  );
  var TOWN_TAB_IDS = ["ResTab", "BuildTab", "ArmyTab"];
  function fitTownRows(panel) {
    const table = panel.querySelector(":scope > table");
    if (!table) return;
    const rows = Array.from(table.querySelectorAll(":scope > tbody > tr"));
    const totals = table.querySelector(":scope > tfoot");
    if (rows.length <= 5) {
      panel.style.maxHeight = "";
      return;
    }
    const previousCap = panel.style.maxHeight;
    const scrollTop = panel.scrollTop;
    panel.style.maxHeight = "";
    const tableBox = table.getBoundingClientRect();
    if (tableBox.height === 0) {
      panel.style.maxHeight = previousCap;
      return;
    }
    const cut = rows[5].getBoundingClientRect().top - tableBox.top;
    const tail = totals
      ? tableBox.bottom - totals.getBoundingClientRect().top
      : tableBox.bottom - rows[rows.length - 1].getBoundingClientRect().bottom;
    panel.style.maxHeight = `${Math.ceil(cut + tail)}px`;
    panel.scrollTop = scrollTop;
  }
  var watchingTownRows = false;
  function watchTownRows() {
    TOWN_TAB_IDS.forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) fitTownRows(panel);
    });
    if (watchingTownRows || typeof ResizeObserver !== "function") return;
    watchingTownRows = true;
    const resized = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const panel = entry.target.parentElement;
        if (panel) fitTownRows(panel);
      });
    });
    TOWN_TAB_IDS.forEach((id) => {
      const panel = document.getElementById(id);
      if (!panel) return;
      const followTable = (changes = []) => {
        changes.forEach((change) =>
          change.removedNodes.forEach((node) => {
            if (node instanceof Element) resized.unobserve(node);
          }),
        );
        const table = panel.querySelector(":scope > table");
        if (table) resized.observe(table);
      };
      followTable();
      new MutationObserver(followTable).observe(panel, { childList: true });
    });
  }
  var render = {
    mainContentBox: null,
    $tabs: null,
    cityRows: {
      building: {},
      resource: {},
      army: {},
    },
    _cssResLoaded: false,
    toolTip: {
      elem: null,
      timer: null,
      hide: function () {
        render.toolTip.elem.parent().hide();
      },
      show: function () {
        render.toolTip.elem.parent().show();
      },
      mouseOver: function (event) {
        if (render.toolTip.timer) render.toolTip.timer();
        var f = (function (shiftKey) {
          return function (_alsoShiftKey) {
            var elem = jq(event.target).attr("data-tooltip")
              ? event.target
              : jq(event.target).parents("[data-tooltip]");
            render.toolTip.elem.html(
              render.toolTip.dynamicTip(
                jq(event.target).parents("tr").attr("id")
                  ? jq(event.target).parents("tr").attr("id").split("_").pop()
                  : 0,
                elem,
              ),
            );
            return render.toolTip.elem.html();
          };
        })(event.originalEvent.shiftKey);
        if (f(event.originalEvent.shiftKey)) {
          render.toolTip.show();
          render.toolTip.timer = events.scheduleActionAtInterval(f, 1e3);
        }
      },
      mouseMove: function (event) {
        if (render.toolTip.timer && render.toolTip.elem) {
          var l = parseInt(render.mainContentBox.css("left").split("px")[0]);
          var t = parseInt(render.mainContentBox.css("top").split("px")[0]);
          var x = event.pageX - 15 - l;
          var y = event.pageY + 20 - t;
          if (render.mainContentBox.height() - render.toolTip.elem.height() < y)
            y = event.pageY - render.toolTip.elem.height() - 15 - t;
          if (render.mainContentBox.width() - render.toolTip.elem.width() < x)
            x = event.pageX - render.toolTip.elem.width() + 15 - l;
          render.toolTip.elem.parent().css({
            left: x + "px",
            top: y + "px",
          });
        }
      },
      mouseOut: function (event) {
        if (render.toolTip.timer) {
          render.toolTip.timer();
          render.toolTip.timer = null;
        }
        render.toolTip.hide();
      },
      init: function () {
        render.toolTip.elem = render.mainContentBox
          .append(
            jq(
              '<div id="empireTip" style="z-index: 999999999;"><div class="content"></div></div>',
            ),
          )
          .find("div.content");
        render.mainContentBox
          .on("mouseover", "[data-tooltip]", render.toolTip.mouseOver)
          .on("mousemove", "[data-tooltip]", render.toolTip.mouseMove)
          .on("mouseout", "[data-tooltip]", render.toolTip.mouseOut);
      },
      dynamicTip: function (id, elem) {
        var lang = database.settings.languageChange.value;
        var $elem = jq(elem);
        var tiptype;
        if ($elem.attr("data-tooltip") === "dynamic")
          tiptype = $elem.attr("class").split(" ");
        else return $elem.attr("data-tooltip") || "";
        var city = database.getCityFromId(id);
        var resourceName;
        if (city)
          resourceName = $elem.is("td")
            ? $elem.attr("class").split(" ").pop()
            : $elem.parent("td").attr("class").split(" ").pop();
        var total;
        switch (tiptype.shift()) {
          case "incoming":
            return getIncomingTip();
          case "current":
            return "";
          case "progressbar":
            if (resourceName !== Constant.Resources.GOLD)
              return getProgressTip();
            break;
          case "total":
            switch ($elem.attr("id").split("_").pop()) {
              case "sigma":
                return getResourceTotalTip();
              case "goldincome":
                return getGoldIncomeTip();
              case "research":
                var researchDat;
                jq.each(database.cities, function (cityId, city) {
                  if (researchDat)
                    jq.each(city.research.researchData, function (key, value) {
                      researchDat[key] += value;
                    });
                  else researchDat = jq.extend({}, city.research.researchData);
                });
                return getResearchTip(researchDat);
              case "army":
                return "soon";
              case "wineincome":
                total = 0;
                var consumption = 0;
                resourceName = $elem
                  .attr("id")
                  .split("_")
                  .pop()
                  .split("income")
                  .shift();
                jq.each(database.cities, function (cityId, c) {
                  total += c.getResource(resourceName).getProduction;
                  consumption += c.getResource(resourceName).getConsumption;
                });
                return getProductionConsumptionSubSumTip(
                  total * 3600,
                  consumption,
                  true,
                );
              default:
                total = 0;
                resourceName = $elem
                  .attr("id")
                  .split("_")
                  .pop()
                  .split("income")
                  .shift();
                jq.each(database.cities, function (cityId, c) {
                  total += c.getResource(resourceName).getProduction;
                });
                return getProductionTip(total * 3600);
            }
          case "pop":
            return getPopulationTip();
          case "happy":
            return getGrowthTip();
          case "garrisonlimit":
            return getActionPointsTip();
          case "wonder":
            return city.getBuildingFromName(Constant.Buildings.TEMPLE)
              ? getWonderTip()
              : getNoWonderTip();
          case "prodconssubsum consumption Red":
            return getFinanceTip();
          case "scientists":
            return getResearchTip();
          case "prodconssubsum":
            return resourceName === Constant.Resources.GOLD
              ? getFinanceTip()
              : getProductionConsumptionSubSumTip(
                  city.getResource(resourceName).getProduction * 3600,
                  city.getResource(resourceName).getConsumption,
                );
          case "building":
            var buildingName = tiptype.shift();
            var index = parseInt(buildingName.slice(-1));
            buildingName = buildingName.slice(0, -1);
            return getBuildingTooltip(
              city.getBuildingsFromName(buildingName)[index],
            );
          case "army":
            switch (tiptype.shift()) {
              case "unit":
                return "";
              case "movement":
                return getArmyMovementTip(tiptype.pop());
              case "incoming":
                return "";
            }
            break;
          default:
            return "";
        }
        function getGoldIncomeTip() {
          var researchCost = 0;
          var income = 0;
          var sigmaIncome = 0;
          jq.each(database.cities, function (cityID, city) {
            researchCost += Math.floor(city.getExpenses);
            income += Math.floor(city.getIncome);
          });
          var expense =
            database.getGlobalData.finance.armyCost +
            database.getGlobalData.finance.armySupply +
            database.getGlobalData.finance.fleetCost +
            database.getGlobalData.finance.fleetSupply -
            researchCost;
          sigmaIncome = income - expense;
          return (
            '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_upkeep.png" style="height: 14px;"></td><td><b>1 ' +
            Constant.LanguageData[lang].hour +
            "</b></td><td><b>1 " +
            Constant.LanguageData[lang].day +
            "</b></td><td><b> 1 " +
            Constant.LanguageData[lang].week +
            '</b></div><td></td></th>\n    </thead>\n    <tbody>\n    <tr class="data">\n        <td><b>-&nbsp;</b></td>\n        <td> ' +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.armyCost,
              false,
              0,
            ) +
            " </td>\n        <td> " +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.armyCost * 24,
              false,
              0,
            ) +
            "</td>\n        <td> " +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.armyCost * 24 * 7,
              false,
              0,
            ) +
            '</td>\n        <td class="left"><i>« ' +
            Constant.LanguageData[lang].army_cost +
            '</i></td>\n    </tr>\n    <tr class="data">\n        <td><b>-&nbsp;</b></td>\n        <td class="nolf"> ' +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.fleetCost,
              false,
              0,
            ) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.fleetCost * 24,
              false,
              0,
            ) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.fleetCost * 24 * 7,
              false,
              0,
            ) +
            '</td>\n        <td class="left"><i>« ' +
            Constant.LanguageData[lang].fleet_cost +
            '</i></td>\n    </tr>\n    <tr class="data">\n        <td><b>-&nbsp;</b></td>\n        <td class="nolf">' +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.armySupply,
              false,
              0,
            ) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.armySupply * 24,
              false,
              0,
            ) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.armySupply * 24 * 7,
              false,
              0,
            ) +
            '</td>\n        <td class="left"><i>« ' +
            Constant.LanguageData[lang].army_supply +
            '</i></td>\n    </tr>\n    <tr class="data">\n        <td><b>-&nbsp;</b></td>\n        <td class="nolf">' +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.fleetSupply,
              false,
              0,
            ) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.fleetSupply * 24,
              false,
              0,
            ) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(
              database.getGlobalData.finance.fleetSupply * 24 * 7,
              false,
              0,
            ) +
            '</td>\n        <td class="left"><i>« ' +
            Constant.LanguageData[lang].fleet_supply +
            '</i></td>\n    </tr>\n    <tr class="data">\n        <td><b>-&nbsp;</b></td>\n        <td class="nolf">' +
            Utils.FormatNumToStr(researchCost, false, 0) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(researchCost * 24, false, 0) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(researchCost * 24 * 7, false, 0) +
            '</td>\n        <td class="left"><i>« ' +
            Constant.LanguageData[lang].research_cost +
            '</i></td>\n    </tr>\n    <tr style="border-top:1px solid #FFE4B5">\n        <td><b>+&nbsp;</b></td>\n        <td class="nolf">' +
            Utils.FormatNumToStr(income, false, 0) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(income * 24, false, 0) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(income * 7 * 24, false, 0) +
            '</td>\n        <td class="left"><i>« ' +
            Constant.LanguageData[lang].income +
            '</i></td>\n    </tr>\n    <tr>\n        <td><b>-&nbsp;</b></td>\n        <td class="nolf">' +
            Utils.FormatNumToStr(expense, false, 0) +
            '</td>\n        <td class="left">' +
            Utils.FormatNumToStr(expense * 24, false, 0) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(expense * 24 * 7, false, 0) +
            "</td>\n        <td><i>« " +
            Constant.LanguageData[lang].expenses +
            '</i></td></tbody><tfoot>\n    </tr>\n    <tr  class="total">\n        <td><b>Σ ' +
            (sigmaIncome > 0 ? "+&nbsp;" : "-&nbsp;") +
            "</b></td>\n        <td>" +
            Utils.FormatNumToStr(sigmaIncome, false, 0) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(sigmaIncome * 24, false, 0) +
            "</td>\n        <td>" +
            Utils.FormatNumToStr(sigmaIncome * 7 * 24, false, 0) +
            "</td>\n        <td><i>« " +
            Constant.LanguageData[lang].balances +
            "</i></td>\n    </tr>\n    </tfoot>\n</table>"
          );
        }
        function getArmyMovementTip(unit) {
          var total = 0;
          var table =
            '<table>\n    <thead>\n        <th colspan="3"><div align="center"><img src="{0}" style="height: 18px; float: left"></td>\n        <b>' +
            Constant.LanguageData[lang].training +
            '</b></div></th>\n        \n    </thead>\n    <tbody>\n{1}\n    </tbody><tfoot><tr class="small">\n        <td><b>Σ +</b></td>\n        <td>{2}</td>\n        <td class="left"><i>« ' +
            Constant.LanguageData[lang].total_ +
            "</i></td>\n    </tr>\n    </tfoot>\n</table>";
          var rows = "";
          jq.each(
            city.military.getTrainingForUnit(unit),
            function (index, data) {
              rows += Utils.format(
                '<tr class="data">\n    <td><b>+</b></td>\n    <td >{0}</td>\n    <td ><i>« {1}</i></td>\n</tr>',
                [
                  data.count,
                  Utils.FormatTimeLengthToStr(data.time - jq.now(), 3),
                ],
              );
              total += data.count;
            },
          );
          if (rows === "") return "";
          else return Utils.format(table, [getImage(unit), rows, total]);
        }
        function getPopulationTip() {
          var populationData = city.populationData;
          var popDiff = populationData.maxPop - populationData.currentPop;
          var Tip = "";
          if (popDiff !== 0)
            Tip =
              '<tr class="data"><tfoot>&nbsp;' +
              Utils.FormatTimeLengthToStr(
                (popDiff / populationData.growth) * 36e5,
                4,
              ) +
              "<td> « " +
              Constant.LanguageData[lang].time_to_full +
              "</td>\n    </tr>\n</tfoot>";
          return Utils.format(
            '<table>\n    <thead>\n    <th colspan="2"><div align="center">\n <img src="cdn/all/both/resources/icon_population.png" style="height: 15px; float: left"><b>{0}</b></div></th>\n    </thead>\n    <tbody>\n <tr class="data">\n        <td>{1}</td>\n        <td>« {5}</td>\n    </tr>\n<tr class="data">\n        <td>{2}</td>\n        <td>« {0}</td>\n    </tr>\n<tr class="data">\n        <td>{3}</td>\n        <td>« {6}</td>\n    </tr>\n<tr class="data">\n        <td>{4}</td>\n        <td>« {7}</td>\n    </tr></tbody>\n </table>{8}',
            [
              Constant.LanguageData[lang].citizens,
              Utils.FormatNumToStr(populationData.maxPop, false, 0),
              Utils.FormatNumToStr(populationData.currentPop, false, 0),
              Utils.FormatNumToStr(city._citizens, false, 0),
              popDiff === 0
                ? Constant.LanguageData[lang].full
                : Utils.FormatNumToStr(popDiff, false, 2),
              Constant.LanguageData[lang].housing_space,
              Constant.LanguageData[lang].free_housing_space,
              Constant.LanguageData[lang].free_Citizens,
              Tip,
            ],
          );
        }
        function getGrowthTip() {
          var lang = database.settings.languageChange.value;
          var populationData = city.populationData;
          var popDiff = populationData.maxPop - populationData.currentPop;
          var Icon =
            populationData.happiness >= 0
              ? "cdn/all/both/icons/growth_positive.png"
              : "cdn/all/both/icons/growth_negative.png";
          var Tip = "";
          if (popDiff > 0)
            Tip =
              '<table>\n    <thead>\n    <th><div align="center">\n <img src="' +
              Icon +
              '" style="height: 14px;"></td><td><b>1 ' +
              Constant.LanguageData[lang].hour +
              "</b></td><td><b>1 " +
              Constant.LanguageData[lang].day +
              "</b></td><td><b> 1 " +
              Constant.LanguageData[lang].week +
              "</b></div><td></td></th>\n    </thead>\n    <tbody>\n <tr><td><b>" +
              (populationData.growth > 0 ? "+" : "-") +
              "</b></td><td>" +
              (popDiff === 0
                ? "0" + Constant.LanguageData[lang].decimalPoint + "00"
                : Utils.FormatNumToStr(populationData.growth, false, 2)) +
              "</td><td>" +
              (popDiff === 0
                ? "0" + Constant.LanguageData[lang].decimalPoint + "00"
                : populationData.growth * 24 > popDiff
                  ? Utils.FormatNumToStr(popDiff, false, 2)
                  : Utils.FormatNumToStr(
                      populationData.growth * 24,
                      false,
                      2,
                    )) +
              "</td><td><i>" +
              (popDiff === 0
                ? "0" + Constant.LanguageData[lang].decimalPoint + "00"
                : populationData.growth * 24 * 7 > popDiff
                  ? Utils.FormatNumToStr(popDiff, false, 2)
                  : Utils.FormatNumToStr(
                      populationData.growth * 24 * 7,
                      false,
                      2,
                    )) +
              "</i></td><td></td></tr></tbody></table>";
          var corruption = "<td>" + city.CorruptionCity;
          if (city.CorruptionCity > 0)
            corruption = '<td class="red">' + city.CorruptionCity;
          var sat = "";
          var img = "";
          if (populationData.growth < -1) {
            img = "outraged";
            sat = Constant.LanguageData[lang].angry;
          } else if (populationData.growth < 0) {
            img = "sad";
            sat = Constant.LanguageData[lang].unhappy;
          } else if (populationData.growth < 1) {
            img = "neutral";
            sat = Constant.LanguageData[lang].neutral;
          } else if (populationData.growth < 6) {
            img = "happy";
            sat = Constant.LanguageData[lang].happy;
          } else {
            img = "ecstatic";
            sat = Constant.LanguageData[lang].euphoric;
          }
          var growthTip =
            '<table>\n    <thead>\n    <th colspan="2"><div align="center">\n <img src="cdn/all/both/smilies/' +
            img +
            '_x25.png" style="height: 18px; float: left"><b>{0}</b></div></th>\n    </thead>\n    <tbody>\n <tr class="data">\n        <td>{1}</td>\n        <td>« {2}</td>\n    </tr>\n<tr class="data">\n            {3}</td>\n        <td>« {4}</td>\n    </tr>\n<tr class="data">\n        <td>{5}</td>\n        <td>« {6}</td>\n    </tr>\n<tr class="data">\n        <td>{7}</td>\n        <td>« {8}</td>\n    </tr></tbody>\n  </table> {9}';
          return Utils.format(growthTip, [
            Constant.LanguageData[lang].satisfaction,
            Utils.FormatNumToStr(populationData.happiness, true, 0),
            sat,
            corruption + "%",
            Constant.LanguageData[lang].corruption,
            Math.floor(city._culturalGoods) +
              "/" +
              Math.floor(city.maxculturalgood),
            Constant.LanguageData[lang].cultural,
            Math.floor(city.tavernlevel) +
              "/" +
              Math.floor(city.maxtavernlevel),
            Constant.LanguageData[lang].level_tavern,
            Tip,
          ]);
        }
        function getActionPointsTip() {
          return Utils.format(
            '<table>\n    <thead>\n    <th colspan="3"><div align="center">\n <b>{0}</b></div></th>\n    </thead>\n    <tbody>\n <tr class="data">\n        <td>{1}</td>\n        <td>{2}</td>\n        <td>« {3}</td>\n    </tr>\n<tr class="data">\n        <td>{4}</td>\n        <td>{5}</td>\n        <td>« {6}</td>\n    </tr>\n</tfoot></table>',
            [
              Constant.LanguageData[lang].garrision,
              '<img src="cdn/all/both/advisors/military/bang_soldier.png" style="height: 15px;">',
              city.garrisonland,
              Constant.LanguageData[lang].Inland,
              '<img src="cdn/all/both/advisors/military/bang_ship.png" style="height: 15px;">',
              city.garrisonsea,
              Constant.LanguageData[lang].Sea,
            ],
          );
        }
        function getWonderTip() {
          var populationData = city.populationData;
          return Utils.format(
            '<table>\n    <thead>\n    <th colspan="3"><div align="center">\n <img src="cdn/all/both/wonder/w{0}.png" style="height: 25px; float: left">{1}</div></th>\n    </thead>\n    <tbody>\n <tr class="data">\n        <td>{2}</td>\n        <td>« {3}</td>\n    </tr>\n<tr class="data">\n        <td>{4}%</td>\n       <td>« {5}</td>\n    </tr>\n</tbody></table>',
            [
              city.getWonder,
              "Brunnen des<br>Poseidon",
              city._priests,
              "Priester",
              Utils.FormatNumToStr(
                (city._priests * 500) / populationData.maxPop,
                false,
                2,
              ),
              "Konvertierung",
              "100",
              "Inselglaube",
              "8h",
              "Cooldown",
            ],
          );
        }
        function getNoWonderTip() {
          city.populationData;
          return Utils.format(
            '<table><thead><th colspan="3"><div align="center"><img src="cdn/all/both/wonder/w{0}.png" style="height: {4}px; float: left">{1}</div></th></thead>\n    <tbody>\n <tr class="data">\n        <td>{2}</td>\n        <td> {3}</td>\n    </tr>\n</tbody></table>',
            [
              city.getWonder,
              "Brunnen des<br>Poseidon",
              "kein Tempel in",
              city._name,
              25,
            ],
          );
        }
        function getFinanceTip() {
          var totCity = Math.floor(city.getIncome + city.getExpenses);
          var Tip = "";
          if (city.getExpenses < 0)
            Tip =
              "<td></td><td>" +
              Utils.FormatNumToStr(city.getExpenses, true, 0) +
              "</td><td>" +
              Utils.FormatNumToStr(city.getExpenses * 24, true, 0) +
              "</td><td><i>" +
              Utils.FormatNumToStr(city.getExpenses * 24 * 7, true, 0) +
              "</i></td><td></td></tr></tbody><tfoot><tr><td>Σ<b> " +
              (totCity > 0 ? "+&nbsp;" : "-&nbsp;") +
              "</b></td><td>" +
              Utils.FormatNumToStr(totCity, false, 0) +
              "</td><td>" +
              Utils.FormatNumToStr(totCity * 24, false, 0) +
              "</td><td><i>" +
              Utils.FormatNumToStr(totCity * 7 * 24, false, 0) +
              "</i></td><td></td></tr></tfoot>";
          return Utils.format(
            '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_upkeep.png" style="height: 14px;"></td><td><b>{0}</b></td><td><b>{1}</b></td><td><b>{2}</b></div><td></td></th>\n    </thead>\n    <tbody>\n <tr class="data">\n        <td></td>\n        <td>{3}</td>\n        <td>{4}</td>\n        <td><i>{5}</i></td>\n        <td></td>\n    </tbody></tr>\n{6}</table>',
            [
              "1 " + Constant.LanguageData[lang].hour,
              "1 " + Constant.LanguageData[lang].day,
              "1 " + Constant.LanguageData[lang].week,
              Utils.FormatNumToStr(city.getIncome, true, 0),
              Utils.FormatNumToStr(city.getIncome * 24, false, 0),
              Utils.FormatNumToStr(city.getIncome * 24 * 7, false, 0),
              Tip,
            ],
          );
        }
        function getResearchTip(researchData) {
          researchData = researchData || city.research.researchData;
          var tooltip =
            researchData.scientists > 0
              ? '<table>\n    <thead>\n  <th colspan="5"><div align="center">\n <img src="cdn/all/both/buildings/y50/y50_academy.png" style="height: 20px; float: left"><b>{0}</b></div></th>\n    </thead>\n    <tbody>\n <tr class="data">\n        <td>{1}</td>\n        <td colspan="4">« {2}</td>\n    </tr>\n<tr class="data">\n        <td>{3}</td>\n        <td colspan="4">« {4}</td>\n    </tr>\n<thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_research_time.png" style="height: 14px;">  <td><b>{5}</b></td><td><b>{6}</b></td><td><b>{7}</b></div><td></td></th>\n    </thead>\n    <tbody>\n  <tr class="data">\n        <td>{11}</td>\n        <td>{8}</td>\n        <td>{9}</td>\n    <td><i>{10}</i></td>\n        <td></td></tr>\n</table>'
              : "";
          return Utils.format(tooltip, [
            Constant.LanguageData[lang].academy,
            Utils.FormatNumToStr(researchData.scientists, false, 0),
            Constant.LanguageData[lang].scientists,
            Utils.FormatNumToStr(city.maxSci, false, 0),
            Constant.LanguageData[lang].scientists_max,
            "1 " + Constant.LanguageData[lang].hour,
            "1 " + Constant.LanguageData[lang].day,
            "1 " + Constant.LanguageData[lang].week,
            Utils.FormatNumToStr(researchData.total, true, 0),
            Utils.FormatNumToStr(researchData.total * 24, false, 0),
            Utils.FormatNumToStr(researchData.total * 24 * 7, false, 0),
            database.getGlobalData.hasPremiumFeature(
              Constant.Premium.RESEARCH_POINTS_BONUS,
            )
              ? '<img src="cdn/all/both/premium/b_premium_research.jpg" style="width:18px;">'
              : "",
          ]);
        }
        function getIncomingTip() {
          var cRes = city.getResource(resourceName).getCurrent;
          if (resourceName === Constant.Resources.GOLD)
            cRes = database.getGlobalData.finance.currentGold;
          var rMov = database.getGlobalData.getResourceMovementsToCity(
            city.getId,
          );
          jq("#js_MilitaryMovementsEventRow1546373TargetLink");
          var table =
            "<table>\n    <thead>{0}</thead>\n    <tbody>{1}</tbody>\n    <tfoot>{2}</tfoot>\n</table>";
          var row =
            '<tr class="data" style="border-top:1px solid #FFE4B5">\n    <td><div class="icon2 {0}Image"></div></td>\n    <td>{1}</td>\n    <td><i>« {2}</i></td>\n    \n</tr><td></td><td>{3}</td>\n<td class="small data">« ({4})</td>\n</tr><td colspan="2"><b>{5}</b></td><td>« ' +
            Constant.LanguageData[lang].arrival +
            "</td></tr>";
          var header =
            '<tr>\n    <th ><div class="icon2 merchantImage"></div></th>\n    <th colspan="3">' +
            Constant.LanguageData[lang].transport +
            "</th>\n</tr>";
          var subtotal =
            '<tr class="total" style="border-top:1px solid #FFE4B5">\n    <td>=</td>\n    <td>{0}</td>\n    <td colspan=2><i>{1}</i></td>\n</tr>';
          var footer =
            '<tr class="total">\n    <td>Σ</td>\n    <td>{0}</td><td></td>\n</tr>';
          if (rMov.length) {
            var trades = "";
            var transp = "";
            var plunder = "";
            var movTotal = 0;
            for (var movID in rMov) {
              if (!jq.isNumeric(movID)) break;
              if (rMov[movID].getResources[resourceName]) {
                var origin = database.getCityFromId(
                  rMov[movID].getOriginCityId,
                );
                var tMov = Utils.format(row, [
                  rMov[movID].getMission,
                  Utils.FormatNumToStr(
                    rMov[movID].getResources[resourceName],
                    false,
                    0,
                  ),
                  origin ? origin.getName : rMov[movID].getOriginCityId,
                  Utils.FormatRemainingTime(
                    rMov[movID].getArrivalTime - jq.now(),
                  ),
                  rMov[movID].isLoading
                    ? Constant.LanguageData[lang].loading +
                      ": " +
                      Utils.FormatRemainingTime(
                        rMov[movID].getLoadingTime,
                        false,
                      )
                    : rMov[movID].getArrivalTime > jq.now()
                      ? Constant.LanguageData[lang].en_route
                      : Constant.LanguageData[lang].arrived,
                  Utils.FormatTimeToDateString(rMov[movID].getArrivalTime),
                ]);
                if (rMov[movID].getMission == "trade") trades += tMov;
                else if (rMov[movID].getMission == "transport") transp += tMov;
                else if (rMov[movID].getMission == "plunder") plunder += tMov;
                movTotal += rMov[movID].getResources[resourceName];
              }
            }
            if (trades === "" && transp === "" && plunder === "") return "";
            var body =
              trades +
              transp +
              plunder +
              Utils.format(subtotal, [
                Utils.FormatNumToStr(movTotal, false, 0),
                "« " + Constant.LanguageData[lang].total_,
              ]);
            var foot = Utils.format(footer, [
              Utils.FormatNumToStr(movTotal + cRes, false, 0),
            ]);
            var head = Utils.format(header, []);
            return Utils.format(table, [head, body, foot]);
          }
          return "";
        }
        function getBuildingTooltip(building) {
          if (building) {
            var uConst = building.isUpgrading;
            var resourceCost = building.getUpgradeCost;
            var serverTyp = 1;
            if (ikariam.Server() == "s201" || ikariam.Server() == "s202")
              serverTyp = 3;
            var elem = "";
            var time = 0;
            var needlevel = 0;
            var costlevel = 0;
            needlevel = building.getLevel + 2;
            costlevel = building.getLevel + 1;
            for (var key in resourceCost) {
              if (key == "time") {
                time =
                  '<tr class="total"><td><img src="cdn/all/both/resources/icon_time.png" style="height: 11px; float: left;"></td><td colspan="2" ><i>(' +
                  Utils.FormatTimeLengthToStr(
                    resourceCost[key] / serverTyp,
                    3,
                    " ",
                  ) +
                  ")</i></td></tr>";
                continue;
              }
              if (resourceCost[key]) {
                elem +=
                  '<tr class="data"><td><div class="icon ' +
                  key +
                  'Image"></div></td><td>' +
                  Utils.FormatNumToStr(resourceCost[key], false, 0) +
                  "</td>";
                elem +=
                  building.city().getResource(key).getCurrent <
                  resourceCost[key]
                    ? '<td class="red left">(' +
                      Utils.FormatNumToStr(
                        building.city().getResource(key).getCurrent -
                          resourceCost[key],
                        true,
                        0,
                      ) +
                      ")</td></tr>"
                    : '<td><img src="cdn/all/both/interface/check_mark_17px.png" style="height:11px; float:left;"></td></tr>';
              }
            }
            elem =
              elem !== ""
                ? '<table><thead><tr><th colspan="3" align="center"><b>' +
                  (uConst
                    ? Constant.LanguageData[lang].next_Level + " " + needlevel
                    : Constant.LanguageData[lang].next_Level +
                      " " +
                      costlevel) +
                  "</b></th></tr></thead><tbody>" +
                  elem +
                  "</tbody><tfoot>" +
                  time +
                  "</tfoot></table>"
                : '<table><thead><tr><th colspan="3" align="center">' +
                  Constant.LanguageData[lang].max_Level +
                  "</th></tr></thead></table>";
            if (uConst)
              elem =
                '<table><thead><tr><th colspan="3" align="center"><b>' +
                Constant.LanguageData[lang].constructing +
                "</b></th></tr></thead><tbody><tr><td></td><td>" +
                Utils.FormatFullTimeToDateString(
                  building.getCompletionTime,
                  true,
                ) +
                '</td></tr><tr><td><img src="cdn/all/both/resources/icon_time.png" style="height: 11px; float: left;"></td><td><i>(' +
                Utils.FormatTimeLengthToStr(
                  building.getCompletionTime - jq.now(),
                  3,
                  " ",
                ) +
                ")</i></td></tr></tbody></table>" +
                elem;
            return elem;
          }
        }
        function getResourceTotalTip() {
          var totals = {};
          var res;
          jq.each(database.cities, function (cityId, city) {
            jq.each(Constant.Resources, function (key, resourceName) {
              res = city.getResource(resourceName);
              if (!totals[resourceName]) totals[resourceName] = {};
              totals[resourceName].total = totals[resourceName].total
                ? totals[resourceName].total + res.getCurrent
                : res.getCurrent;
              totals[resourceName].income = totals[resourceName].income
                ? totals[resourceName].income +
                  res.getProduction * 3600 -
                  res.getConsumption
                : res.getProduction * 3600 - res.getConsumption;
              if (resourceName === Constant.Resources.GOLD) {
                var researchCost = 0,
                  expense = 0,
                  inGold = 3;
                res = 0;
                res += Math.round(city.getIncome + city.getExpenses);
                researchCost += Math.round(city.getExpenses);
                expense =
                  (database.getGlobalData.finance.armyCost +
                    database.getGlobalData.finance.armySupply +
                    database.getGlobalData.finance.fleetCost +
                    database.getGlobalData.finance.fleetSupply) /
                  database.getCityCount;
                inGold =
                  database.getGlobalData.finance.currentGold /
                  database.getCityCount;
                totals[resourceName].total = totals[resourceName].total
                  ? totals[resourceName].total + inGold
                  : inGold;
                totals[resourceName].income = totals[resourceName].income
                  ? totals[resourceName].income + res - expense
                  : res - expense;
              }
            });
          });
          var r = "";
          var finalSums = {
            income: 0,
            total: 0,
            day: 0,
            week: 0,
          };
          jq.each(totals, function (resourceName, data) {
            var day = data.total + data.income * 24;
            var week = data.total + data.income * 168;
            r += Utils.format(
              '<tr class="data">\n    <td><div class="icon {0}Image"></div></td>\n    <td>{1}</td>\n    <td>{2}</td>\n    <td>{3}</td>\n    <td><i>{4}</i></td>\n<td></td></tr>',
              [
                resourceName,
                Utils.FormatNumToStr(data.income, true, 0),
                Utils.FormatNumToStr(data.total, true, 0),
                Utils.FormatNumToStr(day, true, 0),
                Utils.FormatNumToStr(week, true, 0),
              ],
            );
            finalSums.income += data.income;
            finalSums.total += data.total;
            finalSums.day += day;
            finalSums.week += week;
          });
          if (r === "") return "";
          else
            return Utils.format(
              "<table>\n    <thead>\n    <td></td>\n    <td><b>1 {5}</b></td>\n    <td><b>{6}</b></td>\n    <td><b>+24 {7}</b></td>\n    <td><b> +1 {8}</b></td>\n  <td></td>  </thead>\n    <tbody>\n    {0}\n    <tfoot>\n    <td><b>Σ&nbsp;</b></td>\n    <td>{1}</td>\n    <td>{2}</td>\n    <td>{3}</td>\n    <td><i>{4}</i></td>\n  <td></td>  </tfoot>\n    </tbody>\n</td></table>",
              [
                r,
                Utils.FormatNumToStr(finalSums.income, true, 0),
                Utils.FormatNumToStr(finalSums.total, true, 0),
                Utils.FormatNumToStr(finalSums.day, true, 0),
                Utils.FormatNumToStr(finalSums.week, true, 0),
                Constant.LanguageData[lang].hour,
                Constant.LanguageData[lang].total_,
                Constant.LanguageData[lang].hour,
                Constant.LanguageData[lang].week,
              ],
            );
        }
        function getProgressTip() {
          if (resourceName == "population" || resourceName == "ui-corner-all")
            return "";
          var storage = city.maxResourceCapacities;
          var current = city.getResource(resourceName).getCurrent;
          var fulltime =
            (city.getResource(resourceName).getFullTime ||
              0 - city.getResource(resourceName).getEmptyTime) * 36e5;
          var gold = "";
          var serverTyp = 1;
          if (ikariam.Server() == "s201" || ikariam.Server() == "s202")
            serverTyp = 3;
          if (city.plundergold > 0 && serverTyp != 1)
            gold =
              '<td><img src="cdn/all/both/resources/icon_gold.png" style="height: 12px;"></td><td>' +
              Utils.FormatNumToStr(city.plundergold) +
              "</td><td>∞</td><td> « " +
              Constant.LanguageData[lang].plundergold;
          var progTip =
            '<table>\n <thead>\n <tr>\n <th><img src="cdn/all/both/premium/safecapacity_small.png" style="height: 16px;"></th>\n <th><b>{12}</b></th>\n <th colspan="2"><b>{13}</b></th>\n        \n    </tr>\n    </thead>\n    <tbody>{0}{11}<tr class="total" style="border-top:1px solid #daa520">\n        <td>{9}</td>\n        <td>{1}</td>\n        <td>{2}</td>\n        <td><i>« {14}</i></td>\n    </tr>\n    <tr class="total">\n        <td></td>\n        <td>{16}</td>\n        <td>{17}</td>\n        <td><i>« {18}</i></td>\n    </tr>\n    <tr>\n        <td></td>\n        <td>{19}</td>\n        <td>{20}</td>\n        <td></td>\n    </tr>\n        <tr class="total" style="border-top:1px solid #daa520">\n        <td>{10}</td>\n        <td>{3}</td>\n        <td>{4}</td>\n        <td><i>« {15}</i></td>\n    </tr>\n    <tr>\n        <td></td>\n        <td>{5}</td>\n        <td>{6}</td>\n        <td></td>\n    </tr>\n    </tbody>\n    <tfoot>\n    <tr>\n        <td colspan="3">{7}</td>\n        <td>« {8}</td>\n    </tr>\n    </tfoot>\n</table>';
          var progTr =
            '<tr class="data">\n <td style="width:20px; background: url(\'{0}\'); background-size: auto 23px; background-position: -1px -1px; \n background-repeat: no-repeat;">\n </td>\n <td>{1}</td>\n <td>{2}</td>\n <td>« {3}</td>\n</tr>';
          var rows = "";
          jq.each(storage.buildings, function (buildingName, data) {
            rows += Utils.format(progTr, [
              Constant.BuildingData[buildingName].icon,
              Utils.FormatNumToStr(data.safe, false, 0),
              Utils.FormatNumToStr(data.storage, false, 0),
              data.lang,
            ]);
          });
          return Utils.format(progTip, [
            rows,
            Utils.FormatNumToStr(storage.safe, false, 0),
            Utils.FormatNumToStr(storage.capacity, false, 0),
            Utils.FormatNumToStr(Math.min(storage.safe, current), false, 0),
            Utils.FormatNumToStr(Math.min(storage.capacity, current), false, 0),
            Utils.FormatNumToStr(
              Math.min(1, current / storage.safe) * 100,
              false,
              2,
            ) + "%",
            Utils.FormatNumToStr(
              Math.min(1, current / storage.capacity) * 100,
              false,
              2,
            ) + "%",
            Utils.FormatTimeLengthToStr(fulltime, 4),
            fulltime < 0
              ? Constant.LanguageData[lang].time_to_empty
              : Constant.LanguageData[lang].time_to_full,
            database.getGlobalData.hasPremiumFeature(
              Constant.Premium.STORAGECAPACITY_BONUS,
            )
              ? '<img src="cdn/all/both/premium/b_premium_storagecapacity.jpg" style="width:18px;">'
              : "",
            database.getGlobalData.hasPremiumFeature(
              Constant.Premium.SAFECAPACITY_BONUS,
            )
              ? '<img src="cdn/all/both/premium/b_premium_safecapacity.jpg" style="width:18px;">'
              : "",
            gold,
            Constant.LanguageData[lang].safe,
            Constant.LanguageData[lang].capacity,
            Constant.LanguageData[lang].maximum,
            Constant.LanguageData[lang].used,
            Utils.FormatNumToStr(
              storage.safe - Math.min(storage.safe, current),
              false,
              0,
            ),
            Utils.FormatNumToStr(
              storage.capacity - Math.min(storage.capacity, current),
              false,
              0,
            ),
            Constant.LanguageData[lang].missing,
            Utils.FormatNumToStr(
              100 - Math.min(1, current / storage.safe) * 100,
              false,
              0,
            )
              ? Utils.FormatNumToStr(
                  100.01 - Math.min(1, current / storage.safe) * 100,
                  false,
                  2,
                ) + "%"
              : Utils.FormatNumToStr(
                  100 - Math.min(1, current / storage.safe) * 100,
                  false,
                  2,
                ) + "%",
            Utils.FormatNumToStr(
              100 - Math.min(1, current / storage.capacity) * 100,
              false,
              0,
            )
              ? Utils.FormatNumToStr(
                  100.01 - Math.min(1, current / storage.capacity) * 100,
                  false,
                  2,
                ) + "%"
              : Utils.FormatNumToStr(
                  100 - Math.min(1, current / storage.capacity) * 100,
                  false,
                  2,
                ) + "%",
          ]);
        }
        function getConsumptionTooltip(consumption, force) {
          if (
            (consumption === 0 && !force) ||
            resourceName !== Constant.Resources.WINE
          )
            return "";
          else
            return Utils.format(
              '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_{0}.png" style="height: 14px;">  <td><b>{1}</b></td><td><b>{2}</b></td><td><b>{3}</b></div><td></td></th>\n    </thead>\n    <tbody>\n  <tr class="data">\n            <td></td>\n            <td>{4}</td>\n            <td>{5}</td>\n            <td><i>{6}</i></td>\n        <td></td></tr>\n    </tbody>\n</table>',
              [
                Constant.Resources.WINE,
                "1 " + Constant.LanguageData[lang].hour,
                "1 " + Constant.LanguageData[lang].day,
                "1 " + Constant.LanguageData[lang].week,
                Utils.FormatNumToStr(-consumption, true, 0),
                Utils.FormatNumToStr(-consumption * 24, true, 0),
                Utils.FormatNumToStr(-consumption * 24 * 7, true, 0),
              ],
            );
        }
        function getProductionTip(income, force) {
          var resName = resourceName;
          if (resourceName == "glass") resName = "crystal";
          var resBonus = resourceName;
          if (resourceName == "wood")
            resBonus = database.getGlobalData.hasPremiumFeature(
              Constant.Premium.WOOD_BONUS,
            );
          if (resourceName == "wine")
            resBonus = database.getGlobalData.hasPremiumFeature(
              Constant.Premium.WINE_BONUS,
            );
          if (resourceName == "marble")
            resBonus = database.getGlobalData.hasPremiumFeature(
              Constant.Premium.MARBLE_BONUS,
            );
          if (resourceName == "sulfur")
            resBonus = database.getGlobalData.hasPremiumFeature(
              Constant.Premium.SULFUR_BONUS,
            );
          if (resourceName == "glass")
            resBonus = database.getGlobalData.hasPremiumFeature(
              Constant.Premium.CRYSTAL_BONUS,
            );
          if (income === 0 && !force) return "";
          else
            return Utils.format(
              '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_{0}.png" style="height: 14px;">  <td><b>{1}</b></td><td><b>{2}</b></td><td><b>{3}</b></div><td></td></th>\n    </thead>\n    <tbody>\n  <tr class="data">\n        <td>{7}</td>\n        <td>{4}</td>\n        <td>{5}</td>\n        <td><i>{6}</i></td>\n    <td></td></tr>\n    </tbody>\n</table>',
              [
                resourceName,
                "1 " + Constant.LanguageData[lang].hour,
                "1 " + Constant.LanguageData[lang].day,
                "1 " + Constant.LanguageData[lang].week,
                Utils.FormatNumToStr(income, true, 0),
                Utils.FormatNumToStr(income * 24, false, 0),
                Utils.FormatNumToStr(income * 24 * 7, false, 0),
                resBonus
                  ? '<img src="cdn/all/both/premium/b_premium_' +
                    resName +
                    '.jpg" style="width:18px;">'
                  : "",
              ],
            );
        }
        function getProductionConsumptionSubSumTip(income, consumption, force) {
          if (income === 0 && consumption === 0 && !force) return "";
          else if (resourceName !== Constant.Resources.WINE)
            return getProductionTip(income, force);
          else if (income === 0)
            return getConsumptionTooltip(consumption, force);
          else
            return Utils.format(
              '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_{0}.png" style="height: 14px;">  <td><b>{1}</b></td><td><b>{2}</b></td><td><b>{3}</b></div><td></td></th>\n    </thead>\n    <tbody>\n  <tr class="data">\n            <td>{14}</td>\n        <td>{4}</td>\n            <td>{5}</td>\n            <td><i>{6}</i></td>\n        <td></td></tr>\n    <tr class="data">\n            <td></td>\n            <td>{7}</td>\n            <td>{8}</td>\n            <td><i>{9}</i></td>\n        <td></td></tr>\n    </tbody><tfoot> <tr class="total">\n           <td>{10}</td>\n        <td>{11}</td>\n           <td>{12}</td>\n           <td><i>{13}</i></td>\n       <td></td></tr>\n    </tfoot>\n</table>',
              [
                resourceName,
                "1 " + Constant.LanguageData[lang].hour,
                "1 " + Constant.LanguageData[lang].day,
                "1 " + Constant.LanguageData[lang].week,
                Utils.FormatNumToStr(income, true, 0),
                Utils.FormatNumToStr(income * 24, false, 0),
                Utils.FormatNumToStr(income * 24 * 7, false, 0),
                Utils.FormatNumToStr(-consumption, true, 0),
                Utils.FormatNumToStr(-consumption * 24, true, 0),
                Utils.FormatNumToStr(-consumption * 24 * 7, true, 0),
                income > consumption ? "Σ +&nbsp;" : "Σ -&nbsp;",
                Utils.FormatNumToStr(income - consumption, false, 0),
                Utils.FormatNumToStr((income - consumption) * 24, false, 0),
                Utils.FormatNumToStr((income - consumption) * 24 * 7, false, 0),
                database.getGlobalData.hasPremiumFeature(
                  Constant.Premium.WINE_BONUS,
                )
                  ? '<img src="cdn/all/both/premium/b_premium_wine.jpg" style="width:18px;">'
                  : "",
              ],
            );
        }
        function getImage(unitID) {
          return Constant.UnitData[unitID].type == "fleet"
            ? "cdn/all/both/characters/fleet/60x60/" + unitID + "_faceright.png"
            : "cdn/all/both/characters/military/x60_y60/y60_" +
                unitID +
                "_faceright.png";
        }
      },
    },
    cssResLoaded: function () {
      var ret = this._cssResLoaded;
      this._cssResLoaded = true;
      return ret;
    },
    Init: function () {
      this.SidePanelButton();
      events(Constant.Events.DATABASE_LOADED).sub(
        function () {
          this.LoadCSS();
          this.DrawContentBox();
        }.bind(render),
      );
      events(Constant.Events.MODEL_AVAILABLE).sub(
        function () {
          this.DrawTables();
          this.setCommonData();
          this.RestoreDisplayOptions();
          this.startMonitoringChanges();
          this.cityChange(ikariam.CurrentCityId);
        }.bind(render),
      );
    },
    startMonitoringChanges: function () {
      events(Constant.Events.TAB_CHANGED).sub(
        function (tab) {
          this.stopResourceCounters();
          switch (tab) {
            case 0:
              this.startResourceCounters();
              break;
            case 1:
              this.updateCitiesBuildingData();
              break;
            case 2:
              this.updateCitiesArmyData();
              break;
            case 3:
              this.redrawSettings();
              break;
          }
        }.bind(render),
      );
      events(Constant.Events.TAB_CHANGED).pub(
        database.settings.window.activeTab,
      );
      events("cityChanged").sub(this.cityChange.bind(render));
      events(Constant.Events.BUILDINGS_UPDATED).sub(
        this.updateChangesForCityBuilding.bind(render),
      );
      events(Constant.Events.GLOBAL_UPDATED).sub(
        this.updateGlobalData.bind(render),
      );
      events(Constant.Events.MOVEMENTS_UPDATED).sub(
        this.updateMovementsForCity.bind(render),
      );
      events(Constant.Events.RESOURCES_UPDATED).sub(
        this.updateResourcesForCity.bind(render),
      );
      events(Constant.Events.CITY_UPDATED).sub(
        this.updateCityDataForCity.bind(render),
      );
      events(Constant.Events.MILITARY_UPDATED).sub(
        this.updateChangesForCityMilitary.bind(render),
      );
      events(Constant.Events.PREMIUM_UPDATED).sub(
        this.updateGlobalData.bind(render),
      );
    },
    cityChange: function (cid) {
      var city = database.getCityFromId(cid);
      jq("#empireBoard tr.current,#empireBoard tr.selected").removeClass(
        "selected current",
      );
      if (city)
        this.getAllRowsForCity(city)
          .addClass("selected")
          .addClass(isChrome ? "current" : "selected");
    },
    getWorldmapTable: function () {},
    getHelpTable: function () {
      var lang = database.settings.languageChange.value;
      var elems = '<div id="HelpTab"><div>';
      var features =
        '<div class="options"><span class="categories">' +
        Constant.LanguageData[lang].Re_Order_Towns +
        "</span> " +
        Constant.LanguageData[lang].On_any_tab +
        '<hr><span class="categories">' +
        Constant.LanguageData[lang].Reset_Position +
        "</span> " +
        Constant.LanguageData[lang].Right_click +
        '<hr><span class="categories">' +
        Constant.LanguageData[lang].Hotkeys +
        "</span>" +
        Constant.LanguageData[lang].Navigate +
        "<br>" +
        Constant.LanguageData[lang].Navigate_to_City +
        "<br>" +
        Constant.LanguageData[lang].Navigate_to +
        "<br>" +
        Constant.LanguageData[lang].Navigate_to_World +
        "<br>" +
        Constant.LanguageData[lang].Spacebar +
        '<hr><span class="categories">' +
        Constant.LanguageData[lang].Initialize_Board +
        '</span> 1. <span id="helpTownhall" class="clickable"><b>> ' +
        Constant.LanguageData[lang].click_ +
        " <</b></span> " +
        Constant.LanguageData[lang].on_your_Town_Hall +
        '<br> 2. <span id="helpResearch" class="clickable"><b>> ' +
        Constant.LanguageData[lang].click_ +
        " <</b></span> " +
        Constant.LanguageData[lang].on_Research_Advisor +
        '<br> 3. <span id="helpPalace" class="clickable"><b>> ' +
        Constant.LanguageData[lang].click_ +
        " <</b></span> " +
        Constant.LanguageData[lang].on_your_Palace +
        '<br> 4. <span id="helpFinance" class="clickable"><b>> ' +
        Constant.LanguageData[lang].click_ +
        " <</b></span> " +
        Constant.LanguageData[lang].on_your_Finance +
        '<br> 5. <span id="helpMilitary" class="clickable"><b>> ' +
        Constant.LanguageData[lang].click_ +
        " <</b></span> " +
        Constant.LanguageData[lang].on_the_Troops +
        "</div>";
      elems += features + '<div style="clear:left"></div>';
      elems += "</div></div>";
      return elems;
    },
    getSettingsTable: function () {
      var lang = database.settings.languageChange.value;
      var wineOut = "";
      if (ikariam.Nationality() == "de")
        wineOut =
          ' <span><input type="checkbox" id="empire_wineOut" ' +
          (database.settings.wineOut.value ? 'checked="checked"' : "") +
          '/><nobr data-tooltip="' +
          Constant.LanguageData[lang].wineOut_description +
          '"> ' +
          Constant.LanguageData[lang].wineOut +
          "</nobr></span>";
      var piracy = "";
      if (
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Seafaring.PIRACY,
        )
      )
        piracy =
          ' <span><input type="checkbox" id="empire_noPiracy" ' +
          (database.settings.noPiracy.value ? 'checked="checked"' : "") +
          '/><nobr data-tooltip="' +
          Constant.LanguageData[lang].noPiracy_description +
          '"> ' +
          Constant.LanguageData[lang].noPiracy +
          "</nobr></span>";
      var elems = '<div id="SettingsTab"><div>';
      var inits =
        '<div class="options" style="clear:right"><span class="categories">' +
        Constant.LanguageData[lang].building_category +
        '</span> <span><input type="checkbox" id="empire_alternativeBuildingList" ' +
        (database.settings.alternativeBuildingList.value
          ? 'checked="checked"'
          : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].alternativeBuildingList_description +
        '"> ' +
        Constant.LanguageData[lang].alternativeBuildingList +
        '</nobr></span> <span><input type="checkbox" id="empire_compressedBuildingList" ' +
        (database.settings.compressedBuildingList.value
          ? 'checked="checked"'
          : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].compressedBuildingList_description +
        '"> ' +
        Constant.LanguageData[lang].compressedBuildingList +
        '</nobr></span> <hr> <span class="categories">' +
        Constant.LanguageData[lang].resource_category +
        '</span> <span><input type="checkbox" id="empire_hourlyRess" ' +
        (database.settings.hourlyRess.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].hourlyRes_description +
        '"> ' +
        Constant.LanguageData[lang].hourlyRes +
        "</nobr></span> " +
        wineOut +
        ' <span><input type="checkbox" id="empire_dailyBonus" ' +
        (database.settings.dailyBonus.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].dailyBonus_description +
        '"> ' +
        Constant.LanguageData[lang].dailyBonus +
        '</nobr></span> <span><input type="checkbox" id="empire_wineWarning" ' +
        (database.settings.wineWarning.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].wineWarning_description +
        '"> ' +
        Constant.LanguageData[lang].wineWarning +
        '</nobr></span> <span><select id="empire_wineWarningTime"><option value="0"' +
        (database.settings.wineWarningTime.value === 0
          ? "selected=selected"
          : "") +
        "> " +
        Constant.LanguageData[lang].off +
        '</option><option value="12"' +
        (database.settings.wineWarningTime.value == 12
          ? "selected=selected"
          : "") +
        "> 12" +
        Constant.LanguageData[lang].hour +
        '</option><option value="24"' +
        (database.settings.wineWarningTime.value == 24
          ? "selected=selected"
          : "") +
        "> 24" +
        Constant.LanguageData[lang].hour +
        '</option><option value="36"' +
        (database.settings.wineWarningTime.value == 36
          ? "selected=selected"
          : "") +
        "> 36" +
        Constant.LanguageData[lang].hour +
        '</option><option value="48"' +
        (database.settings.wineWarningTime.value == 48
          ? "selected=selected"
          : "") +
        "> 48" +
        Constant.LanguageData[lang].hour +
        '</option><option value="96"' +
        (database.settings.wineWarningTime.value == 96
          ? "selected=selected"
          : "") +
        "> 96" +
        Constant.LanguageData[lang].hour +
        '</option></select><nobr data-tooltip="' +
        Constant.LanguageData[lang].wineWarningTime_description +
        '"> ' +
        Constant.LanguageData[lang].wineWarningTime +
        '</nobr></span> <hr> <span class="categories">' +
        Constant.LanguageData[lang].language_category +
        '</span> <span><select id="empire_languageChange"><option value="en"' +
        (database.settings.languageChange.value == "en"
          ? "selected=selected"
          : "") +
        "> " +
        Constant.LanguageData[lang].en +
        '</option></select><nobr data-tooltip="' +
        Constant.LanguageData[lang].languageChange_description +
        '"> ' +
        Constant.LanguageData[lang].languageChange +
        "</nobr></span></div>";
      var features =
        '<div class="options"> <span class="categories">' +
        Constant.LanguageData[lang].visibility_category +
        '</span> <span><input type="checkbox" id="empire_hideOnWorldView" ' +
        (database.settings.hideOnWorldView.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].hideOnWorldView_description +
        '"> ' +
        Constant.LanguageData[lang].hideOnWorldView +
        '</nobr></span> <span><input type="checkbox" id="empire_hideOnIslandView" ' +
        (database.settings.hideOnIslandView.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].hideOnIslandView_description +
        '"> ' +
        Constant.LanguageData[lang].hideOnIslandView +
        '</nobr></span> <span><input type="checkbox" id="empire_hideOnCityView" ' +
        (database.settings.hideOnCityView.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].hideOnCityView_description +
        '"> ' +
        Constant.LanguageData[lang].hideOnCityView +
        '</nobr></span> <hr> <span class="categories">' +
        Constant.LanguageData[lang].army_category +
        '</span> <span><input type="checkbox" id="empire_fullArmyTable" ' +
        (database.settings.fullArmyTable.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].fullArmyTable_description +
        '"> ' +
        Constant.LanguageData[lang].fullArmyTable +
        '</nobr></span> <span><input type="checkbox" id="empire_onIkaLogs" ' +
        (database.settings.onIkaLogs.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].onIkaLogs_description +
        '"> ' +
        Constant.LanguageData[lang].onIkaLogs +
        '</nobr></span> <hr> <span class="categories">' +
        Constant.LanguageData[lang].global_category +
        '</span> <span><input type="checkbox" id="empire_autoUpdates" ' +
        (database.settings.autoUpdates.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].autoUpdates_description +
        '"> ' +
        Constant.LanguageData[lang].autoUpdates +
        "</nobr></span></div>";
      var display =
        '<div class="options"> <span class="categories">' +
        Constant.LanguageData[lang].display_category +
        '</span> <span><input type="checkbox" id="empire_onTop" ' +
        (database.settings.onTop.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].onTop_description +
        '"> ' +
        Constant.LanguageData[lang].onTop +
        '</nobr></span> <span><input type="checkbox" id="empire_windowTennis" ' +
        (database.settings.windowTennis.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].windowTennis_description +
        '"> ' +
        Constant.LanguageData[lang].windowTennis +
        '</nobr></span> <span><input type="checkbox" id="empire_smallFont" ' +
        (database.settings.smallFont.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].smallFont_description +
        '"> ' +
        Constant.LanguageData[lang].smallFont +
        '</nobr></span> <span><input type="checkbox" id="empire_GoldShort" ' +
        (database.settings.GoldShort.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].goldShort_description +
        '"> ' +
        Constant.LanguageData[lang].goldShort +
        '</nobr></span> <span><input type="checkbox" id="empire_newsTicker" ' +
        (database.settings.newsTicker.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].newsticker_description +
        '"> ' +
        Constant.LanguageData[lang].newsticker +
        '</nobr></span> <span><input type="checkbox" id="empire_event" ' +
        (database.settings.event.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].event_description +
        '"> ' +
        Constant.LanguageData[lang].event +
        '</nobr></span> <span><input type="checkbox" id="empire_logInPopup" ' +
        (database.settings.logInPopup.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].logInPopup_description +
        '"> ' +
        Constant.LanguageData[lang].logInPopup +
        '</nobr></span> <span><input type="checkbox" id="empire_birdSwarm" ' +
        (database.settings.birdSwarm.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].birdswarm_description +
        '"> ' +
        Constant.LanguageData[lang].birdswarm +
        '</nobr></span> <span><input type="checkbox" id="empire_walkers" ' +
        (database.settings.walkers.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].walkers_description +
        '"> ' +
        Constant.LanguageData[lang].walkers +
        "</nobr></span> " +
        piracy +
        ' <span><input type="checkbox" id="empire_controlCenter" ' +
        (database.settings.controlCenter.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].control_description +
        '"> ' +
        Constant.LanguageData[lang].control +
        '</nobr></span> <span><input type="checkbox" id="empire_withoutFable" ' +
        (database.settings.withoutFable.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].unnecessaryTexts_description +
        '"> ' +
        Constant.LanguageData[lang].unnecessaryTexts +
        '</nobr></span> <span><input type="checkbox" id="empire_ambrosiaPay" ' +
        (database.settings.ambrosiaPay.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].ambrosiaPay_description +
        '"> ' +
        Constant.LanguageData[lang].ambrosiaPay +
        "</nobr></span></div>";
      elems += features + inits + display + '<div style="clear:left"></div>';
      elems += "</div></div>";
      elems +=
        '<div style="clear:left"><hr><p>&nbsp; ' +
        Constant.LanguageData[lang].current_Version +
        " <b>&nbsp;" +
        empire.version +
        "</b></p><p>&nbsp; " +
        Constant.LanguageData[lang].ikariam_Version +
        ' <b style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=version\')">&nbsp;' +
        ikariam.GameVersion() +
        "</b></p></div><br>";
      elems +=
        '<div class="buttons"><button data-tooltip="' +
        Constant.LanguageData[lang].reset +
        '" id="empire_Reset_Button">Reset</button><button data-tooltip="' +
        Constant.LanguageData[lang].goto_website +
        '" id="empire_Website_Button">' +
        Constant.LanguageData[lang].website +
        '</button><button data-tooltip="' +
        Constant.LanguageData[lang].Check_for_updates +
        '" id="empire_Update_Button">' +
        Constant.LanguageData[lang].check +
        '</button><button data-tooltip="' +
        Constant.LanguageData[lang].Report_bug +
        '" id="empire_Bug_Button">' +
        Constant.LanguageData[lang].report +
        '</button><button data-tooltip="Check All" id="empire_CheckAll_Button">Check All</button><button data-tooltip="Check" id="empire_Check_Button">Check</button><button data-tooltip="' +
        Constant.LanguageData[lang].save_settings +
        '" id="empire_Save_Button" onclick="ajaxHandlerCall(\'?view=city&oldBackgroundView\')">' +
        Constant.LanguageData[lang].save +
        "</button>";
      return elems;
    },
    DrawHelp: function () {
      var lang = database.settings.languageChange.value;
      jq("#HelpTab")
        .html(this.getHelpTable())
        .on("click", "#helpTownhall", function () {
          ikariam.loadUrl(
            ikariam.viewIsCity,
            "city",
            ikariam.getCurrentCity.getBuildingFromName(
              Constant.Buildings.TOWN_HALL,
            ).getUrlParams,
          );
        })
        .on("click", "#helpMilitary", function () {
          ikariam.loadUrl(ikariam.viewIsCity, "city", {
            view: "cityMilitary",
            activeTab: "tabUnits",
          });
        })
        .on("click", "#helpMuseum", function () {
          ikariam.loadUrl(ikariam.viewIsCity, "city", {
            view: "culturalPossessions_assign",
            activeTab: "tab_culturalPossessions_assign",
          });
        })
        .on("click", "#helpResearch", function () {
          ikariam.loadUrl(ikariam.viewIsCity, "city", {
            view: "researchAdvisor",
          });
        })
        .on("click", "#helpPalace", function () {
          var capital = ikariam.getCapital;
          if (capital)
            ikariam.loadUrl(
              ikariam.viewIsCity,
              "city",
              capital.getBuildingFromName(Constant.Buildings.PALACE)
                .getUrlParams,
            );
          else render.toastAlert(Constant.LanguageData[lang].alert_palace);
        })
        .on("click", "#helpFinance", function () {
          ikariam.loadUrl(ikariam.viewIsCity, "city", { view: "finances" });
        })
        .on("click", "#helpShop", function () {
          ikariam.loadUrl(ikariam.viewIsCity, "city", { view: "premium" });
        });
    },
    DrawSettings: function () {
      var lang = database.settings.languageChange.value;
      jq("#SettingsTab")
        .html(this.getSettingsTable())
        .on("change", "#empire_onTop", function () {
          database.settings.onTop.value = this.checked;
          render.mainContentBox.css("z-index", this.checked ? 65112 : 61);
        })
        .on("change", "#empire_windowTennis", function () {
          database.settings.windowTennis.value = this.checked;
          if (!this.checked)
            render.mainContentBox.css(
              "z-index",
              database.settings.onTop.value ? 65112 : 61,
            );
          else render.mainContentBox.trigger("mouseenter");
        })
        .on("change", "#empire_fullArmyTable", function () {
          database.settings.fullArmyTable.value = this.checked;
          render.updateCitiesArmyData();
        })
        .on("change", "#empire_playerInfo", function () {
          database.settings.playerInfo.value = this.checked;
        })
        .on("change", "#empire_onIkaLogs", function () {
          database.settings.onIkaLogs.value = this.checked;
        })
        .on("change", "#empire_controlCenter", function () {
          database.settings.controlCenter.value = this.checked;
        })
        .on("change", "#empire_withoutFable", function () {
          database.settings.withoutFable.value = this.checked;
        })
        .on("change", "#empire_ambrosiaPay", function () {
          database.settings.ambrosiaPay.value = this.checked;
        })
        .on("change", "#empire_hideOnWorldView", function () {
          database.settings.hideOnWorldView.value = this.checked;
        })
        .on("change", "#empire_hideOnIslandView", function () {
          database.settings.hideOnIslandView.value = this.checked;
        })
        .on("change", "#empire_hideOnCityView", function () {
          database.settings.hideOnCityView.value = this.checked;
        })
        .on("change", "#empire_autoUpdates", function () {
          database.settings.autoUpdates.value = this.checked;
        })
        .on("change", "#empire_smallFont", function () {
          database.settings.smallFont.value = this.checked;
          if (this.checked) GM_addStyle("#empireBoard {font-size:8pt}");
          else GM_addStyle("#empireBoard {font-size:inherit}");
        })
        .on("change", "#empire_GoldShort", function () {
          database.settings.GoldShort.value = this.checked;
        })
        .on("change", "#empire_newsTicker", function () {
          database.settings.newsTicker.value = this.checked;
        })
        .on("change", "#empire_event", function () {
          database.settings.event.value = this.checked;
        })
        .on("change", "#empire_birdSwarm", function () {
          database.settings.birdSwarm.value = this.checked;
        })
        .on("change", "#empire_walkers", function () {
          database.settings.walkers.value = this.checked;
        })
        .on("change", "#empire_noPiracy", function () {
          database.settings.noPiracy.value = this.checked;
        })
        .on("change", "#empire_hourlyRess", function () {
          database.settings.hourlyRess.value = this.checked;
        })
        .on("change", "#empire_wineWarning", function () {
          database.settings.wineWarning.value = this.checked;
        })
        .on("change", "#empire_wineOut", function () {
          database.settings.wineOut.value = this.checked;
        })
        .on("change", "#empire_dailyBonus", function () {
          database.settings.dailyBonus.value = this.checked;
        })
        .on("change", "#empire_logInPopup", function () {
          database.settings.logInPopup.value = this.checked;
        })
        .on("change", "#empire_alternativeBuildingList", function () {
          database.settings.alternativeBuildingList.value = this.checked;
          render.cityRows.building = {};
          if (
            database.settings.alternativeBuildingList.value == this.checked &&
            database.settings.compressedBuildingList.value == 1
          )
            render.toastAlert(Constant.LanguageData[lang].alert);
          jq("table.buildings").html(render.getBuildingTable());
          render.updateCitiesBuildingData();
          jq.each(database.cities, function (cityId, city) {
            render.setCityName(city);
            render.setActionPoints(city);
            jq.each(
              database.settings[Constant.Settings.CITY_ORDER].value,
              function (idx, val) {
                jq("#building_" + val).appendTo(
                  jq("#building_" + val).parent(),
                );
              },
            );
          });
        })
        .on("change", "#empire_compressedBuildingList", function () {
          database.settings.compressedBuildingList.value = this.checked;
          if (
            database.settings.compressedBuildingList.value == this.checked &&
            database.settings.alternativeBuildingList.value == 1
          )
            render.toastAlert(Constant.LanguageData[lang].alert);
          render.cityRows.building = {};
          jq("table.buildings").html(render.getBuildingTable());
          render.updateCitiesBuildingData();
          jq.each(database.cities, function (cityId, city) {
            render.setCityName(city);
            render.setActionPoints(city);
            jq.each(
              database.settings[Constant.Settings.CITY_ORDER].value,
              function (idx, val) {
                jq("#building_" + val).appendTo(
                  jq("#building_" + val).parent(),
                );
              },
            );
          });
        })
        .on("change", "#empire_wineWarningTime", function () {
          database.settings.wineWarningTime.value = this.value;
        })
        .on("change", "#empire_languageChange", function () {
          database.settings.languageChange.value = this.value;
        })
        .on("click", "#empire_Website_Button", function () {})
        .on("click", "#empire_Reset_Button", function () {
          empire.HardReset();
        })
        .on("click", "#empire_CheckAll_Button", function () {
          empire.CheckAll();
        })
        .on("click", "#empire_Check_Button", function () {
          empire.Check();
        })
        .on("click", "#empire_Update_Button", function () {
          empire.CheckForUpdates.call(empire, true);
        })
        .on("click", "#empire_Bug_Button", function () {})
        .on("change", "input[type='checkbox']", function () {
          this.blur();
        });
      jq(document).ready(function () {
        if (
          jq("#empire_dailyBonus").attr("checked") &&
          jq("#dailyActivityBonus form")
        )
          jq("#dailyActivityBonus form").submit();
        if (jq("#empire_logInPopup").attr("checked"))
          GM_addStyle("#multiPopup {display: none;}");
        if (
          jq("#empire_dailyBonus").attr("checked") &&
          jq("#empire_logInPopup").attr("checked")
        )
          GM_addStyle("#multiPopup {display: none;}");
      });
      jq("#empire_Reset_Button").button({
        icons: { primary: "ui-icon-alert" },
        text: true,
      });
      jq("#empire_Website_Button").button({
        icons: { primary: "ui-icon-home" },
        text: true,
      });
      jq("#empire_Update_Button").button({
        icons: { primary: "ui-icon-info" },
        text: true,
      });
      jq("#empire_Bug_Button").button({
        icons: { primary: "ui-icon-notice" },
        text: true,
      });
      jq("#empire_CheckAll_Button").button({
        icons: { primary: "ui-icon-notice" },
        text: true,
      });
      jq("#empire_Check_Button").button({
        icons: { primary: "ui-icon-notice" },
        text: true,
      });
      jq("#empire_Save_Button").button({
        icons: { primary: "ui-icon-check" },
        text: true,
      });
      jq("#empire_Allianz").button({ text: true });
      jq("#empire_Allianz_einlesen").button({ text: true });
    },
    toast: function (sMessage) {
      jq("<div>")
        .addClass("ui-tooltip-content ui-widget-content")
        .text(sMessage)
        .appendTo(
          jq(document.createElement("div"))
            .addClass("ui-helper-reset ui-tooltip ui-tooltip-pos-bc ui-widget")
            .css({
              position: "relative",
              display: "inline-block",
              left: "auto",
              top: "auto",
            })
            .show()
            .appendTo(
              jq(document.createElement("div"))
                .addClass("toast")
                .appendTo(document.body)
                .delay(100)
                .fadeIn("slow", function () {
                  jq(this)
                    .delay(2e3)
                    .fadeOut("slow", function () {
                      jq(this).remove();
                    });
                }),
            ),
        );
    },
    toastAlert: function (sMessage) {
      jq('<div class="red">')
        .addClass("ui-tooltip-content ui-widget-content")
        .text(sMessage)
        .appendTo(
          jq(document.createElement("div"))
            .addClass("ui-helper-reset ui-tooltip ui-tooltip-pos-bc ui-widget")
            .css({
              position: "relative",
              display: "inline-block",
              left: "auto",
              top: "-20px",
            })
            .show()
            .appendTo(
              jq(document.createElement("div"))
                .addClass("toastAlert")
                .appendTo(document.body)
                .delay(100)
                .fadeIn("slow", function () {
                  jq(this)
                    .delay(3e3)
                    .fadeOut("slow", function () {
                      jq(this).remove();
                    });
                }),
            ),
        );
    },
    RestoreDisplayOptions: function () {
      render.mainContentBox.css("left", database.settings.window.left);
      render.mainContentBox.css("top", database.settings.window.top);
      this.$tabs.tabs("select", database.settings.window.activeTab);
      if (
        !(
          (ikariam.viewIsWorld && database.settings.hideOnWorldView.value) ||
          (ikariam.viewIsIsland && database.settings.hideOnIslandView.value) ||
          (ikariam.viewIsCity && database.settings.hideOnCityView.value)
        ) &&
        database.settings.window.visible
      )
        this.mainContentBox.fadeToggle(0);
    },
    SaveDisplayOptions: function () {
      if (database.settings)
        try {
          database.settings.addOptions({
            window: {
              left: render.mainContentBox.css("left"),
              top: render.mainContentBox.css("top"),
              visible:
                (ikariam.viewIsWorld &&
                  database.settings.hideOnWorldView.value) ||
                (ikariam.viewIsIsland &&
                  database.settings.hideOnIslandView.value) ||
                (ikariam.viewIsCity && database.settings.hideOnCityView.value)
                  ? database.settings.window.visible
                  : render.mainContentBox.css("display") != "none",
              activeTab: render.$tabs.tabs("option", "active"),
            },
          });
        } catch (e) {
          empire.error("SaveDisplayOptions", e);
        }
    },
    SidePanelButton: function () {
      jq("#js_viewCityMenu")
        .find("li.empire_Menu")
        .on("click", function (event) {
          render.ToggleMainBox();
        })
        .on("contextmenu", function (event) {
          event.preventDefault();
          database.settings.window.left = 110;
          database.settings.window.top = 200;
          render.mainContentBox.css("left", database.settings.window.left);
          render.mainContentBox.css("top", database.settings.window.top);
        });
      jq(document).on("keydown", function (event) {
        var index = -1;
        var type = event.target.nodeName.toLowerCase();
        if (type === "input" || type === "textarea" || type === "select")
          return true;
        if (event.which === 32) {
          event.stopImmediatePropagation();
          render.ToggleMainBox();
          return false;
        }
        if (event.originalEvent.shiftKey) {
          index = [49, 50, 51, 52, 53].indexOf(event.which);
          if (index !== -1) {
            render.$tabs.tabs("option", "active", index);
            return false;
          } else
            switch (event.which) {
              case 81:
                jq("#js_worldMapLink").find("a").click();
                break;
              case 87:
                jq("#js_islandLink").find("a").click();
                break;
              case 69:
                jq("#js_cityLink").find("a").click();
                break;
            }
        } else {
          var keycodes = "";
          switch (ikariam.Nationality()) {
            case "en":
            case "gr":
            case "ro":
            case "ru":
            case "pl":
            case "ir":
            case "ae":
            case "au":
            case "br":
            case "hk":
            case "hu":
            case "il":
            case "lt":
            case "nl":
            case "tw":
            case "us":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 173, 61];
              if (isChrome)
                keycodes = [
                  49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 189, 187, 8, 220, 221,
                  219,
                ];
              break;
            case "de":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 63, 192];
              if (isChrome)
                keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 219, 221];
              break;
            case "it":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 222, 160];
              break;
            case "es":
            case "rs":
            case "si":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 222, 171];
              break;
            case "ar":
            case "cl":
            case "co":
            case "mx":
            case "pe":
            case "pt":
            case "ve":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 222, 0];
              break;
            case "fr":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 169, 61];
              break;
            case "cz":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 61, 169];
              break;
            case "bg":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 173, 190];
              break;
            case "dk":
            case "fi":
            case "ee":
            case "se":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 171, 192];
              break;
            case "no":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 171, 222];
              break;
            case "tr":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 170, 173];
              break;
            case "sk":
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 61, 0];
              break;
          }
          index = keycodes.indexOf(event.which);
          if (index !== -1) {
            if (index < database.settings.cityOrder.value.length) {
              jq(
                "#resource_" +
                  database.settings.cityOrder.value[index] +
                  " .city_name .clickable",
              ).trigger("click");
              return false;
            }
          } else
            switch (event.which) {
              case 81:
                jq("#js_GlobalMenu_cities").click();
                break;
              case 87:
                jq("#js_GlobalMenu_military").click();
                break;
              case 69:
                jq("#js_GlobalMenu_research").click();
                break;
              case 82:
                jq("#js_GlobalMenu_diplomacy").click();
                break;
            }
        }
      });
    },
    ToggleMainBox: function () {
      database.settings.window.visible =
        this.mainContentBox.css("display") == "none";
      this.mainContentBox.fadeToggle(0);
    },
    DrawTables: function () {
      if (jq(this.mainContentBox)) {
        jq("#ArmyTab").html(this.getArmyTable());
        jq("#ResTab").html(this.getResourceTable());
        jq("#BuildTab").html(this.getBuildingTable());
        jq("#WorldmapTab").html(this.getWorldmapTable());
        this.DrawSettings();
        this.DrawHelp();
        this.toolTip.init();
        jq("#ResTab, #BuildTab, #ArmyTab").each(function () {
          jq(this).sortable({
            helper: function (e, ui) {
              jq(ui)
                .children("td")
                .each(function () {
                  jq(this).width(Math.round(jq(this).width()));
                  jq(this).hasClass("building");
                  jq(this).css("border", "1px solid transparent");
                });
              jq(ui)
                .parents("div[role=tabpanel]")
                .each(function () {
                  jq(this).width(Math.round(jq(this).width()));
                });
              return ui;
            },
            handle: ".city_name .icon",
            cursor: "move",
            axis: "y",
            items: "tbody tr",
            container: "tbody",
            revert: 200,
            stop: function (event, ui) {
              ui.item.parents("div[role=tabpanel]").css("width", "");
              ui.item.children("td").css("width", "").css("border", "");
              database.settings[Constant.Settings.CITY_ORDER].value = ui.item
                .parents(".ui-sortable")
                .sortable("toArray")
                .map(function (item) {
                  return parseInt(item.split("_").pop());
                });
              jq.each(["building", "resource", "army"], function (idx, type) {
                if (jq(this).parents(".ui-sortable").attr("id") !== type)
                  jq.each(
                    database.settings[Constant.Settings.CITY_ORDER].value,
                    function (idx, val) {
                      jq("#" + type + "_" + val).appendTo(
                        jq("#" + type + "_" + val).parent(),
                      );
                    },
                  );
              });
            },
          });
        });
        jq.each(["building", "resource", "army"], function (idx, type) {
          jq.each(
            database.settings[Constant.Settings.CITY_ORDER].value,
            function (idx, val) {
              jq("#" + type + "_" + val).appendTo(
                jq("#" + type + "_" + val).parent(),
              );
            },
          );
        });
        watchTownRows();
      }
      this.AttachClickHandlers();
    },
    getResourceTable: function () {
      var lang = database.settings.languageChange.value;
      var header =
        '<colgroup span="2"/>\n      <colgroup span="1"/>\n    <colgroup span="1"/>\n    <colgroup span="2"/>\n    <colgroup span="2"/>\n    <colgroup span="2"/>\n    <colgroup span="2"/>\n    <colgroup span="2"/>\n   <colgroup span="2"/>\n    <colgroup span="2"/>\n<thead>\n<tr class="header_row">\n    <th class="city_name" data-tooltip="{10}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=18\')">{0}</th>\n    <th class="action_points icon actionpointImage" data-tooltip="{1}"></th>\n    \n    <th class="empireactions">\n       <div class="trading" data-tooltip="' +
        Constant.LanguageData[lang].transport +
        '" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=militaryAdvisor\')"></div>\n<div class="agora" data-tooltip="' +
        Constant.LanguageData[lang].agora +
        '" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=diplomacyIslandBoard&amp=&islandId\')"></div> <div class="member" data-tooltip="' +
        Constant.LanguageData[lang].member +
        '" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=diplomacyAllyMemberlist\')"></div>\n  </th>\n    <th class="citizen_header icon populationImage" data-tooltip="{2}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=3\');return false;"></th>\n    \n    <th class="growth_header icon growthImage" data-tooltip="' +
        Constant.LanguageData[lang].satisfaction +
        '"   style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=3\');return false;"></th>\n    <th class="research_header icon researchImage" data-tooltip="{3}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=researchAdvisor\');return false;"></th>\n    <th class="gold_header icon goldImage" colspan="2" data-tooltip="{4}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=finances\');return false;"></th>\n    <th class="wood_header icon woodImage" colspan="2" data-tooltip="{5}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=5\');return false;"></th>\n    <th class="wine_header icon wineImage" colspan="2" data-tooltip="{6}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=6\');return false;"></th>\n    <th class="marble_header icon marbleImage" colspan="2" data-tooltip="{7}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=6\');return false;"></th>\n    <th class="glass_header icon glassImage" colspan="2" data-tooltip="{8}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=6\');return false;"></th>\n    <th class="sulfur_header icon sulfurImage" colspan="2" data-tooltip="{9}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=6\');return false;"></th>\n  \n</tr>\n</thead>';
      var table =
        '<table class="resources">\n    {0}\n   <tbody>{1}</tbody>\n    <tfoot>{2}</tfoot>\n</table>';
      var resourceRow =
        '<tr id="resource_{0}">\n    <td class="city_name">\n        <span></span>\n        <span class="clickable"></span>\n        <sub></sub>\n        <span class="Red" data-tooltip="{6}">&nbsp;&nbsp;<b>{5}</b>&nbsp;&nbsp;</span>\n         </td>\n    <td class="action_points"><span class="ap"></span>&nbsp;<br><span class="garrisonlimit"  data-tooltip="dynamic"><img height="18" hspace="3"></span></td>\n          <td class="empireactions">\n        <div class="worldmap" data-tooltip="' +
        Constant.LanguageData[lang].to_world +
        '" style="cursor:pointer;"></div>        <div class="city" data-tooltip="' +
        Constant.LanguageData[lang].to_town_hall +
        ' {2}" style="cursor:pointer;"></div>\n    <div class="island" data-tooltip="' +
        Constant.LanguageData[lang].to_island +
        '" style="cursor:pointer;"></div>\n  <br> <div class="islandwood" data-tooltip="' +
        Constant.LanguageData[lang].to_saw_mill +
        '" style="cursor:pointer;"></div>\n    <div class="islandgood" style="background: url(cdn/all/both/resources/icon_{3}.png) no-repeat center center; background-size: 18px auto; cursor: pointer;" data-tooltip="' +
        Constant.LanguageData[lang].to_mine +
        '"></div>\n <div class="transport" data-tooltip="' +
        Constant.LanguageData[lang].transporting +
        ' {2}" style="cursor:pointer;"></div>\n        </td>\n    <td class="population" data-tooltip="dynamic">\n        <span class= "pop" data-tooltip="dynamic"></span>\n        <span></span>\n        <div class="progressbarPop ui-progressbar ui-widget ui-widget-content ui-corner-all" data-tooltip="dynamic">\n            <div class="ui-progressbar-value ui-widget-header ui-corner-left" style="width: 95%"></div>\n        </div>\n    </td>\n    \n    <td class="population_happiness">   <span class="happy"  data-tooltip="dynamic"><img align=right height="18" hspace="8" vspace="2"></span><br><span class="growth clickbar"></span>\n </td>\n    <td class="research" data-tooltip="dynamic">\n        <span class="scientists" data-tooltip="dynamic"></span>\n        <span></span>\n    {4}   \n   </div>\n    </td>\n    {1}\n    </tr>\n';
      var resourceCell =
        '<td class="resource {0}">\n    <span class="icon safeImage"></span>\n    <span class="current"></span>\n   <span class="incoming" data-tooltip="dynamic"></span>\n    <div class="progressbar ui-progressbar ui-widget ui-widget-content ui-corner-all" data-tooltip="dynamic">\n    <div class="ui-progressbar-value ui-widget-header ui-corner-left" style="width: 95%"></div>\n    </div>\n  </td>\n<td class="resource {0}">\n    <span class="prodconssubsum production Green" data-tooltip="dynamic"></span>\n    <span class="prodconssubsum consumption Red" data-tooltip="dynamic"></span>\n    <span class="emptytime Red"></span>\n</td>';
      var footer =
        '<tr>\n    <td colspan="2"></td>\n   <td id="t_sigma" class="total" data-tooltip="dynamic">Σ</td>\n    <td id="t_population" class="total"></td><td id="t_growth" class="total"></td>\n    <td id="t_research" class="total" data-tooltip="dynamic"></td>\n        <td id="t_currentgold" class="total"></td>\n    <td id="t_goldincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n      <span class="Red"></span>\n         <td id="t_currentwood" class="total"></td>\n    <td id="t_woodincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n    <td id="t_currentwine" class="total"></td>\n    <td id="t_wineincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n    <td id="t_currentmarble" class="total"></td>\n    <td id="t_marbleincome" class="total"data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n    <td id="t_currentglass" class="total"></td>\n    <td id="t_glassincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n    <td id="t_currentsulfur" class="total"></td>\n    <td id="t_sulfurincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n</tr>';
      return Utils.format(table, [getHead(), getBody(), getFooter()]);
      function getHead() {
        return Utils.format(header, [
          Constant.LanguageData[lang].towns,
          Constant.LanguageData[lang].actionP,
          Constant.LanguageData[lang].population,
          Constant.LanguageData[lang].researchP,
          Constant.LanguageData[lang].finances_,
          Constant.LanguageData[lang].wood_,
          Constant.LanguageData[lang].wine_,
          Constant.LanguageData[lang].marble_,
          Constant.LanguageData[lang].crystal_,
          Constant.LanguageData[lang].sulphur_,
          database.getGlobalData.getLocalisedString("Current form"),
        ]);
      }
      function getBody() {
        var rows = "";
        jq.each(database.cities, function (cityId, city) {
          var resourceCells = "";
          var info = city.isUpgrading === true ? "!" : "";
          var progSci = "";
          if (this.getBuildingFromName(Constant.Buildings.ACADEMY))
            progSci =
              '<div class="progressbarSci ui-progressbar ui-widget ui-widget-content ui-corner-all" data-tooltip="dynamic">\n <div class="ui-progressbar-value ui-widget-header ui-corner-left" style="width: 95%"></span></div>';
          var wonder_size = 20;
          if (city.getWonder == 7 || 1) wonder_size = 25;
          jq.each(Constant.Resources, function (key, resourceName) {
            resourceCells += Utils.format(resourceCell, [resourceName]);
          });
          rows += Utils.format(resourceRow, [
            city.getId,
            resourceCells,
            city._name,
            city.getTradeGood,
            progSci,
            info,
            info ? Constant.LanguageData[lang].constructing : "",
            city.getTradeGoodID,
            wonder_size,
          ]);
        });
        return rows;
      }
      function getFooter() {
        return footer;
      }
    },
    getArmyTable: function () {
      var lang = database.settings.languageChange.value;
      var table =
        '<table class="army">\n    {0}\n    <tbody>{1}</tbody>\n    <tfoot>{2}</tfoot>\n</table>';
      var headerRow =
        '<thead><tr class="header_row">\n    <th class="city_name">{0}</th>\n    <th data-tooltip="{1}" class="icon actionpointImage action_points" >\n <th class="empireactions" colspan="2">\n       <div class="spio" data-tooltip="' +
        Constant.LanguageData[lang].espionage +
        '" style="cursor:pointer;"></div>\n<div class="combat"data-tooltip="' +
        Constant.LanguageData[lang].combat +
        '" style="cursor:pointer;"></div>\n  </th><th class="expenses_header icon expensesImage"data-tooltip="' +
        Constant.LanguageData[lang].expenses +
        '"></th>\n\n    {2}\n</tr></thead>';
      var headerCell =
        '<th data-tooltip="{0}" style="background:url(\'{1}\')  no-repeat center center; background-size: auto 24px; cursor: pointer;" colspan="2" class="army unit icon {2}" onclick="ajaxHandlerCall(\'?view=unitdescription&{5}Id={3}&helpId={4}\'); return false;">&nbsp;</th>\n\n';
      var bodyRow =
        '<tr id="army_{0}">\n    <td class="city_name"><img><span class="clickable"></span><sub></sub></td>\n    <td class="action_points"><span class="ap"></span>&nbsp;&nbsp;<br><span class="garrisonlimit"  data-tooltip="dynamic"><img height="18" hspace="5"></span></td>\n    <td class="empireactions">\n     <div class="deploymentarmy"data-tooltip="' +
        Constant.LanguageData[lang].transporting_units +
        '&nbsp;{2}" style="cursor:pointer;"></div>\n  <br>  <div class="deploymentfleet" data-tooltip="' +
        Constant.LanguageData[lang].transporting_fleets +
        '&nbsp;{2}" style="cursor:pointer;"></div>\n</td> \n <td class="empireactions">{3} <br> {4}  \n    </td>\n <td class="expenses"> {5} </td>\n   {1}\n</tr>';
      var bodyCell =
        '</td><td style="" class="army unit {0}">\n    <span>{1}</span>\n</td>\n<td style="" class="army movement {0}" data-tooltip="dynamic">\n    <span class="More Green {0}">{2}</span>\n  <br>  <span class="More Blue {0}">{3}</span>\n</td>';
      var footerRow =
        '<tr class="totals_row">\n    <td class="city_name"></td>\n    <td></td>\n   <td class="sigma" colspan="2">Σ</td><td>&nbsp;{1}&nbsp;</td>\n    {0}\n</tr>';
      var footerCell =
        '<td class="army total {0} unit">\n    <span></span>\n</td>\n<td style="" class="army total {0} movement">\n    <span class="More Green"></span>\n    <span class="More Blue"></span>\n</td>';
      return Utils.format(table, [getHead(), getBody(), getFooter()]);
      function getHead() {
        var headerCells = "";
        var cols = "<colgroup span=4/><colgroup></colgroup>";
        for (var category in Constant.unitOrder) {
          cols += "<colgroup>";
          jq.each(Constant.unitOrder[category], function (index, value) {
            var helpId = 9;
            var unit = "unit";
            if (Constant.UnitData[value].id < 300) {
              helpId = 10;
              unit = "ship";
            }
            headerCells += Utils.format(headerCell, [
              Constant.LanguageData[lang][value],
              getImage(value),
              value,
              Constant.UnitData[value].id,
              helpId,
              unit,
            ]);
            cols += "<col><col>";
          });
          cols += "</colgroup>";
        }
        return (
          cols +
          Utils.format(headerRow, [
            Constant.LanguageData[lang].towns,
            Constant.LanguageData[lang].actionP,
            headerCells,
          ])
        );
      }
      function getBody() {
        var body = "";
        jq.each(database.cities, function (cityId, city) {
          var rowCells = "";
          var barracksLink = "";
          if (this.getBuildingFromName(Constant.Buildings.BARRACKS))
            barracksLink =
              '<div class="barracks" data-tooltip="' +
              Constant.LanguageData[lang].to_barracks +
              '&nbsp;{2}" style="cursor:pointer;"></div>';
          var shipyardLink = "&nbsp;";
          if (this.getBuildingFromName(Constant.Buildings.SHIPYARD))
            shipyardLink =
              '<div class="shipyard" data-tooltip="' +
              Constant.LanguageData[lang].to_shipyard +
              '&nbsp;{2}" style="cursor:pointer;"></div>';
          var cost = 0;
          for (var category in Constant.unitOrder)
            jq.each(Constant.unitOrder[category], function (index, value) {
              var builds = city.getUnitBuildsByUnit(value);
              rowCells += Utils.format(bodyCell, [
                value,
                city.military.getUnits.getUnit(value) || "",
                builds[value] ? builds[value] : "",
                "",
              ]);
            });
          body += Utils.format(bodyRow, [
            city.getId,
            rowCells,
            city._name,
            barracksLink,
            shipyardLink,
            cost,
          ]);
        });
        return body;
      }
      function getFooter() {
        var footerCells = "";
        var expense = Utils.FormatNumToStr(
          database.getGlobalData.finance.armyCost +
            database.getGlobalData.finance.fleetCost,
        );
        for (var category in Constant.unitOrder)
          jq.each(Constant.unitOrder[category], function (index, value) {
            footerCells += Utils.format(footerCell, [value]);
          });
        return Utils.format(footerRow, [footerCells, expense]);
      }
      function getImage(unitID) {
        return Constant.UnitData[unitID].type == "fleet"
          ? "cdn/all/both/characters/fleet/60x60/" + unitID + "_faceright.png"
          : "cdn/all/both/characters/military/x60_y60/y60_" +
              unitID +
              "_faceright.png";
      }
    },
    getBuildingTable: function () {
      var lang = database.settings.languageChange.value;
      var table =
        '<table class="buildings">\n{0}\n    <tbody>{1}</tbody>\n</table>';
      var headerCell =
        '<th data-tooltip="{0}" style="background-color: transparent; background-image: url(\'{1}\'); \n background-repeat: no-repeat; background-attachment: scroll; background-position: center center; background-clip: \n border-box; background-origin: padding-box; background-size: 50px auto; cursor: pointer;" colspan="{2}" class="icon" onclick="ajaxHandlerCall(\'?view=buildingDetail&helpId=1&buildingId={3}\');return false;">&nbsp;</th>';
      var headerRow =
        '<thead><tr class="header_row">\n    <th class="city_name">{0}</th>\n    <th data-tooltip="{1}" class="action_points icon actionpointImage"></th>\n  <th class="empireactions">\n  <div class="contracts" data-tooltip="' +
        Constant.LanguageData[lang].contracts +
        '" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=diplomacyTreaty\')"></div></th>\n    {2}\n</tr></thead>';
      var buildingCell =
        '<td class="building {0}" data-tooltip="dynamic"></td>';
      var buildingRow =
        '<tr id="building_{0}">\n    <td class="city_name"><img><span class="clickable"></span><sub></sub></td>\n    <td class="action_points"><span class="ap"></span>&nbsp;&nbsp;<br><span class="garrisonlimit"  data-tooltip="dynamic"><img height="18" hspace="5"></span></td>\n    <td class="empireactions">\n  <div class="deploymentfleet"></div> <br>  <div class="transport" data-tooltip="' +
        Constant.LanguageData[lang].transporting +
        ' {2}" style="cursor:pointer;"></div>\n   </td>\n    {1}\n</tr>';
      var counts = database.getBuildingCounts;
      var buildingOrder = database.settings.alternativeBuildingList.value
        ? Constant.altBuildingOrder
        : database.settings.compressedBuildingList.value
          ? Constant.compBuildingOrder
          : Constant.buildingOrder;
      return Utils.format(table, [getHead(), getBody()]);
      function getHead() {
        var headerCells = "";
        var colgroup = '<colgroup span="3"></colgroup>';
        for (var category in buildingOrder) {
          var cols = "";
          jq.each(buildingOrder[category], function (index, value) {
            if (value == "colonyBuilding") {
              if (
                !database.settings.compressedBuildingList.value ||
                !counts[value]
              )
                return true;
              cols += '<col span="' + counts[value] + '">';
              headerCells += Utils.format(headerCell, [
                Constant.LanguageData[lang].palace +
                  "/" +
                  Constant.LanguageData[lang].palaceColony,
                Constant.BuildingData[Constant.Buildings.PALACE].icon,
                counts[value],
                "?view=buildingDetail&helpId=1&buildingId=" +
                  Constant.BuildingData.palace.buildingId,
              ]);
            } else if (value == "productionBuilding") {
              if (
                !database.settings.compressedBuildingList.value ||
                !counts[value]
              )
                return true;
              cols += '<col span="' + counts[value] + '">';
              headerCells += Utils.format(headerCell, [
                Constant.LanguageData[lang].stonemason +
                  "/" +
                  Constant.LanguageData[lang].winegrower +
                  "/" +
                  Constant.LanguageData[lang].alchemist +
                  "/" +
                  Constant.LanguageData[lang].glassblowing,
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAUCAMAAACknt2MAAABelBMVEUAAADp49mgkICxmnzVuIxMcwtciQ90pSC/tKR7aFWOfGmIdmPKr4lomxChyk/YxKjTyrzl2slrVkKBblu5ooXp0a3NwrOqm4uNeWRTMzMnGRZFQBvb0sS0p5j18OiTgW3cvpSeXF07JSSJUlLFeHY2NhZzrRKZh3XmyJwPCgl7jzSHyBXlx53EuateSje0amp0YE2Fc2FzSEeFqzfoyJftylO7l1312oXv0GzWyqzN0MH15b311WO3iy2jchyLXiuZrqtyt9uJx+bP2M789+/sz3nv2p7+5IOXZRWHVA/jxou7vquTyuS7x72MqKmEw+J/wOFdk6ylsaXsz6Xz1njKnzTBlkF6SAvhvE2TsraVzeiNyeZ8ttJ7v+EzXnXJ1M2tfiKts6S63ex2utyUw9hFhqV6ss2W0O7fvmDUrUJnnrOk0+tjq8602uzO6fbCyr7Eu6BqrM1tstS74fKbzeXS6/dvud7OrG1PlLeMwNfW7viu2e2i0ObK4OYudx14AAAAAXRSTlMAQObYZgAAAAFiS0dEAIgFHUgAAAAJcEhZcwAAAEgAAABIAEbJaz4AAAFfSURBVCgVBcFLTlNhGADQ8/29t/e/reVhChWkUDFRE0hM1IlxYiIzhy5EN+ASTNyBO3DoIpw7VBNAiga0QFKsPK7nBBARV4AiIq4ukUBWVd0bQI0OJJjPC3VcV0AVTdOGhKVot//0TEFR9pebWQ8J1d9qNjxZjhGKYV3XI7N7JLDfU+dh48HmekrKcjYab0m2Y7GeP9tb2ztCL5meT8J45UJre5KOrlZv/hr0TyeXk3p6sdBqfc96439p399GXdx2Pbxv47zTreeiGcxKAABF8aiA/tZjAZ5EfAYA0ALDFKsrB4Cn63sgwbOyVeYu4HnOL0BgJyJOFkR88jIiIiI+ouDVecfhMCIa5iLix1oEJDtnnShmZ2mcT8k5VXdzzpB20kn/8HJkcfVnw4c8V09znr5GSpsbX5qlruOvA7zZbbdXqvJWhfR799tgduzhnVY9z/vtnN9VdfvgLQAAAPgPmQZaHvndsJEAAAAASUVORK5CYII=",
                counts[value],
                "?view=buildingDetail&helpId=1&buildingId=21",
              ]).replace("50px auto", "38px 28px");
            } else if (counts[value]) {
              cols += '<col span="' + counts[value] + '">';
              headerCells += Utils.format(headerCell, [
                Constant.LanguageData[lang][value],
                Constant.BuildingData[value].icon,
                counts[value],
                "?view=buildingDetail&helpId=1&buildingId=" +
                  Constant.BuildingData[value].buildingId,
              ]);
            }
          });
          if (cols !== "") colgroup += "<colgroup>" + cols + "</colgroup>";
        }
        return (
          colgroup +
          Utils.format(headerRow, [
            Constant.LanguageData[lang].towns,
            Constant.LanguageData[lang].actionP,
            headerCells,
          ])
        );
      }
      function getBody() {
        var body = "";
        jq.each(database.cities, function (cityId, city) {
          var rowCells = "";
          for (var category in buildingOrder)
            jq.each(buildingOrder[category], function (index, value) {
              if (
                (value == "productionBuilding" || value == "colonyBuilding") &&
                !database.settings.compressedBuildingList.value
              )
                return false;
              var i = 0;
              while (i < counts[value]) {
                var cssClass = "";
                if (value == "colonyBuilding")
                  cssClass = city.isCapital
                    ? Constant.Buildings.PALACE
                    : Constant.Buildings.GOVERNORS_RESIDENCE;
                else if (value == "productionBuilding")
                  switch (city.getTradeGoodID) {
                    case 1:
                      cssClass = Constant.Buildings.WINERY;
                      break;
                    case 2:
                      cssClass = Constant.Buildings.STONEMASON;
                      break;
                    case 3:
                      cssClass = Constant.Buildings.GLASSBLOWER;
                      break;
                    case 4:
                      cssClass = Constant.Buildings.ALCHEMISTS_TOWER;
                      break;
                  }
                else cssClass = value;
                cssClass += +i;
                rowCells += Utils.format(buildingCell, [cssClass]);
                i++;
              }
            });
          body += Utils.format(buildingRow, [city.getId, rowCells, city._name]);
        });
        return body;
      }
    },
    AddIslandCSS: function () {
      if (!/.*view=island.*/.test(window.document.location.href)) {
        if (!this.cssResLoaded())
          Utils.addStyleSheet(
            '@import "https://' +
              ikariam.Host() +
              "/skin/compiled-" +
              ikariam.Nationality() +
              '-island.css";',
          );
      }
    },
    updateCityArmyCell: function (cityId, type, $node) {
      var $row;
      var celllevel = !$node;
      try {
        if (celllevel) {
          $row = this.getArmyRow(cityId);
          $node = Utils.getClone($row);
        }
        var city = database.getCityFromId(cityId);
        var ownUnits = city.military.getUnits.getUnit(type) || 0;
        var incomingUnits = city.military.getIncomingTotals[type] || 0;
        var trainingUnits = city.military.getTrainingTotals[type] || 0;
        var cells = $node.find("td." + type);
        cells.get(0).textContent =
          Utils.FormatNumToStr(ownUnits, false, 0) || "";
        cells = cells.eq(1).children("span");
        cells.get(0).textContent =
          Utils.FormatNumToStr(incomingUnits, true, 0) || "";
        cells.get(1).textContent =
          Utils.FormatNumToStr(trainingUnits, true, 0) || "";
        delete this.cityRows.army[cityId];
        if (celllevel) {
          Utils.setClone($row, $node);
          this.setArmyTotals(void 0, type);
        }
      } catch (e) {
        empire.error("updateCityArmyCell", e);
      }
    },
    updateCityArmyRow: function (cityId, $node) {
      var $row;
      var rowLevel = !$node;
      if (rowLevel) {
        $row = this.getArmyRow(cityId);
        $node = Utils.getClone($row);
      }
      for (var armyId in Constant.UnitData)
        this.updateCityArmyCell(cityId, armyId, $node);
      if (rowLevel) {
        Utils.setClone($row, $node);
        this.setArmyTotals();
        delete this.cityRows.army[cityId];
      }
    },
    updateCitiesArmyData: function () {
      var $node = jq("#ArmyTab").find("table.army");
      var $clone = Utils.getClone($node);
      for (var cityId in database.cities)
        empire.time(
          this.updateCityArmyRow.bind(
            this,
            cityId,
            $clone.find("#army_" + cityId),
          ),
          "updateArmyRow",
        );
      this.setArmyTotals($clone);
      Utils.setClone($node, $clone);
      this.cityRows.army = {};
    },
    updateChangesForCityMilitary: function (cityId, changes) {
      if (changes && changes.length < 5) {
        jq.each(
          changes,
          function (index, unit) {
            this.updateCityArmyCell(cityId, unit);
          }.bind(render),
        );
        this.setArmyTotals();
      } else this.updateCityArmyRow(cityId);
    },
    updateGlobalData: function (changes) {
      this.setAllResourceData();
      return true;
    },
    updateMovementsForCity: function (changedCityIds) {
      if (changedCityIds.length)
        jq.each(
          changedCityIds,
          function (index, id) {
            var city = database.getCityFromId(id);
            if (city) this.setMovementDataForCity(city);
          }.bind(render),
        );
    },
    updateResourcesForCity: function (cityId, changes) {
      if (database.getCityFromId(cityId))
        events.scheduleAction(
          this.updateResourceCounters.bind(render, true),
          0,
        );
    },
    updateCityDataForCity: function (cityId, changes) {
      var city = database.getCityFromId(cityId);
      if (city) {
        var research = 0,
          population = 0,
          finance = 0;
        for (var key in changes)
          switch (key) {
            case "research":
              research += changes[key];
              break;
            case "priests":
              if (
                Constant.Government.THEOCRACY === database.getGovernmentType
              ) {
                population += changes[key];
                finance += changes[key];
              }
              break;
            case "culturalGoods":
              research += changes[key];
              population += changes[key];
              break;
            case "citizens":
            case "population":
              population += changes[key];
              finance += changes[key];
              break;
            case "name":
              this.setCityName(city);
              break;
            case "islandId":
              break;
            case "coordinates":
              break;
            case "finance":
              finance += changes[key];
          }
        if (!!population) this.setPopulationData(city);
        if (!!research) this.setResearchData(city);
        if (!!finance) this.setFinanceData(city);
      }
    },
    setArmyTotals: function ($node, unitId) {
      var data = database.getArmyTotals;
      if (!$node) $node = jq("#ArmyTab");
      if (unitId) {
        $node
          .find("td.total." + unitId)
          .eq(0)
          .text(Utils.FormatNumToStr(data[unitId].total, false, 0) || "")
          .next()
          .children("span")
          .eq(0)
          .text(Utils.FormatNumToStr(data[unitId].incoming, true, 0) || "")
          .next()
          .text(Utils.FormatNumToStr(data[unitId].training, true, 0) || "");
        if (
          data[unitId].training ||
          data[unitId].incoming ||
          data[unitId].total ||
          database.settings.fullArmyTable.value
        )
          $node.find("td." + unitId + " ,th." + unitId).show();
        else $node.find("td." + unitId + " ,th." + unitId).hide();
      } else
        jq.each(Constant.UnitData, function (unit, info) {
          $node
            .find("td.total." + unit)
            .eq(0)
            .text(Utils.FormatNumToStr(data[unit].total, false, 0) || "")
            .next()
            .children("span")
            .eq(0)
            .text(Utils.FormatNumToStr(data[unit].incoming, true, 0) || "")
            .next()
            .text(Utils.FormatNumToStr(data[unit].training, true, 0) || "");
          if (
            data[unit].training ||
            data[unit].incoming ||
            data[unit].total ||
            database.settings.fullArmyTable.value
          )
            $node.find("td." + unit + " ,th." + unit).show();
          else $node.find("td." + unit + " ,th." + unit).hide();
        });
    },
    updateChangesForCityBuilding: function (cityID, changes) {
      try {
        var city = database.getCityFromId(cityID);
        if (city) {
          if (changes.length)
            jq.each(
              changes,
              function (key, data) {
                if (
                  city.getBuildingFromPosition(data.position).getName ===
                  data.name
                )
                  this.updateCityBuildingPosition(city, data.position);
                else {
                  this.updateCityBuildingRow(city);
                  return false;
                }
              }.bind(render),
            );
        }
      } catch (e) {
        empire.error("updateChangesForCityBuilding", e);
      }
    },
    updateCityBuildingPosition: function (city, position, $node) {
      var building = city.getBuildingFromPosition(position);
      var idx = 0;
      var cellOnly = $node === void 0;
      jq.each(city.getBuildingsFromName(building.getName), function (index, b) {
        if (b.getPosition == building.getPosition) {
          idx = index;
          return false;
        }
      });
      var cell;
      if (cellOnly) {
        $node = render.getBuildingsRow(city);
        cell = $node.find("td.building." + building.getName + idx);
      } else cell = $node.find("td.building." + building.getName + idx);
      if (!building.isEmpty)
        if (cell.length)
          cell
            .html("<span>" + building.getLevel + "</span>")
            .find("span")
            .removeClass("upgrading upgradable upgradableSoon maxLevel")
            .addClass("clickable")
            .addClass(
              (building.isMaxLevel ? "maxLevel" : "") +
                (building.isUpgrading ? " upgrading" : "") +
                (building.isUpgradable
                  ? city.isUpgrading
                    ? " upgradableSoon"
                    : " upgradable"
                  : ""),
            );
        else return false;
      return true;
    },
    updateCityBuildingRow: function (city, $node) {
      try {
        var $row;
        var cellLevel = !$node;
        if (cellLevel) {
          $row = this.getBuildingsRow(city);
          $node = Utils.getClone($row);
        }
        var success = true;
        jq.each(
          city.getBuildings,
          function (position, building) {
            success = this.updateCityBuildingPosition(city, position, $node);
            return success;
          }.bind(render),
        );
        if (cellLevel) {
          render.cityRows.building[city.getId] = void 0;
          $node.find("table.buildings").html(render.getBuildingTable);
          if (!success) {
            render.updateCitiesBuildingData();
            jq.each(database.cities, function (cityId, city) {
              render.setCityName(city);
              render.setActionPoints(city);
            });
            return success;
          }
          Utils.setClone($row, $node);
        }
        return success;
      } catch (e) {
        empire.error("updateCityBuildingRow", e);
      }
    },
    updateCitiesBuildingData: function ($redraw) {
      try {
        var success = true;
        var $node = jq("#BuildTab").find("table.buildings");
        var $clone = $redraw || Utils.getClone($node);
        jq.each(
          database.cities,
          function (cityId, city) {
            success = empire.time(
              this.updateCityBuildingRow.bind(
                this,
                city,
                $clone.find("#building_" + city.getId),
              ),
              "updateBuildingRow",
            );
            return success;
          }.bind(render),
        );
        if (!success) {
          $clone.html(render.getBuildingTable);
          if (!$redraw) render.updateCitiesBuildingData($clone);
        }
        if (!$redraw) {
          this.cityRows.building = {};
          Utils.setClone($node, $clone);
        } else
          jq.each(database.cities, function (cityId, city) {
            render.setCityName(city);
            render.setActionPoints(city);
          });
      } catch (e) {
        empire.error("updateCitiesBuildingData", e);
      }
    },
    redrawSettings: function () {
      jq("#SettingsTab").html(render.getSettingsTable());
      jq("#empire_Reset_Button").button({
        icons: { primary: "ui-icon-alert" },
        text: true,
      });
      jq("#empire_Website_Button").button({
        icons: { primary: "ui-icon-home" },
        text: true,
      });
      jq("#empire_Update_Button").button({
        icons: { primary: "ui-icon-info" },
        text: true,
      });
      jq("#empire_Bug_Button").button({
        icons: { primary: "ui-icon-notice" },
        text: true,
      });
      jq("#empire_CheckAll_Button").button({
        icons: { primary: "ui-icon-notice" },
        text: true,
      });
      jq("#empire_Check_Button").button({
        icons: { primary: "ui-icon-notice" },
        text: true,
      });
      jq("#empire_Save_Button").button({
        icons: { primary: "ui-icon-check" },
        text: true,
      });
    },
    DrawContentBox: function () {
      var lang = database.settings.languageChange.value;
      if (!this.mainContentBox) {
        jq("#container").after(
          '<div id="empireBoard" class="ui-widget" style="display:none;z-index:' +
            (database.settings.onTop.value ? 65112 : 61) +
            ';position: absolute; left:70px;top:180px;"><div id="empire_Tabs"><ul><li><a href="#ResTab">' +
            Constant.LanguageData[lang].economy +
            '</a></li><li><a href="#BuildTab">' +
            Constant.LanguageData[lang].buildings +
            '</a></li><li><a href="#ArmyTab">' +
            Constant.LanguageData[lang].military +
            '</a></li><li><a href="#SettingsTab" data-tooltip="' +
            Constant.LanguageData[lang].options +
            '"><span class="ui-icon ui-icon-gear"/></a></li><li><a href="#HelpTab" data-tooltip="' +
            Constant.LanguageData[lang].help +
            '"><span class="ui-icon ui-icon-help"/></a></li></ul><div id="ResTab"></div><div id="BuildTab"></div><div id="ArmyTab"></div><div id="WorldmapTab"></div><div id="SettingsTab"></div><div id="HelpTab"></div></div></div>',
        );
        this.mainContentBox = jq("#empireBoard");
        this.$tabs = jq("#empire_Tabs").tabs({
          collapsible: true,
          show: null,
          selected: -1,
        });
        this.mainContentBox.draggable({
          handle: "#empire_Tabs > ul",
          cancel: "div.ui-tabs-panel",
          stop: function () {
            render.SaveDisplayOptions();
          },
        });
        this.$tabs.find("ul li a").on("click", function () {
          events(Constant.Events.TAB_CHANGED).pub(
            render.$tabs.tabs("option", "active"),
          );
          render.SaveDisplayOptions();
        });
        render.mainContentBox
          .on("mouseenter", function () {
            if (database.settings.windowTennis.value)
              render.mainContentBox.css("z-index", "65112");
          })
          .on("mouseleave", function () {
            if (database.settings.windowTennis.value)
              render.mainContentBox.css("z-index", "2");
          });
      }
    },
    AttachClickHandlers: function () {
      jq("body").on("click", "#js_buildingUpgradeButton", function (e) {
        var upgradeSuccessCheck;
        var href = this.getAttribute("href");
        if (href !== "#") {
          var params = jq.decodeUrlParam(href);
          if (params["function"] === "upgradeBuilding")
            upgradeSuccessCheck = (function upgradeSuccess() {
              var p = params;
              return function (response) {
                var len = response.length;
                var feedback = 0;
                while (len--)
                  if (response[len][0] == "provideFeedback") {
                    feedback = response[len][1][0].type;
                    break;
                  }
                if (feedback == 10)
                  render.updateChangesForCityBuilding(
                    p.cityId || ikariam.getCurrentCity,
                    [],
                  );
                events("ajaxResponse").unsub(upgradeSuccessCheck);
              };
            })();
          events("ajaxResponse").sub(upgradeSuccessCheck);
        }
      });
      render.mainContentBox
        .on("click", "td.city_name span.clickable", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          target.parents("td").attr("class");
          var params = { cityId: city.getId };
          if (!city.isCurrentCity) {
            jq("#js_cityIdOnChange").val(city.getId);
            if (unsafeWindow.ikariam.templateView) {
              if (
                unsafeWindow.ikariam.templateView.id === "tradegood" ||
                unsafeWindow.ikariam.templateView.id === "resource"
              ) {
                params.templateView = unsafeWindow.ikariam.templateView.id;
                if (ikariam.viewIsCity) {
                  params.islandId = city.getIslandID;
                  params.view = unsafeWindow.ikariam.templateView.id;
                  params.type =
                    unsafeWindow.ikariam.templateView.id == "resource"
                      ? "resource"
                      : city.getTradeGoodID;
                } else
                  params.currentIslandId = ikariam.getCurrentCity.getIslandID;
              }
            }
            ikariam.loadUrl(true, ikariam.mainView, params);
          }
          return false;
        })
        .on("click", "td.empireactions div.transport", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("td").parents("tr").attr("id").split("_").pop(),
          );
          if (!city.isCurrentCity && ikariam.getCurrentCity)
            ikariam.loadUrl(true, ikariam.mainView, {
              view: "transport",
              destinationCityId: city.getId,
              templateView: Constant.Buildings.TRADING_PORT,
            });
          return false;
        })
        .on(
          "click",
          "td.empireactions div[class*=deployment]",
          function (event) {
            var target = jq(event.target);
            var city = database.getCityFromId(
              target.parents("tr").attr("id").split("_").pop(),
            );
            var type = target
              .attr("class")
              .split(" ")
              .pop()
              .split("deployment")
              .pop();
            if (ikariam.currentCityId === city.getId) return false;
            var params = {
              cityId: ikariam.CurrentCityId,
              view: "deployment",
              deploymentType: type,
              destinationCityId: city.getId,
            };
            ikariam.loadUrl(true, null, params);
          },
        );
      jq("#empire_Tabs")
        .on("click", "td.empireactions div.worldmap", function (event) {
          var target = jq(event.target);
          target.parents("td").attr("class").split(" ").pop();
          var params = {
            cityId: database.getCityFromId(
              target.parents("tr").attr("id").split("_").pop(),
            ).getId,
            view: "worldmap_iso",
          };
          ikariam.loadUrl(true, "city", params);
          return false;
        })
        .on("click", "td.empireactions div.island", function (event) {
          var target = jq(event.target);
          target.parents("td").attr("class").split(" ").pop();
          var params = {
            cityId: database.getCityFromId(
              target.parents("tr").attr("id").split("_").pop(),
            ).getId,
            view: "island",
          };
          ikariam.loadUrl(true, null, params);
          return false;
        })
        .on("click", "td.empireactions div.city", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          target.parents("td").attr("class").split(" ").pop();
          var params = city.getBuildingFromName(
            Constant.Buildings.TOWN_HALL,
          ).getUrlParams;
          if (unsafeWindow.ikariam.templateView)
            unsafeWindow.ikariam.templateView.id = null;
          ikariam.loadUrl(true, "city", params);
          return false;
        })
        .on("click", "td.population_happiness", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          target.parents("td").attr("class").split(" ").pop();
          var params = city.getBuildingFromName(
            Constant.Buildings.TAVERN,
          ).getUrlParams;
          if (unsafeWindow.ikariam.templateView)
            unsafeWindow.ikariam.templateView.id = null;
          ikariam.loadUrl(true, "city", params);
          return false;
        })
        .on("click", "td.research span", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          target.parents("td").attr("class").split(" ").pop();
          var params = city.getBuildingFromName(
            Constant.Buildings.ACADEMY,
          ).getUrlParams;
          if (unsafeWindow.ikariam.templateView)
            unsafeWindow.ikariam.templateView.id = null;
          ikariam.loadUrl(true, "city", params);
          return false;
        })
        .on("click", "td.empireactions div.barracks", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          target.parents("td").attr("class").split(" ").pop();
          var params = city.getBuildingFromName(
            Constant.Buildings.BARRACKS,
          ).getUrlParams;
          if (unsafeWindow.ikariam.templateView)
            unsafeWindow.ikariam.templateView.id = null;
          ikariam.loadUrl(true, "city", params);
          return false;
        })
        .on("click", "td.empireactions div.shipyard", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          target.parents("td").attr("class").split(" ").pop();
          var params = city.getBuildingFromName(
            Constant.Buildings.SHIPYARD,
          ).getUrlParams;
          if (unsafeWindow.ikariam.templateView)
            unsafeWindow.ikariam.templateView.id = null;
          ikariam.loadUrl(true, "city", params);
          return false;
        })
        .on("click", "td.wonder", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          target.parents("td").attr("class").split(" ").pop();
          var params = city.getBuildingFromName(
            Constant.Buildings.TEMPLE,
          ).getUrlParams;
          if (unsafeWindow.ikariam.templateView)
            unsafeWindow.ikariam.templateView.id = null;
          ikariam.loadUrl(true, "city", params);
          return false;
        })
        .on("click", "th.empireactions div.spio", function () {
          ikariam.loadUrl(
            ikariam.viewIsCity,
            "city",
            ikariam.getCurrentCity.getBuildingFromName(
              Constant.Buildings.HIDEOUT,
            ).getUrlParams,
          );
        })
        .on("click", "th.empireactions div.combat", function () {
          ikariam.loadUrl(ikariam.viewIsCity, "city", {
            view: "militaryAdvisor",
            activeTab: "combatReports",
          });
        })
        .on("click", "span.production", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          var resource = target.parents("td").attr("class").split(" ").pop();
          var params = { cityId: city.getId };
          if (ikariam.CurrentCityId == city.getId || !ikariam.viewIsIsland) {
            params.type =
              resource == Constant.Resources.WOOD
                ? "resource"
                : city.getTradeGoodID;
            params.view =
              resource == Constant.Resources.WOOD ? "resource" : "tradegood";
            params.islandId = city.getIslandID;
          } else if (ikariam.viewIsIsland) {
            params.templateView =
              resource == Constant.Resources.WOOD ? "resource" : "tradegood";
            if (unsafeWindow.ikariam.templateView)
              unsafeWindow.ikariam.templateView.id = null;
          }
          if (ikariam.viewIsIsland)
            params.currentIslandId = ikariam.getCurrentCity.getIslandID;
          ikariam.loadUrl(true, ikariam.mainView, params);
          render.AddIslandCSS();
          return false;
        })
        .on("click", "td.empireactions div.islandgood", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          var resource = target.parents("td").attr("class").split(" ").pop();
          var params = { cityId: city.getId };
          if (ikariam.CurrentCityId == city.getId || !ikariam.viewIsIsland) {
            params.type =
              resource == Constant.Resources.WOOD
                ? "resource"
                : city.getTradeGoodID;
            params.view =
              resource == Constant.Resources.WOOD ? "resource" : "tradegood";
            params.islandId = city.getIslandID;
          } else if (ikariam.viewIsIsland) {
            params.templateView =
              resource == Constant.Resources.WOOD ? "resource" : "tradegood";
            if (unsafeWindow.ikariam.templateView)
              unsafeWindow.ikariam.templateView.id = null;
          }
          if (ikariam.viewIsIsland)
            params.currentIslandId = ikariam.getCurrentCity.getIslandID;
          ikariam.loadUrl(true, ikariam.mainView, params);
          render.AddIslandCSS();
          return false;
        })
        .on("click", "td.empireactions div.islandwood", function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          var resource = target.parents("td").attr("class").split(" ").pop();
          var params = { cityId: city.getId };
          if (ikariam.CurrentCityId == city.getId || !ikariam.viewIsIsland) {
            params.type =
              resource == Constant.Resources.WOOD
                ? city.getTradeGoodID
                : "resource";
            params.view =
              resource == Constant.Resources.WOOD ? "tradegood" : "resource";
            params.islandId = city.getIslandID;
          } else if (ikariam.viewIsIsland) {
            params.templateView =
              resource == Constant.Resources.WOOD ? "resource" : "tradegood";
            if (unsafeWindow.ikariam.templateView)
              unsafeWindow.ikariam.templateView.id = null;
          }
          if (ikariam.viewIsIsland)
            params.currentIslandId = ikariam.getCurrentCity.getIslandID;
          ikariam.loadUrl(true, ikariam.mainView, params);
          render.AddIslandCSS();
          return false;
        });
      jq("#empire_Tabs").on(
        "click",
        "td.building span.clickable",
        function (event) {
          var target = jq(event.target);
          var city = database.getCityFromId(
            target.parents("tr").attr("id").split("_").pop(),
          );
          var className = target.parents("td").attr("class").split(" ").pop();
          var params = city.getBuildingsFromName(className.slice(0, -1))[
            className.charAt(className.length - 1)
          ].getUrlParams;
          if (unsafeWindow.ikariam.templateView)
            unsafeWindow.ikariam.templateView.id = null;
          ikariam.loadUrl(true, "city", params);
          return false;
        },
      );
    },
    startResourceCounters: function () {
      this.stopResourceCounters();
      this.resUpd = events.scheduleActionAtInterval(
        render.updateResourceCounters.bind(render),
        5e3,
      );
      this.updateResourceCounters(true);
    },
    stopResourceCounters: function () {
      if (this.resUpd) {
        this.resUpd();
        this.resUpd = null;
      }
    },
    getResourceRow: function (city) {
      return this._getRow(city, "resource");
    },
    getBuildingsRow: function (city) {
      return this._getRow(city, "building");
    },
    getArmyRow: function (city) {
      return this._getRow(city, "army");
    },
    _getRow: function (city, type) {
      city = typeof city == "object" ? city : database.getCityFromId(city);
      if (!this.cityRows[type][city.getId])
        this.cityRows[type][city.getId] = jq("#" + type + "_" + city.getId);
      return this.cityRows[type][city.getId];
    },
    getAllRowsForCity: function (city) {
      return this.getResourceRow(city)
        .add(this.getBuildingsRow(city))
        .add(this.getArmyRow(city));
    },
    setCityName: function (city, rows) {
      if (!rows) rows = this.getAllRowsForCity(city);
      var lang = database.settings.languageChange.value;
      rows.find("td.city_name").each(function (index, elem) {
        elem.children[0].outerHTML =
          '<span class="icon ' + city.getTradeGood + 'Image"></span>';
        elem.children[1].textContent = city.getName;
        elem.children[2].textContent =
          " " + (city.getAvailableBuildings || "") + " ";
        elem.children[2].setAttribute(
          "data-tooltip",
          Constant.LanguageData[lang].free_ground,
        );
      });
    },
    setActionPoints: function (city, rows) {
      if (!rows) rows = this.getAllRowsForCity(city);
      rows.find("span.ap").text(city.getAvailableActions + "/" + city.maxAP);
      rows
        .find("span.garrisonlimit img")
        .attr("src", "cdn/all/both/advisors/military/bang_soldier.png");
    },
    setFinanceData: function (city, row) {
      if (!row) row = this.getResourceRow(city);
    },
    setPopulationData: function (city, row) {
      if (!row) row = this.getResourceRow(city);
      var lang = database.settings.languageChange.value;
      var populationData = city.populationData;
      var popSpace = Math.floor(
        populationData.currentPop - populationData.maxPop,
      );
      var popDiff = populationData.maxPop - populationData.currentPop;
      row.find("td.population span").get(0).textContent =
        Utils.FormatNumToStr(populationData.currentPop, false, 0) +
        "/" +
        Utils.FormatNumToStr(populationData.maxPop, false, 0);
      row.find("td.population span").get(1).textContent =
        popSpace !== 0 ? Utils.FormatNumToStr(popSpace, true, 0) : "";
      var fillperc = (100 / populationData.maxPop) * populationData.currentPop;
      row
        .find("td.population div.progressbarPop")
        .find("div.ui-progressbar-value")
        .width(fillperc + "%")
        .removeClass("normal, warning, full")
        .addClass(
          populationData.currentPop / populationData.maxPop == 1
            ? "full"
            : city._citizens < 300
              ? "warning"
              : "normal",
        );
      var img = "";
      if (populationData.growth < -1) img = "outraged";
      else if (populationData.growth < 0) img = "sad";
      else if (populationData.growth < 1) img = "neutral";
      else if (populationData.growth < 6) img = "happy";
      else img = "ecstatic";
      row
        .find("td.population_happiness span img")
        .attr("src", "cdn/all/both/smilies/" + img + "_x25.png");
      row
        .find("span.growth")
        .text(
          popDiff !== 0
            ? Utils.FormatNumToStr(populationData.growth, true, 2)
            : "0" + Constant.LanguageData[lang].decimalPoint + "00",
        );
      row
        .find("span.growth")
        .removeClass("Red Green")
        .addClass(
          populationData.happiness > 60 && popDiff === 0
            ? "Red"
            : populationData.happiness > 0 &&
                populationData.happiness <= 60 &&
                popDiff > 0
              ? "Green"
              : "",
        );
    },
    setResearchData: function (city, row) {
      if (!row) row = this.getResourceRow(city);
      var researchData = researchData || city.research.researchData;
      row.find("td.research span").addClass("clickbar").get(0).textContent =
        Utils.FormatNumToStr(city.research.getResearch) > 0
          ? Utils.FormatNumToStr(city.research.getResearch, true, 0)
          : city.iSci;
      var fillperc = (100 * researchData.scientists) / city.maxSci;
      row
        .find("td.research div.progressbarSci")
        .find("div.ui-progressbar-value")
        .width(fillperc + "%")
        .removeClass("normal, full")
        .addClass(
          researchData.scientists === 0
            ? ""
            : city.maxSci - researchData.scientists > 0
              ? "normal"
              : "full",
        );
    },
    setMovementDataForCity: function (city, row) {
      if (!row) row = this.getResourceRow(city);
      var totalIncoming = {
        wood: 0,
        wine: 0,
        marble: 0,
        glass: 0,
        sulfur: 0,
        gold: 0,
      };
      jq.each(city.getIncomingResources, function (index, element) {
        for (var resourceName in Constant.Resources)
          totalIncoming[Constant.Resources[resourceName]] +=
            element.getResource(Constant.Resources[resourceName]);
      });
      row.find("td.resource.wood").find("span.incoming").get(0).textContent =
        Utils.FormatNumToStr(totalIncoming[Constant.Resources.WOOD]) || "";
      row.find("td.resource.wine").find("span.incoming").get(0).textContent =
        Utils.FormatNumToStr(totalIncoming[Constant.Resources.WINE]) || "";
      row.find("td.resource.marble").find("span.incoming").get(0).textContent =
        Utils.FormatNumToStr(totalIncoming[Constant.Resources.MARBLE]) || "";
      row.find("td.resource.glass").find("span.incoming").get(0).textContent =
        Utils.FormatNumToStr(totalIncoming[Constant.Resources.GLASS]) || "";
      row.find("td.resource.sulfur").find("span.incoming").get(0).textContent =
        Utils.FormatNumToStr(totalIncoming[Constant.Resources.SULFUR]) || "";
      row.find("td.resource.gold").find("span.incoming").get(0).textContent =
        Utils.FormatNumToStr(totalIncoming[Constant.Resources.GOLD]) || "";
    },
    setAllResourceData: function () {
      this.startResourceCounters();
    },
    setCommonData: function () {
      jq.each(
        database.cities,
        function (cityId, city) {
          this.setCityName(city);
          this.setActionPoints(city);
        }.bind(render),
      );
    },
    updateResourceCounters: function (force) {
      try {
        if (this.$tabs.tabs("option", "active") === 0 || force) {
          var tot = {
            wood: 0,
            wine: 0,
            marble: 0,
            glass: 0,
            sulfur: 0,
          };
          var inc = {
            wood: 0,
            wine: 0,
            marble: 0,
            glass: 0,
            sulfur: 0,
          };
          var conWine = 0;
          var income = 0;
          var researchCost = 0;
          var researchTot = 0;
          var populationTot = 0;
          var populationMaxTot = 0;
          var growthTot = 0;
          var citygrowth = 0;
          var popDiffTot = 0;
          jq.each(
            database.cities,
            function (cityId, city) {
              var $row = Utils.getClone(this.getResourceRow(city));
              if (force) {
                this.setFinanceData(city, $row);
                this.setPopulationData(city, $row);
                this.setResearchData(city, $row);
                this.setActionPoints(city, $row);
                this.setMovementDataForCity(city, $row);
              }
              income += Math.floor(city.getIncome);
              researchTot += city.research.getResearch;
              researchCost += Math.floor(city.getExpenses);
              populationTot += city._population;
              populationMaxTot += city.populationData.maxPop;
              citygrowth =
                city.populationData.maxPop - city._population > 0
                  ? city.populationData.growth
                  : 0;
              growthTot += citygrowth;
              popDiffTot = Math.floor(populationMaxTot - populationTot);
              var storage = city.maxResourceCapacities;
              jq.each(
                Constant.Resources,
                function (key, resourceName) {
                  var lang = database.settings.languageChange.value;
                  var currentResource = city.getResource(resourceName);
                  var production = currentResource.getProduction * 3600;
                  var current = currentResource.getCurrent;
                  var consumption =
                    resourceName == Constant.Resources.WINE
                      ? currentResource.getConsumption
                      : 0;
                  inc[resourceName] += production;
                  tot[resourceName] += current;
                  conWine += consumption;
                  var rescells = $row.find("td.resource." + resourceName);
                  rescells
                    .find("span.current")
                    .addClass(
                      resourceName == Constant.Resources.WOOD ||
                        city.getTradeGood == resourceName,
                    )
                    .get(0).textContent = current
                    ? Utils.FormatNumToStr(current, false, 0)
                    : "0" + Constant.LanguageData[lang].decimalPoint + "00";
                  if (resourceName !== Constant.Resources.GOLD)
                    rescells
                      .find("span.production")
                      .addClass("clickable")
                      .get(0).textContent = production
                      ? Utils.FormatNumToStr(production, true, 0)
                      : "";
                  if (resourceName === Constant.Resources.WINE) {
                    rescells.find("span.consumption").get(0).textContent =
                      consumption
                        ? Utils.FormatNumToStr(0 - consumption, true, 0)
                        : "";
                    var time = currentResource.getEmptyTime;
                    var drains = isFinite(time);
                    time =
                      time > 1
                        ? Math.floor(time) + (60 - new Date().getMinutes()) / 60
                        : 0;
                    time *= 36e5;
                    var $emptyTime = rescells
                      .find("span.emptytime")
                      .removeClass("Red Green");
                    if (drains)
                      $emptyTime.addClass(
                        time > database.settings.wineWarningTime.value * 36e5
                          ? "Green"
                          : "Red",
                      );
                    $emptyTime.get(0).textContent =
                      drains && database.settings.wineWarningTime.value > 0
                        ? Utils.FormatTimeLengthToStr(time, 2)
                        : "";
                    if (
                      drains &&
                      time < database.settings.wineWarningTime.value * 36e5 &&
                      database.settings.wineWarning.value != 1
                    )
                      render.toastAlert(
                        "!!! " +
                          Constant.LanguageData[lang].alert_wine +
                          city._name +
                          " !!!",
                      );
                  } else {
                    var time = currentResource.getFullTime;
                    time =
                      time > 1
                        ? Math.floor(time) + (60 - new Date().getMinutes()) / 60
                        : 0;
                    time *= 36e5;
                    rescells
                      .find("span.emptytime")
                      .removeClass("Red Green")
                      .addClass(
                        time > database.settings.wineWarningTime.value * 36e5
                          ? "Green"
                          : "Red",
                      )
                      .get(0).textContent = Utils.FormatTimeLengthToStr(
                      time,
                      2,
                    );
                  }
                  if (resourceName === Constant.Resources.GOLD) {
                    rescells.find("span.current").get(0).textContent =
                      city.getIncome + city.getExpenses >= 0
                        ? Utils.FormatNumToStr(
                            city.getIncome + city.getExpenses,
                          )
                        : Utils.FormatNumToStr(
                            city.getIncome + city.getExpenses,
                            true,
                          );
                    rescells.find("span.production").get(0).textContent =
                      Utils.FormatNumToStr(city.getIncome, true, 0);
                    rescells.find("span.consumption").get(0).textContent =
                      city.getExpenses !== 0
                        ? Utils.FormatNumToStr(city.getExpenses, true, 0)
                        : "";
                  }
                  var fillperc = (current / storage.capacity) * 100;
                  const capped =
                    resourceName !== Constant.Resources.GOLD &&
                    storage.capacity > 0 &&
                    current >= storage.capacity;
                  rescells
                    .find("div.progressbar")
                    .find("div.ui-progressbar-value")
                    .width(fillperc + "%")
                    .removeClass("normal warning almostfull full capped")
                    .addClass(
                      fillperc > 90
                        ? fillperc > 96
                          ? "full"
                          : "almostfull"
                        : fillperc > 70
                          ? "warning"
                          : "normal",
                    )
                    .toggleClass("capped", capped);
                  var diffGold = Math.floor(city.getIncome + city.getExpenses);
                  var fillpercG =
                    (100 / (city.populationData.maxPop * 3)) * diffGold;
                  if (resourceName === Constant.Resources.GOLD)
                    rescells
                      .find("div.progressbar")
                      .find("div.ui-progressbar-value")
                      .width(fillpercG + "%")
                      .removeClass("normal almostfull full fullGold")
                      .addClass(
                        fillpercG > 50
                          ? fillpercG == 100
                            ? "fullGold"
                            : "normal"
                          : fillpercG > 25
                            ? "almostfull"
                            : "full",
                      );
                  if (storage.safe > current)
                    rescells.find("span.safeImage").show();
                  else rescells.find("span.safeImage").hide();
                  if (resourceName === Constant.Resources.GOLD)
                    rescells.find("span.safeImage").hide();
                }.bind(render),
              );
              Utils.setClone(this.getResourceRow(city), $row);
              this.cityRows.resource[city.getId] = null;
            }.bind(render),
          );
          var lang = database.settings.languageChange.value;
          var expense =
            database.getGlobalData.finance.armyCost +
            database.getGlobalData.finance.armySupply +
            database.getGlobalData.finance.fleetCost +
            database.getGlobalData.finance.fleetSupply -
            researchCost;
          var sigmaIncome = income - expense;
          var currentGold = 0;
          currentGold = Utils.FormatNumToStr(
            database.getGlobalData.finance.currentGold,
          );
          if (
            database.settings.GoldShort.value == 1 &&
            database.getGlobalData.finance.currentGold > 1e4
          )
            currentGold =
              Utils.FormatNumToStr(
                database.getGlobalData.finance.currentGold / 1e3,
              ) + "k";
          jq("#t_currentgold").get(0).textContent = currentGold;
          jq("#t_currentwood").get(0).textContent = Utils.FormatNumToStr(
            Math.round(tot[Constant.Resources.WOOD]),
            false,
          );
          jq("#t_currentwine").get(0).textContent = Utils.FormatNumToStr(
            Math.round(tot[Constant.Resources.WINE]),
            false,
          );
          jq("#t_currentmarble").get(0).textContent = Utils.FormatNumToStr(
            Math.round(tot[Constant.Resources.MARBLE]),
            false,
          );
          jq("#t_currentglass").get(0).textContent = Utils.FormatNumToStr(
            Math.round(tot[Constant.Resources.GLASS]),
            false,
          );
          jq("#t_currentsulfur").get(0).textContent = Utils.FormatNumToStr(
            Math.round(tot[Constant.Resources.SULFUR]),
            false,
          );
          jq("#t_goldincome")
            .children("span")
            .removeClass("Red Green")
            .addClass(sigmaIncome >= 0 ? "Green" : "Red")
            .eq(0)
            .text(Utils.FormatNumToStr(sigmaIncome, true, 0))
            .siblings("span")
            .eq(0)
            .text(
              sigmaIncome > 0
                ? "∞"
                : Utils.FormatTimeLengthToStr(
                    (database.getGlobalData.finance.currentGold / sigmaIncome) *
                      60 *
                      60 *
                      1e3,
                    true,
                    0,
                  ),
            );
          jq("#t_woodincome").find("span").get(0).textContent =
            Utils.FormatNumToStr(
              Math.round(inc[Constant.Resources.WOOD]),
              true,
            );
          jq("#t_wineincome")
            .children("span")
            .eq(0)
            .text(
              Utils.FormatNumToStr(
                Math.round(inc[Constant.Resources.WINE]),
                true,
              ),
            )
            .siblings("span")
            .eq(0)
            .text("-" + Utils.FormatNumToStr(Math.round(conWine), false));
          jq("#t_marbleincome").find("span").get(0).textContent =
            Utils.FormatNumToStr(
              Math.round(inc[Constant.Resources.MARBLE]),
              true,
            );
          jq("#t_glassincome").find("span").get(0).textContent =
            Utils.FormatNumToStr(
              Math.round(inc[Constant.Resources.GLASS]),
              true,
            );
          jq("#t_sulfurincome").find("span").get(0).textContent =
            Utils.FormatNumToStr(
              Math.round(inc[Constant.Resources.SULFUR]),
              true,
            );
          jq("#t_population").get(0).textContent =
            Utils.FormatNumToStr(Math.round(populationTot), false) +
            "(" +
            Utils.FormatNumToStr(Math.round(populationMaxTot), false) +
            ")";
          jq("#t_growth").get(0).textContent =
            popDiffTot > 0
              ? Utils.FormatNumToStr(growthTot, true, 2)
              : "0" + Constant.LanguageData[lang].decimalPoint + "00";
          jq("#t_research").get(0).textContent = researchTot
            ? Utils.FormatNumToStr(researchTot, true, 0)
            : "0" + Constant.LanguageData[lang].decimalPoint + "00";
          tot = inc = null;
        }
      } catch (e) {
        empire.error("UpdateResourceCounters", e);
      }
    },
  };
  var EMPIRE_STORAGE_PREFIX = empireKeyPrefix(readAccountName());
  var empire = {
    version: 1.1831,
    scriptId: 764,
    scriptName: "Empire Overview",
    logger: null,
    loaded: false,
    setVar: function (varname, varvalue) {
      localStorage.setItem(EMPIRE_STORAGE_PREFIX + varname, varvalue);
    },
    deleteVar: function (varname) {
      localStorage.removeItem(EMPIRE_STORAGE_PREFIX + varname);
    },
    getVar: function (varname, vardefault) {
      var ret = localStorage.getItem(EMPIRE_STORAGE_PREFIX + varname);
      if (null === ret && "undefined" != typeof vardefault) return vardefault;
      return ret;
    },
    log: function (val) {},
    error: function (func, e) {
      this.log("****** Error raised in " + func + " ******");
      this.log(e.name + " : " + e.message);
      this.log(e.stack);
      this.log("****** End ******");
    },
    time: function (func, name) {
      return func();
    },
    Init: function () {
      ikariam.Init();
      render.Init();
      database.Init(ikariam.Host());
    },
    CheckForUpdates: function (forced) {
      var lang = database.settings.languageChange.value;
      if (
        forced ||
        (database.getGlobalData.LastUpdateCheck + 864e5 <= jq.now() &&
          database.settings.autoUpdates.value)
      )
        try {
          GM_xmlhttpRequest({
            method: "GET",
            url:
              "https://greasyfork.org/scripts/" +
              empire.scriptId +
              "-empire-overview/code/Empire_Overview.meta.js",
            headers: { "Cache-Control": "no-cache" },
            onload: function (resp) {
              var remote_version,
                rt = resp.responseText;
              database.getGlobalData.LastUpdateCheck = jq.now();
              var versionMatch = /@version\s*(.*?)\s*$/m.exec(rt);
              if (!versionMatch) {
                if (forced)
                  render.toast(
                    Constant.LanguageData[
                      database.settings.languageChange.value
                    ].toast_remoteVersionUnreadable,
                  );
                return;
              }
              remote_version = parseFloat(versionMatch[1]);
              if (empire.version != -1) {
                if (remote_version > empire.version) {
                  if (
                    confirm(
                      Constant.LanguageData[lang].alert_update +
                        empire.scriptName +
                        '". \n' +
                        Constant.LanguageData[lang].alert_update1,
                    )
                  )
                    GM_openInTab(
                      "https://greasyfork.org/scripts/" +
                        empire.scriptId +
                        "-empire-overview",
                    );
                } else if (forced)
                  render.toast(
                    Constant.LanguageData[lang].alert_noUpdate +
                      empire.scriptName +
                      '".',
                  );
              }
              database.getGlobalData.latestVersion = remote_version;
            },
          });
        } catch (err) {
          if (forced)
            render.toast(Constant.LanguageData[lang].alert_error + "\n" + err);
        }
    },
    HardReset: function () {
      var lang = database.settings.languageChange.value;
      for (const key of Object.keys(database)) delete database[key];
      empire.deleteVar("settings");
      empire.deleteVar("Options");
      empire.deleteVar("options");
      empire.deleteVar("cities");
      empire.deleteVar("LocalStrings");
      empire.deleteVar("globalData");
      render.toast(Constant.LanguageData[lang].alert_toast);
      setTimeout(function () {
        document.location =
          document.getElementById("js_cityLink").children[0].href;
      }, 3500);
    },
    CheckAll: function () {
      database.settings.hideOnWorldView.value = true;
      database.settings.hideOnIslandView.value = true;
      database.settings.compressedBuildingList.value = true;
      database.settings.dailyBonus.value = true;
      database.settings.wineWarning.value = true;
      database.settings.onTop.value = true;
      database.settings.windowTennis.value = true;
      database.settings.GoldShort.value = true;
      database.settings.newsTicker.value = true;
      database.settings.event.value = true;
      database.settings.birdSwarm.value = true;
      database.settings.walkers.value = true;
      database.settings.noPiracy.value = true;
      database.settings.logInPopup.value = true;
      database.settings.controlCenter.value = true;
      database.settings.withoutFable.value = true;
      database.settings.ambrosiaPay.value = true;
      database.settings.wineWarningTime.value = 96;
      document.location =
        document.getElementById("js_cityLink").children[0].href;
    },
    Check: function () {
      database.settings.hideOnWorldView.value = true;
      database.settings.hideOnIslandView.value = true;
      database.settings.compressedBuildingList.value = true;
      database.settings.dailyBonus.value = true;
      database.settings.wineWarning.value = true;
      database.settings.onTop.value = true;
      database.settings.windowTennis.value = true;
      database.settings.GoldShort.value = false;
      database.settings.newsTicker.value = false;
      database.settings.event.value = false;
      database.settings.birdSwarm.value = true;
      database.settings.walkers.value = true;
      database.settings.noPiracy.value = false;
      database.settings.logInPopup.value = true;
      database.settings.controlCenter.value = true;
      database.settings.withoutFable.value = false;
      database.settings.ambrosiaPay.value = true;
      database.settings.wineWarningTime.value = 96;
      document.location =
        document.getElementById("js_cityLink").children[0].href;
    },
  };
  function winePressSavingPercent(city) {
    const press = city.getBuildingFromName(Constant.Buildings.VINEYARD);
    return press ? Math.min(press.getLevel, 50) : 0;
  }
  function City(id) {
    this._id = id || 0;
    this._name = "";
    this._resources = {
      gold: new Resource(this, Constant.Resources.GOLD),
      wood: new Resource(this, Constant.Resources.WOOD),
      wine: new Resource(this, Constant.Resources.WINE),
      marble: new Resource(this, Constant.Resources.MARBLE),
      glass: new Resource(this, Constant.Resources.GLASS),
      sulfur: new Resource(this, Constant.Resources.SULFUR),
    };
    this._capacities = {
      capacity: 0,
      safe: 0,
      buildings: {
        dump: {
          storage: 0,
          safe: 0,
        },
        warehouse: {
          storage: 0,
          safe: 0,
        },
        townHall: {
          storage: 2500,
          safe: 100,
        },
      },
      invalid: true,
    };
    this._tradeGoodID = 0;
    this.knownTime = jq.now();
    this._lastPopUpdate = jq.now();
    this._buildings = new Array(25);
    var i = this._buildings.length;
    while (i--) this._buildings[i] = new Building(this, i);
    this._research = new CityResearch(this);
    this.actionPoints = 0;
    this._actionPoints = 0;
    this._coordinates = {
      x: 0,
      y: 0,
    };
    this._islandID = null;
    this.population = new Population(this);
    this._population = 0;
    this._citizens = 0;
    this._resourceWorkers = 0;
    this._tradeWorkers = 0;
    this._priests = 0;
    this._culturalGoods = 0;
    this._military = new Military(this);
    this.fleetMovements = {};
    this.militaryMovements = {};
    this.unitBuildList = [];
    this.goldIncome = 0;
    this.goldExpend = 0;
    this._pop = {
      currentPop: 0,
      maxPop: 0,
      satisfaction: {
        city: 196,
        museum: {
          cultural: 0,
          level: 0,
        },
        government: 0,
        tavern: {
          wineConsumption: 0,
          level: 0,
        },
        research: 0,
        priest: 0,
        total: 0,
      },
      happiness: 0,
      growth: 0,
    };
    events("updateCityData").sub(this.updateCityDataFromAjax.bind(this));
    events("updateBuildingData").sub(
      this.updateBuildingsDataFromAjax.bind(this),
    );
  }
  City.prototype = {
    init: function () {
      jq.each(this._buildings, function (idx, building) {
        building.startUpgradeTimer();
      });
      this.military.init();
      jq.each(this._resources, function (resourceName, resource) {
        resource.project();
      });
      events.scheduleActionAtInterval(
        function () {
          jq.each(
            this._resources,
            function (resourceName, resource) {
              resource.project();
            }.bind(this),
          );
        }.bind(this),
        1e3,
      );
    },
    projectResource: function (seconds) {},
    updateBuildingsDataFromAjax: function (id, position) {
      var changes = [];
      if (id != this.getId) return;
      trace("updateBuildingData", {
        city: this.getId,
        viewIsCity: ikariam.viewIsCity,
        positionCount: Array.isArray(position)
          ? position.length
          : position
            ? "not-an-array"
            : null,
      });
      if (ikariam.viewIsCity) {
        if (position) {
          jq.each(
            position,
            function (i, item) {
              var change = this.getBuildingFromPosition(i).update(item);
              if (change) changes.push(change);
            }.bind(this),
          );
          if (changes.length) {
            this._capacities.invalid = true;
            events(Constant.Events.BUILDINGS_UPDATED).pub(id, changes);
          }
        }
      }
    },
    updateCityDataFromAjax: function (id, cityData) {
      var resourcesChanged = false;
      var changes = {};
      if (id == this.getId) {
        try {
          var baseWineConsumption = 0,
            wineConsumption = 0;
          if (
            jq.inArray(
              cityData.wineSpendings,
              Constant.BuildingData[Constant.Buildings.TAVERN].wineUse,
              Constant.BuildingData[Constant.Buildings.TAVERN].wineUse2,
            ) > -1
          ) {
            baseWineConsumption = cityData.wineSpendings;
            wineConsumption =
              (baseWineConsumption * (100 - winePressSavingPercent(this))) /
              100;
          } else wineConsumption = cityData.wineSpendings;
          this.updateTradeGoodID(parseInt(cityData.producedTradegood));
          resourcesChanged =
            this.updateResource(
              Constant.Resources.WOOD,
              cityData.currentResources[Constant.ResourceIDs.WOOD],
              cityData.resourceProduction,
              0,
            ) || resourcesChanged;
          resourcesChanged =
            this.updateResource(
              Constant.Resources.WINE,
              cityData.currentResources[Constant.ResourceIDs.WINE],
              this.getTradeGoodID == Constant.ResourceIDs.WINE
                ? cityData.tradegoodProduction
                : 0,
              wineConsumption,
            ) || resourcesChanged;
          resourcesChanged =
            this.updateResource(
              Constant.Resources.MARBLE,
              cityData.currentResources[Constant.ResourceIDs.MARBLE],
              this.getTradeGoodID == Constant.ResourceIDs.MARBLE
                ? cityData.tradegoodProduction
                : 0,
              0,
            ) || resourcesChanged;
          resourcesChanged =
            this.updateResource(
              Constant.Resources.GLASS,
              cityData.currentResources[Constant.ResourceIDs.GLASS],
              this.getTradeGoodID == Constant.ResourceIDs.GLASS
                ? cityData.tradegoodProduction
                : 0,
              0,
            ) || resourcesChanged;
          resourcesChanged =
            this.updateResource(
              Constant.Resources.SULFUR,
              cityData.currentResources[Constant.ResourceIDs.SULFUR],
              this.getTradeGoodID == Constant.ResourceIDs.SULFUR
                ? cityData.tradegoodProduction
                : 0,
              0,
            ) || resourcesChanged;
          this.knownTime = jq.now();
          var $actionPointElem = jq("#js_GlobalMenu_maxActionPoints");
          if (cityData.maxActionPoints)
            changes.actionPoints = this.updateActionPoints(
              cityData.maxActionPoints || 0,
            );
          else
            changes.actionPoints = this.updateActionPoints(
              parseInt($actionPointElem.text()) || 0,
            );
          changes.coordinates = this.updateCoordinates(
            parseInt(cityData.islandXCoord),
            parseInt(cityData.islandYCoord),
          );
          if (ikariam.viewIsCity) {
            changes.name = this.updateName(cityData.name);
            changes.population = this.updatePopulation(
              cityData.currentResources.population,
            );
            changes.islandId = this.updateIslandID(parseInt(cityData.islandId));
            changes.coordinates = this.updateCoordinates(
              parseInt(cityData.islandXCoord),
              parseInt(cityData.islandYCoord),
            );
          }
          if (ikariam.viewIsIsland) {
            changes.islandId = this.updateIslandID(parseInt(cityData.id));
            changes.coordinates = this.updateCoordinates(
              parseInt(cityData.xCoord),
              parseInt(cityData.yCoord),
            );
          }
          changes.citizens = this.updateCitizens(
            cityData.currentResources.citizens,
          );
          database.getGlobalData.addLocalisedString(
            "cities",
            jq("#js_GlobalMenu_cities").find("> span").text(),
          );
          database.getGlobalData.addLocalisedString(
            "ActionPoints",
            $actionPointElem.attr("title"),
          );
          if (cityData.gold)
            database.getGlobalData.finance.currentGold = parseFloat(
              cityData.gold,
            );
        } catch (e) {
          empire.error("fetchCurrentCityData", e);
        } finally {
          cityData = null;
        }
        events(Constant.Events.CITY_UPDATED).pub(this.getId, changes);
        if (resourcesChanged)
          events(Constant.Events.RESOURCES_UPDATED).pub(
            this.getId,
            resourcesChanged,
          );
      }
    },
    get getCorruption() {
      if (typeof this._corruption != "function")
        this._corruption = Utils.cacheFunction(
          function () {
            var h = 0;
            if (
              this.getBuildingFromName(
                Constant.Buildings.GOVERNORS_RESIDENCE,
              ) &&
              this.getBuildingFromName(Constant.Buildings.GOVERNORS_RESIDENCE)
                .getLevel /
                database.getCityCount !=
                1
            )
              h =
                Constant.GovernmentData[
                  database.getGlobalData.getGovernmentType
                ].governors;
            return Math.max(
              0,
              1 -
                ((this.getBuildingFromName(
                  Constant.Buildings.GOVERNORS_RESIDENCE,
                )
                  ? this.getBuildingFromName(
                      Constant.Buildings.GOVERNORS_RESIDENCE,
                    ).getLevel
                  : this.getBuildingFromName(Constant.Buildings.PALACE)
                    ? this.getBuildingFromName(Constant.Buildings.PALACE)
                        .getLevel
                    : 0) +
                  1) /
                  database.getCityCount +
                Constant.GovernmentData[
                  database.getGlobalData.getGovernmentType
                ].corruption +
                h,
            );
          }.bind(this),
          1e3,
        );
      return this._corruption();
    },
    get isCurrentCity() {
      return this.getId == ikariam.CurrentCityId;
    },
    getResource: function (name) {
      return this._resources[name];
    },
    updateResource: function (resourceName, current, production, consumption) {
      return this.getResource(resourceName).update(
        current,
        production,
        consumption,
      );
    },
    get getIncome() {
      var priestsGold = 0;
      var serverTyp = 1;
      if (ikariam.Server() == "s202") serverTyp = 3;
      priestsGold = Math.floor(
        this._priests *
          Constant.GovernmentData[database.getGlobalData.getGovernmentType]
            .goldBonusPerPriest,
      );
      return this._citizens * 3 * serverTyp + priestsGold;
    },
    updateIncome: function (value) {
      return false;
    },
    get getExpenses() {
      return -1 * this._research.getResearchCost;
    },
    updateExpenses: function (value) {
      return this._research.updateCost(Math.abs(value));
    },
    get getBuildings() {
      return this._buildings;
    },
    getBuildingsFromName: function (name) {
      var ret = [];
      var i = this._buildings.length;
      while (i--)
        if (this._buildings[i].getName == name) ret.push(this._buildings[i]);
      return ret;
    },
    getBuildingFromName: function (name) {
      var i = this._buildings.length;
      while (i--)
        if (this._buildings[i].getName == name) return this._buildings[i];
      return null;
    },
    getBuildingFromPosition: function (position) {
      return this._buildings[position];
    },
    getWonder: function () {
      return 7;
    },
    get getTradeGood() {
      for (var resourceName in Constant.ResourceIDs)
        if (this._tradeGoodID == Constant.ResourceIDs[resourceName])
          return Constant.Resources[resourceName];
      return null;
    },
    get getTradeGoodID() {
      return this._tradeGoodID;
    },
    updateTradeGoodID: function (value) {
      var changed = this._tradeGoodID != value;
      if (changed) this._tradeGoodID = value;
      return changed;
    },
    updatePriests: function (priests) {
      var changed = this._priests != priests;
      this._priests = priests;
      return changed;
    },
    get getName() {
      return this._name;
    },
    updateName: function (value) {
      var changed = this._name != value;
      if (changed) this._name = value;
      return changed;
    },
    get getId() {
      return this._id;
    },
    get research() {
      return this._research;
    },
    updateResearchers: function (value) {
      return this._research.updateResearchers(value);
    },
    updateResearchCost: function (value) {
      return this._research.updateCost(value);
    },
    get garrisonland() {
      var i = 0,
        r = 0,
        t = 0;
      if (this.getBuildingFromName(Constant.Buildings.TOWN_HALL))
        i = this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel;
      if (this.getBuildingFromName(Constant.Buildings.WALL))
        r = this.getBuildingFromName(Constant.Buildings.WALL).getLevel;
      t = (i + r - 1) * 50 + 300;
      return t;
    },
    get garrisonsea() {
      var t = 0,
        n = 0,
        s = 0;
      if (this.getBuildingFromName(Constant.Buildings.TRADING_PORT))
        t = this.getBuildingFromName(Constant.Buildings.TRADING_PORT).getLevel;
      if (this.getBuildingFromName(Constant.Buildings.SHIPYARD))
        s = this.getBuildingFromName(Constant.Buildings.SHIPYARD).getLevel;
      n = t > s ? t : s;
      return n * 25 + 125;
    },
    get plundergold() {
      var i = 0;
      if (this.getBuildingFromName(Constant.Buildings.PALACE))
        i =
          Math.floor(
            this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel,
          ) * 950;
      else if (database.getCityCount == 1)
        i =
          Math.floor(
            this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel,
          ) * 950;
      return i;
    },
    get maxculturalgood() {
      var i = 0;
      if (this.getBuildingFromName(Constant.Buildings.MUSEUM))
        i = this.getBuildingFromName(Constant.Buildings.MUSEUM).getLevel;
      return i;
    },
    get maxtavernlevel() {
      var i = 0;
      if (this.getBuildingFromName(Constant.Buildings.TAVERN))
        i = this.getBuildingFromName(Constant.Buildings.TAVERN).getLevel;
      return i;
    },
    get tavernlevel() {
      var wineUse;
      var i;
      if (this.getBuildingFromName(Constant.Buildings.TAVERN)) {
        wineUse = Constant.BuildingData[Constant.Buildings.TAVERN].wineUse;
        if (ikariam.Server() == "s202")
          wineUse = Constant.BuildingData[Constant.Buildings.TAVERN].wineUse2;
        var consumption = Math.floor(
          this.getResource(Constant.Resources.WINE).getConsumption *
            (100 / (100 - winePressSavingPercent(this))),
        );
        for (i = 0; i < wineUse.length; i++)
          if (Math.abs(wineUse[i] - consumption) <= 1) break;
      }
      return i > 0 ? i : "";
    },
    get CorruptionCity() {
      var i = Math.max(
        0,
        1 -
          ((this.getBuildingFromName(Constant.Buildings.GOVERNORS_RESIDENCE)
            ? this.getBuildingFromName(Constant.Buildings.GOVERNORS_RESIDENCE)
                .getLevel
            : this.getBuildingFromName(Constant.Buildings.PALACE)
              ? this.getBuildingFromName(Constant.Buildings.PALACE).getLevel
              : 0) +
            1) /
            database.getCityCount +
          Constant.GovernmentData[database.getGlobalData.getGovernmentType]
            .corruption,
      );
      var h = 0;
      if (
        this.getBuildingFromName(Constant.Buildings.GOVERNORS_RESIDENCE) &&
        this.getBuildingFromName(Constant.Buildings.GOVERNORS_RESIDENCE)
          .getLevel /
          database.getCityCount !=
          1
      )
        h =
          Constant.GovernmentData[database.getGlobalData.getGovernmentType]
            .governors;
      return Math.floor(i * 100) + h * 100;
    },
    get maxAP() {
      var i = 0;
      if (this.getBuildingFromName(Constant.Buildings.TOWN_HALL))
        i = this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel;
      return Constant.BuildingData[Constant.Buildings.TOWN_HALL]
        .actionPointsMax[i];
    },
    get maxSci() {
      var i;
      if (this.getBuildingFromName(Constant.Buildings.ACADEMY))
        i = this.getBuildingFromName(Constant.Buildings.ACADEMY).getLevel;
      return (
        Constant.BuildingData[Constant.Buildings.ACADEMY].maxScientists[i] || ""
      );
    },
    get iSci() {
      var i = "";
      if (this.getBuildingFromName(Constant.Buildings.ACADEMY)) i = 0;
      return i;
    },
    get storageCapacity() {
      return null;
    },
    get getAvailableActions() {
      return this._actionPoints;
    },
    updateActionPoints: function (value) {
      var changed = this._actionPoints != value;
      this._actionPoints = value;
      return changed;
    },
    get getCoordinates() {
      return this._coordinates
        ? [this._coordinates.x, this._coordinates.y]
        : null;
    },
    updateCoordinates: function (x, y) {
      this._coordinates = {
        x,
        y,
      };
      return false;
    },
    get getIslandID() {
      return this._islandID;
    },
    updateIslandID: function (id) {
      this._islandID = id;
      return false;
    },
    get getCulturalGoods() {
      return this._culturalGoods;
    },
    updateCulturalGoods: function (value) {
      var changed = this._culturalGoods !== value;
      if (changed) this._culturalGoods = value;
      return changed;
    },
    get getIncomingResources() {
      return database.getGlobalData.getResourceMovementsToCity(this.getId);
    },
    get getIncomingMilitary() {
      return database.getGlobalData.getMilitaryMovementsToCity(this.getId);
    },
    get _getMaxPopulation() {
      var mPop = 0;
      if (this.getBuildingFromName(Constant.Buildings.TOWN_HALL))
        mPop =
          Math.floor(
            10 *
              Math.pow(
                this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel,
                1.5,
              ),
          ) *
            2 +
          40;
      if (
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Science.WELL_CONSTRUCTION,
        ) &&
        (this.getBuildingFromName(Constant.Buildings.PALACE) ||
          database.getCityCount == 1)
      )
        mPop += 50;
      if (
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Economy.UTOPIA,
        ) &&
        this.getBuildingFromName(Constant.Buildings.PALACE)
      )
        mPop += 200;
      if (
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Economy.HOLIDAY,
        )
      )
        mPop += 50;
      mPop +=
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Economy.ECONOMIC_FUTURE,
        ) * 20;
      return mPop;
    },
    get military() {
      return this._military;
    },
    get getAvailableBuildings() {
      var p = 0;
      var i =
        23 +
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Economy.BUREACRACY,
        ) +
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Seafaring.PIRACY,
        );
      jq.each(this.getBuildings, function (idx, building) {
        i -= Number(!building.isEmpty);
      });
      if (
        database.settings.noPiracy.value &&
        database.getGlobalData.getResearchTopicLevel(
          Constant.Research.Seafaring.PIRACY,
        )
      )
        p = 1;
      return i - p;
    },
    get maxResourceCapacities() {
      if (!this._capacities.invalid) return this._capacities;
      var lang = database.settings.languageChange.value;
      var ret = {};
      ret[Constant.Buildings.DUMP] = {
        storage: 0,
        safe: 0,
        lang: Constant.LanguageData[lang].dump,
      };
      ret[Constant.Buildings.WAREHOUSE] = {
        storage: 0,
        safe: 0,
        lang: Constant.LanguageData[lang].warehouse,
      };
      ret[Constant.Buildings.TOWN_HALL] = {
        storage: 2500,
        safe: 100,
        lang: Constant.LanguageData[lang].townHall,
      };
      jq.each(
        this.getBuildingsFromName(Constant.Buildings.WAREHOUSE),
        function (i, building) {
          ret[Constant.Buildings.WAREHOUSE].storage +=
            Constant.BuildingData[Constant.Buildings.WAREHOUSE].capacity[
              building.getLevel - 1
            ] || 0;
          ret[Constant.Buildings.WAREHOUSE].safe += building.getLevel * 480;
        },
      );
      jq.each(
        this.getBuildingsFromName(Constant.Buildings.DUMP),
        function (i, building) {
          ret[Constant.Buildings.DUMP].storage +=
            Constant.BuildingData[Constant.Buildings.DUMP].capacity[
              building.getLevel - 1
            ] || 0;
        },
      );
      var capacity = 0;
      var safe = 0;
      for (var key in ret) {
        capacity += ret[key].storage;
        safe += ret[key].safe;
      }
      this._capacities = {
        capacity:
          capacity *
          (1 +
            database.getGlobalData.hasPremiumFeature(
              Constant.Premium.STORAGECAPACITY_BONUS,
            ) *
              Constant.PremiumData[Constant.Premium.STORAGECAPACITY_BONUS]
                .bonus),
        safe:
          safe *
          (1 +
            database.getGlobalData.hasPremiumFeature(
              Constant.Premium.SAFECAPACITY_BONUS,
            ) *
              Constant.PremiumData[Constant.Premium.SAFECAPACITY_BONUS].bonus),
        buildings: ret,
      };
      return this._capacities;
    },
    get _getSatisfactionData() {
      var r = {
        city: 196,
        museum: {
          cultural: 0,
          level: 0,
        },
        government: 0,
        tavern: {
          wineConsumption: 0,
          level: 0,
        },
        research: 0,
        priest: 0,
        total: 0,
      };
      if (this.getBuildingFromName(Constant.Buildings.MUSEUM)) {
        var eventBonus = 0;
        r.museum.cultural = this.getCulturalGoods * 50 + eventBonus;
        r.museum.level =
          Constant.BuildingData[Constant.Buildings.MUSEUM].basicBonus[
            this.getBuildingFromName(Constant.Buildings.MUSEUM).getLevel
          ] || 0;
      }
      r.government =
        Constant.GovernmentData[database.getGlobalData.getGovernmentType]
          .happiness +
        Constant.GovernmentData[database.getGlobalData.getGovernmentType]
          .happinessWithoutTemple *
          Number(this.getBuildingFromName(Constant.Buildings.TEMPLE) == void 0);
      if (this.getBuildingFromName(Constant.Buildings.TAVERN)) {
        var wineUse = Constant.BuildingData[Constant.Buildings.TAVERN].wineUse;
        if (ikariam.Server() == "s202")
          wineUse = Constant.BuildingData[Constant.Buildings.TAVERN].wineUse2;
        r.tavern.level =
          Constant.BuildingData[Constant.Buildings.TAVERN].basicBonus[
            this.getBuildingFromName(Constant.Buildings.TAVERN).getLevel
          ] || 0;
        var consumption = Math.floor(
          this.getResource(Constant.Resources.WINE).getConsumption *
            (100 / (100 - winePressSavingPercent(this))),
        );
        for (var i = 0; i < wineUse.length; i++)
          if (Math.abs(wineUse[i] - consumption) <= 1) {
            r.tavern.wineConsumption =
              Constant.BuildingData[Constant.Buildings.TAVERN].wineBonus[i];
            break;
          }
      }
      r.research =
        database.getGlobalData.getResearchTopicLevel(2080) * 25 +
        database.getGlobalData.getResearchTopicLevel(2999) * 10 +
        (this.getBuildingFromName(Constant.Buildings.PALACE)
          ? 50 * database.getGlobalData.getResearchTopicLevel(3010)
          : 0) +
        (this.getBuildingFromName(Constant.Buildings.PALACE)
          ? 200 * database.getGlobalData.getResearchTopicLevel(2120)
          : 0) +
        (database.getCityCount == 1
          ? 50 * database.getGlobalData.getResearchTopicLevel(3010)
          : 0) -
        (this.getBuildingFromName(Constant.Buildings.PALACE) &&
        database.getCityCount == 1
          ? 50 * database.getGlobalData.getResearchTopicLevel(3010)
          : 0);
      r.priest =
        ((this._priests * 500) / this._getMaxPopulation) *
        Constant.GovernmentData[database.getGlobalData.getGovernmentType]
          .happinessBonusWithTempleConversion;
      r.priest = r.priest <= 150 ? r.priest : 150;
      r.city = 196;
      var total = 0;
      for (var n in r)
        if (typeof r[n] === "object") for (var o in r[n]) total += r[n][o];
        else total += r[n];
      r.total = total;
      r.corruption = Math.round(this._population + this._pop.happiness - total);
      return r;
    },
    updatePopulation: function (population) {
      var changed = this._population != population;
      this._population = population;
      this._lastPopUpdate = jq.now();
      return changed;
    },
    updateCitizens: function (citizens) {
      var changed = this._citizens != citizens;
      this._citizens = citizens;
      this._lastPopUpdate = jq.now();
      return changed;
    },
    projectPopData: function (untilTime) {
      var serverTyp = 1;
      if (ikariam.Server() == "s201" || ikariam.Server() == "s202")
        serverTyp = 3;
      var plus = this._getSatisfactionData;
      var maxPopulation = this._getMaxPopulation;
      var happiness = (1 - this.getCorruption) * plus.total - this._population;
      var hours = (untilTime - this._lastPopUpdate) / 36e5;
      var pop =
        this._population + happiness * (1 - Math.pow(Math.E, -(hours / 50)));
      pop =
        pop > maxPopulation
          ? this._population > maxPopulation
            ? this._population
            : maxPopulation
          : pop;
      happiness = (1 - this.getCorruption) * plus.total - pop;
      this._citizens = this._citizens + pop - this._population;
      this._population = pop;
      this._lastPopUpdate = untilTime;
      var old = jq.extend({}, this._pop);
      this._pop = {
        currentPop: pop,
        maxPop: maxPopulation,
        satisfaction: plus,
        happiness,
        growth: happiness * 0.02 * serverTyp,
      };
      if (
        Math.floor(old.currentPop) != Math.floor(this._pop.currentPop) ||
        Math.floor(old.maxPop) != Math.floor(this._pop.maxPop) ||
        Math.floor(old.happiness) != Math.floor(this._pop.happiness)
      )
        events(Constant.Events.CITY_UPDATED).pub(this.getId, {
          population: true,
        });
    },
    get populationData() {
      return this._pop;
    },
    processUnitBuildList: function () {
      var newList = [];
      var j;
      for (var i = 0; i < this.unitBuildList.length; i++) {
        var list = this.unitBuildList[i];
        if (list.completionTime <= jq.now()) {
          for (var uID in list.units) j = this.army.length;
          while (j) {
            j--;
            if (uID == this.army[j].id) this.army[uID] += list.units[uID];
          }
        } else newList.push(list);
      }
      this.unitBuildList = newList;
    },
    clearUnitBuildList: function (type) {
      var newList = [];
      if (type) {
        for (var i = 0; i < this.unitBuildList.length; i++)
          if (this.unitBuildList[i].type != type)
            newList.push(this.unitBuildList[i]);
      }
      this.unitBuildList = newList;
    },
    getUnitBuildsByUnit: function () {
      var ret = {};
      for (var i = 0; i < this.unitBuildList.length; i++)
        for (var uID in this.unitBuildList[i].units) {
          ret[uID] = ret[uID] || [];
          ret[uID].push({
            count: this.unitBuildList[i].units[uID],
            completionTime: this.unitBuildList[i].completionTime,
          });
        }
      return ret;
    },
    getUnitTransportsByUnit: function () {
      var ret = {};
      var data = database.getGlobalData.militaryMovements[this.getId];
      if (data)
        for (var row in data)
          for (var uID in data[row].troops) {
            ret[uID] = ret[uID] || [];
            ret[uID].push({
              count: data[row].troops[uID],
              arrivalTime: data[row].arrivalTime,
              origin: data[row].originCityId,
            });
          }
      return ret;
    },
    get isCapital() {
      return this.getBuildingFromName(Constant.Buildings.PALACE) !== null;
    },
    get isColony() {
      return this.getBuildingFromName(Constant.Buildings.PALACE) === null;
    },
    get isUpgrading() {
      var res = false;
      jq.each(this.getBuildings, function (idx, building) {
        res = res || building.isUpgrading;
      });
      return res;
    },
  };
  function Movement(
    id,
    originCityId,
    targetCityId,
    arrivalTime,
    mission,
    loadingTime,
    resources,
    military,
    ships,
  ) {
    if (typeof id === "object") {
      this._id = id._id || null;
      this._originCityId = id._originCityId || null;
      this._targetCityId = id._targetCityId || null;
      this._arrivalTime = id._arrivalTime || null;
      this._mission = id._mission || null;
      this._loadingTime = id._loadingTime || null;
      this._resources = id._resources || {
        wood: 0,
        wine: 0,
        marble: 0,
        glass: 0,
        sulfur: 0,
        gold: 0,
      };
      this._military = id._military || new MilitaryUnits();
      this._ships = id._ships || null;
      this._updatedCity = id._updatedCity || false;
      this._complete = id._complete || false;
      this._updateTimer = id._updateTimer || null;
    } else {
      this._id = id || null;
      this._originCityId = originCityId || null;
      this._targetCityId = targetCityId || null;
      this._arrivalTime = arrivalTime || null;
      this._mission = mission || null;
      this._loadingTime = loadingTime || null;
      this._resources = resources || {
        wood: 0,
        wine: 0,
        marble: 0,
        glass: 0,
        sulfur: 0,
        gold: 0,
      };
      this._military = military || new MilitaryUnits();
      this._ships = ships || null;
      this._updatedCity = false;
      this._complete = false;
      this._updateTimer = null;
    }
  }
  Movement.prototype = {
    startUpdateTimer: function () {
      this.clearUpdateTimer();
      if (this.isCompleted) this.updateTransportComplete();
      else
        this._updateTimer = events.scheduleActionAtTime(
          this.updateTransportComplete.bind(this),
          this._arrivalTime + 1e3,
        );
    },
    clearUpdateTimer: function () {
      var ret = !this._updateTimer || this._updateTimer();
      this._updateTimer = null;
      return ret;
    },
    get getId() {
      return this._id;
    },
    get getOriginCityId() {
      return this._originCityId;
    },
    get getTargetCityId() {
      return this._targetCityId;
    },
    get getArrivalTime() {
      return this._arrivalTime;
    },
    get getMission() {
      return this._mission;
    },
    get getLoadingTime() {
      return this._loadingTime - jq.now();
    },
    get getResources() {
      return this._resources;
    },
    getResource: function (resourceName) {
      return this._resources[resourceName];
    },
    get getMilitary() {
      return this._military;
    },
    get getShips() {
      return this._ships;
    },
    get isCompleted() {
      return this._arrivalTime < jq.now();
    },
    get isLoading() {
      return this._loadingTime > jq.now();
    },
    get getRemainingTime() {
      return this._arrivalTime - jq.now();
    },
    updateTransportComplete: function () {
      if (this.isCompleted && !this._updatedCity) {
        var city = database.getCityFromId(this._targetCityId);
        var changes = [];
        if (city) {
          for (var resource in Constant.Resources) {
            if (this.getResource(Constant.Resources[resource]))
              changes.push(Constant.Resources[resource]);
            city
              .getResource(Constant.Resources[resource])
              .increment(this.getResource(Constant.Resources[resource]));
          }
          this._updatedCity = true;
          city = database.getCityFromId(this.originCityId);
          if (city) city.updateActionPoints(city.getAvailableActions + 1);
          if (changes.length) {
            events(Constant.Events.MOVEMENTS_UPDATED).pub([
              this.getTargetCityId,
            ]);
            events(Constant.Events.RESOURCES_UPDATED).pub(
              this.getTargetCityId,
              changes,
            );
          }
          events.scheduleAction(
            function () {
              database.getGlobalData.removeFleetMovement(this._id);
            }.bind(this),
          );
          return true;
        }
      } else if (this._updatedCity)
        events.scheduleAction(
          function () {
            database.getGlobalData.removeFleetMovement(this._id);
          }.bind(this),
        );
      return false;
    },
  };
  function GlobalData() {
    this._version = {
      lastUpdateCheck: 0,
      latestVersion: null,
      installedVersion: 0,
    };
    this._research = {
      topics: {},
      lastUpdate: 0,
    };
    this.governmentType = "Ikacracy";
    this.fleetMovements = [];
    this.militaryMovements = [];
    this.finance = {
      armyCost: 0,
      armySupply: 0,
      fleetCost: 0,
      fleetSupply: 0,
      currentGold: 0,
      sigmaExpenses: function () {
        return (
          this.armyCost + this.armySupply + this.fleetCost + this.fleetSupply
        );
      },
      sigmaIncome: 0,
      lastUpdated: 0,
    };
    this.localStrings = {};
    this.premium = {};
  }
  GlobalData.prototype = {
    init: function () {
      var lang = database.settings.languageChange.value;
      jq.each(Constant.LanguageData[lang], this.addLocalisedString.bind(this));
      jq.each(
        this.fleetMovements,
        function (key, movement) {
          this.fleetMovements[key] = new Movement(movement);
          this.fleetMovements[key]._updateTimer = null;
          this.fleetMovements[key].startUpdateTimer();
        }.bind(this),
      );
    },
    hasPremiumFeature: function (feature) {
      return this.premium[feature]
        ? this.premium[feature].endTime > jq.now() ||
            this.premium[feature].continuous
        : false;
    },
    setPremiumFeature: function (feature, endTime, continuous) {
      var ret = !this.hasPremiumFeature(feature) && endTime > jq.now();
      this.premium[feature] = {
        endTime,
        continuous,
      };
      return ret;
    },
    getPremiumTimeRemaining: function (feature) {
      return this.premium[feature]
        ? this.premium[feature].endTime > jq.now()
        : 0;
    },
    getPremiumTimeContinuous: function (feature) {
      return this.premium[feature] ? this.premium[feature].continuous : false;
    },
    removeFleetMovement: function (id) {
      jq.each(
        this.fleetMovements,
        function (i, movement) {
          if (movement.getId == id) {
            this.fleetMovements.splice(i, 1);
            return false;
          }
        }.bind(this),
      );
    },
    addFleetMovement: function (transport) {
      try {
        this.fleetMovements.push(transport);
        transport.startUpdateTimer();
        this.fleetMovements.sort(function (a, b) {
          return a.getArrivalTime - b.getArrivalTime;
        });
        var changes = [];
        jq.each(transport.getResources, function (resourceName, value) {
          changes.push(resourceName);
        });
        return changes;
      } catch (e) {
        empire.error("addFleetMovement", e);
      }
    },
    getMovementById: function (id) {
      for (var i in this.fleetMovements)
        if (this.fleetMovements[i].getId == id) return this.fleetMovements[i];
      return false;
    },
    clearFleetMovements: function () {
      var changes = [];
      jq.each(this.fleetMovements, function (index, item) {
        changes.push(item.getTargetCityId);
        item.clearUpdateTimer();
      });
      this.fleetMovements.length = 0;
      return jq.exclusive(changes);
    },
    getResourceMovementsToCity: function (cityID) {
      return this.fleetMovements.filter(function (el) {
        if (el.getTargetCityId == cityID)
          return (
            el.getMission == "trade" ||
            el.getMission == "transport" ||
            el.getMission == "plunder"
          );
      });
    },
    getMilitaryMovementsToCity: function (cityID) {
      return this.fleetMovements.filter(function (el) {
        if (el.getOriginCityId == cityID)
          return (
            el.getMission != "trade" &&
            el.getMission != "transport" &&
            el.getMission == "plunder" &&
            el.getMission == "deploy"
          );
      });
    },
    getResearchTopicLevel: function (research) {
      return this._research.topics[research] || 0;
    },
    updateResearchTopic: function (topic, level) {
      var changed = this.getResearchTopicLevel(topic) != level;
      this._research.topics[topic] = level;
      return changed;
    },
    get getGovernmentType() {
      return this.governmentType;
    },
    getLocalisedString: function (string) {
      var lString =
        this.localStrings[string.replace(/([A-Z])/g, "_$1").toLowerCase()];
      if (lString == void 0)
        lString = this.localStrings[string.toLowerCase().split(" ").join("_")];
      return lString == void 0 ? string : lString;
    },
    addLocalisedString: function (string, value) {
      if (this.getLocalisedString(string) == string)
        this.localStrings[string.toLowerCase().split(" ").join("_")] = value;
    },
    isOldVersion: function () {
      return this._version.latestVersion < this._version.installedVersion;
    },
  };
  function Setting(name) {
    this._name = name;
    this._value = null;
  }
  Setting.prototype = {
    get name() {
      return database.getGlobalData.getLocalisedString(this._name);
    },
    get type() {
      return Constant.SettingData[this._name].type;
    },
    get description() {
      return database.getGlobalData.getLocalisedString(
        this._name + "_description",
      );
    },
    get value() {
      return this._value !== null
        ? this._value
        : Constant.SettingData[this._name].default;
    },
    get categories() {
      return Constant.SettingData[this._name].categories;
    },
    get choices() {
      return Constant.SettingData[this._name].choices || false;
    },
    get selection() {
      return Constant.SettingData[this._name].selection || false;
    },
    set value(value) {
      if (this.type === "boolean") this._value = !!value;
      else if (this.type === "number") {
        if (!isNaN(value)) this._value = value;
      } else if (this.type === "buildings") {
        if (!isNaN(value)) this._value = value;
      } else if (this.type === "language") this._value = value;
      else if (this.type === "array" || this.type === "orderedList") {
        if (Object.prototype.toString.call(value) === "[object Array]")
          this._value = value;
      }
    },
    toJSON: function () {
      return { value: this._value };
    },
  };
  var SAVE_DEBOUNCE_MS = 1e3;
  var database = {
    _globalData: new GlobalData(),
    cities: {},
    settings: {
      version: empire.version,
      window: {
        left: 110,
        top: 200,
        activeTab: 0,
        visible: true,
      },
      addOptions: function (objVals) {
        return jq.mergeValues(this, objVals);
      },
    },
    Init: function (host) {
      jq.each(
        Constant.Settings,
        function (key, value) {
          this.settings[value] = new Setting(value);
        }.bind(database),
      );
      var prefix = host;
      prefix = prefix.replace(".ikariam.", "-");
      prefix = prefix.replace(".", "-");
      this.Prefix = prefix;
      this.Load();
      this.startMonitoringChanges();
      events(Constant.Events.LOCAL_STRINGS_AVAILABLE).sub(
        ikariam.getLocalizationStrings.bind(this),
      );
      jq(window).on("beforeunload", function () {
        if (typeof database.Save === "function") database.Save();
      });
    },
    addCity: function (id, a) {
      if (a) return jq.mergeValues(new City(id), a);
      else return new City(id);
    },
    get getBuildingCounts() {
      var buildingCounts = {};
      jq.each(this.cities, function (cityId, city) {
        jq.each(Constant.Buildings, function (key, value) {
          if (database.settings.alternativeBuildingList.value && value === "") {
          } else if (
            database.settings.compressedBuildingList.value &&
            (value == Constant.Buildings.STONEMASON ||
              value == Constant.Buildings.WINERY ||
              value == Constant.Buildings.ALCHEMISTS_TOWER ||
              value == Constant.Buildings.GLASSBLOWER)
          )
            buildingCounts.productionBuilding = Math.max(
              buildingCounts.productionBuilding || 0,
              city.getBuildingsFromName(value).length,
            );
          else if (
            database.settings.compressedBuildingList.value &&
            (value == Constant.Buildings.GOVERNORS_RESIDENCE ||
              value == Constant.Buildings.PALACE)
          )
            buildingCounts.colonyBuilding = Math.max(
              buildingCounts.colonyBuilding || 0,
              city.getBuildingsFromName(value).length,
            );
          else
            buildingCounts[value] = Math.max(
              buildingCounts[value] || 0,
              city.getBuildingsFromName(value).length,
            );
        });
      });
      return buildingCounts;
    },
    startMonitoringChanges: function () {
      events(Constant.Events.BUILDINGS_UPDATED).sub(this.SaveSoon.bind(this));
      events(Constant.Events.GLOBAL_UPDATED).sub(this.SaveSoon.bind(this));
      events(Constant.Events.MOVEMENTS_UPDATED).sub(this.SaveSoon.bind(this));
      events(Constant.Events.RESOURCES_UPDATED).sub(this.SaveSoon.bind(this));
      events(Constant.Events.MILITARY_UPDATED).sub(this.SaveSoon.bind(this));
      events(Constant.Events.PREMIUM_UPDATED).sub(this.SaveSoon.bind(this));
    },
    Load: function () {
      var settings = this.UnSerialize(empire.getVar("settings", ""));
      if (typeof settings === "object") {
        if (!this.isDatabaseOutdated(settings.version)) {
          jq.mergeValues(this.settings, settings);
          var globalData = this.UnSerialize(empire.getVar("globalData", ""));
          if (globalData.governmentType === "")
            globalData.governmentType = "Ikacracy";
          if (typeof globalData == "object")
            jq.mergeValues(this._globalData, globalData);
          var cities = this.UnSerialize(empire.getVar("cities", ""));
          if (typeof cities == "object")
            for (var cityID in cities)
              (this.cities[cityID] = this.addCity(
                cities[cityID]._id,
                cities[cityID],
              )).init();
        }
        this._globalData.init();
      }
      events(Constant.Events.DATABASE_LOADED).pub();
    },
    Serialize: function (data) {
      var ret;
      if (data)
        try {
          ret = JSON.stringify(data);
        } catch (e) {
          empire.log("error saving");
        }
      return ret || void 0;
    },
    UnSerialize: function (data) {
      var ret;
      if (data)
        try {
          ret = JSON.parse(data);
        } catch (e) {
          empire.log("error loading");
        }
      return ret || void 0;
    },
    Save: function () {
      if (this._saveTimer !== null && this._saveTimer !== void 0) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
      }
      empire.setVar("cities", database.Serialize(database.cities));
      empire.setVar("settings", database.Serialize(database.settings));
      empire.setVar("globalData", database.Serialize(database._globalData));
    },
    _saveTimer: null,
    SaveSoon: function () {
      if (this._saveTimer !== null && this._saveTimer !== void 0) return;
      this._saveTimer = setTimeout(function () {
        database._saveTimer = null;
        database.Save();
      }, SAVE_DEBOUNCE_MS);
    },
    get getGlobalData() {
      return this._globalData;
    },
    isDatabaseOutdated: function (version) {
      return 1.166 > (version || 0);
    },
    getCityFromId: function (id) {
      return this.cities[id] || null;
    },
    get getArmyTotals() {
      if (!this._armyTotals)
        this._armyTotals = Utils.cacheFunction(
          this._getArmyTotals.bind(database),
          1e3,
        );
      return this._armyTotals();
    },
    _getArmyTotals: function () {
      var totals = {};
      jq.each(Constant.UnitData, function (unitId, info) {
        totals[unitId] = {
          training: 0,
          total: 0,
          incoming: 0,
          plunder: 0,
        };
      });
      jq.each(this.cities, function (cityId, city) {
        var train = city.military.getTrainingTotals;
        var incoming = city.military.getIncomingTotals;
        var total = city.military.getUnits.totals;
        jq.each(Constant.UnitData, function (unitId, info) {
          totals[unitId].training += train[unitId] || 0;
          totals[unitId].total += total[unitId] || 0;
          totals[unitId].incoming += incoming[unitId] || 0;
        });
      });
      return totals;
    },
    get getCityCount() {
      return Object.keys(this.cities).length;
    },
    _getArmyTrainingTotals: function () {},
  };
  var Utils = {
    wrapInClosure: function (obj) {
      return (function (x) {
        return function () {
          return x;
        };
      })(obj);
    },
    existsIn: function (input, test) {
      var ret;
      try {
        ret = input.indexOf(test) !== -1;
      } catch (e) {
        return false;
      }
      return ret;
    },
    estimateTravelTime: function (city1, city2) {
      var time;
      if (!city1 || !city2) return 0;
      if (city1[0] == city2[0] && city1[1] == city2[1])
        time = (1200 / 60) * 0.5;
      else
        time =
          (1200 / 60) *
          Math.sqrt(
            Math.pow(city2[0] - city1[0], 2) + Math.pow(city2[1] - city1[1], 2),
          );
      return Math.floor(time * 60 * 1e3);
    },
    addStyleSheet: function (style) {
      var getHead = document.getElementsByTagName("head")[0];
      var cssNode = window.document.createElement("style");
      var elementStyle = getHead.appendChild(cssNode);
      elementStyle.innerHTML = style;
      return elementStyle;
    },
    escapeRegExp: function (str) {
      return str.replace(/[\[\]\/\{\}\(\)\-\?\$\*\+\.\\\^\|]/g, "\\$&");
    },
    format: function (inputString, replacements) {
      var str = "" + inputString;
      var keys = Object.keys(replacements);
      var i = keys.length;
      while (i--)
        str = str.replace(
          new RegExp(this.escapeRegExp("{" + keys[i] + "}"), "g"),
          replacements[keys[i]],
        );
      return str;
    },
    cacheFunction: function (toExecute, expiry) {
      expiry = expiry || 1e3;
      var cachedTime = jq.now();
      var cachedResult = void 0;
      return function () {
        if (cachedTime < jq.now() - expiry || cachedResult === void 0) {
          cachedResult = toExecute();
          cachedTime = jq.now();
        }
        return cachedResult;
      };
    },
    getClone: function ($node) {
      if (
        $node.hasClass("ui-sortable-helper") ||
        $node.parent().find(".ui-sortable-helper").length
      )
        return $node;
      return jq($node.get(0).cloneNode(true));
    },
    setClone: function ($node, $clone) {
      if (
        $node.hasClass("ui-sortable-helper") ||
        $node.parent().find(".ui-sortable-helper").length
      )
        return $node;
      $node.get(0).parentNode.replaceChild($clone.get(0), $node.get(0));
      return $node;
    },
    replaceNode: function (node, html) {
      var t = node.cloneNode(false);
      t.innerHTML = html;
      node.parentNode.replaceChild(t, node);
      return t;
    },
    FormatTimeLengthToStr: function (timeString, precision, spacer) {
      var lang = database.settings.languageChange.value;
      timeString = timeString || 0;
      precision = precision || 2;
      spacer = spacer || " ";
      if (!isFinite(timeString)) return " ∞ ";
      if (timeString < 0) timeString *= -1;
      var factors = [];
      var locStr = [];
      factors.year = 31536e3;
      factors.month = 252e4;
      factors.day = 86400;
      factors.hour = 3600;
      factors.minute = 60;
      factors.second = 1;
      locStr.year = Constant.LanguageData[lang].year;
      locStr.month = Constant.LanguageData[lang].month;
      locStr.day = Constant.LanguageData[lang].day;
      locStr.hour = Constant.LanguageData[lang].hour;
      locStr.minute = Constant.LanguageData[lang].minute;
      locStr.second = Constant.LanguageData[lang].second;
      timeString = Math.ceil(timeString / 1e3);
      var retString = "";
      for (var fact in factors) {
        var timeInSecs = Math.floor(timeString / factors[fact]);
        if (isNaN(timeInSecs)) return retString;
        if (precision > 0 && (timeInSecs > 0 || retString != "")) {
          timeString = timeString - timeInSecs * factors[fact];
          if (retString != "") retString += spacer;
          retString += timeInSecs == 0 ? "" : timeInSecs + locStr[fact];
          precision = timeInSecs == 0 ? precision : precision - 1;
        }
      }
      return retString;
    },
    FormatFullTimeToDateString: function (timeString, precise) {
      var lang = database.settings.languageChange.value;
      precise = precise || true;
      timeString = timeString || 0;
      var sInDay = 864e5;
      var day = "";
      var compDate = new Date(timeString);
      if (precise)
        switch (
          Math.floor(compDate.getTime() / sInDay) -
          Math.floor(jq.now() / sInDay)
        ) {
          case 0:
            day = Constant.LanguageData[lang].today;
            break;
          case 1:
            day = Constant.LanguageData[lang].tomorrow;
            break;
          case -1:
            day = Constant.LanguageData[lang].yesterday;
            break;
          default:
            day = compDate.toString().split(" ").splice(0, 3).join(" ");
        }
      if (day !== "") day += ", ";
      return day + compDate.toLocaleTimeString();
    },
    FormatTimeToDateString: function (timeString) {
      timeString = timeString || 0;
      return new Date(timeString).toLocaleTimeString();
    },
    FormatRemainingTime: function (time, brackets) {
      brackets = brackets || false;
      var arrInTime = Utils.FormatTimeLengthToStr(time, 3, " ");
      return arrInTime === ""
        ? ""
        : (brackets ? "(" : "") + arrInTime + (brackets ? ")" : "");
    },
    FormatNumToStr: function (inputNum, outputSign, precision) {
      var lang = database.settings.languageChange.value;
      precision = precision ? "10e" + (precision - 1) : 1;
      var ret, val, sign, i, j;
      var tho = Constant.LanguageData[lang].thousandSeperator;
      var dec = Constant.LanguageData[lang].decimalPoint;
      if (!isFinite(inputNum)) return "∞";
      sign = inputNum > 0 ? 1 : inputNum === 0 ? 0 : -1;
      if (sign) {
        val = (
          Math.floor(Math.abs(inputNum * precision)) / precision +
          ""
        ).split(".");
        ret = val[1] !== void 0 ? [dec, val[1]] : [];
        val = val[0].split("");
        i = val.length;
        j = 1;
        while (i--) {
          ret.unshift(val.pop());
          if (i && j % 3 === 0) ret.unshift(tho);
          j++;
        }
        if (outputSign) ret.unshift(sign == 1 ? "+" : "-");
        return ret.join("");
      } else return inputNum;
    },
  };
  function Military(city) {
    this.city = Utils.wrapInClosure(city);
    this._units = new MilitaryUnits();
    this._advisorLastUpdate = 0;
    this.armyTraining = [];
    this._trainingTimer = null;
  }
  Military.prototype = {
    init: function () {
      this._trainingTimer = null;
      this._startTrainingTimer();
    },
    _getTrainingTotals: function () {
      var ret = {};
      jq.each(this.armyTraining, function (index, training) {
        jq.each(Constant.UnitData, function (unitId, info) {
          ret[unitId] = ret[unitId]
            ? ret[unitId] + (training.units[unitId] || 0)
            : training.units[unitId] || 0;
        });
      });
      return ret;
    },
    get getTrainingTotals() {
      if (!this._trainingTotals)
        this._trainingTotals = Utils.cacheFunction(
          this._getTrainingTotals.bind(this),
          1e3,
        );
      return this._trainingTotals();
    },
    _getIncomingTotals: function () {
      var ret = {};
      jq.each(this.city().getIncomingMilitary, function (index, element) {
        for (var unitName in Constant.UnitData)
          ret[unitName] = ret[unitName]
            ? ret[unitName] + (element.getMilitary.totals[unitName] || 0)
            : element.getMilitary.totals[unitName] || 0;
      });
      return ret;
    },
    get getIncomingTotals() {
      if (!this._incomingTotals)
        this._incomingTotals = Utils.cacheFunction(
          this._getIncomingTotals.bind(this),
          1e3,
        );
      return this._incomingTotals();
    },
    getTrainingForUnit: function (unit) {
      var ret = [];
      jq.each(this.armyTraining, function (index, training) {
        jq.each(training.units, function (unitId, count) {
          if (unitId === unit)
            ret.push({
              count,
              time: training.completionTime,
            });
        });
      });
      return ret;
    },
    setTraining: function (trainingQueue) {
      if (!trainingQueue.length) return false;
      this._stopTrainingTimer();
      var type = trainingQueue[0].type;
      var changes = this._clearTrainingForType(type);
      jq.each(
        trainingQueue,
        function (index, training) {
          this.armyTraining.push(training);
          jq.each(training.units, function (unitId, count) {
            changes.push(unitId);
          });
        }.bind(this),
      );
      this.armyTraining.sort(function (a, b) {
        return a.completionTime - b.completionTime;
      });
      this._startTrainingTimer();
      return jq.exclusive(changes);
    },
    _clearTrainingForType: function (type) {
      var oldTraining = this.armyTraining.filter(function (item) {
        return item.type === type;
      });
      this.armyTraining = this.armyTraining.filter(function (item) {
        return item.type !== type;
      });
      var changes = [];
      jq.each(oldTraining, function (index, training) {
        jq.each(training.units, function (unitId, count) {
          changes.push(unitId);
        });
      });
      return changes;
    },
    _completeTraining: function () {
      if (this.armyTraining.length) {
        if (this.armyTraining[0].completionTime < jq.now() + 5e3) {
          var changes = [];
          var training = this.armyTraining.shift();
          jq.each(
            training.units,
            function (id, count) {
              this.getUnits.addUnit(id, count);
              changes.push(id);
            }.bind(this),
          );
          if (changes.length)
            events(Constant.Events.MILITARY_UPDATED).pub(
              this.city().getId,
              changes,
            );
        }
      }
      this._startTrainingTimer();
    },
    _startTrainingTimer: function () {
      this._stopTrainingTimer();
      if (this.armyTraining.length)
        this._trainingTimer = events.scheduleActionAtTime(
          this._completeTraining.bind(this),
          this.armyTraining[0].completionTime,
        );
    },
    _stopTrainingTimer: function () {
      if (this._trainingTimer) this._trainingTimer();
      this._trainingTimer = null;
    },
    updateUnits: function (counts) {
      var changes = [];
      jq.each(
        counts,
        function (unitId, count) {
          if (this._units.setUnit(unitId, count)) changes.push(unitId);
        }.bind(this),
      );
      return changes;
    },
    get getUnits() {
      return this._units;
    },
  };
  function MilitaryUnits(obj) {
    this._units = obj !== void 0 ? obj._units : {};
  }
  MilitaryUnits.prototype = {
    getUnit: function (unitId) {
      return this._units[unitId] || 0;
    },
    setUnit: function (unitId, count) {
      var changed = this._units[unitId] != count;
      this._units[unitId] = count;
      return changed;
    },
    get totals() {
      return this._units;
    },
    addUnit: function (unitId, count) {
      return this.setUnit(unitId, this.getUnit(unitId) + count);
    },
    removeUnit: function (unitId, count) {
      count = Math.max(0, this.getUnit[unitId] - count);
      return this.setUnit(unitId, count);
    },
  };
  var TOWN_SWITCH_TIMEOUT_MS = 15e3;
  var TOWN_SWITCH_POLL_MS = 100;
  var TOWN_SWITCH_SETTLE_MS = 1200;
  var PENDING_VIEW_KEY = "ika_pendingBoardView";
  var PENDING_VIEW_MAX_AGE_MS = 3e4;
  function savePendingView(view) {
    try {
      sessionStorage.setItem(PENDING_VIEW_KEY, JSON.stringify(view));
    } catch {}
  }
  function takePendingView() {
    try {
      const raw = sessionStorage.getItem(PENDING_VIEW_KEY);
      sessionStorage.removeItem(PENDING_VIEW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function gameIsLoading() {
    if ((pageJQuery()?.active ?? 0) > 0) return true;
    const loading = qs(SEL.loadingIndicator);
    return !!loading && loading.style.display === "block";
  }
  function languageText() {
    return Constant.LanguageData[database.settings.languageChange.value];
  }
  function updatedPrefix() {
    return languageText().toast_updated;
  }
  var ikariam = {
    _View: null,
    _Host: null,
    _ActionRequest: null,
    _Units: null,
    _BuildingsList: null,
    _AltBuildingsList: null,
    _Nationality: null,
    _GameVersion: null,
    _TemplateView: null,
    _currentCity: null,
    url: function () {
      return "http://" + this.Host() + "/index.php";
    },
    get mainView() {
      return unsafeWindow.ikariam.backgroundView.id;
    },
    get boxViewParams() {
      if (
        unsafeWindow.ikariam.mainbox_x ||
        unsafeWindow.ikariam.mainbox_y ||
        unsafeWindow.ikariam.mainbox_z
      )
        return {
          mainbox_x: unsafeWindow.ikariam.mainbox_x,
          mainbox_y: unsafeWindow.ikariam.mainbox_y,
          mainbox_z: unsafeWindow.ikariam.mainbox_z,
        };
      return {};
    },
    loadUrl: function (ajax, mainView, params, townAlreadySwitched) {
      mainView = mainView || ikariam.mainView;
      if (
        !townAlreadySwitched &&
        ajax &&
        ikariam.viewIsCity &&
        mainView === "city" &&
        params.view !== void 0 &&
        params.cityId !== void 0 &&
        String(ikariam.CurrentCityId) !== String(params.cityId)
      ) {
        savePendingView({
          cityId: params.cityId,
          mainView,
          params,
          savedAt: Date.now(),
        });
        if (
          ikariam.switchTownWithGameForm(params.cityId, function (switched) {
            if (switched) takePendingView();
            ikariam.loadUrl(switched, mainView, params, switched);
          })
        )
          return;
        takePendingView();
      }
      var paramList = { cityId: ikariam.CurrentCityId };
      if (!townAlreadySwitched && ikariam.CurrentCityId !== params.cityId) {
        paramList.action = "header";
        paramList.function = "changeCurrentCity";
        paramList.actionRequest = unsafeWindow.ikariam.model.actionRequest;
        paramList.currentCityId = ikariam.CurrentCityId;
        paramList.oldView = ikariam.mainView;
      }
      if (mainView !== void 0 && mainView !== ikariam.mainView) {
        paramList.oldBackgroundView = ikariam.mainView;
        paramList.backgroundView = mainView;
        ajax = false;
      }
      jq.extend(paramList, params);
      if (ajax)
        gotoAjaxURL(
          "?" +
            jq
              .map(paramList, function (value, key) {
                return key + "=" + value;
              })
              .join("&"),
        );
      else
        gotoURL(
          ikariam.url() +
            "?" +
            jq
              .map(paramList, function (value, key) {
                return key + "=" + value;
              })
              .join("&"),
        );
      function gotoURL(url) {
        window.location.assign(url);
      }
      function gotoAjaxURL(url) {
        document.location =
          "javascript:ajaxHandlerCall(" + JSON.stringify(url) + "); void(0);";
      }
    },
    switchTownWithGameForm: function (cityId, done) {
      if (!/^\d+$/.test(String(cityId))) return false;
      const anchor = qs(
        SEL.townListContainer + ' > li[selectvalue="' + cityId + '"] > a',
      );
      const target = (
        modelCityName(cityId) ||
        anchor?.getAttribute("title") ||
        anchor?.textContent ||
        ""
      ).trim();
      if (!anchor || !target) return false;
      const form = qs(SEL.changeCityForm);
      const cityInput = qs(SEL.changeCityInput);
      const submitForm = unsafeWindow.ajaxHandlerCallFromForm;
      if (!form || !cityInput || typeof submitForm !== "function") return false;
      cityInput.value = String(cityId);
      submitForm(form);
      const arrived = () => getCurrentTownName() === target;
      let quietSince = null;
      const settled = () => {
        if (!arrived() || gameIsLoading()) {
          quietSince = null;
          return false;
        }
        const now = Date.now();
        if (quietSince === null) quietSince = now;
        return now - quietSince >= TOWN_SWITCH_SETTLE_MS;
      };
      waitFor(settled, {
        intervalMs: TOWN_SWITCH_POLL_MS,
        timeoutMs: TOWN_SWITCH_TIMEOUT_MS,
        label: `switch to ${target}`,
      }).then(
        () => done(true),
        () => done(arrived()),
      );
      return true;
    },
    openPendingView: function () {
      const pending = takePendingView();
      if (!pending) return;
      if (Date.now() - pending.savedAt > PENDING_VIEW_MAX_AGE_MS) return;
      if (String(ikariam.CurrentCityId) !== String(pending.cityId)) return;
      ikariam.loadUrl(true, pending.mainView, pending.params, true);
    },
    Host: function () {
      if (this._Host == null) {
        this._Host = "";
        this._Host = document.location.host;
      }
      return this._Host;
    },
    Server: function (host) {
      if (this._Server == null) {
        if (host == void 0) host = this.Host();
        this._Server = "";
        var parts = host.split(".");
        this._Server = parts[0].split("-")[0];
      }
      return this._Server;
    },
    Language: function (host) {
      if (this._Language == null) {
        if (host == void 0) host = this.Host();
        this._Language = "";
        var parts = host.split(".");
        this._Language = parts[0].split("-")[1];
      }
      if (
        this._Language == "us" ||
        this._Language == "au" ||
        this._Language == "hk" ||
        this._Language == "tw" ||
        this._Language == "il" ||
        this._Language == "lt" ||
        this._Language == "hu" ||
        this._Language == "bg" ||
        this._Language == "rs" ||
        this._Language == "si" ||
        this._Language == "sk" ||
        this._Language == "dk" ||
        this._Language == "fi" ||
        this._Language == "ee" ||
        this._Language == "se" ||
        this._Language == "no"
      )
        this._Language = "en";
      if (
        this._Language == "ve" ||
        this._Language == "mx" ||
        this._Language == "ar" ||
        this._Language == "co" ||
        this._Language == "cl" ||
        this._Language == "pe"
      )
        this._Language = "es";
      if (this._Language == "br") this._Language = "pt";
      if (this._Language == "ae") this._Language = "ar";
      if (this._Language == "gr") this._Language = "el";
      return this._Language;
    },
    Nationality: function (host) {
      if (this._Nationality == null) {
        if (host == void 0) host = this.Host();
        this._Nationality = "";
        var parts = host.split(".");
        this._Nationality = parts[0].split("-")[1];
      }
      return this._Nationality;
    },
    getNextWineTick: function (precision) {
      precision = precision || 1;
      if (precision == 1) return 60 - new Date().getMinutes();
      else {
        var secs =
          3600 - new Date().getMinutes() * 60 - new Date().getSeconds();
        var ret =
          Math.floor(secs / 60) +
          database.getGlobalData.getLocalisedString("minute") +
          " ";
        ret +=
          secs -
          Math.floor(secs / 60) * 60 +
          database.getGlobalData.getLocalisedString("second");
        return ret;
      }
    },
    GameVersion: function () {
      if (this._GameVersion == null)
        this._GameVersion = jq(".version").text().split("v")[1];
      return this._GameVersion;
    },
    get CurrentCityId() {
      return unsafeWindow.ikariam.backgroundView &&
        unsafeWindow.ikariam.backgroundView.id === "city"
        ? ikariam._currentCity ||
            unsafeWindow.ikariam.model.relatedCityData[
              unsafeWindow.ikariam.model.relatedCityData.selectedCity
            ].id
        : unsafeWindow.ikariam.model.relatedCityData[
            unsafeWindow.ikariam.model.relatedCityData.selectedCity
          ].id;
    },
    get viewIsCity() {
      return (
        unsafeWindow.ikariam.backgroundView &&
        unsafeWindow.ikariam.backgroundView.id === "city"
      );
    },
    get viewIsIsland() {
      return (
        unsafeWindow.ikariam.backgroundView &&
        unsafeWindow.ikariam.backgroundView.id === "island"
      );
    },
    get viewIsWorld() {
      return (
        unsafeWindow.ikariam.backgroundView &&
        unsafeWindow.ikariam.backgroundView.id === "worldmap_iso"
      );
    },
    get getCurrentCity() {
      return database.cities[ikariam.CurrentCityId];
    },
    get getCapital() {
      for (var c in database.cities)
        if (database.cities[c].isCapital) return database.cities[c];
      return false;
    },
    get CurrentTemplateView() {
      try {
        this._CurrentTemplateView = unsafeWindow.ikariam.templateView.id;
      } catch (e) {
        this._CurrentTemplateView = null;
      }
      return this._CurrentTemplateView;
    },
    getLocalizationStrings: function () {
      var localStrings = unsafeWindow.LocalizationStrings;
      if (!localStrings)
        jq("script").each(function (index, script) {
          var match = /LocalizationStrings = JSON.parse\('(.*)'\);/.exec(
            script.innerHTML,
          );
          if (match) {
            localStrings = JSON.parse(match[1]);
            return false;
          }
        });
      var local = jq.extend({}, localStrings);
      jq.extend(local, local.timeunits.short);
      delete local.warnings;
      delete local.timeunits;
      jq.each(local, function (name, value) {
        database.getGlobalData.addLocalisedString(name.toLowerCase(), value);
      });
      local = null;
    },
    setupEventHandlers: function () {
      events("ajaxResponse").sub(
        function (response) {
          var view, html, template;
          if (!Array.isArray(response)) return;
          trace("ajaxResponse", {
            viewIsCity: this.viewIsCity,
            currentCityId: this.CurrentCityId,
            entries: response.map(describeEntry),
          });
          var len = response.length;
          var oldCity = this._currentCity;
          while (len) {
            len--;
            var entry = response[len];
            if (!Array.isArray(entry) || entry.length < 2 || entry[1] == null) {
              reportBug("manual", new Error("Malformed ajaxResponse entry"), {
                entry: JSON.stringify(entry ?? null).slice(0, 200),
                index: len,
                responseLength: response.length,
              });
              continue;
            }
            try {
              switch (entry[0]) {
                case "updateGlobalData":
                  if (!entry[1].backgroundData) break;
                  this._currentCity = parseInt(entry[1].backgroundData.id);
                  var cityData = jq.extend(
                    {},
                    entry[1].backgroundData,
                    entry[1].headerData,
                  );
                  events("updateCityData").pub(
                    this.CurrentCityId,
                    jq.extend({}, cityData),
                  );
                  events("updateBuildingData").pub(
                    this.CurrentCityId,
                    cityData.position,
                  );
                  break;
                case "changeView":
                  view = entry[1][0];
                  html = entry[1][1];
                  break;
                case "updateTemplateData":
                  template = entry[1];
                  if (unsafeWindow.ikariam.templateView) {
                    if (
                      unsafeWindow.ikariam.templateView.id == "researchAdvisor"
                    )
                      view = unsafeWindow.ikariam.templateView.id;
                  }
                  break;
                case "updateBackgroundData":
                  oldCity = this.CurrentCityId;
                  this._currentCity = parseInt(entry[1].id);
                  events("updateCityData").pub(
                    this._currentCity,
                    jq.extend(true, {}, unsafeWindow.dataSetForView, entry[1]),
                  );
                  events("updateBuildingData").pub(
                    this._currentCity,
                    entry[1].position,
                  );
                  break;
              }
            } catch (e) {
              reportBug("manual", e, {
                where: "ajaxResponse entry",
                entryType: String(entry[0]),
              });
            }
          }
          this.parseViewData(view, html, template);
          if (oldCity !== this.CurrentCityId)
            events("cityChanged").pub(this.CurrentCityId);
        }.bind(ikariam),
      );
      events("formSubmit").sub(
        function (form) {
          var formID = form.getAttribute("id");
          if (!ikariam[formID + "Submitted"]) return false;
          var formSubmission = (function formSubmit() {
            var data = ikariam[formID + "Submitted"]();
            return function formSubmitID(response) {
              var len = response.length;
              var feedback = 0;
              while (len) {
                len--;
                var item = response[len];
                if (Array.isArray(item) && item[0] == "provideFeedback")
                  feedback = item[1] && item[1][0] ? item[1][0].type : 0;
              }
              if (feedback == 10) ikariam[formID + "Submitted"](data);
              events("ajaxResponse").unsub(formSubmission);
            };
          })();
          events("ajaxResponse").sub(formSubmission);
        }.bind(ikariam),
      );
      events(Constant.Events.CITYDATA_AVAILABLE).sub(
        ikariam.FetchAllTowns.bind(ikariam),
      );
    },
    Init: function () {
      this.setupEventHandlers();
    },
    parseViewData: function (view, html, tData) {
      if (this.getCurrentCity)
        switch (view) {
          case "finances":
            this.parseFinances(
              jq("#finances").find("table.table01 tr").slice(2).children("td"),
            );
            break;
          case Constant.Buildings.TOWN_HALL:
            this.parseTownHall(tData);
            break;
          case "militaryAdvisor":
            this.parseMilitaryAdvisor(html, tData);
            break;
          case "cityMilitary":
            this.parseCityMilitary();
            break;
          case "researchAdvisor":
            this.parseResearchAdvisor(tData);
            break;
          case Constant.Buildings.PALACE:
            this.parsePalace();
            break;
          case Constant.Buildings.ACADEMY:
            this.parseAcademy(tData);
            break;
          case "culturalPossessions_assign":
            this.parseCulturalPossessions(html);
            break;
          case Constant.Buildings.MUSEUM:
            this.parseMuseum();
            break;
          case Constant.Buildings.TAVERN:
            this.parseTavern();
            break;
          case "transport":
          case "plunder":
            this.transportFormSubmitted();
            break;
          case Constant.Buildings.TEMPLE:
            this.parseTemple(tData);
            break;
          case Constant.Buildings.BARRACKS:
          case Constant.Buildings.SHIPYARD:
            this.parseBarracks(view, html, tData);
            break;
          case "deployment":
          case "plunder":
            this.parseMilitaryTransport();
            break;
          case "premium":
            this.parsePremium(view, html, tData);
            break;
        }
    },
    parsePalace: function () {
      var governmentType = jq("#formOfRuleContent")
        .find("td.government_desc h3")
        .text();
      var changed = database.getGlobalData.getGovernmentType != governmentType;
      database.getGlobalData.governmentType = governmentType;
      if (changed)
        events(Constant.Events.GLOBAL_UPDATED).pub({ type: "government" });
      database.getGlobalData.addLocalisedString(
        "Current form",
        jq("#palace").find("div.contentBox01h h3.header").get(0).textContent,
      );
      render.toast(updatedPrefix() + jq("#palace").children(":first").text());
    },
    parseCulturalPossessions: function (html) {
      var allCulturalGoods = html.match(/iniValue\s:\s(\d*)/g);
      var changes = [];
      jq.each(html.match(/goodscity_(\d*)/g), function (i) {
        var cityID = this.split("_")[1];
        var culturalGoods = parseInt(allCulturalGoods[i].split(" ").pop());
        if (database.cities[cityID]._culturalGoods != culturalGoods) {
          database.cities[cityID]._culturalGoods = culturalGoods;
          changes.push(cityID);
        }
      });
      if (changes.length)
        jq.each(changes, function (idx, cityID) {
          events(Constant.Events.CITY_UPDATED).pub(cityID, {
            culturalGoods: true,
          });
        });
      render.toast(
        updatedPrefix() + jq("#culturalPossessions_assign > .header").text(),
      );
    },
    parseMuseum: function () {
      var changed;
      var regText = jq("#val_culturalGoodsDeposit")
        .parent()
        .text()
        .match(/(\d+)/g);
      if (regText && regText.length == 2)
        changed = ikariam.getCurrentCity.updateCulturalGoods(
          parseInt(regText[0]),
        );
      if (changed)
        events(Constant.Events.CITY_UPDATED).pub(ikariam.CurrentCityId, {
          culturalGoods: true,
        });
      render.toast(
        updatedPrefix() + jq("#tab_museum > div > h3").get(0).textContent,
      );
    },
    parseTavern: function () {},
    resTransportObject: function () {
      return {
        id: null,
        wood: 0,
        wine: 0,
        marble: 0,
        glass: 0,
        sulfur: 0,
        gold: 0,
        targetCityId: 0,
        arrivalTime: 0,
        originCityId: 0,
        loadedTime: 0,
        mission: "",
      };
    },
    troopTransportObject: function () {
      return {
        id: null,
        troops: {},
        targetCityId: 0,
        arrivalTime: 0,
        originCityId: 0,
        returnTime: 0,
        mission: "",
      };
    },
    parseBarracks: function (view, html, tData) {
      var type =
        view == Constant.Buildings.BARRACKS
          ? "army"
          : view == Constant.Buildings.SHIPYARD
            ? "fleet"
            : false;
      var city = ikariam.getCurrentCity;
      var currentUnits = {};
      var i = 14;
      while (i--)
        if (tData["js_barracksUnitUnitsAvailable" + (i - 1)])
          currentUnits[
            tData["js_barracksUnitClass" + (i - 1)]["class"].split(" ").pop()
          ] = parseInt(tData["js_barracksUnitUnitsAvailable" + (i - 1)].text);
      var changes = city.military.updateUnits(currentUnits);
      var elem = jq("#unitConstructionList");
      if (elem.length) {
        var tasks = [];
        tasks.push({
          units: parseUnits(elem.find("> .army_wrapper .army")),
          completionTime: parseTime(jq("#unitBuildCountDown").text()),
          type,
        });
        elem.find("div.constructionBlock").each(function () {
          tasks.push({
            units: parseUnits(jq(this).find("> .army_wrapper .army")),
            completionTime: parseTime(jq(this).find("h4 > span").text()),
            type,
          });
        });
        changes = changes.concat(city.military.setTraining(tasks));
      }
      elem = null;
      if (changes.length)
        events(Constant.Events.MILITARY_UPDATED).pub(
          city.getId,
          jq.exclusive(changes),
        );
      function parseUnits(element) {
        var units = {};
        element.each(function () {
          units[Constant.unitIds[this.classList.toString().match(/(\d+)/g)]] =
            parseInt(this.nextElementSibling.textContent.match(/(\d+)/g));
        });
        return units;
      }
      function parseTime(timeText) {
        var completionTime = new Date();
        var server = ikariam.Nationality();
        completionTime.setSeconds(
          completionTime.getSeconds() +
            (timeText.match(/(\d+)s/)
              ? parseInt(timeText.match(/(\d+)s/)[1])
              : 0),
        );
        completionTime.setMinutes(
          completionTime.getMinutes() +
            (timeText.match(/(\d+)m/)
              ? parseInt(timeText.match(/(\d+)m/)[1])
              : 0),
        );
        completionTime.setHours(
          completionTime.getHours() +
            (timeText.match(/(\d+)h/)
              ? parseInt(timeText.match(/(\d+)h/)[1])
              : 0),
        );
        completionTime.setDate(
          completionTime.getDate() +
            (timeText.match(/(\d+)D/)
              ? parseInt(timeText.match(/(\d+)D/)[1])
              : 0),
        );
        switch (server) {
          case "de":
            completionTime.setDate(
              completionTime.getDate() +
                (timeText.match(/(\d+)T/)
                  ? parseInt(timeText.match(/(\d+)T/)[1])
                  : 0),
            );
            break;
          case "gr":
            completionTime.setDate(
              completionTime.getDate() +
                (timeText.match(/(\d+)M/)
                  ? parseInt(timeText.match(/(\d+)M/)[1])
                  : 0),
            );
            break;
          case "fr":
            completionTime.setDate(
              completionTime.getDate() +
                (timeText.match(/(\d+)J/)
                  ? parseInt(timeText.match(/(\d+)J/)[1])
                  : 0),
            );
            break;
          case "ro":
            completionTime.setDate(
              completionTime.getDate() +
                (timeText.match(/(\d+)Z/)
                  ? parseInt(timeText.match(/(\d+)Z/)[1])
                  : 0),
            );
            break;
          case "it":
          case "tr":
            completionTime.setDate(
              completionTime.getDate() +
                (timeText.match(/(\d+)G/)
                  ? parseInt(timeText.match(/(\d+)G/)[1])
                  : 0),
            );
            break;
          case "ir":
          case "ae":
            completionTime.setSeconds(
              completionTime.getSeconds() +
                (timeText.match(/(\d+)ث/)
                  ? parseInt(timeText.match(/(\d+)ث/)[1])
                  : 0),
            );
            completionTime.setMinutes(
              completionTime.getMinutes() +
                (timeText.match(/(\d+)د/)
                  ? parseInt(timeText.match(/(\d+)د/)[1])
                  : 0),
            );
            completionTime.setHours(
              completionTime.getHours() +
                (timeText.match(/(\d+)س/)
                  ? parseInt(timeText.match(/(\d+)س/)[1])
                  : 0),
            );
            completionTime.setDate(
              completionTime.getDate() +
                (timeText.match(/(\d+)ر/)
                  ? parseInt(timeText.match(/(\d+)ر/)[1])
                  : 0),
            );
            break;
        }
        return completionTime.getTime();
      }
      render.toast(updatedPrefix() + jq("#js_mainBoxHeaderTitle").text());
    },
    transportFormSubmitted: function (data) {
      try {
        if (!data) {
          var journeyTime = jq("#journeyTime").text();
          var loadingTime = jq("#loadingTime").text();
          var wood = parseInt(String(jq("#textfield_wood").val()));
          var wine = parseInt(String(jq("#textfield_wine").val()));
          var marble = parseInt(String(jq("#textfield_marble").val()));
          var glass = parseInt(String(jq("#textfield_glass").val()));
          var sulfur = parseInt(String(jq("#textfield_sulfur").val()));
          var gold = "";
          var targetID = jq("input[name=destinationCityId]").val();
          var ships = jq("#transporterCount").val();
          var arrTime = new Date();
          var loadedTime = new Date();
          var server = ikariam.Nationality();
          arrTime.setSeconds(
            arrTime.getSeconds() +
              (journeyTime.match(/(\d+)s/)
                ? parseInt(journeyTime.match(/(\d+)s/)[1])
                : 0),
          );
          arrTime.setMinutes(
            arrTime.getMinutes() +
              (journeyTime.match(/(\d+)m/)
                ? parseInt(journeyTime.match(/(\d+)m/)[1])
                : 0),
          );
          arrTime.setHours(
            arrTime.getHours() +
              (journeyTime.match(/(\d+)h/)
                ? parseInt(journeyTime.match(/(\d+)h/)[1])
                : 0),
          );
          arrTime.setDate(
            arrTime.getDate() +
              (journeyTime.match(/(\d+)D/)
                ? parseInt(journeyTime.match(/(\d+)D/)[1])
                : 0),
          );
          if (server == "de")
            arrTime.setDate(
              arrTime.getDate() +
                (journeyTime.match(/(\d+)T/)
                  ? parseInt(journeyTime.match(/(\d+)T/)[1])
                  : 0),
            );
          loadedTime.setSeconds(
            loadedTime.getSeconds() +
              (loadingTime.match(/(\d+)s/)
                ? parseInt(loadingTime.match(/(\d+)s/)[1])
                : 0),
          );
          loadedTime.setMinutes(
            loadedTime.getMinutes() +
              (loadingTime.match(/(\d+)m/)
                ? parseInt(loadingTime.match(/(\d+)m/)[1])
                : 0),
          );
          loadedTime.setHours(
            loadedTime.getHours() +
              (loadingTime.match(/(\d+)h/)
                ? parseInt(loadingTime.match(/(\d+)h/)[1])
                : 0),
          );
          loadedTime.setDate(
            loadedTime.getDate() +
              (loadingTime.match(/(\d+)D/)
                ? parseInt(loadingTime.match(/(\d+)D/)[1])
                : 0),
          );
          if (server == "de")
            loadedTime.setDate(
              loadedTime.getDate() +
                (loadingTime.match(/(\d+)T/)
                  ? parseInt(loadingTime.match(/(\d+)T/)[1])
                  : 0),
            );
          return new Movement(
            "XXX-" + arrTime.getTime(),
            this.CurrentCityId,
            targetID,
            arrTime.getTime() + loadedTime.getTime() - jq.now(),
            "transport",
            loadedTime.getTime(),
            {
              gold: gold || 0,
              wood: wood || 0,
              wine: wine || 0,
              marble: marble || 0,
              glass: glass || 0,
              sulfur: sulfur || 0,
            },
            void 0,
            ships,
          );
        } else {
          database.getGlobalData.addFleetMovement(data);
          events(Constant.Events.MOVEMENTS_UPDATED).pub([data.getTargetCityId]);
        }
      } catch (e) {
        empire.error("transportFormSubmitted", e);
      }
    },
    parseMilitaryTransport: function (submit) {
      submit = submit || false;
      if (submit) {
        var journeyTime = jq("#journeyTime").text();
        var returnTime = jq("#returnTime").text();
        var targetID = jq("input:[name=destinationCityId]").val();
        var troops = {};
        var mission = "";
        jq("ul.assignUnits li input.textfield").each(function () {
          const input = this;
          if (input.value !== "")
            troops[this.getAttribute("name").split("_").pop()] = parseInt(
              input.value,
            );
          if (mission === "")
            mission = "deploy" + this.getAttribute("name").match(/_(.*)_/)[1];
          else
            mission = "plunder" + this.getAttribute("name").match(/_(.*)_/)[1];
        });
        var arrTime = new Date();
        var transport = this.troopTransportObject();
        var server = ikariam.Nationality();
        transport.id = "XXX-" + arrTime.getTime();
        transport.targetCityId = targetID;
        transport.originCityId = this.CurrentCityId;
        transport.mission = mission;
        transport.troops = troops;
        arrTime.setSeconds(
          arrTime.getSeconds() +
            (journeyTime.match(/(\d+)s/)
              ? parseInt(journeyTime.match(/(\d+)s/)[1])
              : 0),
        );
        arrTime.setMinutes(
          arrTime.getMinutes() +
            (journeyTime.match(/(\d+)m/)
              ? parseInt(journeyTime.match(/(\d+)m/)[1])
              : 0),
        );
        arrTime.setHours(
          arrTime.getHours() +
            (journeyTime.match(/(\d+)h/)
              ? parseInt(journeyTime.match(/(\d+)h/)[1])
              : 0),
        );
        arrTime.setDate(
          arrTime.getDate() +
            (journeyTime.match(/(\d+)D/)
              ? parseInt(journeyTime.match(/(\d+)D/)[1])
              : 0),
        );
        if (server == "de")
          arrTime.setDate(
            arrTime.getDate() +
              (journeyTime.match(/(\d+)T/)
                ? parseInt(journeyTime.match(/(\d+)T/)[1])
                : 0),
          );
        transport.arrivalTime = arrTime.getTime();
        arrTime = new Date();
        arrTime.setSeconds(
          arrTime.getSeconds() +
            (returnTime.match(/(\d+)s/)
              ? parseInt(returnTime.match(/(\d+)s/)[1])
              : 0),
        );
        arrTime.setMinutes(
          arrTime.getMinutes() +
            (returnTime.match(/(\d+)m/)
              ? parseInt(returnTime.match(/(\d+)m/)[1])
              : 0),
        );
        arrTime.setHours(
          arrTime.getHours() +
            (returnTime.match(/(\d+)h/)
              ? parseInt(returnTime.match(/(\d+)h/)[1])
              : 0),
        );
        arrTime.setDate(
          arrTime.getDate() +
            (returnTime.match(/(\d+)D/)
              ? parseInt(returnTime.match(/(\d+)D/)[1])
              : 0),
        );
        if (server == "de")
          arrTime.setDate(
            arrTime.getDate() +
              (returnTime.match(/(\d+)T/)
                ? parseInt(returnTime.match(/(\d+)T/)[1])
                : 0),
          );
        transport.returnTime = arrTime.getTime();
        database.getGlobalData.addFleetMovement(transport);
        render.toast(updatedPrefix() + languageText().toast_movementAdded);
        return false;
      } else return true;
    },
    parseFinances: function ($elem) {
      jq.now();
      var changed;
      for (var i = 1; i < database.getCityCount + 1; i++) {
        var city = database.cities[Object.keys(database.cities)[i - 1]];
        if (city !== false) {
          changed = city.updateIncome(
            parseInt(
              $elem[i * 4 - 3].textContent
                .split(
                  database.getGlobalData.getLocalisedString(
                    "thousandSeperator",
                  ),
                )
                .join(""),
            ),
          );
          changed =
            city.updateExpenses(
              parseInt(
                $elem[i * 4 - 2].textContent
                  .split(
                    database.getGlobalData.getLocalisedString(
                      "thousandSeperator",
                    ),
                  )
                  .join(""),
              ),
            ) || changed;
        }
        if (changed)
          events(Constant.Events.CITY_UPDATED).pub(city.getId, {
            finances: true,
          });
      }
      var $breakdown = jq("#finances").find(
        "tbody tr.bottomLine td:last-child",
      );
      database.getGlobalData.finance.armyCost = parseInt(
        $breakdown[0].textContent
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      database.getGlobalData.finance.fleetCost = parseInt(
        $breakdown[1].textContent
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      database.getGlobalData.finance.armySupply = parseInt(
        $breakdown[2].textContent
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      database.getGlobalData.finance.fleetSupply = parseInt(
        $breakdown[3].textContent
          .split(database.getGlobalData.getLocalisedString("thousandSeperator"))
          .join(""),
      );
      events("globalData").pub({ finances: true });
      database.getGlobalData.addLocalisedString(
        "finances",
        jq("#finances").find("h3#js_mainBoxHeaderTitle").text(),
      );
      render.toast(updatedPrefix() + jq("#finances").children(":first").text());
    },
    parseResearchAdvisor: function (data) {
      var changes = [];
      var research = JSON.parse(
        data.new_js_params || data.load_js.params,
      ).currResearchType;
      jq.each(research, function (name, Data) {
        var id = parseInt(Data.aHref.match(/researchId=([0-9]+)/i)[1]);
        var level = name.match(/\((\d+)\)/);
        var explored = level
          ? parseInt(level[1]) - 1
          : Data.liClass === "explored"
            ? 1
            : 0;
        if (database.getGlobalData.updateResearchTopic(id, explored))
          changes.push({
            type: "research_topic",
            subType: id,
          });
        database.getGlobalData.addLocalisedString(
          "research_" + id,
          name.split("(").shift(),
        );
      });
      if (changes.length) events(Constant.Events.GLOBAL_UPDATED).pub(changes);
      database.getGlobalData.addLocalisedString(
        "researchpoints",
        jq("li.points").text().split(":")[0],
      );
      render.toast(
        updatedPrefix() + jq("#tab_researchAdvisor").children(":first").text(),
      );
    },
    parseAcademy: function (data) {
      var changed = ikariam.getCurrentCity.updateResearchers(
        parseInt(data.js_AcademySlider.slider.ini_value),
      );
      if (changed)
        events(Constant.Events.CITY_UPDATED).pub(ikariam.CurrentCityId, {
          research: changed,
        });
      render.toast(
        updatedPrefix() + jq("#academy h3#js_mainBoxHeaderTitle").text(),
      );
    },
    parseTownHall: function (data) {
      var changes = {};
      var city = ikariam.getCurrentCity;
      var cultBon =
        parseInt(
          data.js_TownHallSatisfactionOverviewCultureBoniTreatyBonusValue.text,
        ) || 0;
      var priests =
        parseInt(
          data.js_TownHallPopulationGraphPriestCount.text
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        ) || 0;
      var researchers =
        parseInt(data.js_TownHallPopulationGraphScientistCount.text) || 0;
      changes.culturalGoods = city.updateCulturalGoods(cultBon / 50);
      changes.priests = city.updatePriests(priests);
      changes.research = city.updateResearchers(researchers);
      events(Constant.Events.CITY_UPDATED).pub(ikariam.CurrentCityId, changes);
      render.toast(updatedPrefix() + jq("#js_TownHallCityName").text());
    },
    parseTemple: function (data) {
      var priests = parseInt(data.js_TempleSlider.slider.ini_value) || 0;
      var changed = ikariam.getCurrentCity.updatePriests(priests);
      events(Constant.Events.CITY_UPDATED).pub(ikariam.CurrentCityId, {
        priests: changed,
      });
    },
    parseMilitaryAdvisor: function (html, data) {
      try {
        var ownMovementIds = [];
        for (var key in data) {
          var match = key.match(/^js_MilitaryMovementsEventRow(\d+)$/);
          if (match && Utils.existsIn(data[key]["class"], "own"))
            ownMovementIds.push(match[1]);
        }
        var changes = 0;
        if (ownMovementIds.length) {
          changes = database.getGlobalData.clearFleetMovements();
          jq.each(ownMovementIds, function (idx, value) {
            var transport = new Movement(value);
            transport._id = parseInt(value);
            transport._arrivalTime =
              data["js_MilitaryMovementsEventRow" + value + "ArrivalTime"]
                .countdown.enddate * 1e3;
            transport._loadingTime = 0;
            transport._originCityId = parseInt(
              data[
                "js_MilitaryMovementsEventRow" + value + "OriginLink"
              ].href.match(/cityId=(\d+)/)[1],
            );
            transport._targetCityId = parseInt(
              data[
                "js_MilitaryMovementsEventRow" + value + "TargetLink"
              ].href.match(/cityId=(\d+)/)[1],
            );
            transport._mission =
              data["js_MilitaryMovementsEventRow" + value + "MissionIcon"][
                "class"
              ].split(" ")[1];
            var status =
              data["js_MilitaryMovementsEventRow" + value + "Mission"]["class"];
            if (status) {
              if (Utils.existsIn(status, "arrow_left_green")) {
                var t = transport._originCityId;
                transport._originCityId = transport._targetCityId;
                transport._targetCityId = t;
              }
            } else {
              var serverTyp = 1;
              if (ikariam.Server() == "s201" || ikariam.Server() == "s202")
                serverTyp = 3;
              transport._loadingTime = transport._arrivalTime;
              if (
                database.getCityFromId(transport._originCityId) &&
                database.getCityFromId(transport._targetCityId)
              )
                transport._arrivalTime +=
                  Utils.estimateTravelTime(
                    database.getCityFromId(transport._originCityId)
                      .getCoordinates,
                    database.getCityFromId(transport._targetCityId)
                      .getCoordinates,
                  ) / serverTyp;
            }
            switch (transport._mission) {
              case "trade":
              case "transport":
              case "plunder":
                jq.each(
                  data["js_MilitaryMovementsEventRow" + value + "UnitDetails"]
                    .appendElement,
                  function (index, item) {
                    if (Utils.existsIn(item["class"], Constant.Resources.WOOD))
                      transport._resources.wood = parseInt(
                        item.text
                          .split(
                            database.getGlobalData.getLocalisedString(
                              "thousandSeperator",
                            ),
                          )
                          .join(""),
                      );
                    else if (
                      Utils.existsIn(item["class"], Constant.Resources.WINE)
                    )
                      transport._resources.wine = parseInt(
                        item.text
                          .split(
                            database.getGlobalData.getLocalisedString(
                              "thousandSeperator",
                            ),
                          )
                          .join(""),
                      );
                    else if (
                      Utils.existsIn(item["class"], Constant.Resources.MARBLE)
                    )
                      transport._resources.marble = parseInt(
                        item.text
                          .split(
                            database.getGlobalData.getLocalisedString(
                              "thousandSeperator",
                            ),
                          )
                          .join(""),
                      );
                    else if (
                      Utils.existsIn(item["class"], Constant.Resources.GLASS)
                    )
                      transport._resources.glass = parseInt(
                        item.text
                          .split(
                            database.getGlobalData.getLocalisedString(
                              "thousandSeperator",
                            ),
                          )
                          .join(""),
                      );
                    else if (
                      Utils.existsIn(item["class"], Constant.Resources.SULFUR)
                    )
                      transport._resources.sulfur = parseInt(
                        item.text
                          .split(
                            database.getGlobalData.getLocalisedString(
                              "thousandSeperator",
                            ),
                          )
                          .join(""),
                      );
                    else if (
                      Utils.existsIn(item["class"], Constant.Resources.GOLD)
                    )
                      transport._resources.gold = parseInt(
                        item.text
                          .split(
                            database.getGlobalData.getLocalisedString(
                              "thousandSeperator",
                            ),
                          )
                          .join(""),
                      );
                  },
                );
                break;
              case "deployarmy":
              case "deployfleet":
              case "plunder":
                transport._military = new MilitaryUnits();
                jq.each(
                  data["js_MilitaryMovementsEventRow" + value + "UnitDetails"]
                    .appendElement,
                  function (index, item) {
                    jq.each(Constant.UnitData, function findIsUnit(val, info) {
                      if (Utils.existsIn(item["class"], " " + val)) {
                        transport._military.setUnit(val, parseInt(item.text));
                        return false;
                      }
                    });
                  },
                );
                break;
              default:
                return true;
            }
            database.getGlobalData.addFleetMovement(transport);
            changes.push(transport._targetCityId);
          });
        }
        if (changes.length)
          events(Constant.Events.MOVEMENTS_UPDATED).pub(jq.exclusive(changes));
      } catch (e) {
        empire.error("parseMilitaryAdvisor", e);
      }
      render.toast(
        updatedPrefix() + jq("#js_MilitaryMovementsFleetMovements h3").text(),
      );
    },
    parseCityMilitary: function () {
      try {
        var $elemArmy = jq("#tabUnits").find("> div.contentBox01h td");
        var $elemShips = jq("#tabShips").find("> div.contentBox01h td");
        var city = ikariam.getCurrentCity;
        var cityArmy = {};
        cityArmy[Constant.Military.SLINGER] = parseInt(
          $elemArmy[5].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.SWORDSMAN] = parseInt(
          $elemArmy[4].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.HOPLITE] = parseInt(
          $elemArmy[1].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.MARKSMAN] = parseInt(
          $elemArmy[7].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.MORTAR] = parseInt(
          $elemArmy[11].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.CATAPULT] = parseInt(
          $elemArmy[10].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.RAM] = parseInt(
          $elemArmy[8].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.STEAM_GIANT] = parseInt(
          $elemArmy[2].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.BALLOON_BOMBADIER] = parseInt(
          $elemArmy[13].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.COOK] = parseInt(
          $elemArmy[14].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.DOCTOR] = parseInt(
          $elemArmy[15].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.GYROCOPTER] = parseInt(
          $elemArmy[12].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.ARCHER] = parseInt(
          $elemArmy[6].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.SPEARMAN] = parseInt(
          $elemArmy[3].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.SPARTAN] = parseInt(
          $elemArmy[16].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.RAM_SHIP] = parseInt(
          $elemShips[3].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.FLAME_THROWER] = parseInt(
          $elemShips[1].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.SUBMARINE] = parseInt(
          $elemShips[8].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.BALLISTA_SHIP] = parseInt(
          $elemShips[4].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.CATAPULT_SHIP] = parseInt(
          $elemShips[5].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.MORTAR_SHIP] = parseInt(
          $elemShips[6].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.STEAM_RAM] = parseInt(
          $elemShips[2].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.ROCKET_SHIP] = parseInt(
          $elemShips[7].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.PADDLE_SPEEDBOAT] = parseInt(
          $elemShips[10].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.BALLOON_CARRIER] = parseInt(
          $elemShips[11].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        cityArmy[Constant.Military.TENDER] = parseInt(
          $elemShips[12].innerHTML
            .split(
              database.getGlobalData.getLocalisedString("thousandSeperator"),
            )
            .join(""),
        );
        var changes = city.military.updateUnits(cityArmy);
        $elemArmy = null;
        $elemShips = null;
        events(Constant.Events.MILITARY_UPDATED).pub(city.getId, changes);
      } catch (e) {
        empire.error("parseCityMilitary", e);
      }
    },
    parsePremium: function (view, html, tData) {
      var changes = [];
      var features = [];
      jq("#premiumOffers")
        .find('table.table01 tbody > tr[class]:not([class=""])')
        .each(function () {
          var item = jq(this).attr("class").split(" ").shift();
          if (Constant.PremiumData[item] !== void 0) features.push(item);
        });
      jq.each(features, function (index, val) {
        var active = false;
        var endTime = 0;
        var continuous = false;
        var type = 0;
        active = jq("#js_buy" + val + "ActiveTime").hasClass("green");
        if (active) {
          endTime =
            parseInt(
              jq("#js_buy" + val + "Link")
                .attr("href")
                .split("typeUntil=")
                .pop()
                .split("&")
                .shift(),
            ) - Constant.PremiumData[val].duration;
          if (isNaN(endTime)) {
            var str = jq("#js_buy" + val + "ActiveTime").text();
            var time = new Date();
            time.setSeconds(
              time.getSeconds() +
                (str.match(/(\d+)s/) ? parseInt(str.match(/(\d+)s/)[1]) : 0),
            );
            time.setMinutes(
              time.getMinutes() +
                (str.match(/(\d+)m/) ? parseInt(str.match(/(\d+)m/)[1]) : 0),
            );
            time.setHours(
              time.getHours() +
                (str.match(/(\d+)h/) ? parseInt(str.match(/(\d+)h/)[1]) : 0),
            );
            time.setDate(
              time.getDate() +
                (str.match(/(\d+)D/) ? parseInt(str.match(/(\d+)D/)[1]) : 0),
            );
            endTime = time.getTime() / 1e3;
          }
          type = parseInt(
            jq("#js_buy" + val + "Link")
              .attr("href")
              .split("type=")
              .pop()
              .split("&")
              .shift(),
          );
          continuous = jq("#empireViewExtendCheckbox" + type + "Img").hasClass(
            "checked",
          );
        }
        changes.push(
          database.getGlobalData.setPremiumFeature(
            val,
            endTime * 1e3,
            continuous,
          ),
        );
      });
      events(Constant.Events.PREMIUM_UPDATED).pub(changes);
      render.toast(updatedPrefix() + jq("#premium").children(":first").text());
    },
    FetchAllTowns: function () {
      var _relatedCityData = unsafeWindow.ikariam.model.relatedCityData;
      var _cityId = null;
      var city = null;
      var order = database.settings.cityOrder.value;
      if (!order.length) order = [];
      if (_relatedCityData) {
        for (_cityId in _relatedCityData)
          if (_cityId != "selectedCity" && _cityId != "additionalInfo") {
            var own = _relatedCityData[_cityId].relationship == "ownCity";
            _relatedCityData[_cityId].relationship;
            _relatedCityData[_cityId].relationship;
            if (own) {
              if (database.cities[_relatedCityData[_cityId].id] == void 0) {
                (database.cities[_relatedCityData[_cityId].id] =
                  database.addCity(_relatedCityData[_cityId].id)).init();
                city = database.cities[_relatedCityData[_cityId].id];
                city.updateTradeGoodID(
                  parseInt(_relatedCityData[_cityId].tradegood),
                );
                city.isOwn = own;
              }
              city = database.cities[_relatedCityData[_cityId].id];
              city.updateName(_relatedCityData[_cityId].name);
              var coords = _relatedCityData[_cityId].coords.match(/\d+/g);
              if (coords && coords.length >= 2)
                city.updateCoordinates(
                  parseInt(coords[0]),
                  parseInt(coords[1]),
                );
              if (jq.inArray(city.getId, order) == -1) order.push(city.getId);
            }
          }
        for (_cityId in _relatedCityData) {
          if (_cityId === "selectedCity" || _cityId === "additionalInfo")
            continue;
          var entry = _relatedCityData[_cityId];
          if (!entry || entry.relationship === "ownCity") continue;
          var known = database.cities[entry.id];
          if (known && known.isOwn) delete database.cities[entry.id];
        }
      }
      database.settings.cityOrder.value = order;
    },
    get currentShips() {
      if (this.$freeTransporters == void 0)
        this.$freeTransporters = jq("#js_GlobalMenu_freeTransporters");
      return parseInt(this.$freeTransporters.text());
    },
  };
  var Constant = {
    PremiumData: {
      PremiumAccount: {
        type: 15,
        duration: 10080,
        cost: 0,
        bonus: 0,
        icon: "cdn/all/both/premium/premium_account.png",
      },
      ResourceBonus: {
        type: 16,
        duration: 10080,
        cost: 0,
        bonus: 0.2,
        icon: "cdn/all/both/premium/b_premium_wood.jpg",
      },
      WineBonus: {
        type: 14,
        duration: 10080,
        cost: 0,
        bonus: 0.2,
        icon: "cdn/all/both/premium/b_premium_wine.jpg",
      },
      MarbleBonus: {
        type: 11,
        duration: 10080,
        cost: 0,
        bonus: 0.2,
        icon: "cdn/all/both/premium/b_premium_marble.jpg",
      },
      SulfurBonus: {
        type: 12,
        duration: 10080,
        cost: 0,
        bonus: 0.2,
        icon: "cdn/all/both/premium/b_premium_sulfur.jpg",
      },
      CrystalBonus: {
        type: 13,
        duration: 10080,
        cost: 0,
        bonus: 0.2,
        icon: "cdn/all/both/premium/b_premium_crystal.jpg",
      },
      ResearchPointsBonus: {
        type: 18,
        duration: 10080,
        cost: 0,
        bonus: 0.2,
        icon: "cdn/all/both/premium/b_premium_research.jpg",
      },
      ResearchPointsBonusExtremeLength: {
        type: 0,
        duration: 1680 * 60,
        cost: 0,
        bonus: 0.2,
        icon: "cdn/all/both/premium/b_premium_research_big.jpg",
      },
      SafecapacityBonus: {
        type: 17,
        duration: 10080,
        cost: 0,
        bonus: 1,
        icon: "cdn/all/both/premium/b_premium_safecapacity.jpg",
      },
      StoragecapacityBonus: {
        type: 33,
        duration: 10080,
        cost: 0,
        bonus: 1,
        icon: "cdn/all/both/premium/b_premium_storagecapacity.jpg",
      },
    },
    Premium: {
      PREMIUM_ACCOUNT: "PremiumAccount",
      WOOD_BONUS: "ResourceBonus",
      WINE_BONUS: "WineBonus",
      MARBLE_BONUS: "MarbleBonus",
      SULFUR_BONUS: "SulfurBonus",
      CRYSTAL_BONUS: "CrystalBonus",
      RESEARCH_POINTS_BONUS: "ResearchPointsBonus",
      RESEARCH_POINTS_BONUS_EXTREME_LENGTH: "ResearchPointsBonusExtremeLength",
      SAFECAPACITY_BONUS: "SafecapacityBonus",
      STORAGECAPACITY_BONUS: "StoragecapacityBonus",
    },
    Events: {
      BUILDINGS_UPDATED: "buildingsUpdated",
      GLOBAL_UPDATED: "globalDataUpdated",
      MOVEMENTS_UPDATED: "movementsUpdated",
      RESOURCES_UPDATED: "resourcesUpdated",
      CITY_UPDATED: "cityData",
      MILITARY_UPDATED: "militaryUpdated",
      LOCAL_STRINGS_AVAILABLE: "localisationAvailable",
      MODEL_AVAILABLE: "modelAvailable",
      CITYDATA_AVAILABLE: "cityDataAvailable",
      DATABASE_LOADED: "databaseLoaded",
      TAB_CHANGED: "tabChanged",
      PREMIUM_UPDATED: "premiumUpdated",
    },
    Settings: {
      CITY_ORDER: "cityOrder",
      FULL_ARMY_TABLE: "fullArmyTable",
      PLAYER_INFO: "playerInfo",
      ON_IKA_LOGS: "onIkaLogs",
      HIDE_WORLD: "hideOnWorldView",
      HIDE_ISLAND: "hideOnIslandView",
      HIDE_CITY: "hideOnCityView",
      SHOW_ON_TOP: "onTop",
      WINDOW_TENNIS: "windowTennis",
      AUTO_UPDATE: "autoUpdates",
      SMALLER_FONT: "smallFont",
      GOLD_LONG: "GoldShort",
      NEWS_TICKER: "newsTicker",
      EVENT: "event",
      LOGIN_POPUP: "logInPopup",
      BIRD_SWARM: "birdSwarm",
      WALKERS: "walkers",
      NO_PIRACY: "noPiracy",
      CONTROL_CENTER: "controlCenter",
      WITHOUT_FABLE: "withoutFable",
      AMBROSIA_PAY: "ambrosiaPay",
      ALTERNATIV_BUILDINGS: "alternativeBuildingList",
      COMPRESS_BUILDINGS: "compressedBuildingList",
      HOURLY_RESS: "hourlyRess",
      WINE_OUT: "wineOut",
      DAILY_BONUS: "dailyBonus",
      WINE_WARNING: "wineWarning",
      WINE_WARNING_TIME: "wineWarningTime",
      LANGUAGE_CHANGE: "languageChange",
    },
    SettingData: {
      cityOrder: {
        type: "array",
        default: [],
        categories: "ignore",
      },
      fullArmyTable: {
        type: "boolean",
        default: false,
        categories: "army_category",
      },
      playerInfo: {
        type: "boolean",
        default: false,
        categories: "army_category",
      },
      onIkaLogs: {
        type: "boolean",
        default: false,
        categories: "army_category",
      },
      hideOnWorldView: {
        type: "boolean",
        default: false,
        categories: "visibility_category",
      },
      hideOnIslandView: {
        type: "boolean",
        default: false,
        categories: "visibility_category",
      },
      hideOnCityView: {
        type: "boolean",
        default: false,
        categories: "visibility_category",
      },
      onTop: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      windowTennis: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      autoUpdates: {
        type: "boolean",
        default: false,
        categories: "global_category",
      },
      smallFont: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      GoldShort: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      newsTicker: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      event: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      logInPopup: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      birdSwarm: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      walkers: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      noPiracy: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      controlCenter: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      withoutFable: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      ambrosiaPay: {
        type: "boolean",
        default: false,
        categories: "display_category",
      },
      alternativeBuildingList: {
        type: "boolean",
        default: false,
        categories: "building_category",
      },
      compressedBuildingList: {
        type: "boolean",
        default: false,
        category: "building_category",
      },
      hourlyRess: {
        type: "boolean",
        default: false,
        categories: "resource_category",
      },
      wineOut: {
        type: "boolean",
        default: false,
        categories: "resource_category",
      },
      dailyBonus: {
        type: "boolean",
        default: false,
        categories: "resource_category",
      },
      wineWarning: {
        type: "boolean",
        default: false,
        categories: "resource_category",
      },
      wineWarningTime: {
        type: "number",
        default: 0,
        choices: [0, 12, 24, 36, 48, 96],
        categories: "resource_category",
      },
      languageChange: {
        type: "language",
        default: ikariam.Language(),
        selection: [
          "en",
          "de",
          "it",
          "el",
          "es",
          "fr",
          "ro",
          "ru",
          "cz",
          "pl",
          "ar",
          "ir",
          "pt",
          "tr",
          "nl",
        ],
        categories: "language_category",
      },
    },
    SettingCategories: {
      VISIBILITY: "visibility_category",
      DISPLAY: "display_category",
      OTHER: "global_category",
      ARMY: "army_category",
      BUILDING: "building_category",
      RESOURCE: "resource_category",
      LANGUAGE: "language_category",
    },
    LanguageData: {
      en: {
        buildings: "Buildings",
        economy: "Economy",
        military: "Military",
        towns: "Towns",
        townHall: "Town Hall",
        palace: "Palace",
        palaceColony: "Governor`s Residence",
        tavern: "Tavern",
        museum: "Museum",
        academy: "Academy",
        workshop: "Workshop",
        temple: "Temple",
        embassy: "Embassy",
        warehouse: "Warehouse",
        dump: "Depot",
        port: "Trading Port",
        branchOffice: "Trading Post",
        wall: "Town Wall",
        safehouse: "Hideout",
        barracks: "Barracks",
        shipyard: "Shipyard",
        forester: "Forester`s House",
        carpentering: "Carpenter`s Workshop",
        winegrower: "Winery",
        vineyard: "Wine Press",
        stonemason: "Stonemason",
        architect: "Architect`s Office",
        chronosForge: "Chronos’ Forge",
        glassblowing: "Glassblower",
        optician: "Optician",
        alchemist: "Alchemist`s Tower",
        fireworker: "Firework Test Area",
        pirateFortress: "Pirate Fortress",
        dockyard: "Dockyard",
        shrineOfOlympus: "Gods’ Shrine",
        blackMarket: "Black Market",
        marineChartArchive: "Sea Chart Archive",
        tavern_level: "Tavern Level",
        corruption: "Corruption",
        cultural: "Cultural Goods",
        population: "Population",
        citizens: "Citizens",
        scientists: "Scientists",
        scientists_max: "max. Scientists",
        options: "Options",
        help: "Help",
        agora: "to Agora",
        to_world: "Show World",
        to_island: "Show Island",
        army_cost: "Army Cost",
        fleet_cost: "Fleet Cost",
        army_supply: "Army Supply",
        fleet_supply: "Fleet Supply",
        research_cost: "Research Cost",
        income: "Income",
        expenses: "Expenses",
        balances: "Balances",
        espionage: "View Espionage",
        contracts: "View Contracts",
        combat: "View Combats",
        satisfaction: "Satisfaction",
        total_: "total",
        max_Level: "max. Level",
        actionP: "Action Points",
        researchP: "Research Points",
        finances_: "Finances",
        free_ground: "free Building Ground",
        wood_: "Building Material",
        wine_: "Wine",
        marble_: "Marble",
        crystal_: "Crystal Glass",
        sulphur_: "Sulphur",
        angry: "angry",
        unhappy: "unhappy",
        neutral: "neutral",
        happy: "happy",
        euphoric: "euphoric",
        housing_space: "max. Housing space",
        free_Citizens: "free Citizens",
        free_housing_space: "free Housing space",
        level_tavern: "Level Tavern",
        maximum: "maximum",
        used: "used",
        missing: "missing",
        plundergold: "Gold",
        garrision: "Garrison limit",
        Sea: "Sea",
        Inland: "Inland",
        full: "0",
        off: "off",
        time_to_full: "to full",
        time_to_empty: "to empty",
        capacity: "Capacity",
        safe: "Safe",
        training: "Training",
        plundering: "Plundering",
        constructing: "Expansion in Progress",
        next_Level: "Needed for Level",
        transport: "Transports",
        loading: "loading",
        en_route: "en route",
        arrived: "arrived",
        arrival: "Arrival",
        to_town_hall: "to Town Hall",
        to_saw_mill: "to Saw Mill",
        to_mine: "to luxury good",
        to_barracks: "to Barracks",
        to_shipyard: "to Shipyard",
        member: "View Memberlist",
        transporting: "Transport to",
        transporting_units: "Deploying troops to",
        transporting_fleets: "Moving fleet to",
        today: "today",
        tomorrow: "tomorrow",
        yesterday: "yesterday",
        second: "s",
        minute: "m",
        hour: "h",
        day: "D",
        week: "W",
        month: "M",
        year: "Y",
        hour_long: "Hour",
        day_long: "Day",
        week_long: "Week",
        ika_world: "Search on Ikariam-World",
        charts: "Show Charts",
        wonder1: "Hephaistos` Forge",
        wonder2: "Hades` Holy Grove",
        wonder3: "Demeter`s gardens",
        wonder4: "Athena`s Parthenon",
        wonder5: "Temple of Hermes",
        wonder6: "Ares` stronghold",
        wonder7: "Temple of Poseidon",
        wonder8: "Colossus",
        cityOrder: "cityOrder",
        fullArmyTable: "Show all military units",
        hideOnWorldView: "Force hide on world view",
        hideOnIslandView: "Force hide on island view",
        hideOnCityView: "Force hide on city view",
        onTop: "Show on top of Ikariam windows",
        windowTennis: "Show above ikariam on mouseover",
        autoUpdates: "Automaticly check for updates",
        smallFont: "Use smaller font size",
        goldShort: "Reduce total gold display",
        alternativeBuildingList: "Use alternative building list",
        compressedBuildingList: "Use compressed building list",
        wineOut: 'Disable Ambrosia feature "Out of Wine"',
        dailyBonus: "Automatically confirm the daily bonus",
        unnecessaryTexts: "Removes unnecessary descriptions",
        ambrosiaPay: "Deactivate new Ambrosia buying options",
        wineWarning: 'Hide tooltip "wine warning"',
        wineWarningTime: "Wine remaining warning",
        languageChange: "Change language",
        current_Version: "Current Version<b>:</b>",
        ikariam_Version: "Ikariam Version<b>:</b>",
        reset: "Reset all settings to default",
        goto_website: "Goto the scripts greasyfork.org website",
        website: "Website",
        Check_for_updates: "Force a check for updates",
        check: "Check for updates",
        Report_bug: "Report a bug in the script",
        report: "Report Bug",
        save: "Save",
        save_settings: "Save settings<b>!</b>&nbsp;",
        newsticker: "Hide news ticker",
        event: "Hide events",
        logInPopup: "Hide the Info Window when login",
        birdswarm: "Hide the bird swarm",
        walkers: "Hide animated citizens",
        noPiracy: "No Piracy",
        hourlyRes: "Hide hourly resources",
        onIkaLogs: "Use IkaLog Battle Report Converter",
        playerInfo: "Show information about player",
        control: "Hide Control center",
        alert: "Please choose only one option!",
        alert_palace: "Please visit your capital city first",
        alert_palace1:
          "There is still no palace present in your city.\n Please explore expansion and build a palace.",
        alert_toast: "Data Reset, reloading the page in a few seconds",
        alert_error: "An error occurred while checking for updates: ",
        alert_noUpdate: 'No update is available for "',
        alert_update:
          'There is an update available for the Greasemonkey script "',
        alert_update1: "Would you like to go to the install page now?",
        alert_daily: "Please enable 'Automatically confirm the daily bonus '",
        alert_wine: "Warning wine > ",
        toast_updated: "Updated: ",
        toast_movementAdded: "Movement added",
        toast_remoteVersionUnreadable: "Could not read the remote version.",
        en: "English",
        phalanx: "Hoplite",
        steamgiant: "Steam Giant",
        spearman: "Spearman",
        swordsman: "Swordsman",
        slinger: "Slinger",
        archer: "Archer",
        marksman: "Sulphur Carabineer",
        ram: "Battering Ram",
        catapult: "Catapult",
        mortar: "Mortar",
        gyrocopter: "Gyrocopter",
        bombardier: "Ballon-Bombardier",
        cook: "Cook",
        medic: "Doctor",
        spartan: "Spartan",
        ship_ram: "Ram Ship",
        ship_flamethrower: "Fire Ship",
        ship_steamboat: "Steam Ram",
        ship_ballista: "Ballista Ship",
        ship_catapult: "Catapult Ship",
        ship_mortar: "Mortar Ship",
        ship_submarine: "Diving Boat",
        ship_paddlespeedship: "Paddle Speedboat",
        ship_ballooncarrier: "Ballon Carrier",
        ship_tender: "Tender",
        ship_rocketship: "Rocket Ship",
        cityOrder_description: "cityOrder_description",
        fullArmyTable_description:
          "Show all possible army units on the Army tab",
        hideOnWorldView_description: "Hide by default on world view",
        hideOnIslandView_description: "Hide by default on island view",
        hideOnCityView_description: "Hide by default on city view",
        onTop_description: "Show board on top of Ikariam windows",
        windowTennis_description:
          "Bring board to the top on mouseover<br>Send behind ikariam windows on mouseout<br>Ignores 'on top' option",
        autoUpdates_description:
          "Enable automatic update checking<br>(Once every 24hrs)",
        smallFont_description: "Use a smaller font for the data tables",
        goldShort_description: "Total gold display shorten on the Board",
        alternativeBuildingList_description: "Use alternative building table",
        compressedBuildingList_description:
          "Use condensed building table<br>Groups luxury resource production buildings<br>Groups palace/govenors residence",
        wineOut_description:
          "Disables the Ambrosia option to buy 'Out of Wine'",
        dailyBonus_description:
          "The daily bonus will be automatically confirmed<br>and the window is no longer displayed",
        unnecessaryTexts_description:
          "Removes unnecessary descriptions in buildings,<br>the building list of buildings, minimize scrolling",
        ambrosiaPay_description:
          "Disables the new Ambrosia buying options,<br>click on the button cancels the action",
        wineWarning_description: "Hide tooltip 'wine warning'",
        wineWarningTime_description:
          "Wine remaining time turns, 'red' at this point",
        languageChange_description: "Change the language",
        newsticker_description: "Hide news ticker in the GF-toolbar",
        event_description: "Hide events under the advisers",
        logInPopup_description: "Hide the Info Window when login",
        birdswarm_description: "Hide the bird swarm in island and city view",
        walkers_description:
          "Hide animated citizens and transport ships in island and city view",
        noPiracy_description: "Removes the Pirate Plot",
        hourlyRes_description: "Hide hourly resources in the infobar",
        onIkaLogs_description: "use IkaLogs for your battle reports",
        playerInfo_description:
          "View information from the players in the island view",
        control_description:
          "Hide the Control center in world, island and city view",
        visibility_category: "<b>Board Visibility</b>",
        display_category: "<b>Display Settings</b>",
        global_category: "<b>Global Settings</b>",
        army_category: "<b>Army Settings</b>",
        building_category: "<b>Building Settings</b>",
        resource_category: "<b>Resource Settings</b>",
        language_category: "<b>Language Settings</b>",
        Initialize_Board: "<b>Initialize Board</b>",
        on_your_Town_Hall:
          "on your Town Hall and go through each town with that view open",
        on_the_Troops:
          'on the "Troops in town" tab on left side and go through each town with that view open',
        on_Museum: 'on Museum and then the "Distribute Cultural Treaties" tab',
        on_Research_Advisor:
          "on Research Advisor and then click on each of the 4 research tabs in the left window",
        on_your_Palace: "on your Palace",
        on_your_Finance: "on your Finance tab",
        on_the_Ambrosia: 'on the "Ambrosia shop"',
        Re_Order_Towns: "<b>Re-Order Towns</b>",
        Reset_Position: "<b>Reset Position</b>",
        On_any_tab:
          "On any tab, drag the resource icon to the left of the town name",
        Right_click:
          "Right click on the empire menu button on the left side page menu",
        Navigate:
          "1, 2, 3 ... 0, -, = <b>:&nbsp;&nbsp;</b> Navigate to town 1 to 12",
        Navigate_to_City:
          "SHIFT + 1/2/3/4/5/4/5 <b>:&nbsp;&nbsp;</b> Navigate to City/ Building/ Army/ Setting/ Help tab",
        Navigate_to:
          "Q, W, E, R <b>:&nbsp;&nbsp;</b> Navigate to City/ Military/ Research/ Diplomacy advisor",
        Navigate_to_World:
          "SHIFT + Q, W, E <b>:&nbsp;&nbsp;</b> Navigate to World/ Island/ City view",
        Spacebar: "Spacebar<b>:&nbsp;&nbsp;</b> Minimise/ Maximise the board",
        Hotkeys: "<b>Hotkeys</b>",
        thousandSeperator: ",",
        decimalPoint: ".",
        click_: "<b>Click</b>",
      },
    },
    Resources: {
      GOLD: "gold",
      WOOD: "wood",
      WINE: "wine",
      MARBLE: "marble",
      GLASS: "glass",
      SULFUR: "sulfur",
    },
    ResourceIDs: {
      GOLD: "gold",
      WOOD: "resource",
      WINE: 1,
      MARBLE: 2,
      GLASS: 3,
      SULFUR: 4,
    },
    Research: {
      Seafaring: {
        CARPENTRY: 2150,
        DECK_WEAPONS: 1010,
        PIRACY: 1170,
        SHIP_MAINTENANCE: 1020,
        DRAFT: 1130,
        EXPANSION: 1030,
        FOREIGN_CULTURES: 1040,
        PITCH: 1050,
        MARKET: 2070,
        GREEK_FIRE: 1060,
        COUNTERWEIGHT: 1070,
        DIPLOMACY: 1080,
        SEA_MAPS: 1090,
        PADDLE_WHEEL_ENGINE: 1100,
        CAULKING: 1140,
        MORTAR_ATTACHMENT: 1110,
        MASSIVE_RAM: 1150,
        OFFSHORE_BASE: 1160,
        SEAFARING_FUTURE: 1999,
      },
      Economy: {
        CONSERVATION: 2010,
        PULLEY: 2020,
        WEALTH: 2030,
        WINE_CULTURE: 2040,
        IMPROVED_RESOURCE_GATHERING: 2130,
        GEOMETRY: 2060,
        ARCHITECTURE: 1120,
        HOLIDAY: 2080,
        LEGISLATION: 2170,
        CULINARY_SPECIALITIES: 2050,
        HELPING_HANDS: 2090,
        SPIRIT_LEVEL: 2100,
        WINE_PRESS: 2140,
        DEPOT: 2160,
        SOLDIER_EXCHANGE: 2180,
        BUREACRACY: 2110,
        UTOPIA: 2120,
        ECONOMIC_FUTURE: 2999,
      },
      Science: {
        WELL_CONSTRUCTION: 3010,
        PAPER: 3020,
        ESPIONAGE: 3030,
        POLYTHEISM: 3040,
        INK: 3050,
        GOVERNMENT_FORMATION: 3150,
        INVENTION: 3140,
        CULTURAL_EXCHANGE: 3060,
        ANATOMY: 3070,
        OPTICS: 3080,
        EXPERIMENTS: 3081,
        MECHANICAL_PEN: 3090,
        BIRDS_FLIGHT: 3100,
        ARCHIVING: 3170,
        LETTER_CHUTE: 3110,
        STATE_RELIGION: 3160,
        PRESSURE_CHAMBER: 3120,
        ARCHIMEDEAN_PRINCIPLE: 3130,
        SCIENTIFIC_FUTURE: 3999,
      },
      Military: {
        DRY_DOCKS: 4010,
        MAPS: 4020,
        PROFESSIONAL_ARMY: 4030,
        SEIGE: 4040,
        CODE_OF_HONOR: 4050,
        BALLISTICS: 4060,
        LAW_OF_THE_LEVEL: 4070,
        GOVERNOR: 4080,
        PYROTECHNICS: 4130,
        LOGISTICS: 4090,
        GUNPOWDER: 4100,
        ROBOTICS: 4110,
        CANNON_CASTING: 4120,
        MILITARISTIC_FUTURE: 4999,
      },
    },
    Military: {
      HOPLITE: "phalanx",
      SPARTAN: "spartan",
      STEAM_GIANT: "steamgiant",
      SPEARMAN: "spearman",
      SWORDSMAN: "swordsman",
      SLINGER: "slinger",
      ARCHER: "archer",
      MARKSMAN: "marksman",
      RAM: "ram",
      CATAPULT: "catapult",
      MORTAR: "mortar",
      GYROCOPTER: "gyrocopter",
      BALLOON_BOMBADIER: "bombardier",
      COOK: "cook",
      DOCTOR: "medic",
      ARMY: "army",
      RAM_SHIP: "ship_ram",
      FLAME_THROWER: "ship_flamethrower",
      STEAM_RAM: "ship_steamboat",
      BALLISTA_SHIP: "ship_ballista",
      CATAPULT_SHIP: "ship_catapult",
      MORTAR_SHIP: "ship_mortar",
      SUBMARINE: "ship_submarine",
      PADDLE_SPEEDBOAT: "ship_paddlespeedship",
      BALLOON_CARRIER: "ship_ballooncarrier",
      TENDER: "ship_tender",
      ROCKET_SHIP: "ship_rocketship",
      NAVY: "navy",
    },
    unitIds: {
      301: "slinger",
      302: "swordsman",
      303: "phalanx",
      304: "marksman",
      305: "mortar",
      306: "catapult",
      307: "ram",
      308: "steamgiant",
      309: "bombardier",
      310: "cook",
      311: "medic",
      312: "gyrocopter",
      313: "archer",
      315: "spearman",
      316: "barbarian",
      319: "spartan",
      210: "ship_ram",
      211: "ship_flamethrower",
      212: "ship_submarine",
      213: "ship_ballista",
      214: "ship_catapult",
      215: "ship_mortar",
      216: "ship_steamboat",
      217: "ship_rocketship",
      218: "ship_paddlespeedship",
      219: "ship_ballooncarrier",
      220: "ship_tender",
    },
    UnitData: {
      slinger: {
        id: 301,
        type: "army",
        position: "army_ranged",
        minlevel: 2,
        baseTime: 90,
        baseCost: 2,
      },
      swordsman: {
        id: 302,
        type: "army",
        position: "army_flank",
        minlevel: 6,
        baseTime: 180,
        baseCost: 4,
      },
      phalanx: {
        id: 303,
        type: "army",
        position: "army_front_line",
        minlevel: 4,
        baseTime: 300,
        baseCost: 3,
      },
      marksman: {
        id: 304,
        type: "army",
        position: "army_ranged",
        minlevel: 13,
        baseTime: 600,
        baseCost: 3,
      },
      mortar: {
        id: 305,
        type: "army",
        position: "army_seige",
        minlevel: 14,
        baseTime: 2400,
        baseCost: 30,
      },
      catapult: {
        id: 306,
        type: "army",
        position: "army_seige",
        minlevel: 8,
        baseTime: 1800,
        baseCost: 25,
      },
      ram: {
        id: 307,
        type: "army",
        position: "army_seige",
        minlevel: 2,
        baseTime: 600,
        baseCost: 15,
      },
      steamgiant: {
        id: 308,
        type: "army",
        position: "army_front_line",
        minlevel: 12,
        baseTime: 900,
        baseCost: 12,
      },
      bombardier: {
        id: 309,
        type: "army",
        position: "army_air",
        minlevel: 11,
        baseTime: 1800,
        baseCost: 45,
      },
      cook: {
        id: 310,
        type: "army",
        position: "army_support",
        minlevel: 5,
        baseTime: 1200,
        baseCost: 10,
      },
      medic: {
        id: 311,
        type: "army",
        position: "army_support",
        minlevel: 9,
        baseTime: 1200,
        baseCost: 20,
      },
      gyrocopter: {
        id: 312,
        type: "army",
        position: "army_air",
        minlevel: 10,
        baseTime: 900,
        baseCost: 15,
      },
      archer: {
        id: 313,
        type: "army",
        position: "army_ranged",
        minlevel: 7,
        baseTime: 240,
        baseCost: 4,
      },
      spearman: {
        id: 315,
        type: "army",
        position: "army_flank",
        minLevel: 1,
        baseTime: 60,
        baseCost: 1,
      },
      spartan: {
        id: 319,
        type: "army",
        position: "army_front_line",
        minLevel: 0,
        baseTime: 0,
        baseCost: 0,
      },
      ship_ram: {
        id: 210,
        type: "fleet",
        position: "navy_flank",
        minlevel: 1,
        baseTime: 2400,
        baseCost: 15,
      },
      ship_flamethrower: {
        id: 211,
        type: "fleet",
        position: "navy_front_line",
        minlevel: 4,
        baseTime: 1800,
        baseCost: 25,
      },
      ship_submarine: {
        id: 212,
        type: "fleet",
        position: "navy_seige",
        minlevel: 19,
        baseTime: 3600,
        baseCost: 50,
      },
      ship_ballista: {
        id: 213,
        type: "fleet",
        position: "navy_ranged",
        minlevel: 3,
        baseTime: 3e3,
        baseCost: 20,
      },
      ship_catapult: {
        id: 214,
        type: "fleet",
        position: "navy_ranged",
        minlevel: 3,
        baseTime: 3e3,
        baseCost: 35,
      },
      ship_mortar: {
        id: 215,
        type: "fleet",
        position: "navy_ranged",
        minlevel: 17,
        baseTime: 3e3,
        baseCost: 50,
      },
      ship_steamboat: {
        id: 216,
        type: "fleet",
        position: "navy_front_line",
        minlevel: 15,
        baseTime: 2400,
        baseCost: 45,
      },
      ship_rocketship: {
        id: 217,
        type: "fleet",
        position: "navy_seige",
        minlevel: 11,
        baseTime: 3600,
        baseCost: 55,
      },
      ship_paddlespeedship: {
        id: 218,
        type: "fleet",
        position: "navy_air",
        minlevel: 13,
        baseTime: 1800,
        baseCost: 5,
      },
      ship_ballooncarrier: {
        id: 219,
        type: "fleet",
        position: "navy_air",
        minlevel: 7,
        baseTime: 3900,
        baseCost: 100,
      },
      ship_tender: {
        id: 220,
        type: "fleet",
        position: "navy_support",
        minlevel: 9,
        baseTime: 2400,
        baseCost: 100,
      },
    },
    Government: {
      ANARCHY: "Anarchy",
      XENOCRACY: "Xenocracy",
      IKACRACY: "Ikacracy",
      ARISTOCRACY: "Aristocracy",
      DICTATORSHIP: "Dictatorship",
      DEMOCRACY: "Democracy",
      NOMOCRACY: "Nomocracy",
      OLIGARCHY: "Oligarchy",
      TECHNOCRACY: "Technocracy",
      THEOCRACY: "Theocracy",
    },
    Buildings: {
      TOWN_HALL: "townHall",
      PALACE: "palace",
      GOVERNORS_RESIDENCE: "palaceColony",
      TAVERN: "tavern",
      MUSEUM: "museum",
      ACADEMY: "academy",
      WORKSHOP: "workshop",
      TEMPLE: "temple",
      EMBASSY: "embassy",
      WAREHOUSE: "warehouse",
      DUMP: "dump",
      TRADING_PORT: "port",
      TRADING_POST: "branchOffice",
      WALL: "wall",
      HIDEOUT: "safehouse",
      BARRACKS: "barracks",
      SHIPYARD: "shipyard",
      FORESTER: "forester",
      CARPENTER: "carpentering",
      WINERY: "winegrower",
      VINEYARD: "vineyard",
      STONEMASON: "stonemason",
      ARCHITECT: "architect",
      GLASSBLOWER: "glassblowing",
      OPTICIAN: "optician",
      ALCHEMISTS_TOWER: "alchemist",
      FIREWORK_TEST_AREA: "fireworker",
      PIRATE_FORTRESS: "pirateFortress",
      BLACK_MARKET: "blackMarket",
      MARINE_CHART_ARCHIVE: "marineChartArchive",
      DOCKYARD: "dockyard",
      SHRINEOFOLYMPUS: "shrineOfOlympus",
      CHRONOSFORGE: "chronosForge",
    },
    GovernmentData: {
      Anarchy: {
        corruptionPalace: 0,
        governors: 0,
        corruption: 0.25,
        spyprotection: 0,
        unitBuildTime: 0,
        fleetBuildTime: 0,
        loadingSpeed: 0,
        buildingTime: 0,
        happiness: 0,
        bonusShips: 0,
        armySupply: 0,
        fleetSupply: 0,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 1,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Xenocracy: {
        corruptionPalace: 0,
        governors: 0,
        corruption: 0,
        spyprotection: 0,
        unitBuildTime: 0,
        fleetBuildTime: 0,
        loadingSpeed: 0,
        buildingTime: 0,
        happiness: 0,
        bonusShips: 0,
        armySupply: 0,
        fleetSupply: 0,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 1,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Ikacracy: {
        corruptionPalace: 0,
        governors: 0,
        corruption: 0,
        spyprotection: 0,
        unitBuildTime: 0,
        fleetBuildTime: 0,
        loadingSpeed: 0,
        buildingTime: 0,
        happiness: 0,
        bonusShips: 0,
        armySupply: 0,
        fleetSupply: 0,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 1,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Aristocracy: {
        corruptionPalace: 3,
        governors: 0.03,
        corruption: 0,
        spyprotection: 0.2,
        unitBuildTime: 0,
        fleetBuildTime: 0,
        loadingSpeed: 0,
        buildingTime: -0.2,
        happiness: 0,
        bonusShips: 0,
        armySupply: 0,
        fleetSupply: 0,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 1,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Dictatorship: {
        corruptionPalace: 0,
        governors: 0,
        corruption: 0,
        spyprotection: 0,
        unitBuildTime: -0.02,
        fleetBuildTime: -0.02,
        loadingSpeed: 0,
        buildingTime: 0,
        happiness: -75,
        bonusShips: 2,
        armySupply: -0.02,
        fleetSupply: -0.02,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 1,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Democracy: {
        corruptionPalace: 0,
        governors: 0,
        corruption: 0,
        spyprotection: -0.2,
        unitBuildTime: 0.05,
        fleetBuildTime: 0,
        loadingSpeed: 0,
        buildingTime: 0,
        happiness: 75,
        bonusShips: 0,
        armySupply: 0,
        fleetSupply: 0,
        researchPerCulturalGood: 1,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 1,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Nomocracy: {
        corruptionPalace: 0,
        governors: 0,
        corruption: -0.05,
        spyprotection: 0.2,
        unitBuildTime: 0.05,
        fleetBuildTime: 0.05,
        loadingSpeed: 0.5,
        buildingTime: 0,
        happiness: 0,
        bonusShips: 0,
        armySupply: 0,
        fleetSupply: 0,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 1,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Oligarchy: {
        corruptionPalace: 0,
        governors: 0,
        corruption: 0.03,
        spyprotection: 0,
        unitBuildTime: 0,
        fleetBuildTime: 0,
        loadingSpeed: 0,
        buildingTime: 0.2,
        happiness: 0,
        bonusShips: 2,
        armySupply: 0,
        fleetSupply: -0.02,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0.1,
        branchOfficeRange: 5,
        researchBonus: 1,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Technocracy: {
        corruptionPalace: 0,
        governors: 0,
        corruption: 0,
        spyprotection: 0,
        unitBuildTime: 0,
        fleetBuildTime: 0,
        loadingSpeed: 0,
        buildingTime: 0,
        happiness: 0,
        bonusShips: 0,
        armySupply: 0,
        fleetSupply: 0,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 1.05,
        researcherCost: 1,
        productivity: 0.2,
        happinessWithoutTemple: 0,
        goldBonusPerPriest: 0,
        cooldownTime: 0,
        happinessBonusWithTempleConversion: 0,
      },
      Theocracy: {
        corruptionPalace: 0,
        governors: 0,
        corruption: 0,
        spyprotection: 0,
        unitBuildTime: 0,
        fleetBuildTime: 0,
        loadingSpeed: 0,
        buildingTime: 0,
        happiness: 0,
        bonusShips: 0,
        armySupply: 0,
        fleetSupply: 0,
        researchPerCulturalGood: 0,
        tradeShipSpeed: 0,
        branchOfficeRange: 0,
        researchBonus: 0.95,
        researcherCost: 0,
        productivity: 0,
        happinessWithoutTemple: -20,
        goldBonusPerPriest: 1,
        cooldownTime: -0.2,
        happinessBonusWithTempleConversion: 2,
      },
    },
    BuildingData: {
      academy: {
        buildingId: 4,
        maxLevel: 0,
        wood: [
          34, 45, 64, 92, 136, 201, 299, 444, 655, 962, 1404, 2041, 2950, 4245,
          6084, 8685, 12354, 17518, 24770, 34930, 49139, 68977, 96628, 135113,
          188600, 262845, 365781, 508333, 705545, 978106, 1354459, 1873675,
          2589401, 3575245, 4932155, 6798502, 9363856, 12887807, 17725664,
          24363545, 33466242, 45942544, 63034293, 86437820, 118469445,
          162290984, 222216933, 304132802, 416064676, 568954467,
        ],
        glass: [
          0, 0, 0, 0, 224, 306, 432, 623, 912, 1345, 1990, 2944, 4349, 6412,
          9429, 13825, 20213, 29474, 42866, 62191, 90024, 130036, 187464,
          269763, 387539, 555861, 796132, 1138714, 1626653, 2320929, 3307871,
          4709607, 6698809, 9519462, 13516116, 19175079, 27182379, 38505308,
          54507092, 77108082, 109012258, 154025415, 217501974, 306972238,
          433022666, 610530905, 860397999, 1211977313, 1706479424, 2401743957,
        ],
        marble: 0,
        sulfur: 0,
        wine: 0,
        time: [
          24, 188, 405, 686, 1048, 1509, 2095, 2832, 3720, 4860, 6300, 8100,
          10260, 12960, 16260, 20340, 25260, 31320, 38640, 47580, 58440, 71580,
          87540, 104400, 129600, 154800, 190800, 230400, 280800, 338400, 410400,
          496800, 597600, 72e4, 867600, 1044e3, 1252800, 1504800, 1807200,
          2167200, 2595600, 3110400, 3715200, 4406400, 5270400, 6307200,
          7603200, 9072e3, 108e5, 12873600,
        ],
        icon: "cdn/all/both/img/city/academy_l.png",
        maxScientists: [
          0, 8, 11, 16, 22, 28, 35, 43, 51, 60, 69, 78, 89, 99, 110, 122, 134,
          146, 158, 171, 184, 198, 212, 226, 241, 256, 271, 286, 302, 318, 334,
          351, 368, 385, 402, 420, 438, 456, 474, 493, 511, 531, 550, 569, 589,
          609, 629, 650, 671, 692, 713,
        ],
      },
      alchemist: {
        buildingId: 22,
        maxLevel: 70,
        wood: [
          225, 286, 377, 510, 701, 971, 1351, 1879, 2608, 3608, 4973, 6826,
          9332, 12710, 17247, 23325, 31445, 42269, 56666, 75779, 101105, 134612,
          178873, 237258, 314174, 415381, 548396, 723032, 952083, 1252225,
          1645175, 2159201, 2831084, 3708647, 4854048, 6348032, 8295448,
          10832381, 14135388, 18433436, 24023354, 31289801, 40731075, 52992468,
          68909347, 89562805, 116351507, 151084440, 196100619, 254423546,
        ],
        glass: 0,
        marble: [
          0, 83, 135, 212, 322, 479, 698, 1002, 1421, 1996, 2780, 3844, 5281,
          7216, 9814, 13291, 17932, 24113, 32328, 43225, 57653, 76725, 101898,
          135078, 178753, 236174, 311580, 410502, 540142, 709882, 931927,
          1222157, 1601209, 2095901, 2741056, 3581877, 4677012, 6102517,
          7956991, 10368196, 13501625, 17571569, 22855399, 29712019, 38605676,
          50136690, 65081100, 84441797, 109514474, 141972642,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          898, 1289, 1742, 2265, 2866, 3555, 4320, 5220, 6240, 7380, 8700,
          10140, 11820, 13680, 15780, 18180, 20820, 23760, 27060, 30780, 34920,
          39540, 44640, 50340, 56700, 63780, 71640, 80340, 9e4, 97200, 111600,
          122400, 136800, 154800, 174300, 190800, 212400, 237600, 262800,
          295200, 327600, 363600, 399600, 442800, 493200, 543600, 601200, 666e3,
          738e3, 813600,
        ],
        icon: "cdn/all/both/img/city/alchemist_l.png",
      },
      architect: {
        buildingId: 24,
        maxLevel: 50,
        wood: [
          146, 201, 271, 357, 464, 593, 751, 942, 1171, 1446, 1776, 2169, 2636,
          3191, 3848, 4625, 5541, 6620, 7888, 9379, 11126, 13173, 15568, 18368,
          21637, 25450, 29894, 35069, 41090, 48092, 56227, 65673, 76634, 89345,
          104077, 121142, 140899, 163762, 190205, 220775, 256102, 296907,
          344021, 398398, 461134, 533489, 616907, 713049, 823818, 951401,
        ],
        glass: 0,
        marble: [
          85, 116, 154, 200, 256, 324, 405, 503, 619, 757, 920, 1112, 1339,
          1606, 1918, 2284, 2711, 3210, 3791, 4467, 5252, 6163, 7220, 8443,
          9858, 11494, 13384, 15564, 18079, 20976, 24312, 28151, 32566, 37640,
          43468, 50160, 57838, 66645, 76741, 88310, 101561, 116731, 134094,
          153956, 176672, 202639, 232315, 266218, 304937, 349144,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          904, 1007, 1123, 1251, 1393, 1549, 1722, 1912, 2122, 2351, 2603, 2878,
          3180, 3509, 3840, 4260, 4680, 5100, 5640, 6180, 6780, 7440, 8100,
          8880, 9720, 10620, 11580, 12600, 13740, 14940, 16260, 17700, 19200,
          20880, 22620, 24540, 26640, 28860, 31260, 33840, 36600, 39643, 42840,
          46260, 49980, 54019, 58260, 62880, 67800, 73140,
        ],
        icon: "cdn/all/both/img/city/architect_l.png",
      },
      barracks: {
        buildingId: 6,
        maxLevel: 0,
        wood: [
          36, 61, 97, 146, 212, 300, 416, 569, 768, 1027, 1360, 1790, 2341,
          3045, 3943, 5084, 6531, 8362, 10676, 13592, 17264, 21880, 27673,
          34935, 44028, 55399, 69606, 87337, 109447, 136992, 171279, 213927,
          266933, 332769, 414484, 515846, 641501, 797182, 989960, 1228548,
          1523687, 1888605, 2339594, 2896709, 3584636, 4433747, 5481399,
          6773536, 8366637, 10330125,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 0, 0, 0, 0, 0, 133, 320, 561, 871, 1268, 1774, 2419, 3237,
          4274, 5585, 7238, 9321, 11940, 15227, 19349, 24510, 30964, 39026,
          49087, 61629, 77250, 96688, 120857, 150884, 188162, 234409, 291745,
          362783, 450747, 559605, 694248, 860696, 1066360, 1320358, 1633905,
          2020794, 2497980, 3086299, 3811353, 4704588, 5804620, 7158856,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          52, 237, 448, 689, 963, 1273, 1623, 2017, 2460, 2958, 3515, 4080,
          4800, 5580, 6420, 7380, 8460, 9660, 10980, 12420, 13980, 15780, 17760,
          19920, 22260, 24900, 27780, 30960, 34500, 38340, 42540, 47220, 52320,
          57900, 64020, 70800, 78180, 86220, 93600, 104400, 115200, 126e3,
          136800, 151200, 165600, 183600, 201600, 219600, 241200, 266400,
        ],
        icon: "cdn/all/both/img/city/barracks_l.png",
      },
      blackMarket: {
        buildingId: 31,
        maxLevel: 25,
        wood: [
          321, 662, 1098, 1648, 2337, 3193, 4252, 5554, 7148, 9091, 11451,
          14309, 17759, 21916, 26910, 32900, 40068, 48632, 58847, 71013, 85483,
          102671, 123062, 147226, 175832, 209662, 249633, 296819, 352476,
          418074, 495332, 586257, 693197, 818894, 966549, 1139897, 1343300,
          1581844, 1861460, 2189065, 2572719, 3021814, 3547294, 4161902,
          4880477, 5720294, 6701457, 7847359, 9185217, 10746683,
        ],
        glass: 0,
        marble: [
          221, 462, 768, 1152, 1630, 2220, 2944, 3830, 4908, 6215, 7794, 9695,
          11979, 14715, 17985, 21886, 26531, 32053, 38605, 46369, 55556, 66415,
          79233, 94348, 112152, 133104, 157738, 186675, 220640, 260476, 307164,
          361845, 425844, 500704, 588216, 690459, 809849, 949192, 1111739,
          1301268, 1522157, 1779483, 2079132, 2427927, 2833773, 3305825,
          3854691, 4492652, 5233925, 6094966,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          347, 742, 1190, 1696, 2265, 2906, 3623, 4380, 5280, 6300, 7380, 8640,
          10020, 11520, 13200, 15060, 17100, 19320, 21840, 24540, 27540, 30840,
          34500, 38460, 42780, 47580, 52800, 58560, 64836, 71640, 79140, 87300,
          93600, 104400, 115200, 126e3, 140400, 151200, 169200, 183600, 201600,
          219600, 241200, 266400, 288e3, 316800, 347820, 378e3, 414e3, 45e4,
        ],
        icon: "cdn/all/both/img/city/blackmarket_l.png",
      },
      branchOffice: {
        buildingId: 13,
        maxLevel: 0,
        wood: [
          63, 152, 278, 449, 681, 991, 1403, 1944, 2653, 3574, 4768, 6307, 8286,
          10820, 14058, 18184, 23428, 30081, 38503, 49147, 62576, 79494, 100778,
          127518, 161074, 203133, 255797, 321672, 403995, 506784, 635019,
          794874, 993998, 1241864, 1550195, 1933500, 2409721, 3001041, 3734876,
          4645098, 5773538, 7171843, 8903756, 11047926, 13701367, 16983708,
          21042427, 26059285, 32258238, 39915158,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 0, 494, 674, 913, 1227, 1639, 2175, 2870, 3767, 4920, 6399,
          8290, 10700, 13766, 17658, 22589, 28824, 36697, 46621, 59115, 74823,
          94547, 119286, 150284, 189083, 237602, 298223, 373902, 468304, 585975,
          732545, 914991, 1141950, 1424111, 1774699, 2210071, 2750444, 3420809,
          4252036, 5282253, 6558537, 8138994, 10095321, 12515969, 15510020,
          19211966, 23787590,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          1287, 1842, 2485, 3228, 4080, 5040, 6120, 7440, 8880, 10500, 12360,
          14460, 16800, 19500, 22500, 25860, 29580, 33780, 38520, 43800, 49680,
          56220, 63540, 71640, 80700, 9e4, 100800, 111600, 126e3, 140400,
          158400, 176400, 198e3, 219600, 244800, 273600, 306e3, 338400, 378e3,
          417600, 464400, 514800, 572400, 633600, 702e3, 778860, 860400, 952320,
          1051200, 1159200,
        ],
        icon: "cdn/all/both/img/city/branchoffice_l.png",
      },
      carpentering: {
        buildingId: 23,
        maxLevel: 50,
        wood: [
          55, 87, 127, 178, 242, 320, 416, 533, 676, 848, 1056, 1307, 1608,
          1968, 2398, 2911, 3521, 4245, 5104, 6122, 7325, 8745, 10421, 12395,
          14719, 17452, 20663, 24432, 28853, 34034, 40101, 47203, 55508, 65216,
          76556, 89795, 105244, 123262, 144265, 168737, 197238, 230416, 269023,
          313930, 366145, 426835, 497350, 579253, 674351, 784736,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 0, 0, 0, 0, 330, 392, 470, 566, 686, 833, 1015, 1238, 1512,
          1847, 2256, 2755, 3362, 4099, 4993, 6077, 7389, 8976, 10892, 13203,
          15990, 19346, 23385, 28241, 34077, 41084, 49492, 59576, 71660, 86136,
          103465, 124200, 148998, 178640, 214058, 256358, 306856, 367117, 439e3,
          524716, 626889, 748636, 893662,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          619, 789, 974, 1175, 1391, 1626, 1879, 2152, 2447, 2764, 3105, 3471,
          3840, 4260, 4680, 5220, 5700, 6240, 6840, 7500, 8160, 8880, 9660,
          10500, 11340, 12300, 13320, 14340, 15480, 16680, 17940, 19320, 20760,
          22260, 23940, 25620, 27480, 29400, 31500, 33660, 36024, 38460, 41040,
          43800, 46740, 49860, 53160, 56580, 60300, 64200,
        ],
        icon: "cdn/all/both/img/city/carpentering_l.png",
      },
      dump: {
        buildingId: 29,
        maxLevel: 0,
        wood: [
          479, 663, 907, 1229, 1648, 2187, 2877, 3754, 4863, 6259, 8008, 10193,
          12913, 16289, 20468, 25630, 31991, 39816, 49424, 61201, 75615, 93232,
          114736, 140951, 172875, 211707, 258897, 316188, 385682, 469907,
          571907, 695339, 844601, 1024978, 1242818, 1505740, 1822893, 2205251,
          2665978, 3220858, 3888809, 4692504, 5659103, 6821133, 8217540,
          9894942, 11909126, 14326838, 17227911, 20707815,
        ],
        glass: [
          600, 733, 904, 1122, 1397, 1742, 2172, 2704, 3360, 4166, 5152, 6354,
          7816, 9587, 11731, 14318, 17435, 21182, 25681, 31074, 37528, 45244,
          54456, 65440, 78526, 94098, 112611, 134603, 160703, 191656, 228336,
          271771, 323172, 383960, 455804, 540669, 640857, 759072, 898489,
          1062830, 1256461, 1484503, 1752955, 2068850, 2440427, 2877336,
          3390878, 3994283, 4703037, 5535264,
        ],
        marble: [
          409, 563, 762, 1017, 1343, 1754, 2270, 2914, 3713, 4700, 5916, 7408,
          9233, 11459, 14170, 17461, 21450, 26276, 32105, 39133, 47594, 57769,
          69989, 84646, 102209, 123231, 148370, 178405, 214259, 257025, 307997,
          368704, 440958, 526899, 629056, 750417, 894513, 1065510, 1268327,
          1508768, 1793680, 2131136, 2530654, 3003454, 3562756, 4224135,
          5005933, 5929750, 7021015, 8309654,
        ],
        sulfur: [
          288, 411, 576, 794, 1078, 1447, 1922, 2528, 3298, 4273, 5499, 7038,
          8963, 11363, 14347, 18050, 22633, 28296, 35279, 43877, 54445, 67419,
          83322, 102795, 126608, 155700, 191204, 234493, 287226, 351409, 429467,
          524328, 639526, 779327, 948878, 1154383, 1403320, 1704704, 2069389,
          2510448, 3043618, 3687837, 4465889, 5405177, 6538649, 7905916,
          9554576, 11541820, 13936347, 16820655,
        ],
        wine: 0,
        time: [
          582, 761, 991, 1283, 1651, 2110, 2679, 3382, 4200, 5280, 6540, 8100,
          10020, 12300, 15060, 18420, 22380, 27180, 32880, 39780, 47940, 57660,
          69240, 82980, 97200, 115200, 140400, 165600, 198e3, 237600, 280800,
          334800, 399600, 471600, 558e3, 662400, 781200, 925200, 1090800,
          1288800, 1519200, 1789200, 2106e3, 2480400, 2851200, 3369600, 3974400,
          4665600, 5529600, 648e4,
        ],
        icon: "cdn/all/both/img/city/dump_l.png",
        capacity: [
          32e3, 65401, 101073, 139584, 181437, 227118, 277128, 331990, 392267,
          458564, 531535, 611896, 700427, 797982, 905498, 1024e3, 1154614,
          1298577, 1457248, 1632119, 1824830, 2037184, 2271165, 2528951,
          2812938, 3125764, 3470326, 3849813, 4267731, 4727938, 5234678,
          5792618, 6406895, 7083160, 7827629, 8647142, 9549229, 10542171,
          11635085, 12838002, 14161964, 15619121, 17222851, 18987875, 20930400,
          23068268, 25421121, 28010582, 30860462, 33996976,
        ],
      },
      embassy: {
        buildingId: 12,
        maxLevel: 0,
        wood: [
          181, 223, 280, 355, 454, 582, 746, 957, 1225, 1565, 1994, 2532, 3207,
          4050, 5099, 6404, 8021, 10022, 12493, 15541, 19293, 23906, 29570,
          36516, 45023, 55431, 68153, 83688, 102641, 125745, 153886, 188136,
          229792, 280422, 341918, 416566, 507128, 616935, 750005, 911185,
          1106319, 1342449, 1628062, 1973380, 2390712, 2894879, 3503717,
          4238691, 5125621, 6195562,
        ],
        glass: 0,
        marble: [
          117, 167, 237, 330, 456, 622, 839, 1122, 1488, 1959, 2563, 3333, 4314,
          5557, 7130, 9114, 11611, 14747, 18679, 23600, 29748, 37418, 46974,
          58864, 73642, 91987, 114737, 142923, 177811, 220956, 274271, 340100,
          421322, 521466, 644861, 796808, 983803, 1213799, 1496532, 1843913,
          2270514, 2794154, 3436613, 4224511, 5190369, 6373908, 7823631,
          9598744, 11771507, 14430087,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          3196, 3626, 4080, 4560, 5100, 5700, 6360, 7020, 7740, 8580, 9420,
          10320, 11340, 12360, 13500, 14700, 15960, 17340, 18840, 20400, 22080,
          23880, 25800, 27840, 3e4, 32280, 34740, 37380, 40140, 43080, 46200,
          49560, 53100, 56880, 60840, 65040, 69540, 74280, 79320, 84660, 9e4,
          93600, 100800, 108e3, 115200, 122400, 129600, 140400, 147600, 158400,
        ],
        icon: "cdn/all/both/img/city/embassy_l.png",
      },
      fireworker: {
        buildingId: 27,
        maxLevel: 50,
        wood: [
          247, 288, 338, 400, 475, 566, 676, 807, 964, 1151, 1372, 1635, 1944,
          2309, 2738, 3241, 3830, 4518, 5322, 6260, 7351, 8621, 10096, 11807,
          13792, 16091, 18752, 21829, 25384, 29490, 34227, 39690, 45985, 53236,
          61583, 71185, 82226, 94916, 109493, 126232, 145444, 167485, 192762,
          221738, 254944, 292983, 336543, 386409, 443476, 508765,
        ],
        glass: 0,
        marble: [
          114, 153, 201, 262, 336, 426, 537, 671, 832, 1026, 1258, 1536, 1866,
          2259, 2724, 3276, 3927, 4695, 5599, 6662, 7911, 9375, 11091, 13099,
          15446, 18188, 21388, 25119, 29465, 34526, 40412, 47256, 55208, 64440,
          75154, 87580, 101984, 118673, 137999, 160370, 186252, 216186, 250790,
          290778, 336969, 390308, 451879, 522927, 604886, 699401,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          894, 1034, 1187, 1354, 1537, 1736, 1954, 2190, 2446, 2725, 3027, 3354,
          3660, 4080, 4500, 4920, 5400, 5940, 6480, 7080, 7740, 8400, 9180,
          9960, 10836, 11700, 12720, 13740, 14880, 16080, 17400, 18780, 20280,
          21840, 23520, 25320, 27300, 29340, 31560, 33900, 36360, 39060, 41880,
          44940, 48180, 51600, 55260, 59160, 63360, 67740,
        ],
        icon: "cdn/all/both/img/city/fireworker_l.png",
      },
      forester: {
        buildingId: 18,
        maxLevel: 70,
        wood: [
          219, 277, 365, 493, 677, 938, 1303, 1811, 2511, 3471, 4780, 6556,
          8957, 12189, 16529, 22339, 30095, 40427, 54159, 72377, 96502, 128398,
          170502, 226005, 299076, 395156, 521350, 686920, 903934, 1188113,
          1559914, 2045951, 2680825, 3509497, 4590363, 5999234, 7834482,
          10223701, 13332318, 17374727, 22628674, 29453848, 38315888, 49817388,
          64737919, 84085687, 109164190, 141658199, 183744665, 238235716,
        ],
        glass: 0,
        marble: [
          0, 67, 114, 183, 282, 422, 619, 893, 1272, 1791, 2500, 3463, 4767,
          6524, 8886, 12052, 16285, 21929, 29440, 39415, 52642, 70149, 93286,
          123823, 164072, 217057, 286731, 378251, 498349, 655799, 862037,
          1131957, 1484943, 1946215, 2548570, 3334630, 4359771, 5695902,
          7436363, 9702264, 12650686, 16485294, 21470051, 27946958, 36358975,
          47279646, 61451363, 79834790, 103672678, 134572257,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          940, 1379, 1885, 2467, 3133, 3840, 4740, 5700, 6840, 8100, 9480,
          11100, 12900, 14940, 17160, 19680, 22500, 25680, 29220, 33120, 37500,
          42360, 47760, 53700, 60360, 67740, 75900, 84960, 93600, 104400,
          115200, 129600, 144e3, 162e3, 18e4, 198e3, 223200, 244800, 273600,
          302400, 334800, 370800, 410400, 453600, 500400, 550800, 608400,
          673200, 741600, 817200,
        ],
        icon: "cdn/all/both/img/city/forester_l.png",
      },
      glassblowing: {
        buildingId: 20,
        maxLevel: 70,
        wood: [
          231, 294, 388, 524, 721, 999, 1389, 1931, 2679, 3705, 5103, 7e3, 9565,
          13019, 17658, 23867, 32158, 43203, 57886, 77367, 103167, 137281,
          182319, 241696, 319874, 422683, 557728, 734931, 967219, 1271430,
          1669486, 2189901, 2869754, 3757232, 4914928, 6424109, 8390239,
          10950125, 14281162, 18613275, 24244366, 31560268, 41060521, 53391660,
          69390195, 90138092, 117034361, 151887423, 197034258, 255494043,
        ],
        glass: 0,
        marble: [
          0, 80, 128, 197, 296, 437, 635, 912, 1293, 1817, 2534, 3508, 4827,
          6607, 9001, 12213, 16509, 22243, 29881, 40032, 53501, 71344, 94944,
          126115, 167232, 221402, 292688, 386399, 509467, 670936, 882601,
          1159836, 1522669, 1997174, 2617284, 3427138, 4484121, 5862811,
          7660088, 10001754, 13051100, 17020006, 22183296, 28897318, 37623972,
          48961787, 63686093, 82800949, 107606250, 139784419,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          925, 1345, 1832, 2392, 3034, 3720, 4560, 5520, 6600, 7800, 9180,
          10740, 12480, 14460, 16680, 19140, 21900, 25020, 28440, 32280, 36600,
          41340, 46680, 52560, 59100, 66360, 74460, 83400, 9e4, 100800, 115200,
          129600, 144e3, 158400, 176400, 198e3, 219600, 244800, 27e4, 298800,
          331200, 367200, 406800, 45e4, 496800, 550800, 608400, 673200, 741600,
          817200,
        ],
        icon: "cdn/all/both/img/city/glassblowing_l.png",
      },
      museum: {
        buildingId: 10,
        maxLevel: 0,
        wood: [
          444, 772, 1359, 2369, 4063, 6851, 11371, 18614, 30109, 48209, 76519,
          120543, 188670, 293640, 454765, 701255, 1077201, 1649046, 2516748,
          3830457, 5815403, 8809004, 13316125, 20091332, 30261187, 45505976,
          68329529, 102459575, 153441407, 229517607, 342930972, 511853072,
          763237383, 1137038037, 1692444828, 2517093724, 3740666824, 5554964954,
          8243521216, 12225273190, 18118943395, 26837912520, 39729978483,
          58783167344, 86928713578, 128486945063, 189823275214, 280313022883,
          413760045065, 610482062587,
        ],
        glass: 0,
        marble: [
          218, 521, 1073, 2042, 3701, 6480, 11069, 18553, 30642, 50009, 80827,
          129580, 206321, 326588, 514343, 806460, 1259563, 1960450, 3041951,
          4707016, 7265293, 11188591, 17194910, 26375637, 40387927, 61745438,
          94257374, 143691046, 218771029, 332685003, 505351822, 766835664,
          1162482579, 1760644292, 2664286633, 4028427942, 6086323349,
          9188763911, 13863034479, 20901328346, 31493284284, 47424590290,
          71374479368, 107361204408, 161408875854, 242545338021, 364294956277,
          546911100944, 820713886868, 1231078954391,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          4980, 6420, 8100, 9960, 12120, 14520, 17280, 20400, 23880, 27840,
          32280, 37260, 42840, 49080, 56040, 63840, 72480, 82080, 9e4, 104400,
          115200, 129600, 147600, 165600, 183600, 205200, 230400, 255600, 288e3,
          320400, 352800, 392400, 435600, 486e3, 536400, 594e3, 658800, 727200,
          802800, 885600, 979200, 108e4, 1188e3, 1310400, 1443600, 1587600,
          1746e3, 1918800, 2109600, 2318400,
        ],
        icon: "cdn/all/both/img/city/museum_r.png",
        basicBonus: [
          0, 20, 41, 63, 88, 114, 144, 176, 211, 250, 294, 341, 395, 453, 518,
          590, 670, 759, 857, 965, 1086, 1219, 1367, 1530, 1711, 1912, 2134,
          2380, 2652, 2953, 3286, 3655, 4064, 4516, 5016, 5569, 6182, 6859,
          7609, 8439, 9357, 10372, 11496, 12739, 14115, 15637, 17321, 19184,
          21245, 23526, 26050,
        ],
      },
      optician: {
        buildingId: 25,
        maxLevel: 50,
        wood: [
          88, 121, 162, 214, 278, 356, 451, 567, 707, 875, 1077, 1318, 1606,
          1949, 2355, 2838, 3408, 4082, 4877, 5813, 6914, 8206, 9723, 11500,
          13581, 16014, 18858, 22178, 26052, 30568, 35829, 41953, 49077, 57361,
          66987, 78167, 91143, 106198, 123655, 143890, 167332, 194479, 225904,
          262267, 304327, 352960, 409173, 474124, 549150, 635784,
        ],
        glass: 0,
        marble: [
          0, 21, 52, 91, 138, 196, 267, 353, 457, 583, 734, 914, 1129, 1386,
          1691, 2053, 2481, 2987, 3585, 4289, 5117, 6091, 7234, 8575, 10146,
          11985, 14136, 16648, 19582, 23004, 26994, 31642, 37053, 43350, 50671,
          59181, 69065, 80541, 93858, 109304, 127212, 147965, 172006, 199844,
          232066, 269351, 312478, 362345, 419987, 486596,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          660, 782, 917, 1066, 1230, 1409, 1606, 1821, 2056, 2312, 2591, 2895,
          3226, 3585, 3960, 4380, 4800, 5340, 5880, 6420, 7080, 7740, 8460,
          9240, 10080, 11040, 12e3, 13080, 14220, 15420, 16740, 18120, 19680,
          21300, 23040, 24900, 26940, 29100, 31380, 33900, 36540, 39360, 42420,
          45660, 49140, 52860, 56820, 61080, 65640, 70500,
        ],
        icon: "cdn/all/both/img/city/optician_l.png",
      },
      palace: {
        buildingId: 11,
        maxLevel: 20,
        wood: [
          621, 5067, 14922, 35635, 77682, 160954, 322861, 633202, 1221325,
          2325576, 4382951, 8191214, 15201180, 28042396, 51466444, 94036143,
          171144741, 310402929, 561235268, 1011950004, 1820060719, 3266078968,
          5848832679, 10454179023, 18653314480, 33229717869, 59109102787,
          104999185097, 186278695277, 330083439180,
        ],
        glass: [
          0, 0, 0, 0, 20036, 36913, 73059, 149309, 308230, 636230, 1307742,
          2673192, 5433606, 10986180, 22106452, 44291771, 88401538, 175835827,
          348674710, 689497719, 1360066463, 2676717428, 5257111646, 10305531195,
          20166895886, 39401464922, 76867506345, 149753535406, 291378218702,
          566265859641,
        ],
        marble: [
          0, 1221, 2743, 6330, 14455, 32372, 71101, 153545, 326934, 688032,
          1433963, 2964360, 6085968, 12421274, 25222524, 50989413, 102677063,
          206045134, 412201170, 822340320, 1636465888, 3249200175, 6437952588,
          12732020922, 25135775043, 49544082920, 97509826873, 191650002247,
          376196691518, 737571972670,
        ],
        sulfur: [
          0, 0, 2993, 7524, 17728, 40101, 88188, 189978, 402866, 843766,
          1749519, 3597583, 7346434, 14912996, 30118390, 60556963, 121282082,
          242060454, 481624481, 955627336, 1891391698, 3734981712, 7360329382,
          14477189882, 28426058968, 55725452915, 109080630148, 213228631864,
          416283408562, 811738180663,
        ],
        wine: [
          0, 0, 0, 9760, 18090, 36260, 75121, 156978, 327341, 678453, 1396259,
          2853769, 5796117, 11706278, 23525973, 47073381, 93825300, 186366298,
          369042504, 728757004, 1435499430, 2821226214, 5533180363, 10831537959,
          21166587854, 41296779750, 80452328037, 156518221314, 304114337859,
          590190453919,
        ],
        time: [
          14100, 18300, 24840, 34920, 49980, 72300, 104400, 151200, 219600,
          313200, 45e4, 644400, 914400, 1292400, 1818e3, 2552400, 3542400,
          4924800, 6825600, 9504e3, 13219200, 18230400, 25056e3, 34128e3,
          47088e3, 648e5, 864e5, 120528e3, 162864e3, 223344e3,
        ],
        icon: "cdn/all/both/img/city/palace_l.png",
      },
      palaceColony: {
        buildingId: 17,
        maxLevel: 0,
        wood: [
          499, 4690, 14021, 33715, 73851, 153645, 309381, 609013, 1178962,
          2253058, 4261638, 7993260, 14887354, 27562545, 50768236, 93094987,
          170042922, 309516851, 561651487, 1016352781, 1834572005, 3303992302,
          5938065770, 10651951957, 19074744886, 34103020026, 60881313460,
          108537305227, 193250111725, 343671692725,
        ],
        glass: [
          0, 0, 0, 0, 20945, 36764, 70834, 143096, 294523, 608746, 1255520,
          2577735, 5265079, 10699616, 21641681, 43588048, 87455521, 174873076,
          348599453, 692996404, 1374202620, 2718854424, 5368136633, 10578881383,
          20811407901, 40875947402, 80166204326, 157006880024, 307108442987,
          599995681652,
        ],
        marble: [
          0, 1229, 3015, 7176, 16497, 36829, 80305, 171871, 362413, 755058,
          1557658, 3187111, 6476102, 13081615, 26290071, 52600478, 104830791,
          208201173, 412225873, 813921918, 1603035750, 3150052490, 6177235498,
          12090625934, 23623746667, 46084336912, 89766643617, 174614571646,
          339227989378, 658242870743,
        ],
        sulfur: [
          0, 0, 3038, 7361, 17131, 38626, 84983, 183447, 390071, 819434,
          1704434, 3516178, 7203584, 14670852, 29726494, 59965169, 120491215,
          241271883, 481632442, 958782590, 1903870896, 3771976337, 7457653556,
          14716810759, 28991492282, 57020629713, 111982594552, 219620508765,
          430170833117, 841574016486,
        ],
        wine: [
          0, 0, 0, 10619, 18478, 35701, 72704, 151003, 314696, 653580, 1349488,
          2768846, 5646946, 11453781, 23118434, 46460108, 93009045, 185556479,
          369054235, 731985298, 1448200944, 2858709877, 5631362181, 11072234267,
          21732141463, 42586740231, 83330382225, 162830670767, 317771361940,
          619407688860,
        ],
        time: [
          14820, 19500, 26700, 37680, 54040, 77940, 111600, 162e3, 230400,
          331200, 471600, 669600, 943200, 1324800, 1854e3, 2581200, 3542400,
          4924800, 6825600, 9331200, 12873600, 17625600, 24105600, 32918400,
          44496e3, 60048e3, 81216e3, 11016e4, 152064e3, 204768e3,
        ],
        icon: "cdn/all/both/img/city/palaceColony_l.png",
      },
      pirateFortress: {
        buildingId: 30,
        maxLevel: 0,
        wood: [
          474, 1072, 1816, 2736, 3864, 5239, 6906, 8916, 11333, 14226, 17679,
          21789, 26667, 32445, 39273, 47327, 56810, 67956, 81039, 96373, 114322,
          135306, 159811, 188397, 221711, 260498, 305618, 358061, 418968,
          489652, 571626, 666630, 776663, 904027, 1051368, 1221724, 1418588,
          1645970, 1908477, 2211395, 2560791, 2963626, 3427887, 3962732,
          4578661, 5287711, 6103679, 7042372, 8121902, 9363013,
        ],
        glass: 0,
        marble: [
          237, 579, 1016, 1569, 2262, 3126, 4194, 5508, 7119, 9085, 11475,
          14372, 17874, 22097, 27175, 33271, 40573, 49306, 59731, 72160, 86956,
          104547, 125435, 150211, 179568, 214317, 255412, 303968, 361292,
          428915, 508629, 602529, 713066, 843106, 995998, 1175655, 1386646,
          1634307, 1924867, 2265593, 2664965, 3132871, 3680843, 4322320,
          5072968, 5951038, 6977792, 8177991, 9580466, 11218783,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          30, 347, 749, 1254, 1885, 2667, 3629, 4800, 6240, 7980, 10080, 12660,
          15720, 19380, 23820, 29100, 35400, 42900, 51840, 62460, 75e3, 89880,
          104400, 126e3, 151200, 18e4, 212400, 255600, 302400, 356400, 421200,
          500400, 586800, 694800, 817200, 961200, 1130400, 1324800, 1558560,
          1825200, 2142e3, 2508960, 2851200, 3369600, 3974400, 4665600, 5443200,
          6393600, 7430400, 864e4,
        ],
        icon: "cdn/all/both/img/city/pirateFortress_l.png",
      },
      port: {
        buildingId: 3,
        maxLevel: 0,
        wood: [
          38, 90, 161, 256, 381, 544, 755, 1027, 1375, 1818, 2380, 3089, 3982,
          5102, 6505, 8255, 10436, 13147, 16511, 20678, 25833, 32199, 40052,
          49725, 61627, 76256, 94217, 116250, 143252, 176316, 216770, 266228,
          326652, 400422, 490428, 600173, 733911, 896794, 1095068, 1336300,
          1629653, 1986223, 2419438, 2945548, 3584209, 4359192, 5299237,
          6439084, 7820712, 9494838,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 0, 0, 231, 332, 468, 649, 889, 1205, 1621, 2164, 2872, 3793,
          4986, 6530, 8521, 11085, 14381, 18611, 24029, 30961, 39817, 51118,
          65520, 83856, 107177, 136808, 174423, 222134, 282600, 359176, 456081,
          578629, 733508, 929124, 1176049, 1487566, 1880361, 2375390, 2998956,
          3784068, 4772137, 6015095, 7578051, 9542612, 12011033, 15111408,
          19004156,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          114, 258, 438, 660, 934, 1268, 1673, 2162, 2751, 3457, 4260, 5280,
          6480, 7920, 9540, 11520, 13860, 16620, 19860, 23640, 28080, 33300,
          39360, 46440, 54720, 64380, 75648, 88680, 100800, 118800, 140400,
          165600, 190800, 223200, 262440, 302400, 352800, 410400, 475200,
          554400, 640800, 745200, 860400, 997200, 1152e3, 1335600, 1540800,
          1782e3, 2055600, 2372400,
        ],
        loadingSpeed: [
          10, 30, 60, 96, 132, 168, 216, 264, 312, 372, 438, 510, 588, 672, 768,
          870, 984, 1110, 1248, 1398, 1566, 1746, 1950, 2172, 2418, 2682, 2982,
          3306, 3660, 4056, 4488, 4962, 5490, 6066, 6696, 7392, 8160, 9006,
          9930, 10950, 12072, 13308, 14664, 16158, 17802, 19608, 21600, 23784,
          26190, 28836, 31746,
        ],
        icon: "cdn/all/both/img/city/port_l.png",
      },
      safehouse: {
        buildingId: 16,
        maxLevel: 0,
        wood: [
          79, 148, 232, 334, 457, 605, 781, 990, 1238, 1530, 1874, 2278, 2750,
          3302, 3946, 4696, 5567, 6577, 7748, 9103, 10668, 12476, 14560, 16961,
          19724, 22901, 26552, 30742, 35549, 41060, 47373, 54600, 62869, 72324,
          83129, 95472, 109563, 125643, 143983, 164892, 188720, 215863, 246772,
          281953, 321984, 367518, 419294, 478147, 545025, 620998,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 87, 123, 168, 224, 291, 372, 470, 589, 730, 900, 1103, 1344,
          1630, 1970, 2373, 2848, 3410, 4073, 4853, 5770, 6848, 8113, 9597,
          11335, 13369, 15749, 18530, 21777, 25567, 29988, 35140, 41142, 48130,
          56261, 65718, 76711, 89485, 104320, 121542, 141527, 164709, 191589,
          222746, 258848, 300664, 349084, 405133,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          1360, 1897, 2475, 3097, 3720, 4440, 5220, 6060, 6900, 7860, 8880,
          9900, 11040, 12300, 13560, 14940, 16380, 17940, 19620, 21360, 23220,
          25230, 27300, 29520, 31860, 34380, 37020, 39780, 42720, 45900, 49200,
          52680, 56340, 60240, 64380, 68700, 73320, 78180, 83280, 88680, 93600,
          97200, 104400, 111600, 118800, 126e3, 133200, 140400, 151200, 158400,
        ],
        icon: "cdn/all/both/img/city/safehouse_l.png",
      },
      shipyard: {
        buildingId: 5,
        maxLevel: 0,
        wood: [
          84, 128, 190, 276, 394, 552, 764, 1046, 1418, 1906, 2542, 3371, 4444,
          5830, 7615, 9907, 12845, 16600, 21392, 27495, 35256, 45108, 57600,
          73416, 93417, 118680, 150556, 190735, 241333, 304994, 385024, 485552,
          611733, 77e4, 968379, 1216878, 1527967, 1917188, 2403892, 3012175,
          3772023, 4720743, 5904734, 7381687, 9223306, 11518694, 14378537,
          17940294, 22374635, 27893402,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 0, 0, 725, 918, 1175, 1513, 1957, 2535, 3287, 4260, 5515,
          7130, 9202, 11854, 15241, 19559, 25054, 32035, 40889, 52103, 66288,
          84210, 106825, 135333, 171234, 216402, 273177, 344483, 433969, 546185,
          686805, 862899, 1083277, 1358905, 1703436, 2133857, 2671296, 3342022,
          4178689, 5221868, 6521957, 8141538, 10158304, 12668676, 15792287,
          19677534, 24508442,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          2300, 2775, 3277, 3780, 4320, 4920, 5580, 6240, 6900, 7680, 8400,
          9240, 10080, 10980, 11940, 12960, 13980, 15060, 16200, 17460, 18720,
          20040, 21420, 22860, 24420, 26040, 27660, 29460, 31260, 33180, 35220,
          37320, 39480, 41820, 44160, 46680, 49320, 52020, 54900, 57840, 60960,
          64200, 67560, 71100, 74820, 78600, 82620, 86820, 9e4, 93600,
        ],
        icon: "cdn/all/both/img/city/shipyard_l.png",
      },
      stonemason: {
        buildingId: 19,
        maxLevel: 70,
        wood: [
          229, 288, 376, 505, 690, 954, 1323, 1837, 2547, 3522, 4853, 6661,
          9108, 12408, 16844, 22789, 30737, 41337, 55445, 74184, 99031, 131922,
          175395, 232776, 308412, 407991, 538944, 710973, 936736, 1232739,
          1620495, 2128021, 2791789, 3659254, 4792128, 6270626, 8198965,
          10712494, 13986913, 18250212, 23798127, 31014120, 40395228, 52585482,
          68419105, 88976328, 115655515, 150266307, 195149923, 253334457,
        ],
        glass: 0,
        marble: [
          0, 83, 133, 206, 311, 460, 669, 959, 1360, 1909, 2660, 3679, 5057,
          6916, 9413, 12759, 17229, 23190, 31120, 41649, 55604, 74071, 98470,
          130662, 173079, 228903, 302288, 398654, 525073, 690763, 907730,
          1191607, 1562737, 2047577, 2680522, 3506260, 4582831, 5985583,
          7812290, 10189778, 13282495, 17303591, 22529243, 29317171, 38130559,
          49568956, 64408192, 83651900, 108598039, 140924741,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          1061, 1465, 1932, 2472, 3091, 3780, 4560, 5520, 6540, 7740, 9060,
          10560, 12240, 14160, 16320, 18720, 21420, 24420, 27840, 31560, 35760,
          40440, 45660, 51420, 57900, 65040, 72960, 81780, 9e4, 100800, 111600,
          126e3, 140400, 158400, 176280, 194400, 216e3, 241200, 266400, 295200,
          327600, 363600, 403200, 446400, 493200, 547200, 605940, 666e3, 738e3,
          813600,
        ],
        icon: "cdn/all/both/img/city/stonemason_l.png",
      },
      temple: {
        buildingId: 28,
        maxLevel: 0,
        wood: [
          141, 181, 232, 296, 376, 476, 598, 749, 932, 1156, 1428, 1756, 2151,
          2627, 3197, 3880, 4697, 5671, 6831, 8210, 9848, 11791, 14093, 16816,
          20035, 23837, 28322, 33609, 39835, 47164, 55782, 65910, 77805, 91766,
          108143, 127341, 149835, 176178, 207012, 243086, 285271, 334582,
          392197, 459487, 538049, 629735, 736699, 861445, 1006880, 1176382,
        ],
        glass: [
          137, 173, 223, 289, 377, 492, 641, 834, 1082, 1399, 1802, 2312, 2957,
          3768, 4787, 6063, 7658, 9647, 12123, 15200, 19018, 23748, 29600,
          36831, 45756, 56760, 70312, 86987, 107486, 132664, 163563, 201456,
          247891, 304756, 374346, 459458, 563491, 690581, 845755, 1035121,
          1266100, 1547705, 1890876, 2308896, 2817877, 3437366, 4191069,
          5107727, 6222178, 7576637,
        ],
        marble: 0,
        sulfur: 0,
        wine: 0,
        time: [
          2205, 2378, 2575, 2801, 3056, 3346, 3660, 4020, 4440, 4920, 5400, 6e3,
          6660, 7380, 8160, 9060, 10080, 11160, 12420, 13800, 15300, 16920,
          18780, 20820, 23040, 25500, 28260, 31200, 34500, 38160, 42120, 46500,
          51300, 56580, 62340, 68640, 75640, 83220, 9e4, 97200, 108e3, 118800,
          133200, 144e3, 158400, 176400, 190800, 208800, 230400, 252e3,
        ],
        icon: "cdn/all/both/img/city/temple_l.png",
      },
      tavern: {
        buildingId: 9,
        maxLevel: 0,
        wood: [
          65, 111, 172, 252, 357, 491, 662, 879, 1153, 1497, 1928, 2465, 3132,
          3958, 4979, 6237, 7786, 9687, 12017, 14868, 18352, 22602, 27780,
          34082, 41743, 51045, 62329, 76006, 92566, 112602, 136824, 166085,
          201408, 244021, 295396, 357296, 431835, 521545, 629456, 759196,
          915107, 1102381, 1327229, 1597075, 1920794, 2308989, 2774329, 3331942,
          3999895, 4799754,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 49, 56, 66, 79, 98, 125, 162, 214, 285, 381, 514, 693, 937,
          1266, 1710, 2308, 3112, 4189, 5631, 7559, 10133, 13563, 18130, 24204,
          32273, 42981, 57179, 75985, 100877, 133795, 177298, 234745, 310556,
          410539, 542317, 715903, 944433, 1245140, 1640619, 2160487, 2843554,
          3740651, 4918343, 6463762, 8490934, 11149032, 14633158,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          883, 1340, 1838, 2381, 2971, 3611, 4260, 5040, 5820, 6720, 7680, 8700,
          9780, 10980, 12240, 13620, 15060, 16680, 18360, 20160, 22080, 24180,
          26400, 28815, 31320, 34020, 36960, 40080, 43380, 46920, 50640, 54660,
          58920, 63480, 68340, 73500, 79020, 84840, 9e4, 97200, 104400, 111600,
          118800, 126e3, 136800, 144e3, 154800, 165600, 176400, 190800,
        ],
        icon: "cdn/all/both/img/city/taverne_r.png",
        wineUse: [
          0, 4, 8, 13, 18, 24, 30, 36, 43, 51, 59, 68, 78, 88, 99, 111, 123,
          136, 150, 165, 181, 198, 216, 235, 255, 277, 300, 324, 350, 378, 407,
          439, 472, 507, 544, 584, 625, 670, 717, 766, 819, 875, 933, 995, 1061,
          1130, 1202, 1279, 1360, 1445, 1534,
        ],
        wineUse2: [
          0, 12, 24, 36, 48, 61, 73, 86, 99, 112, 125, 138, 152, 165, 179, 193,
          207, 222, 236, 251, 266, 282, 297, 313, 329, 345, 361, 378, 395, 410,
          430, 448, 466, 484, 502, 521, 540, 560, 580, 600, 620, 641, 662, 683,
          705, 727, 749, 772, 795, 819.5, 843, 867, 891, 916, 942, 968, 994,
          1021, 1048, 1075, 1103, 1131, 1160, 1189, 1219, 1249, 1280, 1311,
          1343, 1375, 1408,
        ],
        basicBonus: [
          0, 12, 24, 36, 48, 61, 73, 86, 99, 112, 125, 138, 152, 165, 179, 193,
          207, 222, 236, 251, 266, 282, 297, 313, 329, 345, 361, 378, 395, 412,
          430, 448, 466, 484, 502, 521, 540, 560, 580, 600, 620, 641, 662, 683,
          705, 727, 749, 772, 795, 819, 843,
        ],
        wineBonus: [
          0, 60, 120, 181, 242, 304, 367, 430, 494, 559, 624, 691, 758, 826,
          896, 966, 1037, 1109, 1182, 1256, 1332, 1408, 1485, 1564, 1644, 1725,
          1807, 1891, 1975, 2061, 2149, 2238, 2328, 2419, 2512, 2606, 2702,
          2800, 2898, 2999, 3101, 3204, 3310, 3416, 3525, 3635, 3747, 3861,
          3976, 4094, 4213,
        ],
      },
      townHall: {
        buildingId: 0,
        maxLevel: 0,
        wood: [
          0, 118, 248, 422, 652, 952, 1343, 1846, 2492, 3316, 4363, 5688, 7360,
          9462, 12098, 15397, 19515, 24645, 31024, 38943, 48759, 60906, 75920,
          94453, 117304, 145447, 180072, 222631, 274895, 339023, 417643, 513958,
          631864, 776102, 952440, 1167886, 1430960, 1752011, 2143604, 2620995,
          3202699, 3911176, 4773667, 5823201, 7099813, 8652017, 10538589,
          12830714, 15614591, 18994567,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 0, 267, 444, 689, 1022, 1475, 2085, 2903, 3996, 5450, 7376,
          9922, 13276, 17685, 23466, 31032, 40915, 53802, 70577, 92384, 120692,
          157392, 204915, 266384, 345810, 448337, 580562, 750942, 970304,
          1252515, 1615313, 2081388, 2679747, 3447452, 4431846, 5693374,
          7309181, 9377690, 12024426, 15409422, 19736642, 25265952, 32328344,
          41345276, 52853241, 67534979, 86259109,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          268, 457, 697, 998, 1371, 1831, 2396, 3086, 3900, 4920, 6120, 7620,
          9360, 11460, 13980, 16980, 20580, 24840, 29880, 35820, 42840, 51120,
          60960, 72480, 86040, 100800, 118800, 140400, 165600, 198e3, 230400,
          273600, 320400, 378e3, 442800, 522e3, 612e3, 716400, 838800, 979200,
          1144800, 1335600, 1562400, 1821600, 2124e3, 2473200, 2851200, 3283200,
          3888e3, 4492800,
        ],
        icon: "cdn/all/both/img/city/townhall_l.png",
        actionPointsMax: [
          0, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8,
          9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 13, 13, 13,
          13, 14, 14, 14, 14, 15, 15, 15, 15, 16, 16, 16, 16, 17, 17, 17, 17,
          18, 18, 18, 18, 19, 19, 19, 19,
        ],
      },
      vineyard: {
        buildingId: 26,
        maxLevel: 50,
        wood: [
          286, 327, 378, 440, 515, 607, 718, 851, 1010, 1200, 1425, 1692, 2007,
          2379, 2817, 3331, 3933, 4639, 5463, 6426, 7548, 8854, 10374, 12139,
          14189, 16565, 19319, 22506, 26194, 30456, 35380, 41065, 47623, 55184,
          63896, 73931, 85482, 98772, 114056, 131624, 151809, 174992, 201607,
          232150, 267188, 307368, 353430, 406216, 466690, 535948,
        ],
        glass: 0,
        marble: [
          108, 142, 186, 240, 307, 389, 489, 611, 759, 936, 1149, 1404, 1709,
          2072, 2503, 3015, 3621, 4337, 5183, 6179, 7352, 8730, 10349, 12248,
          14473, 17077, 20123, 23682, 27838, 32686, 38340, 44927, 52596, 61520,
          71899, 83963, 97978, 114250, 133135, 155042, 180443, 209883, 243990,
          283489, 329213, 382126, 443336, 514120, 595948, 690515,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          1102, 1210, 1330, 1463, 1610, 1773, 1952, 2148, 2364, 2601, 2860,
          3143, 3453, 3780, 4140, 4500, 4980, 5460, 5940, 6540, 7140, 7800,
          8460, 9240, 10080, 10980, 12e3, 13020, 14160, 15360, 16740, 18120,
          19680, 21360, 23100, 25020, 27120, 29340, 31740, 34320, 37080, 40080,
          43260, 46680, 50417, 54360, 58620, 63180, 68040, 73320,
        ],
        icon: "cdn/all/both/img/city/vineyard_l.png",
      },
      wall: {
        buildingId: 8,
        maxLevel: 0,
        wood: [
          108, 224, 376, 575, 830, 1155, 1568, 2088, 2739, 3552, 4562, 5812,
          7355, 9255, 11588, 14446, 17939, 22201, 27393, 33706, 41372, 50667,
          61924, 75539, 91989, 111843, 135783, 164621, 199330, 241072, 291232,
          351464, 423739, 510409, 614275, 738675, 887583, 1065731, 1278750,
          1533339, 1837468, 2200609, 2634024, 3151098, 3767730, 4502806,
          5378751, 6422188, 7664717, 9143835,
        ],
        glass: 0,
        marble: [
          0, 213, 374, 583, 852, 1195, 1631, 2179, 2866, 3724, 4790, 6110, 7739,
          9745, 12208, 15225, 18914, 23416, 28900, 35569, 43668, 53488, 65383,
          79771, 97157, 118142, 143447, 173934, 210631, 254767, 307809, 371507,
          447949, 539624, 649499, 781107, 938658, 1127163, 1352588, 1622028,
          1943927, 2328322, 2787146, 3334583, 3987485, 4765867, 5693503,
          6798617, 8114710, 9681542,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          70, 534, 1062, 1662, 2340, 3104, 3960, 4920, 6e3, 7222, 8520, 10020,
          11700, 13560, 15660, 17940, 20460, 23280, 26340, 29760, 33540, 37680,
          42300, 47340, 52860, 58920, 65640, 72960, 81e3, 89820, 97200, 108e3,
          118800, 133200, 147600, 162e3, 176400, 198e3, 216e3, 237600, 262800,
          288e3, 313200, 347340, 378e3, 414e3, 453600, 496800, 543600, 594e3,
        ],
        icon: "cdn/all/both/img/city/wall.png",
      },
      warehouse: {
        buildingId: 7,
        maxLevel: 0,
        wood: [
          118, 153, 201, 263, 346, 452, 589, 764, 985, 1266, 1619, 2061, 2615,
          3304, 4161, 5224, 6539, 8163, 10165, 12628, 15655, 19369, 23920,
          29490, 36298, 44612, 54753, 67113, 82163, 100473, 122731, 149768,
          182589, 222401, 270664, 329136, 399936, 485615, 589244, 714523,
          865899, 1048725, 1269436, 1535772, 1857030, 2244386, 2711262, 3273779,
          3951291, 4767033,
        ],
        glass: 0,
        marble: [
          0, 0, 0, 86, 137, 204, 289, 397, 534, 707, 923, 1195, 1533, 1953,
          2474, 3118, 3913, 4892, 6095, 7573, 9384, 11600, 14308, 17614, 21645,
          26555, 32530, 39792, 48613, 59317, 72297, 88024, 107067, 130109,
          157972, 191644, 232313, 281405, 340635, 412059, 498147, 601861,
          726755, 877090, 1057976, 1275536, 1537106, 1851477, 2229174, 2682801,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          53, 221, 429, 683, 991, 1364, 1813, 2351, 2992, 3720, 4620, 5700,
          6960, 8460, 10200, 12240, 14580, 17400, 20640, 24420, 28840, 33900,
          39840, 46740, 54720, 63900, 74580, 86880, 100800, 115200, 133200,
          154800, 18e4, 208800, 244800, 280800, 324e3, 374400, 434880, 500400,
          576e3, 662400, 763200, 874800, 1004400, 1155600, 1324800, 1522800,
          1746e3, 2001600,
        ],
        icon: "cdn/all/both/img/city/warehouse_l.png",
        capacity: [
          8e3, 16401, 25454, 35330, 46181, 58158, 71420, 86137, 102492, 120687,
          140942, 163502, 188637, 216645, 247859, 282646, 321416, 364622,
          412768, 466416, 526188, 592779, 666958, 749584, 841608, 944094,
          1058219, 1185296, 1326787, 1484315, 1659689, 1854922, 2072251,
          2314170, 2583452, 2883186, 3216806, 3588141, 4001450, 4461475,
          4973498, 5543400, 6177729, 6883778, 7669672, 8544459, 9518218,
          10602179, 11808850, 13152172,
        ],
      },
      winegrower: {
        buildingId: 21,
        maxLevel: 70,
        wood: [
          231, 294, 388, 524, 721, 999, 1389, 1931, 2679, 3705, 5103, 7e3, 9565,
          13020, 17658, 23867, 32158, 43204, 57887, 77368, 103169, 137284,
          182323, 241701, 319882, 422694, 557743, 734951, 967247, 1271469,
          1669538, 2189971, 2869849, 3757360, 4915100, 6424340, 8390549,
          10950541, 14281719, 18614019, 24245360, 31561594, 41062287, 53394009,
          69393318, 90142239, 117039862, 151894714, 197043912, 255506818,
        ],
        glass: 0,
        marble: [
          0, 83, 133, 206, 311, 460, 669, 959, 1360, 1909, 2660, 3679, 5057,
          6916, 9413, 12759, 17229, 23190, 31120, 41649, 55604, 74071, 98470,
          130662, 173079, 228903, 302288, 398654, 525073, 690763, 907730,
          1191607, 1562737, 2047577, 2680522, 3506260, 4582831, 5985583,
          7812290, 10189778, 13282495, 17303591, 22529243, 29317171, 38130559,
          49568956, 64408192, 83651900, 108598039, 140924741,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          967, 1379, 1856, 2406, 3037, 3720, 4560, 5460, 6540, 7740, 9120,
          10620, 12360, 14280, 16500, 18900, 21660, 24660, 28080, 31920, 36120,
          40860, 46080, 51960, 58440, 65640, 73620, 82500, 9e4, 100800, 115200,
          126e3, 140400, 158400, 176400, 194400, 216e3, 241200, 27e4, 298800,
          331200, 367200, 406800, 45e4, 496800, 547200, 607560, 669600, 738e3,
          813600,
        ],
        icon: "cdn/all/both/img/city/winegrower_l.png",
      },
      workshop: {
        buildingId: 15,
        maxLevel: 0,
        wood: [
          171, 275, 402, 553, 735, 950, 1206, 1507, 1860, 2275, 2759, 3324,
          3980, 4741, 5623, 6643, 7821, 9178, 10740, 12536, 14599, 16965, 19676,
          22780, 26329, 30385, 35017, 40301, 46326, 53189, 61004, 69896, 80008,
          91501, 104555, 119377, 136196, 155273, 176902, 201412, 229177, 260616,
          296201, 336465, 382006, 433499, 491701, 557468, 631758, 715651,
        ],
        glass: 0,
        marble: [
          63, 116, 180, 259, 354, 468, 605, 768, 962, 1191, 1461, 1779, 2153,
          2590, 3102, 3699, 4394, 5203, 6142, 7231, 8493, 9954, 11642, 13591,
          15839, 18431, 21416, 24850, 28799, 33336, 38546, 44524, 51379, 59236,
          68236, 78540, 90331, 103815, 119231, 136847, 156967, 179938, 206155,
          236065, 270175, 309061, 353377, 403866, 461368, 526838,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          2028, 2732, 3478, 4260, 5100, 5940, 6900, 7860, 8880, 10020, 11160,
          12360, 13620, 15e3, 16380, 17880, 19440, 21060, 22800, 24600, 26520,
          28500, 30600, 32760, 35040, 37440, 39960, 42600, 45360, 48240, 51240,
          54360, 57660, 61140, 64740, 68460, 72420, 76500, 80820, 85320, 9e4,
          93600, 97200, 104400, 108e3, 115200, 122400, 126e3, 133200, 140400,
        ],
        icon: "cdn/all/both/img/city/workshop_l.png",
      },
      marineChartArchive: {
        buildingId: 32,
        maxLevel: 0,
        wood: [
          528, 940, 1452, 2084, 2858, 3801, 4942, 6318, 7970, 9945, 12301,
          15102, 18423, 22354, 26994, 32463, 38897, 46452, 55312, 65688, 77822,
          91996, 108535, 127811, 150255, 176366, 206713, 241957, 282854, 330277,
          385227, 448859, 522496, 607660, 706101, 819824, 951133, 1102674,
          1277479, 1479028, 1711311, 1978900, 2287039, 2641735, 3049869,
          3519323, 4059125, 4679607, 5392601, 6211644,
        ],
        glass: [
          189, 434, 746, 1142, 1637, 2254, 3016, 3953, 5101, 6501, 8203, 10264,
          12753, 15753, 19359, 23685, 28864, 35054, 42440, 51240, 61709, 74150,
          88914, 106416, 127143, 151663, 180645, 214870, 255253, 302865, 358958,
          424998, 502697, 594054, 701406, 827483, 975468, 1149079, 1352651,
          1591241, 1870745, 2198036, 2581124, 3029339, 3553551, 4166416,
          4882671, 5719468, 6696769, 7837797,
        ],
        marble: [
          298, 684, 1178, 1803, 2586, 3561, 4768, 6253, 8073, 10293, 12993,
          16265, 20220, 24987, 30721, 37604, 45848, 55706, 67475, 81504, 98204,
          118057, 141630, 169589, 202715, 241923, 288288, 343068, 407736,
          484018, 573933, 679843, 804510, 951164, 1123579, 1326163, 1564066,
          1843299, 2170880, 2554995, 3005197, 3532623, 4150260, 4873248,
          5719226, 6708748, 7865756, 9218128, 10798328, 12644142,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          2082, 2365, 2695, 3081, 3529, 4020, 4620, 5280, 6060, 6960, 7980,
          9180, 10500, 12e3, 13680, 15660, 17820, 20280, 23040, 26160, 29640,
          33540, 37980, 42900, 48420, 54600, 61560, 69300, 77940, 87540, 97200,
          108e3, 122400, 136800, 154800, 173700, 190800, 216e3, 241200, 27e4,
          298800, 334800, 374400, 417600, 464400, 514800, 576e3, 640800, 709200,
          788400,
        ],
        icon: "cdn/all/both/img/city/marinechartarchive_l.png",
      },
      dockyard: {
        buildingId: 33,
        maxLevel: 0,
        wood: [
          493090, 540090, 602030, 682627, 786430, 918993, 1087089, 1298959,
          1564618, 1896221, 2308499, 2819282, 3450129, 4227081, 5181557,
          6351433, 7782328, 9529139, 11657880, 14247871, 17394355, 21211617,
          25836702, 31433851, 38199788, 46370005, 56226264, 68105514, 82410509,
          99622440, 120315951, 145177010, 175024134, 210833625, 253769552,
          305219359, 366836156, 440588935, 528822163, 634326523, 760422840,
          911061640, 1090941242, 1305647782, 1561821242, 1867352247, 2231615313,
          2665745240, 3182964588, 3798971587,
        ],
        glass: [
          234877, 254052, 278455, 309196, 347598, 395231, 453962, 526001,
          613969, 720964, 850645, 1007336, 1196132, 1423039, 1695127, 2020713,
          2409574, 2873198, 3425067, 4081e3, 4859545, 5782438, 6875132, 8167424,
          9694177, 11496158, 13621021, 16124444, 19071451, 22537953, 26612537,
          31398538, 37016459, 43606772, 51333167, 60386337, 70988358, 83397779,
          97915522, 114891730, 134733712, 157915143, 184986745, 216588660,
          253464789, 296479415, 346636455, 405101766, 473228981, 552589432,
        ],
        marble: [
          278332, 302275, 333116, 372406, 422006, 484154, 561527, 657330,
          775391, 920280, 1097440, 1313357, 1575742, 1893761, 2278296, 2742257,
          3300947, 3972492, 4778349, 5743897, 6899138, 8279517, 9926884,
          11890624, 14228986, 17010638, 20316488, 24241827, 28898834, 34419516,
          40959142, 48700281, 57857513, 68682954, 81472720, 96574489, 114396345,
          135417124, 160198517, 189399206, 223791400, 264280155, 311925951,
          367971059, 433870350, 511327270, 602335848, 709229736, 834739459,
          982059228,
        ],
        sulfur: 0,
        wine: 0,
        time: [
          237600, 262800, 295200, 334800, 381600, 442800, 519120, 608400,
          716400, 849600, 1008e3, 1202400, 1432800, 171e4, 2037600, 243e4,
          2851200, 3369600, 4060800, 4838400, 5788800, 6825600, 8121600,
          9676800, 11404800, 13478400, 15984e3, 18835200, 22204800, 26092800,
          30758400, 34128e3, 41904e3, 4968e4, 57456e3, 68256e3, 78624e3,
          91584e3, 107568e3, 128390400, 149472e3, 173232e3, 202176e3, 236304e3,
          275616e3, 323136e3, 375408e3, 43848e4, 50976e4, 593568e3,
        ],
        icon: "cdn/all/both/img/city/dockyard_l.png",
      },
      shrineOfOlympus: {
        buildingId: 34,
        maxLevel: 21,
        wood: [
          872, 973, 1115, 1311, 1577, 1934, 2410, 3039, 3866, 4946, 6351, 8171,
          10521, 13543, 17420, 22380, 28711, 36774, 47024, 60031, 76508, 97349,
          123672, 156877, 198712, 251358, 317539, 400653, 504931, 635649,
          799373, 1004276, 1260522, 1580751, 1980670, 2479792, 3102346, 3878410,
          4845302, 6049311, 7547835, 9412017, 11730015, 14611033, 18190309,
          22635269, 28153130, 35000291, 43493921, 54026264,
        ],
        wine: [
          0, 0, 81, 101, 127, 163, 209, 271, 351, 455, 589, 762, 984, 1267,
          1629, 2089, 2672, 3411, 4344, 5522, 7005, 8870, 11211, 14148, 17826,
          22428, 28180, 35361, 44319, 55484, 69387, 86688, 108199, 134927,
          168115, 209298, 260372, 323676, 402095, 499188, 619341, 767960,
          951706, 1178781, 1459283, 1805645, 2233162, 2760655, 3411267, 4213458,
        ],
        marble: [
          0, 0, 0, 0, 178, 218, 273, 348, 451, 590, 778, 1030, 1366, 1813, 2407,
          3193, 4229, 5594, 7388, 9740, 12820, 16846, 22100, 28948, 37862,
          49451, 64501, 84025, 109329, 142093, 184480, 239270, 310040, 401381,
          519191, 671041, 866641, 1118449, 1442428, 1859040, 2394492, 3082341,
          3965542, 5099061, 6553210, 8417902, 10808082, 13870656, 17793322,
          22815833,
        ],
        glass: [
          0, 0, 0, 0, 0, 0, 0, 0, 243, 316, 415, 546, 718, 946, 1244, 1635,
          2146, 2812, 3678, 4802, 6258, 8143, 10579, 13721, 17770, 22982, 29683,
          38289, 49331, 63487, 81618, 104822, 134496, 172415, 220838, 282634,
          361446, 461901, 589870, 752802, 960141, 1223862, 1559139, 1985193,
          2526371, 3213493, 4085571, 5191965, 6595117, 8373991,
        ],
        sulfur: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 155, 216, 298, 408, 557, 756, 1022,
          1377, 1850, 2479, 3312, 4416, 5875, 7801, 10341, 13685, 18084, 23865,
          31454, 41406, 54447, 71520, 93855, 123051, 161191, 210980, 275934,
          360622, 470975, 614693, 801765, 1045148, 1361639, 1773010, 2307470,
          3001556, 3902576, 5071772, 6588394, 8554970,
        ],
        time: [
          56, 64, 76, 92, 113, 142, 179, 228, 291, 374, 479, 615, 788, 1008,
          1287, 1641, 2088, 2651, 3360, 4200, 5340, 6720, 8460, 10680, 13380,
          16800, 21e3, 26280, 32760, 40860, 50880, 63360, 78720, 97200, 118800,
          147600, 183600, 230400, 284400, 352800, 435600, 536400, 662400,
          817200, 1008e3, 1245600, 1533600, 1886400, 2322e3, 2851200,
        ],
        icon: "cdn/all/both/img/city/shrineOfOlympus_l.png",
      },
      chronosForge: {
        buildingId: 35,
        maxLevel: 0,
        wood: [
          44754, 133532, 298810, 594363, 1108358, 1984171, 3453375, 5887807,
          9881523, 16379445, 26878786, 43743750, 70696174, 113579091, 181542957,
          288885618, 457902118, 723292612, 1138971660, 1788574792, 2801652051,
          4378601044, 6829019050, 10630642727, 16519849346, 25630508026,
          39706848920, 61429571140, 94915085370, 146479312277, 225805504273,
          347728751626, 534961287874, 822252354306, 1262734498373,
          1937600754414, 2970854011259, 4551776992140, 6969149475425,
          0x9b2c02738e1, 0xed46ca3ffb2, 24918267349707, 38058774432214,
          58097415465981, 88640958335396, 0x7af0f7a8d089, 0xbb64d959604c,
          313918235538062, 478067455499312, 727747793114685,
        ],
        wine: [
          0, 98693, 207989, 389619, 684243, 1153591, 1890858, 3036064, 4798700,
          7491025, 11576947, 17743640, 27006292, 40861074, 61508215, 92176873,
          137597655, 204689112, 303554001, 448923645, 662249904, 974732426,
          1431695609, 2098911962, 3071730525, 4488245216, 6548278121,
          9540727849, 13882944840, 20177389555, 29293114001, 42482879934,
          61551414173, 89097011372, 128858297085, 186211701271, 268884838843,
          387979082322, 559434757869, 806129759123, 1160884314331,
          1670761659864, 2403221439109, 3454921104664, 4964300878894,
          7129573282160, 0x94ee39a6f1e, 0xd5b10957e63, 21061153684216,
          30193690941969,
        ],
        marble: [
          40943, 119743, 262648, 512089, 936025, 1642482, 2802072, 4682774,
          7703492, 12516331, 20132682, 32116049, 50876370, 80118481, 125524308,
          195789079, 304193062, 470982523, 726972180, 1118989701, 1718095465,
          2631979976, 4023644838, 6139527486, 9351808780, 14222006097,
          21596490361, 32749852635, 49599947843, 75030247623, 113372760668,
          171131087264, 258062425169, 388795880390, 585251701516, 880256102470,
          1322940070436, 1986799063629, 2981720012338, 4471921255436,
          6702702075412, 0x921b14a8fc7, 0xdabc2f75068, 22491294138277,
          33636142651535, 50278626670626, 75119957935729, 0x6607dad049cb,
          0x984e6217814c, 0xe3429bce806e,
        ],
        glass: [
          0, 0, 177621, 329421, 572767, 956042, 1551461, 2466323, 3859400,
          5964780, 9126501, 13848734, 20868409, 31260161, 46587738, 69122196,
          102155945, 150454232, 220903543, 323441883, 472392218, 688372164,
          1001026637, 1452935112, 2105194201, 3045388360, 4398962692,
          6345439751, 9141529614, 13154044489, 18906751866, 27147034073,
          38940679778, 55806615516, 79908318351, 114325636141, 163440630475,
          233485051344, 333316850810, 475521144777, 677970625715, 966036399048,
          1375719314441, 1958083620567, 2785532634283, 3960689050974,
          5628957285284, 7996289545852, 0xa53a147d34e, 0xea840051e48,
        ],
        sulfur: [
          0, 0, 0, 276449, 471147, 770848, 1226159, 1910602, 2930583, 4439590,
          6658353, 9903454, 14627836, 21478111, 31375495, 45630014, 66101427,
          95425778, 137334008, 197099616, 282167095, 403033404, 574483404,
          817320106, 1160786207, 1645950869, 2330443473, 3295066090, 4653024998,
          6562811524, 9246165453, 13013114e3, 18296856643, 25702345185,
          36073905945, 50589328454, 70890726503, 99266472464, 138904043696,
          194241293979, 271454294873, 379134617675, 529229317932, 738345113976,
          0xefb66604a0, 1434918184064, 1998933999505, 2783383982725,
          3873996783161, 5389698475744,
        ],
        time: [
          660, 895, 1232, 1704, 2357, 3249, 4440, 6060, 8220, 11100, 14880,
          19860, 26400, 34920, 45960, 60360, 78960, 100800, 133200, 173880,
          223200, 288e3, 374400, 482400, 619200, 792e3, 1015200, 1299600,
          1663200, 2124e3, 2678400, 3369600, 432e4, 5529600, 6998400, 8899200,
          11318400, 14428800, 18230400, 23068800, 29203200, 3672e4, 44496e3,
          57456e3, 7344e4, 91584e3, 117936e3, 14688e4, 186192e3, 233712e3,
        ],
        icon: "cdn/all/both/img/city/chronosForge_l.png",
      },
    },
  };
  Constant.buildingOrder = {
    growth: [
      Constant.Buildings.TOWN_HALL,
      Constant.Buildings.PALACE,
      Constant.Buildings.GOVERNORS_RESIDENCE,
      Constant.Buildings.TAVERN,
      Constant.Buildings.MUSEUM,
      Constant.Buildings.SHRINEOFOLYMPUS,
      Constant.Buildings.CHRONOSFORGE,
    ],
    research: [
      Constant.Buildings.ACADEMY,
      Constant.Buildings.WORKSHOP,
      Constant.Buildings.TEMPLE,
    ],
    diplomacy: [Constant.Buildings.EMBASSY],
    trading: [
      Constant.Buildings.WAREHOUSE,
      Constant.Buildings.DUMP,
      Constant.Buildings.TRADING_PORT,
      Constant.Buildings.TRADING_POST,
      Constant.Buildings.BLACK_MARKET,
      Constant.Buildings.MARINE_CHART_ARCHIVE,
    ],
    military: [
      Constant.Buildings.WALL,
      Constant.Buildings.HIDEOUT,
      Constant.Buildings.BARRACKS,
      Constant.Buildings.SHIPYARD,
    ],
    wood: [Constant.Buildings.FORESTER, Constant.Buildings.CARPENTER],
    wine: [Constant.Buildings.WINERY, Constant.Buildings.VINEYARD],
    marble: [Constant.Buildings.STONEMASON, Constant.Buildings.ARCHITECT],
    crystal: [Constant.Buildings.GLASSBLOWER, Constant.Buildings.OPTICIAN],
    sulfur: [
      Constant.Buildings.ALCHEMISTS_TOWER,
      Constant.Buildings.FIREWORK_TEST_AREA,
    ],
    piracy: [Constant.Buildings.PIRATE_FORTRESS, Constant.Buildings.DOCKYARD],
  };
  Constant.altBuildingOrder = {
    growth: [
      Constant.Buildings.TOWN_HALL,
      Constant.Buildings.PALACE,
      Constant.Buildings.GOVERNORS_RESIDENCE,
      Constant.Buildings.TAVERN,
      Constant.Buildings.MUSEUM,
      Constant.Buildings.SHRINEOFOLYMPUS,
      Constant.Buildings.CHRONOSFORGE,
    ],
    research: [
      Constant.Buildings.ACADEMY,
      Constant.Buildings.WORKSHOP,
      Constant.Buildings.TEMPLE,
    ],
    diplomacy: [Constant.Buildings.EMBASSY],
    trading: [
      Constant.Buildings.WAREHOUSE,
      Constant.Buildings.DUMP,
      Constant.Buildings.TRADING_PORT,
      Constant.Buildings.TRADING_POST,
      Constant.Buildings.BLACK_MARKET,
      Constant.Buildings.MARINE_CHART_ARCHIVE,
    ],
    military: [
      Constant.Buildings.WALL,
      Constant.Buildings.HIDEOUT,
      Constant.Buildings.BARRACKS,
      Constant.Buildings.SHIPYARD,
    ],
    production: [
      Constant.Buildings.FORESTER,
      Constant.Buildings.WINERY,
      Constant.Buildings.STONEMASON,
      Constant.Buildings.GLASSBLOWER,
      Constant.Buildings.ALCHEMISTS_TOWER,
    ],
    reducton: [
      Constant.Buildings.CARPENTER,
      Constant.Buildings.VINEYARD,
      Constant.Buildings.ARCHITECT,
      Constant.Buildings.OPTICIAN,
      Constant.Buildings.FIREWORK_TEST_AREA,
    ],
    piracy: [Constant.Buildings.PIRATE_FORTRESS, Constant.Buildings.DOCKYARD],
  };
  Constant.compBuildingOrder = {
    growth: [
      Constant.Buildings.TOWN_HALL,
      "colonyBuilding",
      Constant.Buildings.PALACE,
      Constant.Buildings.GOVERNORS_RESIDENCE,
      Constant.Buildings.TAVERN,
      Constant.Buildings.MUSEUM,
      Constant.Buildings.SHRINEOFOLYMPUS,
      Constant.Buildings.CHRONOSFORGE,
    ],
    research: [
      Constant.Buildings.ACADEMY,
      Constant.Buildings.WORKSHOP,
      Constant.Buildings.TEMPLE,
    ],
    diplomacy: [Constant.Buildings.EMBASSY],
    trading: [
      Constant.Buildings.WAREHOUSE,
      Constant.Buildings.DUMP,
      Constant.Buildings.TRADING_PORT,
      Constant.Buildings.TRADING_POST,
      Constant.Buildings.BLACK_MARKET,
      Constant.Buildings.MARINE_CHART_ARCHIVE,
    ],
    military: [
      Constant.Buildings.WALL,
      Constant.Buildings.HIDEOUT,
      Constant.Buildings.BARRACKS,
      Constant.Buildings.SHIPYARD,
    ],
    production: [
      Constant.Buildings.FORESTER,
      "productionBuilding",
      Constant.Buildings.WINERY,
      Constant.Buildings.STONEMASON,
      Constant.Buildings.GLASSBLOWER,
      Constant.Buildings.ALCHEMISTS_TOWER,
    ],
    reducton: [
      Constant.Buildings.CARPENTER,
      Constant.Buildings.VINEYARD,
      Constant.Buildings.ARCHITECT,
      Constant.Buildings.OPTICIAN,
      Constant.Buildings.FIREWORK_TEST_AREA,
    ],
    piracy: [Constant.Buildings.PIRATE_FORTRESS, Constant.Buildings.DOCKYARD],
  };
  Constant.unitOrder = {
    army_front_line: [
      Constant.Military.HOPLITE,
      Constant.Military.SPARTAN,
      Constant.Military.STEAM_GIANT,
    ],
    army_flank: [Constant.Military.SPEARMAN, Constant.Military.SWORDSMAN],
    army_ranged: [
      Constant.Military.SLINGER,
      Constant.Military.ARCHER,
      Constant.Military.MARKSMAN,
    ],
    army_seige: [
      Constant.Military.RAM,
      Constant.Military.CATAPULT,
      Constant.Military.MORTAR,
    ],
    army_air: [
      Constant.Military.GYROCOPTER,
      Constant.Military.BALLOON_BOMBADIER,
    ],
    army_support: [Constant.Military.COOK, Constant.Military.DOCTOR],
    navy_front_line: [
      Constant.Military.FLAME_THROWER,
      Constant.Military.STEAM_RAM,
    ],
    navy_flank: [Constant.Military.RAM_SHIP],
    navy_ranged: [
      Constant.Military.BALLISTA_SHIP,
      Constant.Military.CATAPULT_SHIP,
      Constant.Military.MORTAR_SHIP,
    ],
    navy_seige: [Constant.Military.SUBMARINE, Constant.Military.ROCKET_SHIP],
    navy_air: [
      Constant.Military.PADDLE_SPEEDBOAT,
      Constant.Military.BALLOON_CARRIER,
    ],
    navy_support: [Constant.Military.TENDER],
  };
  Constant.LanguageData = new Proxy(Constant.LanguageData, {
    get(table, key) {
      return key in table ? table[key] : table.en;
    },
  });
  function addScript(src) {
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = src;
    document.getElementsByTagName("body")[0].appendChild(script);
  }
  render.LoadCSS = function () {
    GM_addStyle(
      '/* Global board styles */\n #js_GlobalMenu_wood, #js_GlobalMenu_wine, #js_GlobalMenu_marble, #js_GlobalMenu_crystal, #js_GlobalMenu_sulfur {font-size:95%; position:absolute; top:0px; right:5px}\n span.resourceProduction {font-size:85%;position:absolute;right:5px; padding-top: 13px}\n #empireBoard .clickable {\n    color: #542c0f;\n    font-weight: 600; }\n#empireBoard .clickable:hover, #empireBoard .clickbar:hover {\n    cursor: pointer;\n    text-decoration: underline; }\n#empireBoard .Bold, #empireBoard .Red, #empireBoard .Blue, #empireBoard .Green {\n    font-weight: normal; }\n#empireBoard .Green {\n    color: green !important; }\n#empireBoard .Red {\n    color: red !important; }\n#empireBoard .Blue {\n    color: blue !important; }\n#empireBoard .icon {\n    background-clip: border-box;\n    background-repeat: no-repeat;\n    background-position: center;\n    background-color: transparent;\n    background-size: auto 20px; }\n#empireBoard .safeImage {\n    background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAJCAYAAAD+WDajAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAEFJREFUeNpi/P//PwMIhOrzQhhAsPriZ0YQzYQugcxnQhaE6YABxhA9HhRdyICJAQ/AayzxOtFdzYRuFLIVAAEGANwqFwuukYKqAAAAAElFTkSuQmCC");\n    background-size: auto auto !important; }\n#empireBoard .transportImage {\n    background-image: url(cdn/all/both/actions/transport.jpg); }\n#empireBoard .tradeImage {\n    background-image: url(cdn/all/both/actions/trade.jpg); }\n#empireBoard .plunderImage {\n    background-image: url(cdn/all/both/actions/plunder.jpg); }\n#empireBoard .merchantImage {\n    background-image: url(cdn/all/both/minimized/merchantNavy.png);\n    background-position: 0 -5px; }\n#empireBoard .woodImage {\n    background-image: url(cdn/all/both/resources/icon_wood.png);}\n#empireBoard .wineImage {\n    background-image: url(cdn/all/both/resources/icon_wine.png); }\n#empireBoard .marbleImage {\n    background-image: url(cdn/all/both/resources/icon_marble.png); }\n#empireBoard .sulfurImage {\n    background-image: url(cdn/all/both/resources/icon_sulfur.png); }\n#empireBoard .goldImage {\n    background-image: url(cdn/all/both/resources/icon_gold.png); }\n#empireBoard .glassImage {\n    background-image: url(cdn/all/both/resources/icon_glass.png); }\n#empireBoard .sawMillImage {\n    background-image: url(cdn/all/both/characters/y100_worker_wood_faceleft.png); }\n#empireBoard .mineImage {\n    background-image: url(cdn/all/both/characters/y100_worker_tradegood_faceleft.png); }\n#empireBoard .researchImage {\n    background-image: url(cdn/all/both/layout/bulb-on.png); }\n#empireBoard .populationImage {\n    background-image: url(cdn/all/both/resources/icon_population.png); }\n#empireBoard .goldImage {\n    background-image: url(cdn/all/both/resources/icon_gold.png); }\n#empireBoard .expensesImage {\n    background-image: url(cdn/all/both/resources/icon_upkeep.png); }\n#empireBoard .happyImage {\n    background-image: url(cdn/all/both/smilies/happy.png); }\n#empireBoard .actionpointImage {\n    background-image: url(cdn/all/both/resources/icon_actionpoints.png); }\n#empireBoard .growthImage {\n    background-image: url(cdn/all/both/icons/growth_positive.png); }\n#empireBoard .scientistImage {\n    background-image: url(cdn/all/both/characters/40h/scientist_r.png); }\n#empireBoard .priestImage {\n    background-image: url(cdn/all/both/characters/40h/templer_r.png); }\n#empireBoard .citizenImage {\n    background-image: url(cdn/all/both/characters/40h/citizen_r.png); }\n#empireBoard .cityIcon {\n    background-image: url(cdn/all/both/icons/city_30x30.png); }\n#empireBoard .governmentIcon {\n    background-image: url(cdn/all/both/government/zepter_20.png); }\n#empireBoard .researchIcon {\n    background-image: url(cdn/all/both/icons/researchbonus_30x30.png); }\n#empireBoard .tavernIcon {\n    background-image: url(cdn/all/both/buildings/tavern_30x30.png); }\n#empireBoard .culturalIcon {\n    background-image: url(cdn/all/both/interface/icon_message_write.png); }\n#empireBoard .museumIcon {\n    background-image: url(cdn/all/both/buildings/museum_30x30.png); }\n#empireBoard .incomeIcon {\n    background-image: url(cdn/all/both/icons/income_positive.png); }\n#empireBoard .crownIcon {\n    background-image: url(cdn/all/both/layout/crown.png); }\n#empireBoard .corruptionIcon {\n    background-image: url(cdn/all/both/icons/corruption_24x24.png); }\n#empireBoard #empireTip {\n    display: none;\n    position: absolute;\n    top: 0;\n    left: 0;\n    z-index: 99999999; }\n#empireBoard #empireTip .icon {\n    background-clip: border-box;\n    background-repeat: no-repeat;\n    background-position: 0;\n    background-color: transparent;\n    background-attachment: scroll;\n    background-size: 16px auto;\n    height: 17px;\n    min-width: 24px;\n    width: 24px; }\n#empireBoard #empireTip .icon2 {\n    background-clip: border-box;\n    background-repeat: no-repeat;\n    background-position: 0;\n    background-color: transparent;\n    background-attachment: scroll;\n    background-size: 24px auto;\n    height: 17px;\n    min-width: 24px;\n    width: 24px; }\n#empireBoard #empireTip .content {\n    background-color: #fae0ae;\n    border: 1px solid #e4b873;\n    position: relative;\n    overflow: hidden;\n    text-align: left;\n    word-wrap: break-word; }\n#empireBoard #empireTip .content table {\n    width: 100%; }\n#empireBoard #empireTip .content table tr.data {\n    background-color:  	#FFFAF0; }\n#empireBoard #empireTip .content table tr.total {\n     background: #E7C680 url(cdn/all/both/input/button.png) repeat-x scroll 0 0; }\n#empireBoard #empireTip .content table td {\n    padding: 2px;\n    height: auto !important;\n    text-align: right; }\n#empireBoard #empireTip .content table th {\n    padding: 2px;\n    height: auto !important;\n    text-align: center;\n    font-weight: bold;  background: #F8E7B3 url(cdn/all/both/input/button.png) repeat-x scroll 0 bottom;}\n#empireBoard #empireTip .content table tbody td {\n background-color: #FFFAF0;}\n#empireBoard #empireTip .content table tbody td:last-child {\n    text-align: left;\n    white-space: nowrap;\n    font-style: italic; }\n#empireBoard #empireTip .content table tfoot {\n  line-height: 12px !important;  border-top: 3px solid #fdf7dd; }\n#empireBoard #empireTip .content table tfoot td:last-child {\n    text-align: left;\n    white-space: nowrap;\n    font-style: italic; }\n#empireBoard #empireTip .content table thead {\n    background: #F8E7B3 url(cdn/all/both/input/button.png) repeat-x scroll 0 bottom;}\n#empireBoard #empireTip .content table thead th.lf {\n    border-left: 2px solid #e4b873; }\n#empireBoard #empireTip .content table tbody td.lf {\n    border-left: 2px solid #e4b873; }\n#empireBoard #empireTip .content table th.nolf, #empireBoard #empireTip .content table td.nolf {\n    border-left: none; }\n#empireBoard #empireTip .content th.lfdash, #empireBoard #empireTip .content td.lfdash {\n    border-left: 1px dashed #e4b873; }\n#empireBoard #empireTip .content table tr.small td {\n    height: auto !important;\n    padding-top: 1px;\n    font-size: 10px !important;\n    line-height: 15px !important; }\n#empireBoard #empire_Tabs table {\n    width: 100% !important;\n    text-align: center;\n    border: 1px solid #ffffff; }\n#empireBoard #empire_Tabs table colgroup {\n    border-left: 1px solid #e4b873; }\n#empireBoard #empire_Tabs table colgroup:first-child {\n    border: none !important; }\n#empireBoard #empire_Tabs table colgroup col {\n    border-left: 1px dashed #e4b873; }\n#empireBoard #empire_Tabs table thead {\n    background: #f8e7b3 url(cdn/all/both/input/button.png) repeat-x scroll 0 bottom; }\n#empireBoard #empire_Tabs table thead tr {\n    height: 30px; }\n#empireBoard #empire_Tabs table thead tr th {\n    text-align: center;\n    font-weight: bold;\n    \n    overflow: hidden;\n    white-space: nowrap; }\n#empireBoard #ArmyTab table thead tr th.empireactions {\n  min-width: 20px; width: 50px;}\n#empireBoard #empire_Tabs table thead tr th.icon {\n    min-width: 35px;\n    background-size: auto 20px; }\n#empireBoard #empire_Tabs table tbody tr {\n    border-top: 1px solid #e4b873;}\n#empireBoard #empire_Tabs table tbody tr:nth-child(even) {\n    background-color: #FDF1D4; }\n#empireBoard #empire_Tabs table tbody tr.selected {\n    background-color: #FAE3B8;\n    box-shadow: 0 0 1em #CB9B6A inset; }\n#empireBoard #empire_Tabs table tbody tr:hover {\n    background-color: #fff;\n    box-shadow: 0 0 1em #CB9B6A; }\n#empireBoard #empire_Tabs table tbody tr td.city_name {\n    width: 135px;\n    max-width: 135px;\n    padding-left: 3px;\n    text-align: left;\n    padding-right: 14px; }\n#empireBoard #empire_Tabs table tbody tr td.city_name span.icon {\n    background-repeat: no-repeat;\n    float: left;\n    width: 20px;\n    background-size: 15px auto;\n    margin: 0 2px 0 -1px;\n    height: 16px;\n    cursor: move; }\n   #empireBoard #empire_Tabs table tbody tr td.action_points {\n  text-align: right;}\n  #empireBoard #empire_Tabs table tbody tr td.population {\n  text-align: right;}\n#empireBoard #empire_Tabs  table tbody tr td.sawmill {\n    border-left: 1.5px solid #e4b873; }\n  #empireBoard #empire_Tabs table tbody tr td.sawmillprog {\n  text-align: right;}\n  #empireBoard #empire_Tabs table tbody tr td.mineprog {\n  text-align: right;}\n  #empireBoard #empire_Tabs table tbody tr td.empireactions div {\n    background-clip: border-box;\n    background: transparent repeat scroll 0 0;\n    background-size: 25px auto;\n    height: 17px;\n    min-width: 20px;\n    width: 25px; }\n  #empireBoard #empire_Tabs table tbody tr td.wonder div {\n    background-clip: border-box;\n    background: transparent repeat scroll 0 0;\n    background-size: auto 40px;\n    height: 30px;\n    min-width: 30px;\n    width: 30px; }\n	#empireBoard #empire_Tabs table thead tr th.empireactions div {\n    background-clip: border-box;\n    background: transparent repeat scroll 0 0;\n    background-size: 25px auto;\n    height: 20px;\n    min-width: 24px;\n    width: 25px; }\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.transport {\n    background-image: url("cdn/all/both/actions/transport.jpg"); float: right;}\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.worldmap {\n    background-image: url("cdn/all/both/layout/icon-world.png"); background-size: 16px 16px; background-repeat: no-repeat; background-position: center center; float: left;}\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.island {\n    background-image: url("cdn/all/both/layout/icon-island.png"); background-size: 23px 18px; background-position: center center; float: right;}\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.islandwood {\n    background-image: url("cdn/all/both/resources/icon_wood.png"); background-size: 17px auto; background-repeat: no-repeat; background-position: center center; float: left;}\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.islandgood {\n   float: left;}\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.city {\n    background-image: url("cdn/all/both/layout/icon-city2.png"); background-size: auto 21px; background-repeat: no-repeat; background-position: center center; float: right;}\n#empireBoard #empire_Tabs table thead tr th.empireactions div.member {\n    background-image: url("cdn/all/both/characters/y100_citizen_faceright.png"); background-size: auto 20px; background-repeat: no-repeat; background-position: center center; float: right;}\n#empireBoard #empire_Tabs table thead tr th.empireactions div.agora {\n    background-image: url("cdn/all/both/layout/icon-message.png"); background-size: 20px auto; background-repeat: no-repeat; background-position: center center; float: right;}\n#empireBoard #empire_Tabs table thead tr th.empireactions div.trading {\n    background-image: url("cdn/all/both/characters/fleet/40x40/ship_transport_r_40x40.png"); background-size: 22px 19px; background-repeat: no-repeat; background-position: center center; float: left;}\n#empireBoard #empire_Tabs table thead tr th.empireactions div.spio {\n    background-image: url("cdn/all/both/characters/military/120x100/spy_120x100.png"); background-size: 25px auto; background-position: center center;\n    float: left; }\n#empireBoard #empire_Tabs table thead tr th.empireactions div.combat {\n    background-image: url("cdn/all/both/layout/medallie32x32_gold.png"); background-size: 19px auto; background-repeat: no-repeat;\n    float: right; }\n#empireBoard #empire_Tabs table thead tr th.empireactions div.contracts {\n    background-image: url("cdn/all/both/museum/icon32_culturalgood.png"); background-size: 22px auto; background-position: center center;  background-repeat: no-repeat;}\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.barracks {\n    background-image: url("cdn/all/both/buildings/y50/y50_barracks.png"); background-size: 30px auto; background-position: center center; float: right; }\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.shipyard {\n    background-image: url("cdn/all/both/buildings/y50/y50_shipyard.png");\n  background-size: 28px auto;   float: right; }\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.deploymentarmy {\n    background-image: url("cdn/all/both/actions/move_army.jpg");\n    float: left; }\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.deploymentfleet {\n    background-image: url("cdn/all/both/actions/move_fleet.jpg");\n    float: right; }\n#empireBoard #empire_WorldmapTab table tbody tr td.worldmap div.worldmap{ width:829px; height:829px; background-image: url("cdn/all/both/actions/move_fleet.jpg");\n    float: right; }\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.transport:hover {\n    background-position: 0 -17px; }\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.deploymentfleet:hover {\n    background-position: 0 -17px; }\n#empireBoard #empire_Tabs table tbody tr td.empireactions div.deploymentarmy:hover {\n    background-position: 0 -17px; }\n#empireBoard #empire_Tabs table tbody tr.selected .empireactions div.transport, #empireBoard #empire_Tabs table tbody tr.selected .empireactions div.deploymentarmy, #empireBoard #empire_Tabs table tbody tr.selected .empireactions div.deploymentfleet{\n    background-position: 0 17px; }\n#empireBoard #empire_Tabs table tbody tr.current .empireactions div.transport {\n    background-position: 0 px; }\n#empireBoard #empire_Tabs table tfoot {\n    background: #fae0ae;\n    background: #e7c680 url(cdn/all/both/input/button.png) repeat-x scroll 0 0;\n    border-top: 2px solid #e4b873; }\n#empireBoard #empire_Tabs table tfoot tr td {\n    text-align: right;\n     font-weight: bold;}\n#empireBoard #empire_Tabs table tfoot tr #t_research.total {\n    text-align: center; }\n#empireBoard #empire_Tabs table tfoot tr #t_growth.total {\n    text-align: center; }\n#empireBoard #empire_Tabs table tfoot tr td.total span {\n    line-height: 1em;\n    height: 1em;\n    font-size: 0.8em;\n    display: block; }\n#empireBoard #empire_Tabs table tfoot tr td#t_sigma, #empireBoard #empire_Tabs table tfoot tr td.sigma {\n    font-weight: 800;\n    text-align: center; }\n#empireBoard #ResTab div.progressbar .normal {\n    background: #73443E; }\n#empireBoard #ResTab div.progressbar .warning {\n    background: #8F1D1A; }\n#empireBoard #ResTab div.progressbar .almostfull {\n    background: #B42521; }\n#empireBoard #ResTab div.progressbar .full {\n    background: #ff0000; }\n#empireBoard #ResTab div.progressbar .fullGold {\n    background: #185A39; }\n#empireBoard #ResTab div.progressbar .capped {\n    background: repeating-linear-gradient(135deg, #c92a1d 0, #c92a1d 4px, #ef8f24 4px, #ef8f24 8px); }\n#empireBoard #ResTab, #empireBoard #BuildTab, #empireBoard #ArmyTab {\n    overflow-y: auto; }\n#empireBoard #ResTab > table > thead, #empireBoard #BuildTab > table > thead, #empireBoard #ArmyTab > table > thead {\n    position: sticky; top: 0; z-index: 2; }\n#empireBoard #ResTab > table > tfoot, #empireBoard #ArmyTab > table > tfoot {\n    position: sticky; bottom: 0; z-index: 2; }\n#empireBoard #ResTab div.progressbarPop .normal {\n    background: #73443E; }\n#empireBoard #ResTab div.progressbarPop .warning {\n    background: #CC3300; }\n#empireBoard #ResTab div.progressbarPop .full {\n    background: #185A39; }\n#empireBoard #ResTab div.progressbarSci .normal {\n    background: #73443E; }\n#empireBoard #ResTab div.progressbarSci .full {\n    background: #185A39; }\n#empireBoard #ResTab table tr td.gold_income, #empireBoard #ResTab table tr td.resource, #empireBoard #ResTab table tr td.army:nth-child(even) {\n    text-align: right; }\n#empireBoard #ResTab table tr td.gold_income span.incoming, #empireBoard #ResTab table tr td.resource span.incoming {\n  color: blue; }\n#empireBoard #ResTab table tr td.gold_unkeep span, #empireBoard #ResTab table tr td.resource span, #empireBoard #ResTab table tr td.army:nth-child(even) span {\n    line-height: 1em;\n    height: 1em;\n    font-size: 0.8em;\n    display: block; }\n#empireBoard #ResTab table tr td.gold_income span.icon, #empireBoard #ResTab table tr td.resource span.icon, #empireBoard #ResTab table tr td.army:nth-child(even) span.icon {\n    background-repeat: no-repeat;\n    float: left;\n    width: 20px;\n    height: 9px;\n    padding: 5px 4px 0 0; }\n#empireBoard #ResTab table tr td.gold_income span.current, #empireBoard #ResTab table tr td.resource span.current, #empireBoard #ResTab table tr td.army:nth-child(even) span.current {\n    font-size: 1em;\n    display: inline; }\n#empireBoard #ResTab table tr td.population {\n    text-align: right; }\n#empireBoard #ResTab table tr td.gold_income span:nth-child(2), #empireBoard #ResTab table tr td.population span:nth-child(2) {\n    line-height: 1em;\n    height: 1em;\n    font-size: 0.8em;\n    display: block; }\n#empireBoard #BuildTab table tbody tr td {\n    background-clip: border-box;\n    background-repeat: no-repeat;\n    background-position: center;\n    background-color: transparent;\n    background-size: auto 20px; }\n#empireBoard #BuildTab table tbody tr td span.maxLevel {\n    color: rgba(84, 44, 15, 0.3); }\n#empireBoard #BuildTab table tbody tr td span.upgradableSoon {\n    color: #4169e1;\n    font-style: italic; }\n#empireBoard #BuildTab table tbody tr td span.upgradableSoon:after {\n    content: "+"; }\n#empireBoard #BuildTab table tbody tr td span.upgradable {\n    color: green;\n    font-style: italic; }\n#empireBoard #BuildTab table tbody tr td span.upgradable:after {\n    content: "+"; }\n#empireBoard #BuildTab table tbody tr td span.upgrading {\n    background: url("/cdn/all/both/icons/arrow_upgrade.png") no-repeat scroll 1px 3px transparent;\n    border-radius: 5px 5px 5px 5px;\n    box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);\n    display: inline-block;\n    padding: 2px 5px 1px 20px;\n    margin: 2px; }\n#empireBoard #ArmyTab table colgroup col:nth-child(even) {\n    border-left: none; }\n#empireBoard #SettingsTab .options, #empireBoard #HelpTab .options {\n    float: left;\n    padding: 10px; }\n#empireBoard #SettingsTab .options span.categories, #empireBoard #HelpTab .options span.categories {\n    margin-left: -3px;\n    font-weight: 500; }\n#empireBoard #SettingsTab .options span.categories:not(:first-child), #empireBoard #HelpTab .options span.categories:not(:first-child) {\n    margin-top: 5px; }\n#empireBoard #SettingsTab .options span:not(.clickable), #empireBoard #HelpTab .options span:not(.clickable) {\n    display: block; }\n#empireBoard #SettingsTab .options span label, #empireBoard #HelpTab .options span label {\n    vertical-align: top;\n    padding-left: 5px; }\n#empireBoard #SettingsTab .buttons, #empireBoard #HelpTab .buttons {\n    clear: left;\n    padding: 3px; }\n#empireBoard #SettingsTab .buttons button, #empireBoard #HelpTab .buttons button {\n    margin-left: 3px; }\n\n.toast, .toastAlert {\n    display: none;\n    position: fixed;\n    z-index: 99999;\n    width: 100%;\n    text-align: center;\n    bottom: 5em; }\n\n.toast .message, .toastAlert .message {\n    display: inline-block;\n    color: #4C3000;\n    padding: 5px;\n    border-radius: 5px;\n    box-shadow: 3px 0px 15px 0 #542C0F;\n    -webkit-box-shadow: 3px 0px 15px 0 #542C0F;\n    font-family: Arial, Helvetica, sans-serif;\n    font-size: 11px;\n    background: #faf3d7;\n    background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0, #faf3d7), color-stop(1, #e1b06d)); }\n\ndiv.prog:after {\n    -webkit-animation: move 2s linear infinite;\n    -moz-animation: move 2s linear infinite; }\n\n.prog {\n    display: block;\n    width: 100%;\n    height: 100%;\n    background: #fcf938 -moz-linear-gradient(center bottom, #fcf938 37%, #fcf938 69%);\n    position: relative;\n    overflow: hidden; }\n.prog:after {\n    content: "";\n    position: absolute;\n    top: 0;\n    left: 0;\n    bottom: 0;\n    right: 0;\n    background: -moz-linear-gradient(-45deg, rgba(10, 10, 10, 0.6) 25%, transparent 25%, transparent 50%, rgba(10, 10, 10, 0.6) 50%, rgba(10, 10, 10, 0.6) 75%, transparent 75%, transparent);\n    z-index: 1;\n    -webkit-background-size: 50px 50px;\n    -moz-background-size: 50px 50px;\n    background-size: 50px 50px;\n    -webkit-animation: move 5s linear infinite;\n    -moz-animation: move 5s linear infinite;\n    overflow: hidden; }\n\n.animate > .prog:after {\n    display: none; }\n\n@-webkit-keyframes move {\n    0% {\n        background-position: 0 0; }\n\n    100% {\n        background-position: 50px 50px; } }\n\n@-moz-keyframes move {\n    0% {\n        background-position: 0 0; }\n\n    100% {\n        background-position: 50px 50px; } }\n',
    );
    if (database.settings.compressedBuildingList.value)
      GM_addStyle(
        "#empireBoard #BuildTab table tbody tr td.building.forester0:not(:empty) {\n background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAUCAMAAABPqWaPAAAKN2lDQ1BzUkdCIElFQzYxOTY2LTIuMQAAeJydlndUU9kWh8+9N71QkhCKlNBraFICSA29SJEuKjEJEErAkAAiNkRUcERRkaYIMijggKNDkbEiioUBUbHrBBlE1HFwFBuWSWStGd+8ee/Nm98f935rn73P3Wfvfda6AJD8gwXCTFgJgAyhWBTh58WIjYtnYAcBDPAAA2wA4HCzs0IW+EYCmQJ82IxsmRP4F726DiD5+yrTP4zBAP+flLlZIjEAUJiM5/L42VwZF8k4PVecJbdPyZi2NE3OMErOIlmCMlaTc/IsW3z2mWUPOfMyhDwZy3PO4mXw5Nwn4405Er6MkWAZF+cI+LkyviZjg3RJhkDGb+SxGXxONgAoktwu5nNTZGwtY5IoMoIt43kA4EjJX/DSL1jMzxPLD8XOzFouEiSniBkmXFOGjZMTi+HPz03ni8XMMA43jSPiMdiZGVkc4XIAZs/8WRR5bRmyIjvYODk4MG0tbb4o1H9d/JuS93aWXoR/7hlEH/jD9ld+mQ0AsKZltdn6h21pFQBd6wFQu/2HzWAvAIqyvnUOfXEeunxeUsTiLGcrq9zcXEsBn2spL+jv+p8Of0NffM9Svt3v5WF485M4knQxQ143bmZ6pkTEyM7icPkM5p+H+B8H/nUeFhH8JL6IL5RFRMumTCBMlrVbyBOIBZlChkD4n5r4D8P+pNm5lona+BHQllgCpSEaQH4eACgqESAJe2Qr0O99C8ZHA/nNi9GZmJ37z4L+fVe4TP7IFiR/jmNHRDK4ElHO7Jr8WgI0IABFQAPqQBvoAxPABLbAEbgAD+ADAkEoiARxYDHgghSQAUQgFxSAtaAYlIKtYCeoBnWgETSDNnAYdIFj4DQ4By6By2AE3AFSMA6egCnwCsxAEISFyBAVUod0IEPIHLKFWJAb5AMFQxFQHJQIJUNCSAIVQOugUqgcqobqoWboW+godBq6AA1Dt6BRaBL6FXoHIzAJpsFasBFsBbNgTzgIjoQXwcnwMjgfLoK3wJVwA3wQ7oRPw5fgEVgKP4GnEYAQETqiizARFsJGQpF4JAkRIauQEqQCaUDakB6kH7mKSJGnyFsUBkVFMVBMlAvKHxWF4qKWoVahNqOqUQdQnag+1FXUKGoK9RFNRmuizdHO6AB0LDoZnYsuRlegm9Ad6LPoEfQ4+hUGg6FjjDGOGH9MHCYVswKzGbMb0445hRnGjGGmsVisOtYc64oNxXKwYmwxtgp7EHsSewU7jn2DI+J0cLY4X1w8TogrxFXgWnAncFdwE7gZvBLeEO+MD8Xz8MvxZfhGfA9+CD+OnyEoE4wJroRIQiphLaGS0EY4S7hLeEEkEvWITsRwooC4hlhJPEQ8TxwlviVRSGYkNimBJCFtIe0nnSLdIr0gk8lGZA9yPFlM3kJuJp8h3ye/UaAqWCoEKPAUVivUKHQqXFF4pohXNFT0VFysmK9YoXhEcUjxqRJeyUiJrcRRWqVUo3RU6YbStDJV2UY5VDlDebNyi/IF5UcULMWI4kPhUYoo+yhnKGNUhKpPZVO51HXURupZ6jgNQzOmBdBSaaW0b2iDtCkVioqdSrRKnkqNynEVKR2hG9ED6On0Mvph+nX6O1UtVU9Vvuom1TbVK6qv1eaoeajx1UrU2tVG1N6pM9R91NPUt6l3qd/TQGmYaYRr5Grs0Tir8XQObY7LHO6ckjmH59zWhDXNNCM0V2ju0xzQnNbS1vLTytKq0jqj9VSbru2hnaq9Q/uE9qQOVcdNR6CzQ+ekzmOGCsOTkc6oZPQxpnQ1df11Jbr1uoO6M3rGelF6hXrtevf0Cfos/ST9Hfq9+lMGOgYhBgUGrQa3DfGGLMMUw12G/YavjYyNYow2GHUZPTJWMw4wzjduNb5rQjZxN1lm0mByzRRjyjJNM91tetkMNrM3SzGrMRsyh80dzAXmu82HLdAWThZCiwaLG0wS05OZw2xljlrSLYMtCy27LJ9ZGVjFW22z6rf6aG1vnW7daH3HhmITaFNo02Pzq62ZLde2xvbaXPJc37mr53bPfW5nbse322N3055qH2K/wb7X/oODo4PIoc1h0tHAMdGx1vEGi8YKY21mnXdCO3k5rXY65vTW2cFZ7HzY+RcXpkuaS4vLo3nG8/jzGueNueq5clzrXaVuDLdEt71uUnddd457g/sDD30PnkeTx4SnqWeq50HPZ17WXiKvDq/XbGf2SvYpb8Tbz7vEe9CH4hPlU+1z31fPN9m31XfKz95vhd8pf7R/kP82/xsBWgHcgOaAqUDHwJWBfUGkoAVB1UEPgs2CRcE9IXBIYMj2kLvzDecL53eFgtCA0O2h98KMw5aFfR+OCQ8Lrwl/GGETURDRv4C6YMmClgWvIr0iyyLvRJlESaJ6oxWjE6Kbo1/HeMeUx0hjrWJXxl6K04gTxHXHY+Oj45vipxf6LNy5cDzBPqE44foi40V5iy4s1licvvj4EsUlnCVHEtGJMYktie85oZwGzvTSgKW1S6e4bO4u7hOeB28Hb5Lvyi/nTyS5JpUnPUp2Td6ePJninlKR8lTAFlQLnqf6p9alvk4LTduf9ik9Jr09A5eRmHFUSBGmCfsytTPzMoezzLOKs6TLnJftXDYlChI1ZUPZi7K7xTTZz9SAxESyXjKa45ZTk/MmNzr3SJ5ynjBvYLnZ8k3LJ/J9879egVrBXdFboFuwtmB0pefK+lXQqqWrelfrry5aPb7Gb82BtYS1aWt/KLQuLC98uS5mXU+RVtGaorH1futbixWKRcU3NrhsqNuI2ijYOLhp7qaqTR9LeCUXS61LK0rfb+ZuvviVzVeVX33akrRlsMyhbM9WzFbh1uvb3LcdKFcuzy8f2x6yvXMHY0fJjpc7l+y8UGFXUbeLsEuyS1oZXNldZVC1tep9dUr1SI1XTXutZu2m2te7ebuv7PHY01anVVda926vYO/Ner/6zgajhop9mH05+x42Rjf2f836urlJo6m06cN+4X7pgYgDfc2Ozc0tmi1lrXCrpHXyYMLBy994f9Pdxmyrb6e3lx4ChySHHn+b+O31w0GHe4+wjrR9Z/hdbQe1o6QT6lzeOdWV0iXtjusePhp4tLfHpafje8vv9x/TPVZzXOV42QnCiaITn07mn5w+lXXq6enk02O9S3rvnIk9c60vvG/wbNDZ8+d8z53p9+w/ed71/LELzheOXmRd7LrkcKlzwH6g4wf7HzoGHQY7hxyHui87Xe4Znjd84or7ldNXva+euxZw7dLI/JHh61HXb95IuCG9ybv56Fb6ree3c27P3FlzF3235J7SvYr7mvcbfjT9sV3qID0+6j068GDBgztj3LEnP2X/9H686CH5YcWEzkTzI9tHxyZ9Jy8/Xvh4/EnWk5mnxT8r/1z7zOTZd794/DIwFTs1/lz0/NOvm1+ov9j/0u5l73TY9P1XGa9mXpe8UX9z4C3rbf+7mHcTM7nvse8rP5h+6PkY9PHup4xPn34D94Tz+49wZioAAABjUExURf////fetffelO/Wre/WjN7OpebOhN7OhN7Oe97Fe9a9hNa9c9athM61a8WtjNacWsWca86UWrWUa72UUs6MSrWEUq17UqV7Wox7a5xzUoxrUnNra3NrWntjUmNaUlJKSgAAAIa/w40AAAAhdFJOU///////////////////////////////////////////AJ/B0CEAAAAJcEhZcwAACxIAAAsSAdLdfvwAAAEsSURBVHicXZDNjtswDISHP4ost8Ve9lYYu+//VoGxtwDtJfU6EsnSCdCmJQTw8IkzQ+o7jjozNbn6gr+lj8YRe53t/PY/WSPQZWJ9QneyyiB2QCrW5R8SXnd2Dyo6Pr4/E348IR2lXF6fiJjCWFWCHHLZlj9EbTC7SP6IEVO5K97JrTAckwyAeId+O3IkOYNnmDT6vBWizOf65ZhZ0QQ4KfvPK9eJnDTk4UMGGin2a0MqtW7KdCe5fTib37bWRcYoCGPODMqZGX4ij714wE41Ri8vl01RXPhYlHyvluvAp921saabAS7axXpRMerz1zh8alft2ctgdStpk5PSlfU6HTeeWXse24uapMaIDL+sldrMoJcf4NZIc4/Usq5YPhoGG3H9hOynkkmTbP4beIqL5HGYwHAAAAAASUVORK5CYII=);\n    text-shadow: 0px 1px 2px #FFF; background-size: 17px 17px}\n#empireBoard #BuildTab table tbody tr td.building.winegrower0:not(:empty) {\n    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAUCAYAAAB4d5a9AAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAAASAAAAEgARslrPgAABQRJREFUOMuV1MuOHFcBxvH/OXWqurqqu6vdM56LZ3wZC5w4G8OCBSAQCCkSEjs2bBBSFlGMxIKd90hIvACWeAUktjwCQjFJhBNMhtie8fSkZ3r6Xvc6dc5hwYaFjcj3AP/f7lO8YcX8BZ7qPFxMP//9p+MPeTb7J23jcyMZcf/GPRbFnLTc8M2b32V3/8EvTVs97m4dvbal3oQ4Y0E6yqJgPJ+xTgvAMtMNx7mmcRW+ryhNhjY1ranelHo9orMrVJiE6fLkrXU9Z1VO0brGU4Lalqz0DOEbnIpZBjOGXkrj8q+GGF2CtT/J8vEHJ/VTTKdE1gLnBNZYdFPTESFeENDQoJ1Gu+arIQAOZz3p235vSCeaUBYtrXaUmcE5h0g0XQFN5jAJtJr/H6mzKSAinIkDf+c0zPbfDuRzgm6FaR1VZslmDnEA/X5Ar7NF38Tf34v2F222+rNzduP3R/8bsbpEeP6Pi+X4D+cnZ+EXH51xpS11CBZBMQe77lBHIVVkSasLzk7/9rNef/jT/tbtx73B4W+yzXTWG+y8HtHVHNXph+V8/L3F+UX49Mkzzk5mrCtBGA8JE0FgHG3XIFSJ2mk4LRd8/I9P2D3o+/f51q9uCRcn/VuP/htSALZZAiK2unq3Xpz/oLw4f3/xfMrkyyV5VXM9HvLO3j7KF1hhSW3Gy3RMXhSEMZioJfVrxuavgjnvHToYJbceZel01uvvoNpq0W/q8kdllv8wnZ+/v766CrPTBek8w5eSuNNh1OshBMSqg5CS5TKnsgIuQOxCnChMBWmz5ovqL8K04j3hBMng8FG6uZypJlv9bjOb/OL5i9Po2dPPOT27gFbwnaO7PDg4YFmWSCkpm5rxZkleN8yKDYO3fAZJRKsrZGCoU0e2dqhww8v6Q6E8+Z7viYvR8P5vVXH16uHl30/47NNjpqsNurZEgU/aVCRxxG6SsCoK5nXDvyaXTLOMOFHc3tlChYa8AuEE0RZIKTCNI+/MuXRPxG69++uoGh4rXaaIquXta9e5k4xY1TWx73OZbfjo7BWDTkimNfM0RbcGTwqGOz7Jnseq0hhjUYCnBEKAaaCtHZldMTHHUccd7KvWWPKmBiEY9npsDQbgHKuy4HhxSVZVaGsZdEMOt0cYYQj2S9pgTZs34AALtgYZgghA55AWFavehEqsUFmRc3w55eJqxXaSsNfr4Xsem7phWZZsioLtfp+v7e1xmAzRXsM8uSTfrDDWISRY45BW4EmwgBeAtQ6DxmJQSsO1KOKlvuLldEpRlgSeR9223EgSpIDr/T5HW1sMOiHnm5qrVxXCaKItiW4N64VjuC/oh5JaO6x1oAVSd5BOobJXOZFQxN0O803KYZIw6vWojUGbluPZlHVecjKf0REeZ4slxD637t4gcHA5zsgmGVHcIg8EnudopcOrQ5LikG4zQk1WCybrDUXdUOmWQmv2g4BICBZ5ThxGSF8hQ8WqLImSLl8/usm9u4coKZisJnySPcepKZ7X0lUS3Vh8EXBNbhOLHurmN45IP3vOnue4di1Gh4JxmaK0wzhLMuryzt277OxsIX0fKSRR3C97w93HUgj6vd2Hnduj7lg8xbhzrKyRQhJ4IUr6CCFQRw++TRh1qPP1fw4SwXxZMXkxI4ljbt4bsXPrwA227/wxCKMngOfgS+EFf0IIBt3ux3eS7Z+7sXl3nBeY3hQhwPdCpJDg4N+FYbSjpEdluAAAAABJRU5ErkJggg==);\n    text-shadow: 0px 1px 2px #FFF; background-size: 17px 17px}\n#empireBoard #BuildTab table tbody tr td.building.stonemason0:not(:empty) {\n    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAUCAMAAABPqWaPAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAGBQTFRFAAAA8d/I6N/WzcS26NG27Nq68ezjv7Gotq2fyLqk1s3EqJqRraSWsaSW2sit0c2/pJaIrZ+Rn5GDqJqN49bE39rR7Ojaloh639bIxLqtsZ+R+vXxsaia39HEjX9xsaSaTMajHAAAAAF0Uk5TAEDm2GYAAAAJcEhZcwAAAEgAAABIAEbJaz4AAADqSURBVChTpdDRboMwDAVQcBoTEqgDrkMAk/7/XzZM2tpufdt99NGVZTfNf9OCudhPYBE6138g69GHYeyvf4AAKYYhTL/Mkgf0M08hcnijmxFJZolVIvevlUwisHKc47u0IpT9Skhb7cSntAAnGNxFtdpTEmTyhiTtnlXHsb+8islIaTfzKcrXH/EkCCbt3aLOOVX9llSPSfkA1BLU6aTuHNsWs5cE4gXwXnjbmL86FjA7t66GThnKzMxx2yrcAKXuHIPr/ClLpfqgxh6ShOKkyjG6nO6lLHwe2xz1J55inIYwL+EALqXMNcsD5M0SNKvkKqsAAAAASUVORK5CYII=);\n    text-shadow: 0px 1px 2px #FFF; background-size: 19px 19px}\n#empireBoard #BuildTab table tbody tr td.building.glassblowing0:not(:empty) {\n    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAUCAYAAAB4d5a9AAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAAASAAAAEgARslrPgAABJxJREFUOBG9wcuKZGcBwPH/dz3n1DlVXdXVPe3ETHomMQaSjYLEUYgv4CZP4VpGwQjZZOvChxDyFBJcBATNQjfiIgbNMEmc7uq6nfv5bjJCgwxMsvP3g/8DwTdw3RYQ8zg1b4cQTKMqTIrkTE4Z+2egttUdvo7ma4Rui9Sm7Jvtz7tm9+s2SH1QkozAWg1jWc7fTYmP+AaaF/DtBill2da7R9vD7v0ntbNHc8EkC3IZiJnUImXvrBYnH3ddPc1mc15E8wLj2CGFfLg97N77y5Wz2zTHFBmZkURheDJpoTr/y0Ttk+8/6XZPfGbzTxIcdXnG/9KuvTlxU/+DPkg7qgxFYiGGKa+qP17dHO0XjTePW4nMFGVISJmAQKsE/x5U2Q37D1y7Cy/Nzbhart+NKX3Ec7Sfuneaev/h08kUo52jCTgx+NLzGyPiaYjJxCiwUqGVJCZwISGFZDvBv652srm5kt9/sNb5ib4/jAPP04Pz+VXrsn8MpRG5RYrERmhzMbXvr0SDjgNSFCgh0BLGEEhSEBP0XcfjL27wfct07zTFRJsQPE8HNXurS40dMcgoUVJQY5icVrUuaBNEEiklIhGXIkSQDrabaw6HIzPpyYUXWRrfPFuflq69aU255paMQp4GlMiNpLAKKUAIGDHsYklnzojSMsXI6CISiUqCpm7Yba4JbsLmOcJkwo3tr/p2/0gIWU7NNbfkFCWNlygSF5Uh15KU+K+QQNkCYwuUtrgUiSnhXGCz3dLUNcUs5/LBJdXFA3pV2rE7vueG+mGYOm7JTPjrLA3ppm5IMbDMNTEmfIj4GBl8ososhVaYFOndwM1+R725QmnNnW/f4+TsLk6XRDsnRm9SnGwKjlvSCv+301x2wnV8frVDi0hhBD4mXEgMPoFULHPNMtcI5/BDQzXLeOXykrOLu3zZeD7bdAwBktQkNFFobslqNv/9+uTkt/fnKe0Oe77at5RWIgU4nxh9oO5HpFLkNsM7h02OV1/5Fm+9dsnd1YIgYNP1NF7Sy4UOMvtxWVala655Ro79oVnl+g+vLnV7nk082R459hMzq4gkfIhMIbDvHTElTnLNd++/zJuv3eflszmnpeW8LMi0YoySYzCia/ePur7/0Tj2PCONLRYIOV/Ol399YynB9zzd1xQ6oUWiGXq0jLTTQDNFLs9P+d7lXc4XM5QUOB+5t8z4zqpi8oLHTeTLLszGwE/L+bKcmg3ST/1PDofN7z7ftw8HNWc+K+nHkWPbU1lJZiTCGJQ1LErLS+uKKCW9S8gkaKeA1ZJ1Zeh85HpM1Mky9Yefjc3+h37qkM45u+/H/NMa/dlYYYqKRVVQT5HCaF6/s+SsynnjbMHr64Jn/rkdeFo7YoRMSVICAeQK+gBfdZpt54suqreL1T2ljbXjIjNTVTfZ3w+JrFqwynMW1rAqDOvS0IWc89wiBXx6M+JCZF1KaufZ947cS0QUrGaa4iA4tp62sKJP5heyH/4k89ni46xaf5iJhNtfMY0Dwzgx+QEjA1oLVoWhMBJSYpo8uRIYJRhcwihBTInBB6wSnGWK09JgZwsm7NxHsfoPqKt+g05SC1UAAAAASUVORK5CYII=);\n    text-shadow: 0px 1px 2px #FFF; background-size: 19px 19px}\n#empireBoard #BuildTab table tbody tr td.building.alchemist0:not(:empty) {\n    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAUCAMAAABPqWaPAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAGBQTFRFAAAA8d+/9d+W1rZ638Sa8dq29ei69dqD48h60baN9eOf+uzR+uio7NatupZs8d+f+uOR6NGRza1sv5pfrY1oyKRj7Naa//G6/+yftpFa//r1/+yopH9RrYhW2rpx7NGDIqezSAAAAAF0Uk5TAEDm2GYAAAAJcEhZcwAAAEgAAABIAEbJaz4AAAD4SURBVCiRpY/ZcsMwCEUdLQZL3iQZO8RC+v+/jJpMm2mat/IGZw4Xuu6fdVHafAS2BxzsJ9IrcGawf5kfQVllBvOGrPdKTQa1nt82Wr+svQ8xprTRr7Muu3L+uGLiVvPLutz8ovrjvCrizFG26Sf9tjt3nOsKJYkUnTfzrUzVja42gJozVcr5MW+vVKeqrg4JMQqXwvICheoJkUvFJETCTxDGE1N0KxLrClqYRJ7GeASKu6uFOCJUlsRfOX1Qrn1Yr7XExKkAlCwtx/chBB0jroCRmFNbB5R57pYQzDCYHdaHwk0GQMlzZ+00Tda61upE0exmV4CUtztm+xM5HuXJowAAAABJRU5ErkJggg==);\n    text-shadow: 0px 1px 2px #FFF; background-size: 19px 19px}\n#empireBoard #BuildTab table tbody tr td.building.palace0:not(:empty) {\n    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAAASAAAAEgARslrPgAAA2BJREFUOBEFwU1rXVUUgOF3rb3P1725yU3TWJWohEJxUJ1aOlBQiujQiQNnIo6c+gsExwqCv8BB/0HFoQNxoKK2tIJtKNUYaz5u7kfuOWefvZbPw4M7n/rRwY9/zufnbw/u4u5yPjt55+jJL48e3r3tR38/OJ7N5u9fXKzicrHg8PHPzM/Pbx49+f23+z994wd//JDPTo8/12ZjjuV/r1ruvhra7mbq2tdy7r/ou9P9jY0Gd3bykL4U93erKk6fffH6xOz8s747fGU6XrPVLDVo+kQWhx+6FLcg3nDr7VhD9lDqZfessaxxxljGh3Z1lrI+kEJ/jfHoA8nHm1EL8ICWLyEHd95zqZ/HR9dwNmmaRF2tqEYVcWMPimdoVwOr0wUXXcBCJPhDtptjoOFiLkx2XiW2s4RUh3jbos0lRhFUM+Rt3LbAJoRYE8uBsHhEoSvq8pjg0KVMu4QYz4giEBgIPiNKopKGGDYgNECJSCQUI4oyoN0B2ClVdKJMGcTAhdSuiQioOJGBJhplFQgFuGTAgICIEDwj7SmpOyYVNbFsEHrcA9kyigACIGgo0FihwRDJOAEn4gQEJ4ihPmBpwIeMqCFqSFAigAiIAAhgCAkk41IAEQccQzAcMHfAUUkEBRHQdQd5ANxx67HUkrPiFgFFUBRDLGPmZAN3MAfLjpARG4iHJ7CbYVOcInV4rsm2jdAQyIgouIKDO5hBGpzVGlJf0vZCEyGC899caLOjVSZURgiBUAZ8GNAwYK503cC6c1Zr6DGiDEgTaXulrJW4u1Ox7hLuznIlSOWU0qG0xGGFlHOMmvVizcnS6NewWQujQiE4rSgSIlruvMxkc8JkLNS1EgslFIbIgHuHWwIMCU4ZYdzAqFY8G4uTGX2XCGVF1MuvM+gYWd4je09OiZg6irKlKnukMnJOWDCq6LQ9LBaZfrai65Vm+hyxHhF3965/N2/Gb3G+pXn9F4MM5LZFfU4rJdovsWTkQdDRCKxlnXaRsMX0yh7TK/uMp1eQ+XK1N3SLj3SYXfXh4qkW+aZz94bqE0S3Qd4AuwQ+x/P35PyYlG89tbR9Oyj36o2tF8qqOhJ3BxDA2y69ebE8/Xpxdv/aOM4QE8ymuAfAwM/I3tGynyY7+99uTLY+tpz/GY8b/geGd+pmTCUDLQAAAABJRU5ErkJggg==);\n    text-shadow: 0px 1px 2px #FFF; background-size: 19px 19px}",
      );
    if (database.settings.smallFont.value)
      GM_addStyle("#empireBoard {font-size:11px}");
    if (database.settings.hourlyRess.value)
      GM_addStyle(
        "span.resourceProduction {display: none;} #js_GlobalMenu_wood, #js_GlobalMenu_wine, #js_GlobalMenu_marble, #js_GlobalMenu_crystal, #js_GlobalMenu_sulfur {position:absolute; top:0px; right:0px}",
      );
    if (database.settings.wineOut.value)
      GM_addStyle("#wineOutTable { display: none;}");
    if (database.settings.onIkaLogs.value)
      addScript("https://ikalogs.ru/js/etc/script.js");
    if (database.settings.newsTicker.value)
      GM_addStyle(
        "#GF_toolbar #mmoNewsticker {visibility: hidden !important;}",
      );
    if (database.settings.event.value)
      GM_addStyle(
        "#eventDiv, #genericPopup{display: none;}\n #redVsBlueInfo, #redVsBlueInfo_c {visibility: hidden !important;}",
      );
    if (database.settings.birdSwarm.value)
      GM_addStyle(".bird_swarm {visibility: hidden !important;}");
    if (database.settings.walkers.value)
      GM_addStyle("#walkers {visibility: hidden !important;}");
    if (database.settings.controlCenter.value)
      GM_addStyle(
        "#js_toggleControlsOn, #mapControls, div.footerleft, div.footerright {display: none;}",
      );
    if (database.settings.withoutFable.value)
      GM_addStyle(
        "#buildUnits li.unit > div > p, div.buildingimg > p, div.buildingDescription > p:nth-child(2), #tavernDesc > p:nth-child(1), .content_left > p:nth-child(3), .ad_banner, #premiumOffers p:first-child {display: none;}\n #buildUnits li.unit > div img {transform: scale(0.7);}\n ul#buildings div.buildinginfo img {transform: scale(0.7);}",
      );
    if (isChrome && database.settings.withoutFable.value)
      GM_addStyle(
        "ul#buildings div.buildinginfo img {-webkit-transform: scale(0.7);}\n #buildUnits li.unit > div img {-webkit-transform: scale(0.8);}",
      );
    if (database.settings.ambrosiaPay.value)
      GM_addStyle(
        '#confirmResourcePremiumBuy, #confirmResourcePremiumBuy_c, #premiumResourceShop, #premiumResourceShop_c, #premiumOffers tr.resourceShop, div.resourceShopButton, #individualOfferBuildingSpeedup, #premium_btn, div.premiumOfferBox.highlightbox.twoCols, div.actionButton:nth-child(3) { display: none;} \n li.order {visibility: hidden !important;} \n #js_viewCityMenu ul.menu_slots li[onclick*="view=premiumResourceShop"] { position:absolute; top:-1000px; left:-1000px;}',
      );
    if (database.settings.noPiracy.value)
      GM_addStyle("#position17, #pirateFortressShip {display: none;}");
    if (Constant.Buildings.PIRATE_FORTRESS !== 0)
      GM_addStyle("#pirateFortressBackground{visibility: hidden !important;}");
    GM_addStyle(
      '/*!\n* jQuery UI CSS Framework 1.8.21\n*\n* Copyright 2012, AUTHORS.txt (http://jqueryui.com/about)\n* Dual licensed under the MIT or GPL Version 2 licenses.\n* http://jquery.org/license\n*\n* http://docs.jquery.com/UI/Theming/API\n*/\n\n/* Layout helpers\n----------------------------------*/\n.ui-helper-hidden {\n    display: none;\n}\n\n.ui-helper-hidden-accessible {\n    position: absolute !important;\n    clip: rect(1px, 1px, 1px, 1px);\n    clip: rect(1px, 1px, 1px, 1px);\n}\n\n.ui-helper-reset {\n    margin: 0;\n    padding: 0;\n    border: 0;\n    outline: 0;\n    line-height: 1.3;\n    text-decoration: none;\n    font-size: 100%;\n    list-style: none;\n}\n\n.ui-helper-clearfix:before, .ui-helper-clearfix:after {\n    content: "";\n    display: table;\n}\n\n.ui-helper-clearfix:after {\n    clear: both;\n}\n\n.ui-helper-clearfix {\n    zoom: 1;\n}\n\n.ui-helper-zfix {\n    width: 100%;\n    height: 100%;\n    top: 0;\n    left: 0;\n    position: absolute;\n    opacity: 0;\n    filter: Alpha(Opacity = 0);\n}\n\n/* Interaction Cues\n----------------------------------*/\n.ui-state-disabled {\n    cursor: default !important;\n}\n\n/* Icons\n----------------------------------*/\n\n/* states and images */\n.ui-icon {\n    display: block;\n    text-indent: -99999px;\n    overflow: hidden;\n    background-repeat: no-repeat;\n}\n\n/* Misc visuals\n----------------------------------*/\n\n/* Overlays */\n.ui-widget-overlay {\n    position: absolute;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n}\n\n/*!\n* jQuery UI CSS Framework 1.8.21\n*\n* Copyright 2012, AUTHORS.txt (http://jqueryui.com/about)\n* Dual licensed under the MIT or GPL Version 2 licenses.\n* http://jquery.org/license\n*\n* http://docs.jquery.com/UI/Theming/API\n*\n* To view and modify this theme, visit http://jqueryui.com/themeroller/?ffDefault=Verdana,Arial,sans-serif&fwDefault=bold&fsDefault=1em&cornerRadius=4px&bgColorHeader=F8E7B3&bgTextureHeader=03_highlight_soft.png&bgImgOpacityHeader=75&borderColorHeader=ffffff&fcHeader=542c0f&iconColorHeader=542C0F&bgColorContent=f6ebba&bgTextureContent=01_flat.png&bgImgOpacityContent=75&borderColorContent=eccf8e&fcContent=542c0f&iconColorContent=542c0f&bgColorDefault=eccf8e&bgTextureDefault=02_glass.png&bgImgOpacityDefault=75&borderColorDefault=eccf8e&fcDefault=542c0f&iconColorDefault=542c0f&bgColorHover=f6ebba&bgTextureHover=02_glass.png&bgImgOpacityHover=75&borderColorHover=eccf8e&fcHover=542c0f&iconColorHover=542c0f&bgColorActive=f6ebba&bgTextureActive=02_glass.png&bgImgOpacityActive=65&borderColorActive=eccf8e&fcActive=542c0f&iconColorActive=542c0f&bgColorHighlight=f6ebba&bgTextureHighlight=07_diagonals_medium.png&bgImgOpacityHighlight=100&borderColorHighlight=eccf8e&fcHighlight=542c0f&iconColorHighlight=542c0f&bgColorError=f6ebba&bgTextureError=05_inset_soft.png&bgImgOpacityError=95&borderColorError=cd0a0a&fcError=cd0a0a&iconColorError=cd0a0a&bgColorOverlay=aaaaaa&bgTextureOverlay=07_diagonals_medium.png&bgImgOpacityOverlay=75&opacityOverlay=30&bgColorShadow=aaaaaa&bgTextureShadow=01_flat.png&bgImgOpacityShadow=0&opacityShadow=30&thicknessShadow=8px&offsetTopShadow=-8px&offsetLeftShadow=-8px&cornerRadiusShadow=8px\n*/\n\n/* Component containers\n----------------------------------*/\n.ui-widget {\n    font-family: Arial, Helvetica, sans-serif;\n    font-size: 1em;\n}\n\n.ui-widget .ui-widget {\n    font-size: 1em;\n}\n\n.ui-widget input, .ui-widget select, .ui-widget textarea, .ui-widget button {\n    font-family: Arial, Helvetica, sans-serif;\n    font-size: 1em;\n}\n\n.ui-widget-content {\n    border: 1px solid #eccf8e;\n    background: #f6ebba url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAABkCAYAAAD0ZHJ6AAAAfUlEQVRoge3OMQGAIAAAQaR/Iiq5u0oEhht0+Etw13Ovd/zY/DpwUlAVVAVVQVVQFVQFVUFVUBVUBVVBVVAVVAVVQVVQFVQFVUFVUBVUBVVBVVAVVAVVQVVQFVQFVUFVUBVUBVVBVVAVVAVVQVVQFVQFVUFVUBVUBVVBVVBtVtsEYluRKCAAAAAASUVORK5CYII=") 50% 50% repeat-x;\n    color: #542c0f;\n}\n\n.ui-widget-content a {\n    color: #542c0f;\n}\n\n.ui-widget-header {\n    border: 1px solid #ffffff;\n    background: #f8e7b3 url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAABkCAYAAAEwK2r2AAAAY0lEQVQYlaWPMQ6DQAwER/v/7+UhQTRH7N00QEESiUAzki17vOb1fEQAR8QDpSaUmhHkYwSAb4LEKD2vAryc3/2JpFC8IDzWfHgg0qcEd47/haT3VEZxbWUKQW89GhFffeEi3kGvSQXcQU8oAAAAAElFTkSuQmCC") 50% 50% repeat-x;\n    color: #542c0f;\n    font-weight: bold;\n}\n\n.ui-widget-header a {\n    color: #542c0f;\n}\n\n/* Interaction states\n----------------------------------*/\n.ui-state-default, .ui-widget-content .ui-state-default, .ui-widget-header .ui-state-default {\n    border: 1px solid #eccf8e;\n    background: #eccf8e url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAGQCAYAAABvWArbAAAASklEQVQ4je3Puw2EABAD0fGw9F8KFSFqgJTgCPhEFHBCmzxN4sCs8/QToGmaz7JvC5JgMiAnhbEwjoiFPpXUXda1SPyHM03TvHEAd0QJtjgD5PAAAAAASUVORK5CYII=") 50% 50% repeat-x;\n    font-weight: bold;\n    color: #542c0f;\n}\n\n.ui-state-default a, .ui-state-default a:link, .ui-state-default a:visited {\n    color: #542c0f;\n    text-decoration: none;\n}\n\n.ui-state-hover, .ui-widget-content .ui-state-hover, .ui-widget-header .ui-state-hover, .ui-state-focus, .ui-widget-content .ui-state-focus, .ui-widget-header .ui-state-focus {\n    border: 1px solid #eccf8e;\n    background: #f6ebba url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAGQCAYAAABvWArbAAAAR0lEQVQ4je3PMQrAIABD0Z/o/Y/Wk3RwLBSqg0KXHkBKlkeGv4SrHd0AIYTf8twnBmEkDF5IBTMxlupaM1HB0ht7hzMhhC8GEiwJ5YKag9EAAAAASUVORK5CYII=") 50% 50% repeat-x;\n    font-weight: bold;\n    color: #542c0f;\n}\n\n.ui-state-hover a, .ui-state-hover a:hover {\n    color: #542c0f;\n    text-decoration: none;\n}\n\n.ui-state-active, .ui-widget-content .ui-state-active, .ui-widget-header .ui-state-active {\n    border: 1px solid #eccf8e;\n    background: #f6ebba url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAGQCAYAAABvWArbAAAARklEQVQ4je3PsQnAMBBD0S9l/8kyTFIaDDkXBkMgA5ig5iEdXCHafZYBQgi/5ekXrlmFpQNLxmDMTOv2rrU+kHYYE0L4YgB9ewvfYTVHjwAAAABJRU5ErkJggg==") 50% 50% repeat-x;\n    font-weight: bold;\n    color: #542c0f;\n}\n\n.ui-state-active a, .ui-state-active a:link, .ui-state-active a:visited {\n    color: #542c0f;\n    text-decoration: none;\n}\n\n.ui-widget :active {\n    outline: none;\n}\n\n/* Interaction Cues\n----------------------------------*/\n.ui-state-highlight, .ui-widget-content .ui-state-highlight, .ui-widget-header .ui-state-highlight {\n    border: 1px solid #eccf8e;\n    background: #f6ebba url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAjElEQVRYhe2UOwqAMBAFx2DlMbz/kSS3MIUIWij4aZ/gK952YZohu0y3zNPGOWur3Kcfxsf7D16c5YBD0FUOoDjLAdeKHeXWVi9BRzk4f9BVDqA4y8HrBt3k0sEveDqo8nRQ5emgytNBlaeDKk8HVZ4OqjwdVHk6qPJ0UOXpoMrTQZWngypPB1Vu38EdG7NcOPXFHAMAAAAASUVORK5CYII=") 50% 50% repeat;\n    color: #542c0f;\n}\n\n.ui-state-highlight a, .ui-widget-content .ui-state-highlight a, .ui-widget-header .ui-state-highlight a {\n    color: #542c0f;\n}\n\n.ui-state-error, .ui-widget-content .ui-state-error, .ui-widget-header .ui-state-error {\n    border: 1px solid #cd0a0a;\n    background: #f6ebba url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAABkCAYAAABHLFpgAAAASElEQVQYld2PMQ6DUBTDbP/7X4grde/6GACpjN0QS+QkyhC+n20CeI3MQChJJ4GEka7LEtkiRsJF2llw0G02SP5k0oxPOP2P7E3MCpW4kdm7AAAAAElFTkSuQmCC") 50% bottom repeat-x;\n    color: #cd0a0a;\n}\n\n.ui-state-error a, .ui-widget-content .ui-state-error a, .ui-widget-header .ui-state-error a {\n    color: #cd0a0a;\n}\n\n.ui-state-error-text, .ui-widget-content .ui-state-error-text, .ui-widget-header .ui-state-error-text {\n    color: #cd0a0a;\n}\n\n.ui-priority-primary, .ui-widget-content .ui-priority-primary, .ui-widget-header .ui-priority-primary {\n    font-weight: bold;\n}\n\n.ui-priority-secondary, .ui-widget-content .ui-priority-secondary, .ui-widget-header .ui-priority-secondary {\n    opacity: .7;\n    filter: Alpha(Opacity = 70);\n    font-weight: normal;\n}\n\n.ui-state-disabled, .ui-widget-content .ui-state-disabled, .ui-widget-header .ui-state-disabled {\n    opacity: .35;\n    filter: Alpha(Opacity = 35);\n    background-image: none;\n}\n\n/* Icons\n----------------------------------*/\n\n/* states and images */\n.ui-icon {\n    width: 16px;\n    height: 16px;\n}\n\n.ui-state-error .ui-icon, .ui-state-error-text .ui-icon {\n    background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAADwCAMAAADYSUr5AAAA7VBMVEXMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzMCgzrDkZjAAAATnRSTlMAGBAyBAhQv4OZLiJUcEBmYBoSzQwgPBZCSEoeWiYwUiyFNIeBw2rJz8c4RBy9uXyrtaWNqa2zKP2fJO8KBgKPo2KVoa9s351GPm5+kWho0kj9AAAPhUlEQVR4nO1djWLbthEGyUiq5YSSLXtp7FpLOmfzkmxr126tmi2p03RJ1/Xe/3EGgARxPyAgRbIk2/hkSz4CJO4+HsE7AJSVysjI2AMUUOxahZ2iANhzBtZWr4BoIRSYAVN5u4QwDwQDRbcwfUi5KS3wFuDmFnQLa4Dtb//cqktwD5QEFFwfUs7PoCCA7y4bEJVFizcIob8KmhAplwwqVjt+9FBl3uINQniwEiryEyw9JHqGpQdEFNi+B4QQ7QOiHhysIPoAxUqxvdvvA9K42bsAv4S2fxfYOe57IJSRkZGRkZGxx7jxSHDHcRBXQMTyIjInBgHwBJ/bEx8PEANC+uhbpSSggCBAVODVabpI1S/k4WLZpTn6NpMhoX9Y40hxYERFpMcqUs4AloCtDQdID1YhnyXZ2hLjAYWiO9Dy1PDB7tPhIqLx+uMB8grZaR+Qxl2/C2RkZGRkZGRk7A7rBf7J0DR5/LUTjzUPIPSPGvQJiVJiB7kcQCiUOJrcFNtDZIf2xarQ3aGvLNxAVIFAabz90BFiBIlycTBhgWwOWCH0FLYHlPqwHaCvcIn2ZbosCevfPTRiFFcgvHukCjWwrc3GrGh1fsAof8EaUReKXkCB4/MzFNo97qLpFiKFYv/kNR5YQxQbQEofkZ2OuEOHqqT6gFTpru8CN7x/+jaZkZGRkZGRcV+x/rLUNcMMqUAscgnFocmpqkTzqymwVAPxfJ5PnIUUQOUKT04tEdWZyv3JCQSn96WS4pD97QfyW25A7NhSAbyhmVj0FEltA4vdiygBibXhoUYgykCUP7HwPTDeEqAIcHVMkZg7Zx4k0uFANs63hPQXCoRLAwdgGsr9Az7Qv7sgQGgg1aPl/BJLExBWgG4RFRLFImGmIquPC/klEGyCG0AuAXaJJC+B8FVe9NYQDEcXB8g6AQcjYJ1goJIggHWCrFR0S6kRHN5+4BzFi8NaoN35NRxUvL+JJdZr7PV4wK6fj8nIyMjIyNhr3OxdXAYq7FHZwB6bDSzSh4sF0utChqo0NAvaT1hLzXwFinmCzmeDucEQK18TTaQoFgP7bNC+RZ4OT4T6gQogDFYk+1QxQlj19QGSAWKiLYp8P0Ag1Gbz1ULfWHLg9iUnQNK5QQJcukm04blKLH2GgEJCY+HzXAZWCvHKco3Bp6MIaCjSXXRJyOxeqhnzEaF93MfFGW/O16ZvDL5TM4MJIjujz/cHypkQuuzRwWJ93BKdIt+wCRAPl9kpe2Ikkb2mFgGlxh/i40d3EHfdvoyMjIyMu43ylt/IAmGHnN5iIt7wKfbv01RAcJqFRl9lcjYQSnbQqKgC4fYOwSJt6N6trE0twZ9kN/PqNpTQeICvr4TLsDYC06U7BMjshS+v1/aT7IwQYD5LcgRQXMT2FrBfBLjZ6151jDElk9tPFfpUgk2yregusX25BJbwAFEfM+YI6vGAti4bTtizB+TjfQCrERyhKb2X8D6A9wX75P4t4neBYJeP6pdhg/gQl8MWvytzeSTjgOQBynQdh/iXKdxOrGJ/RkZGRsb9QmXihGr5+g8GGg9uTh+KoVZuNIzV+CwRucFBEyr1mVjx4irOxwM1BhirB6Q+2eNQi4eqR+aF6mELtoMzCR7V9RAFe/ZvQogNiyY8FPSUTFsLp8TeTmMui5mtw7bcaT0Yw2AA4wFRQIlkgq+1DQrNhkmoxS5Jq+u6bMAIGRECEANgXHTgWzwgBOhDH2l0oTQ4D8D5NMktBgNywAEMjo8rwATMZrPY7JGxBoJCkIBDQiAY09EGTUiBCWkUpISfGPR5AAwBfZiG2z7Ayc1yeKTxid39xBNwfHr4O0LA48ePFTvhYrF1r4tyAoz9n2MCqEuBtp/6GDR0oAYfG/R6wJExHYZHfhygsv7fEWCOj4bYmsP5A+pL4MkTfAnMlD4F+r3bobKvTyTA2P/w7PN+Agq2QW8piqMCpTBwenoKvX0AHGkGtP2YAPvTEWA7QUTAudn7/NxtOG46wWNmDtpBEkBzN7rBEvAFHp+YTB/q97qPAN4gHFqgBi8uLsC7qPCA6mg41G/+ErByPwEXDdoNxRhOx+M5jPEzQugS0ht+b1/Y3gEnYMAIAOIBE29/hIDucE8tmMsNOgK4B1RHFu4UCRlMHzv0xzcajcfdXWDs2h8TArBCkoDUJYDLmz6w7ip3BFS0ve5wTRwAn6keMA9I3QYbfSZ0DKbyt+7OXjGI1idPcfNyAyfAMlCrzaGqphYrxHocLHRJVycnfGUcbtT+jIyMjIw9x7Nn8fJSzG0TmFtO8rZT+XT3S3ub+tKJbbLd5diTVp50+zahyeHSslJ/YPrU0fuazrZO2CZ92/ZCCVXlGRiZKPJyPPRxyIFWeXLQBXJBKiq/3divEAN6ZwM200Qjm7EJBZeWm/PRWVCbYK7s7u2l4XaCz+lzgOfMfhMonXr7TWzeZb98dbgIzBT8Ub8eYYUqfZ4rVJ/MDbIDgPqTulJ/xvntWAtjIisqnwxOkGz0n077FARoY79GdA6HPE4rOy196NiMWHTZlSSApcOgXpy/fHV2joaNKu3ffsAnRcBf4K/6NcIG6tIxk3HyoXPjASqfUgXbYN5PzpL2njkR9QMjeDTVHDTCgRuxOegjoO0FvKzP/t/gmVdI24+G7NIe8JX6Wv3dDyldMA+4YB5wwTygtd+dwRqaTqrLb1l73zTSN52CNpnHuQOYPsDblybgxfkXh/oVtr+N1DEBJdhRJyd/Bd/q1z+cbNrD17iVKyajcnv9arhOkRPgsruuD6DmNPwpDNrLw2CoTgHni4yALr0L29+tiKAEIPn868ejx//8rpWP3OEOl5On9OwpcQm0MhafP/ey8f1uvDNIgGLQG8z4YO99ENgg95etwv4uYJYY8fUGHYH6j6fscHFZMftlAl9i+9XL73X3N/n+ZStOzfVfRvYXhrbdKOpEgVQTg/wsDuDD3kwOfQNMTJ5y+/ltUDWLunyxnRF46IqlBzGMY4X7inggREFioIyMjIyMHWCIB6ZNKAcXseo3vLTQTkVE7348dlwJJSz0+wLfmi8BhZqfw3D4ww/wHVLnEd5/fgYvXsDZ3MlsvYUbbnDjDZ3MN3TJG4+bxjAaDl8TBri9qxEw1ccao2wTNAMLHo2f+sjrXwb/9qHoYqgPMBXJTVfOpmrZH23y6uvo0LHSyY6fHGwKfHJlAuMFvObjDYrIqxBgQi20h7Hd/nYVLmno+eaNUm/eeH2GCuopntnhBJAlI2AHo9CCh1I1QxUdAbqqGY9BBLwyc3W4wYVhvY8A4BoIc1l5M7vnPWphZW9/Ses3n37y9a0uGqFwFQZsQQbd386DogpgEk+dzynsAZMJXq8+ns9NeukJ0PYrNATGGefJQlhkLo7DTXr+y3bNiOsDvrXTz/C2q1DXZH84iRNwrP88Nj+u2DjYEE6RBxD9Knj16ujVHC67A7422o02RwD3gB+t7EblWvu9geOFxSnd3ROmT+nJyQkhoPlsxVONc/3TEdBos+jtA+ZzcwHgTvD1cDjaYCcItA8w9i88A8b+mqSjc6Pvqd998QguEQPmQMeo23ODN86+p0/bn1buBkT6+oBhNZ/PYY4ZAHYb3PRd4LkZmPX68NRtMZn4ASvdA+qf0jMA5MP9eeg28Nug9QiLnj5A33U1MAES6xHAUNpz/9zFAYE1gqQDMT3G6xI9pwdw/aIgKoHCS1YGlRnSq9yCjdXjgN3j+N27YyROHxmuNAeNKPpYuXIyIyMjYy0M8eros59MF/PT2c602T7eA7zvhJ9dr/vzDjXaLp4Yc5+0wllzxzHv3gdmMMM7/CcQzKgVBqYTmFn+Z+mKm8J7k0A5F/jgCfjQ1WBhQyiOqD0lYuqBb+AyzMw9Ha2G3m6c8qQx+AlqnIceQp+Sb6i9UyQWbhr54+AjnZ0VzW2TAN0DmBT6PWmc6jDBE2PK2u+nF43dyP7Q0t1pOcX2fdRvH0mF2Q4JqN35rnHjVIeaXfIAVyUuw/aHCCiJy9iF5l1621zweI8KZrPZ9iJdb7DXJ3US0OSrtZ10imt7wHY7QesAzUMz1oZ3noB3qFJ/H18j97FYuw8QDN4oeKf30osvcSW2ExLo+VcbuAuo/sUIm8fMG9xocO3Ea19J9gFYivnHJ2KnyfovZlgW3v6ySx32abQiIyMjIyPjhlFDTLxpwIgFMnTp6A3g4IDKNY+stkwAMAoIAbasxBXqUWneSAWTMjt50lTqT29rFjvXohjsDNm2YPXDFlICmrJOZ3t6tHm8AiEAl0sCeLIIorIRt+cFbew/QRsoAXb4o1XSfoywzm0FTMAoYBNvLyFu8v8HpLBtD1iKgC17wHb7AI6d9wFbvguAIGTHd4E9wG7jgIyMjIyM+434c2R3HeV/Ffx6jtZu6ijl8h59T655jhR+rdHzDOP6beABCheb8O8/WFXeOyzgf5oAhVYnKxP7CwaAf1afJu8bSrhS6tdaXeGnrRenOqOlz9d6QwYnA/3TLd+GE7qe3chA5YF5DfY0vK3adfOX/gyNp2BW25MHdxAB9qvRiiP3/XpQQFGYDU4+Mi///XumXG8pjvaUAOsBGlf4jJt+YYEzeEzAdw06F19R3juM7D1wita86GR0CKfDHgLuXCc4Bri6vMLdfjMc4VNSUNsdodo2xu/1+Xl/K5+az8jIyMhYG/z5gJTMF1GtKq/a3rpyCvz5gJTMl9GtKq/a3rpyCmfQ4WwZmS+kXFVetb115ST48wEf/AGcfG1iw+tWbpbS2vJ3nQxcVr3lH3z5h972FUTLzYpOVk7l5hD+eYcYwDcAnewOotrZ4OtrPDucqi/LRX0/RR4qx7Nn4U8g+qjffvuN6Gf+nC85vwauHjaYyubqvWYKY4VEfSUMitdnBCT1Ue63R5439m+OgCn6DroAAaHPVQxKth/wkJgHmG8bmQMsT0D6EjDfvhVRKO3ywOQUgRA7nmL1uawZmHf1k+DPBwQ6NdcJ+k6Md1LA5f5ONdhJ8vZ5J0vLHT99srkGOjmJbd/G1r2Nriqnse1AZt1AalU5jW2HsuuG0qvKGRkZGRkZGRG0gcONyXsP9v8D0/IdJADiBNiXl3327WRGgOL/9HC/0XwlIURkRhC4tz6Z/fu7fUf2gHvfB9z3u0BGRkZGRkbGplHcnkgguQoSqtUXuhbs/wPtMwqV0HUJAvj5vk32b8IDuL23yn7qAXZ5u32hbRX7d3o82Df1FZXvbh9QOfhyxldr/+3xgXU9oKmvsHyr7F/XA269/eveBXrsv7N9QALe/tvjA0kPWAXGbvebkbHn+D/J5nMcHzx1UAAAAABJRU5ErkJggg==");\n}\n\n.ui-icon, .ui-widget-content .ui-icon, .ui-widget-header .ui-icon, .ui-state-default .ui-icon, .ui-state-hover .ui-icon, .ui-state-focus .ui-icon, .ui-state-active .ui-icon, .ui-state-highlight .ui-icon {\n    background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAADwCAMAAAGvTnpvAAAA7VBMVEVULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxULgxwjo40AAAATnRSTlMAGBAyBAhQv4OZLiJUcEBmYBoSzQwgPBZCSEoeWiYwUiyFNIeBw2rJz8c4RBy9uXyrtaWNqa2zKP2fJO8KBgKPo2KVoa9s351GPm5+kWho0kj9AAATX0lEQVR4nO1dC2PbthEGyUpaqJii/JgbZ3bTLNmyJns/Oi1bM7vp0q7r/f+fM+JxwOEAkNTTSoxPlqHD83AE7gAQBIUYBHSfQv0XnbsJgH02A3g5ibVzDFNtlkPI1VjIuOUa8eMclOLS1uRSPBETURnOrkbmID9T9fuPyu+cSGYYKya5efeddN9TRS1H8eD4kDjrPutBpptt2apkiqX57A4gfloj7ua9AXMQ3dWvNs8n7NCwZk6bqYSg1CgNsaCBHDAluMQjcihEWBNYSxamUYNMs15KmwMUKhm0S5UBwMQFjcqxelSYskHBtLC26X7/eWQtVB1MaWXzF1OrUyhLgOrFiBwalDwg6+tigfzbnNbM40UlTrrO3clTftcuX7jyY9gkv81RVWI9K0OxNa8Hruw+EFctu6xaqDhCGkjQ2hyMitiXKyR+7xSqx6u6AitlpI3wrBj5OSo5xv8ZShoq5VZE+p/hb/OVzuPHyHGXQLoug9b4af/OzArAqtlvq8PidqZSflOYigVIpTZ33192wQ1jHVXLgjWWeZdAfhn3UteqH43NI9EGSjns7CJ//g8h6o6++UrLBTrOZJUkhy4NxDNAblZld53kJZl34z4jE5cB0HbA5RHnzg9Txud28wwG4aS1pwzKH7t/IyxlEvW2XVQLcf0vyeCWfL9j39vk95iA1alinhtmcHDr34tiSDECRgCXwFMgynMfrB0PlAxMhdUoPyKDo7qq2yNZHa+Li9BQoynz/I9DNkNcFCQSVi2aQbTOJA7S1tIXYpwM9t+PgBYzwFI0mNdt9JjxuGBHXJuwuJO+fq8KYzpDLtDll1XoYZ6k53P9dUNdNzwQZTcsvLw0Cafa0snfyq/WGVUVDo/VxBxXF5ynLZn6zUO/FvTIdjeiw3VUeyUqv7Q5+dIiz+W/VoTs03r+4U/ERpyHVbkIFAU44dGMKQBZfrwrGeAl4litNO9TVGFXRN1TDlfTyGVqdQaVEV7T0ZNJGO/NTQ9nL18aDk29b2Ui2SaqfhltIIMn4gpz+k+TiNNXkjf0LYWzf+DXO4UzHuF49WYS9pIIN3mjcoga1CNDuZ3kKzlja00XXS71OHFZjBhkI1K98WCQ/QC/r9n3qudrYVVea6aE9iP8L1A/KnWuJMZ+jwiyz+P3SFkcguW26os1MoON1p+35uAIgB3fXnzm2hscgvkD0PBi23t8YcEsP2u+gEUvdsXAg4VrA0y2zD/ZBgCjbz07ZNd4bBvYHQMPFcBFznsTv/hBOj9hkE0yvyRHcYZCK5VoEwGHQwU+dJBlX08BOMGx8MBk+I2oMHdQbLZFkGDADfVBQcmCx8Nb6S6fwJqRehFktWEAVsSA0yNP5DQm8wcW6tNr9D/T6PzGVgS2gP3iCoyPB/L4YF2A2ZICUKoZI06GSjdZYhdlxzeOLANIWxfoGkaofzK2BDRlWaq76VMAuRDbiXyhQiYTtV1L7hBS64vLpRJ/xbYMQRcPVPRT4802P5ruaHvrAv3BtDmzxwz3IsFcru92uL4GysByOVV7H4Rx7Xaqax2xvqiNEQId74svvjAcglfgwis/o+vnFdpxsCJHV8uomprlYHfNpPvrV79B4+G75+dG5i3NEGBh0+urAGWrXZ1uItAYmWJNQl28cCs1pd6/AX+c/Q0znEddU8OOLjEDWWF4qcsp8d7DgweI1Vv85bs8or6kK+g+8scLc22/Ed/oVI3WF9iGKrNzybSd8sQsS9u2sFyqiPXbaWpgH2Xg3x0Dclm+whsRABfKOXlh2tCpCqhMo3wGz54pBkxbsAxUN0ejCKbq/xXAt/dS/BPA9VC+EFC6jiTkrS8w3Raj+Sp2U/vcdFdGprxDRcPbAOa7LwYyOtEZlWh08EyUjdA/GtU4Gjs+bDxRN0bi6HbezUEZQGzNwIMHiB+NDMugG1UD7o4YwLne9MIbbEYGKNT9dIA2gLs/ALzrc1PphlwOAO/BC/n7Vk/DuL+lE67wdleAuQEH8sEik0/U0KMNuDMF3XWkvO3+wdDEFZQm6Vh6pAX47qfXeHYGMwcMXHc/wHc/PQYyAslWXNUPjNf3xEAlocNxqJjbQEYcW6sHO6bEH/6+VSgKf75S2AReOLiEa5Y/dEuF3/yKd0ootu+mvgQCzYt04TNUmPsNG0tga4ze+ZSRkYK3DiJCPYDdAb2ZHiiA78JZt/yge6XcIk67fLbVA1jASD1QILmlBDIy9o7Bxsn1APMeG5/b6SB9cHc9sO9sApTgPNXfXbJUuC2AxWPjjUiOzI3Hc8UmphFJCWQ8eAwehjEYbs2338j4cD+Vn4vgNfOwURsvXhxPDzwDay39+UVkOhCsiHrhwPovDyfxPIXC0xVJPeBqWlCPgvVzJ0FWgPEtyGZUxuCe9MB9zUcydgZ7BdksfFhBGKTM8tg2BkGHTlnJuEKx/d56r9m6gRXF7+ByBiJW11NAm8AoCKvj9HyfP7SfkkAwkjq0nc/jio8frDsFw+P0cYU7uvrh4NWz53avCrHwyOAuOAhvZiV6HVMIUk/uyA6GEwJGl0bReIzu8CZc0AY44o0gd/9PBvIcKObhX91HzAPMHrUK2L0tqD/T/oAbEAVx56B3qorHj9VZBNJHBTSN2lQrThpbkD4EC/RmWWQAhN78BuA2yanYE9x9e1pp9+yMdWug0QXeRJ+b8krTnxr80fGjU1xeegxMBSx1Rrr8EnS8y0t5aIIQ9RN9auPZZHJmJOXNM9w8QTEwh8efewwUGHE+n+uI1zpDZKCaLpfGVcGV2b173UGlr29qUk6EgQml57CQG4QcA5TRn1EJGgbsFlOMv4AFnbEALxBdvgfNVlSXn3EMAF/XRwaVyuM5wHNFJFp3uM8A82HXGs7NjxbbRlWKSCMSv/rVCWUgCEfU5jH8Whh3ot1WNz6WbmHTT1vbzSvKgBXBye+/NByKSEYSqpteGwauDQPXhoGW9PvGT69OZr2wvcNUcHph+gXwGgvGgFZATy8vvxby0FPtz11Tf93Pjat3eL9UbtvagQ+qWkfjIwhO/iLZBsC/zWFdc4G1itWc6Lb2WDcKy2DG/aMO1vH6R3t27PjCtIXpP75Wrum0V1/Bjc5GWc2paSvKVSeR8940C1az4gykFNA34hvQJXkPVGDrh6py4wHtoY1Y+WapTwOfBt3Ob+WkQI9BG28+V/sLG+N/bgYypUt/Kt0XZsemTffmjcloOqs3kACgNcVN+ivQjx24eYRO9uwZPMOKUAlMb27YyT4DDJBoOh/HmXbeGkl+hTnp55W6SyA1ZroNZJjnG8S3AGPO9t89njijpTk4Mw+ruUs0avB2BrDuEf+mHHnAE2mlfBlAdjBjThWFg8z2++/ZAw+btanGdivMqTEVhlea0uW7ckrbzTw9UZ2dbbTjWz3h0RgG7igDlkEzTBiQwKbdStXgTB7hhRlYCQiPzMhIAxvLpsnBNjrVrRqhH3ppSv1jpg8nlP9mJoGJj+lM2910mZzNBwDMdn0xw+410wzMfIXDxiWb27aNJeAy0PHvb0PAlm0g497xX3iqXIDt3mO0KVb/A2FGszM8bg9GfHcGm2EN+KCVHh8sl4V+mL7Qy3MAS/NwPezy9UJi1op2pjkxi7ZuJWPR4+4O7+H9TvPLWBs4H+DuO4Af+txUuiGXQ40JrxLu6wE3la7HjTCgmz3OC9TDdhDxd0/Tob+I+/PvTz9h/JuYAjFzAueCHHjHMjIF8PhheogycCPiT9vjfEBVVLq3nced8f9g/FPuHU3PXAG+Czdm3sGA8wHufjfgptINuRkZIfD+YOCyWe/eGlFQEDIg/P1B+2PgviWQkREg3dYO9FRZwACWe6in2gwD+NBtV26B7kElgAwcvPxEGyiKw3GQ8QBRHPv+9K35692kXajXyBZe5INKRO5gouVBMPIoIHi4koV6Ebge4cnDAoLIQYl7hCyKn8naK4CYgHorGAqgh4HDC2AE9tsFeBM8eBfIyMjI6MfeleD9qjw+DnBbmxGRCDy6byf9ChVhdn1mtVBLnIeTCUB05MOieGZqxDigEH4CP3xo2HBQAYzAJ94FMjIyHjq2XnbfMoNgdtx7J2CD2wT9CfANgl4ZfTlAkCNwisfvzz3yLCewQEgEmgxDflgCSAXGyh8Rg1UwfMtiT+KIgHwGY8n7r9BwCT2BkfRrY9sM9pu+dwUqIyPjoaPgkzfRf0s+EhCJ3G/HvdAEAyRc0PnYCIXGz0blRotPziJ2mZcCvQyEwwaP/3CUMzDskBGARqd6HDgHTIAmMnAPR4c+veMwVn5Yg1HBwQKDT7L4rH6CryEERfAKFLQFsJsMMHQbJNrIe4oPCgiCw/wYf/wKRhIwjnsFEEbO44CMjI8ae+3BgZliWiksXKYoPLsSYIDjwDDz6W+wjN4XviWMlUrewFZBPff/I0rWn9+GDPeZBUwLNACCiLuUAJ5sTwsBL9yrYsSqhwz1iShYgIm0ACaAsIXs3K75A5lgnZ7dGBlYxx9a8hkad/QPmzIyMo4O4bvWPipEZxa+4imDCRuf//HnMIcV3bHcEYXYKrJvdUooPbPk2U3pll4OIDhJBVYgfSytZoQAgvj+AoU+rSshAL4+gZU/mgYghrpAtL2T+GX8akLkl0Q48v4EcE/PYWdkfBxQx1SucfLOZ/Ik0c/2x48POGmaKdFz9jAsF0N+F1wLOlXWVpo2h+dVuApcxelg8jc34eZgVjGp5QOE9cRjQARmhE4vg8mqx79mnpeIHlDKg1ZdKmiaotTADLrr4Zd3LpESAOiXooN7N7ppAUjrdX3C8blKbjOcwOnF/OdABSCPdmX15fUP7BSxYr4AZPU/d+FQ+hKFgnnIV+EVy4KsAMHFxUW6BcBy2bWiqXlJvCq4Un9WADJ+RQTwVKZ++hQ9TuXpf7U4ZdUhCSp76CxG8C2576EE8As6Llm0j8EdZxMIICjvmQKT+MReIS6AaqmAHAY0yF42Be+K1LXtAjWWbw8YCRj6Qn18fvpbAA3XXa4RO0NVtQpbvFLaKYCR0WGr0VQ+8zfjoeHLL3uDS3kmqR3Nz6TNe1FPnc551CmRxSOrw6K9r3L+z40Sfo7pYSHBJle+Havreg1az9Tsob2NVOSl7delPHZoQdcnXgK89NmVZyK3F5iZttOWv4LxB3pUQNYDvnr6+s3VUzJaqrqhEzl9VAsgVWH4Lfyu+8xIBaXmrxlNzU43KpqQ8NZn0NgxO27xy/sSSdIKZnDSQmslBLIFuPoFAtAC9wTwi3n3IdWnI11ACVi6BDXYQvoP8Jfu81e3QOJfYUVXjCbh6up1QMPRqKKcZUO7Turntbc2sCEAZPYfWbvSR0Yn7Q6wgf5zw4DrAnJBia8vWCbkxWbZ9dOCn1gddKmSVl+8/vtCiMXfXxuylVe/b/pe94QdLdY5DbRt85HfGfeOKR2MSy0G133R97uMWMNsOn0LtO/3bxsbQtvlVTtNBfI48BXXwxdOKf5T4l9OC6+mXQatm67FzHJkyZXO76nhli9OkYev2/J0gDOrnQ1fyUK9Cvu1Z1rWAwThej7nBLpS9MrSpR9fu3Ob/F0XNAMiwIkCEYBvReTAjUSQ50F3VboQVADdOIxIqr65kXbV0m8lc25cEkiceSTItAD+rWgci5V64OU0cb1SuPCTO3l1NTo/P/cEQASnVicunnZ/bIFjlWwBNzfd7Jxez9rnV+y+C7yUo1Fn97nNWi0WfyaFNd1f6UQAnoM/5+gxRfmbkakSiEKiBcBUAqLnDN4TTu/uTgnZnshxSokvAgt7oF6B2WL9ISPDx3sg58x+h03uu3vk6LB4Ly0HSuCD7m7y/wcbgynBmFFsnGprPSUf8eA0qBcWuNc29BjdfaC7/tJ0vvcK93lYsJONu+gzS8iKN0S3Bzqrq23Z0vWN77t/33sRzrwUhxWAqzAtvJ8HMttUVfdM29YCUMSG7/FYH0Ag6deOfE0jsUSE8KsvdtAFehYfDoEf5FgU3v1wnzwc0SAlI+PTB8zY7MRfJd0DHj3y6cYvrTnkKEAYQ0CF4AnAhFlNr7hrZsAj2C0UcsxAw0Obyq1kOAiQ5GFHAocUQKrGjDygAA7cBfhA6d67QEbGg8eDfj9s2c1s4ceG3C+sm3dskVQC9dLCTJUWG9LHhlK+bvHHRryit5NXF2Lm30Eli6qT80n3Z9ep4RzO6cK9pMGnJ/IzOVLNXur3TVIB6Fax8tahiQC+1sBV2XXpo0MN8OrFK9rm1TCgacg9p8hZUxkZGZ8I+H2AIfoW6dvN6HXL25YeAr8P8AEskFYvQrs19J2Kr8LvLA2cFsnwDy78Q7J8Ab3hcvmUhfu0zsLd1+gDkLu2CVpeO/vSMHAFJuOTaCLiBvHBjz/Ij8BvgpY3fm9swmEBcAYsbLlyX1Wa4WHaz89GSAgIXKy0gHpo/Y67sQLg9wGG6CtHX21Cr1vetvQI8PsAQ/TVt5L+9mpTet3ytqUzMjIGYHTG3uijh5yr0+k6+PvyhJ7PexUU/QIQ9LnA40cWwEPvAhkZGftA/3tFjgqFGDocrRpc0+XV/ahenOIJAAr8ED8qADvbojmAL4BCvUFvX/zuHNsKQMcXlP6IW0AM/V0gUf2PtQVsC3UAp/lmHDv+D/qKcxyg6AblAAAAAElFTkSuQmCC");\n}\n\n/* positioning */\n.ui-icon-carat-1-n {\n    background-position: 0 0;\n}\n\n.ui-icon-carat-1-ne {\n    background-position: -16px 0;\n}\n\n.ui-icon-carat-1-e {\n    background-position: -32px 0;\n}\n\n.ui-icon-carat-1-se {\n    background-position: -48px 0;\n}\n\n.ui-icon-carat-1-s {\n    background-position: -64px 0;\n}\n\n.ui-icon-carat-1-sw {\n    background-position: -80px 0;\n}\n\n.ui-icon-carat-1-w {\n    background-position: -96px 0;\n}\n\n.ui-icon-carat-1-nw {\n    background-position: -112px 0;\n}\n\n.ui-icon-carat-2-n-s {\n    background-position: -128px 0;\n}\n\n.ui-icon-carat-2-e-w {\n    background-position: -144px 0;\n}\n\n.ui-icon-triangle-1-n {\n    background-position: 0 -16px;\n}\n\n.ui-icon-triangle-1-ne {\n    background-position: -16px -16px;\n}\n\n.ui-icon-triangle-1-e {\n    background-position: -32px -16px;\n}\n\n.ui-icon-triangle-1-se {\n    background-position: -48px -16px;\n}\n\n.ui-icon-triangle-1-s {\n    background-position: -64px -16px;\n}\n\n.ui-icon-triangle-1-sw {\n    background-position: -80px -16px;\n}\n\n.ui-icon-triangle-1-w {\n    background-position: -96px -16px;\n}\n\n.ui-icon-triangle-1-nw {\n    background-position: -112px -16px;\n}\n\n.ui-icon-triangle-2-n-s {\n    background-position: -128px -16px;\n}\n\n.ui-icon-triangle-2-e-w {\n    background-position: -144px -16px;\n}\n\n.ui-icon-arrow-1-n {\n    background-position: 0 -32px;\n}\n\n.ui-icon-arrow-1-ne {\n    background-position: -16px -32px;\n}\n\n.ui-icon-arrow-1-e {\n    background-position: -32px -32px;\n}\n\n.ui-icon-arrow-1-se {\n    background-position: -48px -32px;\n}\n\n.ui-icon-arrow-1-s {\n    background-position: -64px -32px;\n}\n\n.ui-icon-arrow-1-sw {\n    background-position: -80px -32px;\n}\n\n.ui-icon-arrow-1-w {\n    background-position: -96px -32px;\n}\n\n.ui-icon-arrow-1-nw {\n    background-position: -112px -32px;\n}\n\n.ui-icon-arrow-2-n-s {\n    background-position: -128px -32px;\n}\n\n.ui-icon-arrow-2-ne-sw {\n    background-position: -144px -32px;\n}\n\n.ui-icon-arrow-2-e-w {\n    background-position: -160px -32px;\n}\n\n.ui-icon-arrow-2-se-nw {\n    background-position: -176px -32px;\n}\n\n.ui-icon-arrowstop-1-n {\n    background-position: -192px -32px;\n}\n\n.ui-icon-arrowstop-1-e {\n    background-position: -208px -32px;\n}\n\n.ui-icon-arrowstop-1-s {\n    background-position: -224px -32px;\n}\n\n.ui-icon-arrowstop-1-w {\n    background-position: -240px -32px;\n}\n\n.ui-icon-arrowthick-1-n {\n    background-position: 0 -48px;\n}\n\n.ui-icon-arrowthick-1-ne {\n    background-position: -16px -48px;\n}\n\n.ui-icon-arrowthick-1-e {\n    background-position: -32px -48px;\n}\n\n.ui-icon-arrowthick-1-se {\n    background-position: -48px -48px;\n}\n\n.ui-icon-arrowthick-1-s {\n    background-position: -64px -48px;\n}\n\n.ui-icon-arrowthick-1-sw {\n    background-position: -80px -48px;\n}\n\n.ui-icon-arrowthick-1-w {\n    background-position: -96px -48px;\n}\n\n.ui-icon-arrowthick-1-nw {\n    background-position: -112px -48px;\n}\n\n.ui-icon-arrowthick-2-n-s {\n    background-position: -128px -48px;\n}\n\n.ui-icon-arrowthick-2-ne-sw {\n    background-position: -144px -48px;\n}\n\n.ui-icon-arrowthick-2-e-w {\n    background-position: -160px -48px;\n}\n\n.ui-icon-arrowthick-2-se-nw {\n    background-position: -176px -48px;\n}\n\n.ui-icon-arrowthickstop-1-n {\n    background-position: -192px -48px;\n}\n\n.ui-icon-arrowthickstop-1-e {\n    background-position: -208px -48px;\n}\n\n.ui-icon-arrowthickstop-1-s {\n    background-position: -224px -48px;\n}\n\n.ui-icon-arrowthickstop-1-w {\n    background-position: -240px -48px;\n}\n\n.ui-icon-arrowreturnthick-1-w {\n    background-position: 0 -64px;\n}\n\n.ui-icon-arrowreturnthick-1-n {\n    background-position: -16px -64px;\n}\n\n.ui-icon-arrowreturnthick-1-e {\n    background-position: -32px -64px;\n}\n\n.ui-icon-arrowreturnthick-1-s {\n    background-position: -48px -64px;\n}\n\n.ui-icon-arrowreturn-1-w {\n    background-position: -64px -64px;\n}\n\n.ui-icon-arrowreturn-1-n {\n    background-position: -80px -64px;\n}\n\n.ui-icon-arrowreturn-1-e {\n    background-position: -96px -64px;\n}\n\n.ui-icon-arrowreturn-1-s {\n    background-position: -112px -64px;\n}\n\n.ui-icon-arrowrefresh-1-w {\n    background-position: -128px -64px;\n}\n\n.ui-icon-arrowrefresh-1-n {\n    background-position: -144px -64px;\n}\n\n.ui-icon-arrowrefresh-1-e {\n    background-position: -160px -64px;\n}\n\n.ui-icon-arrowrefresh-1-s {\n    background-position: -176px -64px;\n}\n\n.ui-icon-arrow-4 {\n    background-position: 0 -80px;\n}\n\n.ui-icon-arrow-4-diag {\n    background-position: -16px -80px;\n}\n\n.ui-icon-extlink {\n    background-position: -32px -80px;\n}\n\n.ui-icon-newwin {\n    background-position: -48px -80px;\n}\n\n.ui-icon-refresh {\n    background-position: -64px -80px;\n}\n\n.ui-icon-shuffle {\n    background-position: -80px -80px;\n}\n\n.ui-icon-transfer-e-w {\n    background-position: -96px -80px;\n}\n\n.ui-icon-transferthick-e-w {\n    background-position: -112px -80px;\n}\n\n.ui-icon-folder-collapsed {\n    background-position: 0 -96px;\n}\n\n.ui-icon-folder-open {\n    background-position: -16px -96px;\n}\n\n.ui-icon-document {\n    background-position: -32px -96px;\n}\n\n.ui-icon-document-b {\n    background-position: -48px -96px;\n}\n\n.ui-icon-note {\n    background-position: -64px -96px;\n}\n\n.ui-icon-mail-closed {\n    background-position: -80px -96px;\n}\n\n.ui-icon-mail-open {\n    background-position: -96px -96px;\n}\n\n.ui-icon-suitcase {\n    background-position: -112px -96px;\n}\n\n.ui-icon-comment {\n    background-position: -128px -96px;\n}\n\n.ui-icon-person {\n    background-position: -144px -96px;\n}\n\n.ui-icon-print {\n    background-position: -160px -96px;\n}\n\n.ui-icon-trash {\n    background-position: -176px -96px;\n}\n\n.ui-icon-locked {\n    background-position: -192px -96px;\n}\n\n.ui-icon-unlocked {\n    background-position: -208px -96px;\n}\n\n.ui-icon-bookmark {\n    background-position: -224px -96px;\n}\n\n.ui-icon-tag {\n    background-position: -240px -96px;\n}\n\n.ui-icon-home {\n    background-position: 0 -112px;\n}\n\n.ui-icon-flag {\n    background-position: -16px -112px;\n}\n\n.ui-icon-calendar {\n    background-position: -32px -112px;\n}\n\n.ui-icon-cart {\n    background-position: -48px -112px;\n}\n\n.ui-icon-pencil {\n    background-position: -64px -112px;\n}\n\n.ui-icon-clock {\n    background-position: -80px -112px;\n}\n\n.ui-icon-disk {\n    background-position: -96px -112px;\n}\n\n.ui-icon-calculator {\n    background-position: -112px -112px;\n}\n\n.ui-icon-zoomin {\n    background-position: -128px -112px;\n}\n\n.ui-icon-zoomout {\n    background-position: -144px -112px;\n}\n\n.ui-icon-search {\n    background-position: -160px -112px;\n}\n\n.ui-icon-wrench {\n    background-position: -176px -112px;\n}\n\n.ui-icon-gear {\n    background-position: -192px -112px;\n}\n\n.ui-icon-heart {\n    background-position: -208px -112px;\n}\n\n.ui-icon-star {\n    background-position: -224px -112px;\n}\n\n.ui-icon-link {\n    background-position: -240px -112px;\n}\n\n.ui-icon-cancel {\n    background-position: 0 -128px;\n}\n\n.ui-icon-plus {\n    background-position: -16px -128px;\n}\n\n.ui-icon-plusthick {\n    background-position: -32px -128px;\n}\n\n.ui-icon-minus {\n    background-position: -48px -128px;\n}\n\n.ui-icon-minusthick {\n    background-position: -64px -128px;\n}\n\n.ui-icon-close {\n    background-position: -80px -128px;\n}\n\n.ui-icon-closethick {\n    background-position: -96px -128px;\n}\n\n.ui-icon-key {\n    background-position: -112px -128px;\n}\n\n.ui-icon-lightbulb {\n    background-position: -128px -128px;\n}\n\n.ui-icon-scissors {\n    background-position: -144px -128px;\n}\n\n.ui-icon-clipboard {\n    background-position: -160px -128px;\n}\n\n.ui-icon-copy {\n    background-position: -176px -128px;\n}\n\n.ui-icon-contact {\n    background-position: -192px -128px;\n}\n\n.ui-icon-image {\n    background-position: -208px -128px;\n}\n\n.ui-icon-video {\n    background-position: -224px -128px;\n}\n\n.ui-icon-script {\n    background-position: -240px -128px;\n}\n\n.ui-icon-alert {\n    background-position: 0 -144px;\n}\n\n.ui-icon-info {\n    background-position: -16px -144px;\n}\n\n.ui-icon-notice {\n    background-position: -32px -144px;\n}\n\n.ui-icon-help {\n    background-position: -48px -144px;\n}\n\n.ui-icon-check {\n    background-position: -64px -144px;\n}\n\n.ui-icon-bullet {\n    background-position: -80px -144px;\n}\n\n.ui-icon-radio-off {\n    background-position: -96px -144px;\n}\n\n.ui-icon-radio-on {\n    background-position: -112px -144px;\n}\n\n.ui-icon-pin-w {\n    background-position: -128px -144px;\n}\n\n.ui-icon-pin-s {\n    background-position: -144px -144px;\n}\n\n.ui-icon-play {\n    background-position: 0 -160px;\n}\n\n.ui-icon-pause {\n    background-position: -16px -160px;\n}\n\n.ui-icon-seek-next {\n    background-position: -32px -160px;\n}\n\n.ui-icon-seek-prev {\n    background-position: -48px -160px;\n}\n\n.ui-icon-seek-end {\n    background-position: -64px -160px;\n}\n\n.ui-icon-seek-start {\n    background-position: -80px -160px;\n}\n\n/* ui-icon-seek-first is deprecated, use ui-icon-seek-start instead */\n.ui-icon-seek-first {\n    background-position: -80px -160px;\n}\n\n.ui-icon-stop {\n    background-position: -96px -160px;\n}\n\n.ui-icon-eject {\n    background-position: -112px -160px;\n}\n\n.ui-icon-volume-off {\n    background-position: -128px -160px;\n}\n\n.ui-icon-volume-on {\n    background-position: -144px -160px;\n}\n\n.ui-icon-power {\n    background-position: 0 -176px;\n}\n\n.ui-icon-signal-diag {\n    background-position: -16px -176px;\n}\n\n.ui-icon-signal {\n    background-position: -32px -176px;\n}\n\n.ui-icon-battery-0 {\n    background-position: -48px -176px;\n}\n\n.ui-icon-battery-1 {\n    background-position: -64px -176px;\n}\n\n.ui-icon-battery-2 {\n    background-position: -80px -176px;\n}\n\n.ui-icon-battery-3 {\n    background-position: -96px -176px;\n}\n\n.ui-icon-circle-plus {\n    background-position: 0 -192px;\n}\n\n.ui-icon-circle-minus {\n    background-position: -16px -192px;\n}\n\n.ui-icon-circle-close {\n    background-position: -32px -192px;\n}\n\n.ui-icon-circle-triangle-e {\n    background-position: -48px -192px;\n}\n\n.ui-icon-circle-triangle-s {\n    background-position: -64px -192px;\n}\n\n.ui-icon-circle-triangle-w {\n    background-position: -80px -192px;\n}\n\n.ui-icon-circle-triangle-n {\n    background-position: -96px -192px;\n}\n\n.ui-icon-circle-arrow-e {\n    background-position: -112px -192px;\n}\n\n.ui-icon-circle-arrow-s {\n    background-position: -128px -192px;\n}\n\n.ui-icon-circle-arrow-w {\n    background-position: -144px -192px;\n}\n\n.ui-icon-circle-arrow-n {\n    background-position: -160px -192px;\n}\n\n.ui-icon-circle-zoomin {\n    background-position: -176px -192px;\n}\n\n.ui-icon-circle-zoomout {\n    background-position: -192px -192px;\n}\n\n.ui-icon-circle-check {\n    background-position: -208px -192px;\n}\n\n.ui-icon-circlesmall-plus {\n    background-position: 0 -208px;\n}\n\n.ui-icon-circlesmall-minus {\n    background-position: -16px -208px;\n}\n\n.ui-icon-circlesmall-close {\n    background-position: -32px -208px;\n}\n\n.ui-icon-squaresmall-plus {\n    background-position: -48px -208px;\n}\n\n.ui-icon-squaresmall-minus {\n    background-position: -64px -208px;\n}\n\n.ui-icon-squaresmall-close {\n    background-position: -80px -208px;\n}\n\n.ui-icon-grip-dotted-vertical {\n    background-position: 0 -224px;\n}\n\n.ui-icon-grip-dotted-horizontal {\n    background-position: -16px -224px;\n}\n\n.ui-icon-grip-solid-vertical {\n    background-position: -32px -224px;\n}\n\n.ui-icon-grip-solid-horizontal {\n    background-position: -48px -224px;\n}\n\n.ui-icon-gripsmall-diagonal-se {\n    background-position: -64px -224px;\n}\n\n.ui-icon-grip-diagonal-se {\n    background-position: -80px -224px;\n}\n\n/* Misc visuals\n----------------------------------*/\n\n/* Corner radius */\n.ui-corner-all, .ui-corner-top, .ui-corner-left, .ui-corner-tl {\n    -moz-border-radius-topleft: 0px;\n    -webkit-border-top-left-radius: 0px;\n    -khtml-border-top-left-radius: 0px;\n    border-top-left-radius: 0px;\n}\n\n.ui-corner-all, .ui-corner-top, .ui-corner-right, .ui-corner-tr {\n    -moz-border-radius-topright: 0px;\n    -webkit-border-top-right-radius: 0px;\n    -khtml-border-top-right-radius: 0px;\n    border-top-right-radius: 0px;\n}\n\n.ui-corner-all, .ui-corner-bottom, .ui-corner-left, .ui-corner-bl {\n    -moz-border-radius-bottomleft: 0px;\n    -webkit-border-bottom-left-radius: 0px;\n    -khtml-border-bottom-left-radius: 0px;\n    border-bottom-left-radius: 0px;\n}\n\n.ui-corner-all, .ui-corner-bottom, .ui-corner-right, .ui-corner-br {\n    -moz-border-radius-bottomright: 0px;\n    -webkit-border-bottom-right-radius: 0px;\n    -khtml-border-bottom-right-radius: 0px;\n    border-bottom-right-radius: 0px;\n}\n\n/* Overlays */\n.ui-widget-overlay {\n    background: #aaaaaa url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAh0lEQVRYhe2UsQ3AIAwEL0zC/qMwhTdJiiCRpH2kfPHu0DUnbN0xxjiZU1U8p/f+ev/Bm7MccAu6ygE0ZzlgrdhRrqqWoKMczB90lQNoznLwuUE3uXRwB08HVZ4OqjwdVHk6qPJ0UOXpoMrTQZWngypPB1WeDqo8HVR5OqjydFDl6aDK7Tt4AWXCW8vnTP6PAAAAAElFTkSuQmCC") 50% 50% repeat;\n    opacity: .30;\n    filter: Alpha(Opacity = 30);\n}\n\n.ui-widget-shadow {\n    margin: -8px 0 0 -8px;\n    padding: 8px;\n    background: #aaaaaa url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAABkCAYAAAD0ZHJ6AAAAe0lEQVRoge3OMQHAIBAAMcC/kjdZJHTI0A4XBdkz86wfO18H3hRUBVVBVVAVVAVVQVVQFVQFVUFVUBVUBVVBVVAVVAVVQVVQFVQFVUFVUBVUBVVBVVAVVAVVQVVQFVQFVUFVUBVUBVVBVVAVVAVVQVVQFVQFVUFVUBVUF8O8A8WdY6opAAAAAElFTkSuQmCC") 50% 50% repeat-x;\n    opacity: .30;\n    filter: Alpha(Opacity = 30);\n    -moz-border-radius: 8px;\n    -khtml-border-radius: 8px;\n    -webkit-border-radius: 8px;\n    border-radius: 8px;\n}\n\n/*!\n* jQuery UI Resizable 1.8.21\n*\n* Copyright 2012, AUTHORS.txt (http://jqueryui.com/about)\n* Dual licensed under the MIT or GPL Version 2 licenses.\n* http://jquery.org/license\n*\n* http://docs.jquery.com/UI/Resizable#theming\n*/\n.ui-resizable {\n    position: relative;\n}\n\n.ui-resizable-handle {\n    position: absolute;\n    font-size: 0.1px;\n    display: block;\n}\n\n.ui-resizable-disabled .ui-resizable-handle, .ui-resizable-autohide .ui-resizable-handle {\n    display: none;\n}\n\n.ui-resizable-n {\n    cursor: n-resize;\n    height: 7px;\n    width: 100%;\n    top: -5px;\n    left: 0;\n}\n\n.ui-resizable-s {\n    cursor: s-resize;\n    height: 7px;\n    width: 100%;\n    bottom: -5px;\n    left: 0;\n}\n\n.ui-resizable-e {\n    cursor: e-resize;\n    width: 7px;\n    right: -5px;\n    top: 0;\n    height: 100%;\n}\n\n.ui-resizable-w {\n    cursor: w-resize;\n    width: 7px;\n    left: -5px;\n    top: 0;\n    height: 100%;\n}\n\n.ui-resizable-se {\n    cursor: se-resize;\n    width: 12px;\n    height: 12px;\n    right: 1px;\n    bottom: 1px;\n}\n\n.ui-resizable-sw {\n    cursor: sw-resize;\n    width: 9px;\n    height: 9px;\n    left: -5px;\n    bottom: -5px;\n}\n\n.ui-resizable-nw {\n    cursor: nw-resize;\n    width: 9px;\n    height: 9px;\n    left: -5px;\n    top: -5px;\n}\n\n.ui-resizable-ne {\n    cursor: ne-resize;\n    width: 9px;\n    height: 9px;\n    right: -5px;\n    top: -5px;\n}\n\n/*!\n* jQuery UI Button 1.8.21\n*\n* Copyright 2012, AUTHORS.txt (http://jqueryui.com/about)\n* Dual licensed under the MIT or GPL Version 2 licenses.\n* http://jquery.org/license\n*\n* http://docs.jquery.com/UI/Button#theming\n*/\n.ui-button {\n    display: inline-block;\n    position: relative;\n    padding: 0;\n    margin-right: .1em;\n    text-decoration: none !important;\n    cursor: pointer;\n    text-align: center;\n    zoom: 1;\n    overflow: visible;\n}\n\n/* the overflow property removes extra width in IE */\n.ui-button-icon-only {\n    width: 2.2em;\n}\n\n/* to make room for the icon, a width needs to be set here */\nbutton.ui-button-icon-only {\n    width: 2.4em;\n}\n\n/* button elements seem to need a little more width */\n.ui-button-icons-only {\n    width: 3.4em;\n}\n\nbutton.ui-button-icons-only {\n    width: 3.7em;\n}\n\n/*button text element */\n.ui-button .ui-button-text {\n    display: block;\n    line-height: 1.4;\n}\n\n.ui-button-text-only .ui-button-text {\n    padding: .4em 1em;\n}\n\n.ui-button-icon-only .ui-button-text, .ui-button-icons-only .ui-button-text {\n    padding: .4em;\n    text-indent: -9999999px;\n}\n\n.ui-button-text-icon-primary .ui-button-text, .ui-button-text-icons .ui-button-text {\n    padding: .4em 1em .4em 2.1em;\n}\n\n.ui-button-text-icon-secondary .ui-button-text, .ui-button-text-icons .ui-button-text {\n    padding: .4em 2.1em .4em 1em;\n}\n\n.ui-button-text-icons .ui-button-text {\n    padding-left: 2.1em;\n    padding-right: 2.1em;\n}\n\n/* no icon support for input elements, provide padding by default */\ninput.ui-button {\n    padding: .4em 1em;\n}\n\n/*button icon element(s) */\n.ui-button-icon-only .ui-icon, .ui-button-text-icon-primary .ui-icon, .ui-button-text-icon-secondary .ui-icon, .ui-button-text-icons .ui-icon, .ui-button-icons-only .ui-icon {\n    position: absolute;\n    top: 50%;\n    margin-top: -8px;\n}\n\n.ui-button-icon-only .ui-icon {\n    left: 50%;\n    margin-left: -8px;\n}\n\n.ui-button-text-icon-primary .ui-button-icon-primary, .ui-button-text-icons .ui-button-icon-primary, .ui-button-icons-only .ui-button-icon-primary {\n    left: .5em;\n}\n\n.ui-button-text-icon-secondary .ui-button-icon-secondary, .ui-button-text-icons .ui-button-icon-secondary, .ui-button-icons-only .ui-button-icon-secondary {\n    right: .5em;\n}\n\n.ui-button-text-icons .ui-button-icon-secondary, .ui-button-icons-only .ui-button-icon-secondary {\n    right: .5em;\n}\n\n/*button sets*/\n.ui-buttonset {\n    margin-right: 7px;\n}\n\n.ui-buttonset .ui-button {\n    margin-left: 0;\n    margin-right: -.3em;\n}\n\n/* workarounds */\nbutton.ui-button::-moz-focus-inner {\n    border: 0;\n    padding: 0;\n}\n\n/* reset extra padding in Firefox */\n/*!\n * jQuery UI Dialog 1.8.21\n *\n * Copyright 2012, AUTHORS.txt (http://jqueryui.com/about)\n * Dual licensed under the MIT or GPL Version 2 licenses.\n * http://jquery.org/license\n *\n * http://docs.jquery.com/UI/Dialog#theming\n */\n.ui-dialog {\n    position: absolute;\n    padding: .2em;\n    width: 300px;\n    overflow: hidden;\n}\n\n.ui-dialog .ui-dialog-titlebar {\n    padding: .4em 1em;\n    position: relative;\n}\n\n.ui-dialog .ui-dialog-title {\n    float: left;\n    margin: .1em 16px .1em 0;\n}\n\n.ui-dialog .ui-dialog-titlebar-close {\n    position: absolute;\n    right: .3em;\n    top: 50%;\n    width: 19px;\n    margin: -10px 0 0 0;\n    padding: 1px;\n    height: 18px;\n}\n\n.ui-dialog .ui-dialog-titlebar-close span {\n    display: block;\n    margin: 1px;\n}\n\n.ui-dialog .ui-dialog-titlebar-close:hover, .ui-dialog .ui-dialog-titlebar-close:focus {\n    padding: 0;\n}\n\n.ui-dialog .ui-dialog-content {\n    position: relative;\n    border: 0;\n    padding: .5em;\n    background: none;\n    overflow: auto;\n    zoom: 1;\n}\n\n.ui-dialog .ui-dialog-buttonpane {\n    text-align: left;\n    border-width: 1px 0 0 0;\n    background-image: none;\n    margin: .5em 0 0 0;\n    padding: .3em 1em .5em .4em;\n}\n\n.ui-dialog .ui-dialog-buttonpane .ui-dialog-buttonset {\n    float: right;\n}\n\n.ui-dialog .ui-dialog-buttonpane button {\n    margin: .5em .4em .5em 0;\n    cursor: pointer;\n}\n\n.ui-dialog .ui-resizable-se {\n    width: 14px;\n    height: 14px;\n    right: 3px;\n    bottom: 3px;\n}\n\n.ui-draggable .ui-dialog-titlebar {\n    cursor: move;\n}\n\n/*!\n* jQuery UI Tabs 1.8.21\n*\n* Copyright 2012, AUTHORS.txt (http://jqueryui.com/about)\n* Dual licensed under the MIT or GPL Version 2 licenses.\n* http://jquery.org/license\n*\n* http://docs.jquery.com/UI/Tabs#theming\n*/\n.ui-tabs {\n    position: relative;\n    padding: 0em;\n    zoom: 1;\n}\n\n/* position: relative prevents IE scroll bug (element with position: relative inside container with overflow: auto appear as "fixed") */\n.ui-tabs .ui-tabs-nav {\n    margin: 0;\n    padding: .2em .2em 0;\n}\n\n.ui-tabs .ui-tabs-nav li {\n    list-style: none;\n    float: left;\n    position: relative;\n    top: 1px;\n    margin: 0 .2em 1px 0;\n    border-bottom: 0 !important;\n    padding: 0;\n    white-space: nowrap;\n}\n\n.ui-tabs .ui-tabs-nav li a {\n    float: left;\n    padding: .2em 1em;\n    text-decoration: none;\n}\n\n.ui-tabs .ui-tabs-nav li.ui-tabs-active {\n    margin-bottom: 0;\n    padding-bottom: 1px;\n}\n\n.ui-tabs .ui-tabs-nav li.ui-tabs-active a, .ui-tabs .ui-tabs-nav li.ui-state-disabled a, .ui-tabs .ui-tabs-nav li.ui-tabs-loading a {\n    cursor: text;\n}\n\n.ui-tabs .ui-tabs-nav li a, .ui-tabs.ui-tabs-collapsible .ui-tabs-nav li.ui-tabs-active a {\n    cursor: pointer;\n}\n\n/* first selector in group seems obsolete, but required to overcome bug in Opera applying cursor: text overall if defined elsewhere... */\n.ui-tabs .ui-tabs-panel {\n    display: block;\n    border-width: 0;\n    padding: 0em 0.1em;\n    background: none;\n}\n\n/*!\n* jQuery UI Progressbar 1.8.21\n*\n* Copyright 2012, AUTHORS.txt (http://jqueryui.com/about)\n* Dual licensed under the MIT or GPL Version 2 licenses.\n* http://jquery.org/license\n*\n* http://docs.jquery.com/UI/Progressbar#theming\n*/\n.ui-progressbar {\n    height: 4px;\n    text-align: left;\n    overflow: hidden;\n}\n\n.ui-progressbar .ui-progressbar-value {\n    margin: -1px;\n    height: 100%;\n}',
    );
  };
  var ResourceProduction = new (function () {
    function addProd(position, value) {
      value = Math.floor(value);
      if (value > 0)
        jq("span#rp" + position)
          .css("color", "green")
          .text(Utils.FormatNumToStr(value, true));
      else if (value < 0)
        jq("span#rp" + position)
          .css("color", "red")
          .text(Utils.FormatNumToStr(value, true));
      else
        jq("span#rp" + position)
          .css("color", "gray")
          .text("+0");
    }
    this.createSpan = function (n) {
      var ids = ["wood", "wine", "marble", "glass", "sulfur"];
      if (jq("span#rp" + n).length === 0)
        jq('#cityResources li[id="resources_' + ids[n] + '"]')
          .css({
            "line-height": "normal",
            "padding-top": "0px",
          })
          .append('<span id="rp' + n + '" class="resourceProduction"></span>');
    };
    this.repositionSpan = function (newTradegood) {
      var oldTradegood = unsafeWindow.ikariam.model.producedTradegood;
      if (newTradegood != oldTradegood) {
        if (oldTradegood > 1) jq("span#rp" + oldTradegood).remove();
        this.createSpan(newTradegood);
      }
    };
    function wineDrain() {
      var net = modelWineConsumption();
      return net === null ? unsafeWindow.ikariam.model.wineSpendings : net;
    }
    this.updateProd = function () {
      addProd(0, unsafeWindow.ikariam.model.resourceProduction * 3600);
      if (unsafeWindow.ikariam.model.cityProducesWine)
        addProd(
          1,
          unsafeWindow.ikariam.model.tradegoodProduction * 3600 - wineDrain(),
        );
      else {
        addProd(1, -wineDrain());
        addProd(
          unsafeWindow.ikariam.model.producedTradegood,
          unsafeWindow.ikariam.model.tradegoodProduction * 3600,
        );
      }
    };
  })();
  jq(function () {
    ResourceProduction.createSpan(0);
    ResourceProduction.createSpan(1);
    ResourceProduction.createSpan(2);
    ResourceProduction.createSpan(3);
    ResourceProduction.createSpan(4);
    ResourceProduction.updateProd();
    unsafeWindow.ikariam.model.ResourceProduction_updateGlobalData =
      unsafeWindow.ikariam.model.updateGlobalData;
    unsafeWindow.ikariam.model.updateGlobalData = function (dataSet) {
      try {
        if (dataSet)
          ResourceProduction.repositionSpan(dataSet.producedTradegood);
      } catch (e) {
        reportBug("manual", e, { where: "production span: reposition" });
      }
      var result =
        unsafeWindow.ikariam.model.ResourceProduction_updateGlobalData.apply(
          unsafeWindow.ikariam.model,
          arguments,
        );
      try {
        ResourceProduction.updateProd();
      } catch (e) {
        reportBug("manual", e, { where: "production span: update" });
      }
      return result;
    };
  });
  onResponse((entries) => {
    events("ajaxResponse").pub(entries);
  });
  function observeGameResponses() {
    const gameJQuery = pageJQuery();
    if (!gameJQuery) return;
    gameJQuery(unsafeWindow.document).ajaxSuccess(function (event, xhr) {
      let entries;
      try {
        entries = JSON.parse(xhr && xhr.responseText);
      } catch (e) {
        return;
      }
      if (Array.isArray(entries)) events("ajaxResponse").pub(entries);
    });
  }
  installEmpireDiagnostics("userscript", "2.1.0");
  empire.Init();
  jq(function () {
    (function init(
      modelAnnounced,
      cityDataAnnounced,
      stringsAnnounced,
      ajaxHooked,
    ) {
      var hasModel = !!unsafeWindow.ikariam && !!unsafeWindow.ikariam.model;
      var hasCityData =
        !!unsafeWindow.ikariam && !!unsafeWindow.ikariam.model.relatedCityData;
      var hasStrings = !!unsafeWindow.LocalizationStrings;
      var canHookAjax =
        !!unsafeWindow.ikariam.controller &&
        !!unsafeWindow.ikariam.controller.executeAjaxRequest &&
        !!unsafeWindow.ajaxHandlerCallFromForm;
      if (hasCityData && !cityDataAnnounced)
        events(Constant.Events.CITYDATA_AVAILABLE).pub();
      if (hasModel && hasCityData && !modelAnnounced && !cityDataAnnounced)
        events(Constant.Events.MODEL_AVAILABLE).pub();
      if (hasStrings && !stringsAnnounced)
        events(Constant.Events.LOCAL_STRINGS_AVAILABLE).pub();
      if (canHookAjax && !ajaxHooked) {
        unsafeWindow.ajaxHandlerCallFromForm = (function (
          ajaxHandlerCallFromForm,
        ) {
          return function cAjaxHandlerCallFromForm(form) {
            events("formSubmit").pub(form);
            return ajaxHandlerCallFromForm.apply(this, arguments);
          };
        })(unsafeWindow.ajaxHandlerCallFromForm);
        observeGameResponses();
      }
      if (!(hasModel && hasStrings && hasCityData && canHookAjax))
        events.scheduleAction(
          init.bind(null, hasModel, hasCityData, hasStrings, canHookAjax),
          1e3,
        );
      else {
        jq("script").each(function (index, script) {
          var match =
            /ikariam\.getClass\(ajax\.Responder,\s*(\[[\s\S]*\])\s*\)/.exec(
              script.innerHTML,
            );
          if (!match) return;
          var parsed;
          try {
            parsed = JSON.parse(match[1] || "[]");
          } catch (e) {
            reportBug("manual", e, {
              where: "initial ajax bootstrap",
              captured: String(match[1]).slice(0, 200),
            });
            return false;
          }
          if (Array.isArray(parsed)) events("ajaxResponse").pub(parsed);
          return false;
        });
        ikariam.openPendingView();
      }
    })();
  });
})();
