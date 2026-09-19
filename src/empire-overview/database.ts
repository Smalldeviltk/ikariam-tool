/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "./jquery";
import { City } from "./models/city";
import { Constant } from "./constants";
import { GlobalData } from "./models/global-data";
import { Setting } from "./models/setting";
import { Utils } from "./utils";
import { empire } from "./empire";
import { events } from "./events";
import { ikariam } from "./game-api";
import { render } from "./render";

/** How long to wait for more changes before writing the database out. */
const SAVE_DEBOUNCE_MS = 1000;

export const database: any = {
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
      return $.mergeValues(this, objVals);
    },
  },
  Init: function (host) {
    $.each(
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
    // Directly, not through a timeout: see `Save`.
    //
    // Guarded because `empire.HardReset` deliberately empties this object,
    // methods included, and then navigates — which fires this handler. Calling
    // a method that is no longer there would throw, and if it somehow still
    // worked it would write the database straight back out and undo the reset.
    $(window).on("beforeunload", function () {
      if (typeof database.Save === "function") database.Save();
    });
  },
  addCity: function (id, a) {
    if (a) {
      return $.mergeValues(new City(id), a);
    } else return new City(id);
  },
  get getBuildingCounts() {
    var buildingCounts: any = {};
    $.each(this.cities, function (cityId, city) {
      $.each(Constant.Buildings, function (key, value) {
        if (database.settings.alternativeBuildingList.value && value === "") {
        } else if (
          database.settings.compressedBuildingList.value &&
          (value == Constant.Buildings.STONEMASON ||
            value == Constant.Buildings.WINERY ||
            value == Constant.Buildings.ALCHEMISTS_TOWER ||
            value == Constant.Buildings.GLASSBLOWER)
        ) {
          buildingCounts.productionBuilding = Math.max(
            buildingCounts.productionBuilding || 0,
            city.getBuildingsFromName(value).length,
          );
        } else if (
          database.settings.compressedBuildingList.value &&
          (value == Constant.Buildings.GOVERNORS_RESIDENCE ||
            value == Constant.Buildings.PALACE)
        ) {
          buildingCounts.colonyBuilding = Math.max(
            buildingCounts.colonyBuilding || 0,
            city.getBuildingsFromName(value).length,
          );
        } else {
          buildingCounts[value] = Math.max(
            buildingCounts[value] || 0,
            city.getBuildingsFromName(value).length,
          );
        }
      });
    });
    return buildingCounts;
  },
  /**
   * Persist whenever the board learns something.
   *
   * NEVER CALLED IN THE ORIGINAL. Its only apparent call site, in
   * `render.Init`, is `this.startMonitoringChanges()` inside a function bound
   * to `render` — so it reaches render's own method of the same name, not
   * this one. The database therefore subscribed to nothing, and its only
   * route to storage was the `beforeunload` handler, which did not work
   * either (see `Save`).
   *
   * Together with the town deletion in `FetchAllTowns`, that is why a scan
   * could walk every town, with the ajax trace showing 25 building positions
   * arriving for each, and leave the Buildings tab blank: the data was
   * recorded in memory and never written down.
   */
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
        $.mergeValues(this.settings, settings);

        var globalData = this.UnSerialize(empire.getVar("globalData", ""));
        if (globalData.governmentType === "")
          globalData.governmentType = "Ikacracy";
        if (typeof globalData == "object") {
          $.mergeValues(this._globalData, globalData);
        }
        var cities = this.UnSerialize(empire.getVar("cities", ""));
        if (typeof cities == "object") {
          for (var cityID in cities) {
            (this.cities[cityID] = this.addCity(
              cities[cityID]._id,
              cities[cityID],
            )).init();
          }
        }
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
    return ret || undefined;
  },
  UnSerialize: function (data) {
    var ret;
    if (data)
      try {
        ret = JSON.parse(data);
      } catch (e) {
        empire.log("error loading");
      }
    return ret || undefined;
  },
  /**
   * Write the database out. SYNCHRONOUS on purpose.
   *
   * The original deferred the three writes through `events.scheduleAction`,
   * i.e. `setTimeout(fn, 0)`. The only caller was the `beforeunload` handler,
   * which ALSO wrapped it in a `setTimeout` — and a timeout scheduled during
   * `beforeunload` is not guaranteed to run before the page goes away. In
   * Chromium it generally does not, so the save that was supposed to happen
   * on every navigation happened essentially never.
   *
   * Frequency is handled by `SaveSoon` instead, which is the right place for
   * it: one coalesced write per burst of events rather than one per event.
   */
  Save: function () {
    if (this._saveTimer !== null && this._saveTimer !== undefined) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    empire.setVar("cities", database.Serialize(database.cities));
    empire.setVar("settings", database.Serialize(database.settings));
    empire.setVar("globalData", database.Serialize(database._globalData));
  },
  _saveTimer: null,
  /**
   * Save once, shortly. One ajax response can publish four of the events
   * `startMonitoringChanges` listens to, and each save serialises the whole
   * database — tens of kilobytes. Coalesce them.
   */
  SaveSoon: function () {
    if (this._saveTimer !== null && this._saveTimer !== undefined) return;
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
    if (!this._armyTotals) {
      this._armyTotals = Utils.cacheFunction(
        this._getArmyTotals.bind(database),
        1000,
      );
    }
    return this._armyTotals();
  },
  _getArmyTotals: function () {
    var totals = {};
    $.each(Constant.UnitData, function (unitId, info) {
      totals[unitId] = { training: 0, total: 0, incoming: 0, plunder: 0 };
    });
    $.each(this.cities, function (cityId, city) {
      var train = city.military.getTrainingTotals;
      var incoming = city.military.getIncomingTotals;
      var total = city.military.getUnits.totals;
      $.each(Constant.UnitData, function (unitId, info) {
        totals[unitId].training += train[unitId] || 0;
        totals[unitId].total += total[unitId] || 0;
        totals[unitId].incoming += incoming[unitId] || 0;
        // totals[unitId].plunder += plunder[unitId] || 0;
      });
    });
    return totals;
  },
  get getCityCount() {
    return Object.keys(this.cities).length;
  },
  _getArmyTrainingTotals: function () {},
};
/***********************************************************************************************************************
 * render view
 **********************************************************************************************************************/
