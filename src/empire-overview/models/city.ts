/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "../jquery";
import { Building } from "../models/building";
import { CityResearch } from "../models/city-research";
import { Constant } from "../constants";
import { Military } from "../models/military";
import { Population } from "../models/population";
import { Resource } from "../models/resource";
import { trace } from "../ajax-trace";
import { Utils } from "../utils";
import { database } from "../database";
import { empire } from "../empire";
import { events } from "../events";
import { ikariam } from "../game-api";

export function City(id) {
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
      dump: { storage: 0, safe: 0 },
      warehouse: { storage: 0, safe: 0 },
      townHall: { storage: 2500, safe: 100 },
    },
    invalid: true,
  };
  this._tradeGoodID = 0;
  this.knownTime = $.now();
  this._lastPopUpdate = $.now();
  this._buildings = new Array(25);
  var i = this._buildings.length;
  while (i--) {
    this._buildings[i] = new Building(this, i);
  }
  this._research = new CityResearch(this);
  this.actionPoints = 0;
  this._actionPoints = 0;
  // The original wrote `this.maxSci = 0` here. `maxSci` is a getter-only
  // accessor on the prototype (see below), so the assignment never did
  // anything — and the bundle is strict-mode ES, where writing to a
  // getter-only property throws instead of failing silently. That throw
  // aborted `FetchAllTowns`, so the board loaded with no towns in it.
  this._coordinates = { x: 0, y: 0 };
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
      museum: { cultural: 0, level: 0 },
      government: 0,
      tavern: { wineConsumption: 0, level: 0 },
      research: 0,
      priest: 0,
      total: 0,
    },
    happiness: 0,
    growth: 0,
  };
  events("updateCityData").sub(this.updateCityDataFromAjax.bind(this));
  events("updateBuildingData").sub(this.updateBuildingsDataFromAjax.bind(this));
}

(City as any).prototype = {
  init: function () {
    $.each(this._buildings, function (idx, building) {
      building.startUpgradeTimer();
    });
    this.military.init();
    $.each(this._resources, function (resourceName, resource) {
      resource.project();
    });
    events.scheduleActionAtInterval(
      function () {
        $.each(
          this._resources,
          function (resourceName, resource) {
            resource.project();
          }.bind(this),
        );
      }.bind(this),
      1000,
    );
  },
  projectResource: function (seconds) {},
  updateBuildingsDataFromAjax: function (id, position) {
    var changes = [];
    // Every City subscribes, so bail before tracing — otherwise one publish
    // writes a record per town and drowns the trace in near-duplicates.
    if (id != this.getId) return;
    // Two further conditions have to hold, and when one does not the data is
    // dropped in silence. Trace which, so a town that stays blank on the
    // Buildings tab says why.
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
        $.each(
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
    var changes: any = {};
    if (id == this.getId) {
      try {
        var baseWineConsumption = 0,
          wineConsumption = 0;
        if (
          $.inArray(
            cityData.wineSpendings,
            Constant.BuildingData[Constant.Buildings.TAVERN].wineUse,
            Constant.BuildingData[Constant.Buildings.TAVERN].wineUse2,
          ) > -1
        ) {
          baseWineConsumption = cityData.wineSpendings;
          wineConsumption = this.getBuildingFromName(
            Constant.Buildings.VINEYARD,
          )
            ? baseWineConsumption *
              ((100 -
                this.getBuildingFromName(Constant.Buildings.VINEYARD)
                  .getLevel) /
                100)
            : baseWineConsumption;
        } else {
          wineConsumption = cityData.wineSpendings;
        }
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
        this.knownTime = $.now();

        var $actionPointElem = $("#js_GlobalMenu_maxActionPoints");
        if (cityData.maxActionPoints) {
          changes.actionPoints = this.updateActionPoints(
            cityData.maxActionPoints || 0,
          );
        } else {
          changes.actionPoints = this.updateActionPoints(
            parseInt($actionPointElem.text()) || 0,
          );
        }
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
          $("#js_GlobalMenu_cities").find("> span").text(),
        );
        database.getGlobalData.addLocalisedString(
          "ActionPoints",
          $actionPointElem.attr("title"),
        );
        if (cityData.gold) {
          database.getGlobalData.finance.currentGold = parseFloat(
            cityData.gold,
          );
        }
      } catch (e) {
        empire.error("fetchCurrentCityData", e);
      } finally {
        cityData = null;
      }
      events(Constant.Events.CITY_UPDATED).pub(this.getId, changes);
      if (resourcesChanged) {
        events(Constant.Events.RESOURCES_UPDATED).pub(
          this.getId,
          resourcesChanged,
        );
      }
    }
  },
  get getCorruption() {
    if (typeof this._corruption != "function") {
      this._corruption = Utils.cacheFunction(
        function () {
          var h = 0;
          if (
            this.getBuildingFromName(Constant.Buildings.GOVERNORS_RESIDENCE) &&
            this.getBuildingFromName(Constant.Buildings.GOVERNORS_RESIDENCE)
              .getLevel /
              database.getCityCount !=
              1
          ) {
            h =
              Constant.GovernmentData[database.getGlobalData.getGovernmentType]
                .governors;
          }
          return Math.max(
            0,
            1 -
              ((this.getBuildingFromName(Constant.Buildings.GOVERNORS_RESIDENCE)
                ? this.getBuildingFromName(
                    Constant.Buildings.GOVERNORS_RESIDENCE,
                  ).getLevel
                : this.getBuildingFromName(Constant.Buildings.PALACE)
                  ? this.getBuildingFromName(Constant.Buildings.PALACE).getLevel
                  : 0) +
                1) /
                database.getCityCount +
              Constant.GovernmentData[database.getGlobalData.getGovernmentType]
                .corruption +
              h,
          );
        }.bind(this),
        1000,
      );
    }
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
    /*  if(Math.abs(this._citizens - value / 3) > 2) {
    return this.updateCitizens((value / 3))
  }*/
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
    while (i--) {
      if (this._buildings[i].getName == name) ret.push(this._buildings[i]);
    }
    return ret;
  },
  getBuildingFromName: function (name) {
    var i = this._buildings.length;
    while (i--) {
      if (this._buildings[i].getName == name) return this._buildings[i];
    }
    return null;
  },
  getBuildingFromPosition: function (position) {
    return this._buildings[position];
  },
  getWonder: function () {
    // The original wrote `i = 7` with `i` never declared. Inside a sloppy-mode
    // IIFE that silently created a global `window.i`; ES modules are always
    // strict, so it would throw a ReferenceError. Returning the constant gives
    // the same result without leaking a global.
    return 7; //ikariam.wonder();
  },
  get getTradeGood() {
    for (var resourceName in Constant.ResourceIDs) {
      if (this._tradeGoodID == Constant.ResourceIDs[resourceName]) {
        return Constant.Resources[resourceName];
      }
    }
    return null;
  },
  get getTradeGoodID() {
    return this._tradeGoodID;
  },
  updateTradeGoodID: function (value) {
    var changed = this._tradeGoodID != value;
    if (changed) {
      this._tradeGoodID = value;
    }
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
    if (changed) {
      this._name = value;
    }
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
    if (this.getBuildingFromName(Constant.Buildings.TOWN_HALL)) {
      i = this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel;
    }
    if (this.getBuildingFromName(Constant.Buildings.WALL)) {
      r = this.getBuildingFromName(Constant.Buildings.WALL).getLevel;
    }
    t = (i + r - 1) * 50 + 300;
    return t;
  },
  get garrisonsea() {
    var t = 0,
      n = 0,
      s = 0;
    if (this.getBuildingFromName(Constant.Buildings.TRADING_PORT)) {
      //todo
      t = this.getBuildingFromName(Constant.Buildings.TRADING_PORT).getLevel;
    }
    if (this.getBuildingFromName(Constant.Buildings.SHIPYARD)) {
      s = this.getBuildingFromName(Constant.Buildings.SHIPYARD).getLevel;
    }
    //n = t > t ? t : t > s ? t : s;
    n = t > s ? t : s;
    return n * 25 + 125;
  },
  get plundergold() {
    var i = 0;
    if (this.getBuildingFromName(Constant.Buildings.PALACE)) {
      i =
        Math.floor(
          this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel,
        ) * 950;
    } else if (database.getCityCount == 1)
      i =
        Math.floor(
          this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel,
        ) * 950;
    return i;
  },
  get maxculturalgood() {
    var i = 0;
    if (this.getBuildingFromName(Constant.Buildings.MUSEUM)) {
      i = this.getBuildingFromName(Constant.Buildings.MUSEUM).getLevel;
    }
    return i;
  },
  get maxtavernlevel() {
    var i = 0;
    if (this.getBuildingFromName(Constant.Buildings.TAVERN)) {
      i = this.getBuildingFromName(Constant.Buildings.TAVERN).getLevel;
    }
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
          (100 /
            (100 -
              (this.getBuildingFromName(Constant.Buildings.VINEYARD)
                ? this.getBuildingFromName(Constant.Buildings.VINEYARD).getLevel
                : 0))),
      );
      for (i = 0; i < wineUse.length; i++) {
        if (Math.abs(wineUse[i] - consumption) <= 1) {
          break;
        }
      }
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
    ) {
      h =
        Constant.GovernmentData[database.getGlobalData.getGovernmentType]
          .governors;
    }
    return Math.floor(i * 100) + h * 100;
  },
  get maxAP() {
    var i = 0;
    if (this.getBuildingFromName(Constant.Buildings.TOWN_HALL)) {
      i = this.getBuildingFromName(Constant.Buildings.TOWN_HALL).getLevel;
    }
    return Constant.BuildingData[Constant.Buildings.TOWN_HALL].actionPointsMax[
      i
    ];
  },
  get maxSci() {
    //var i = 0;
    var i;
    if (this.getBuildingFromName(Constant.Buildings.ACADEMY)) {
      i = this.getBuildingFromName(Constant.Buildings.ACADEMY).getLevel;
    }
    return (
      Constant.BuildingData[Constant.Buildings.ACADEMY].maxScientists[i] || ""
    );
  },
  get iSci() {
    // Returns "" or 0 depending on the academy; both are falsy, and render.ts
    // only tests it for truthiness. Typed loosely to preserve that.
    var i: any = "";
    if (this.getBuildingFromName(Constant.Buildings.ACADEMY)) {
      i = 0;
    }
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
    this._coordinates = { x: x, y: y };
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
    if (changed) {
      this._culturalGoods = value;
    }
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
    if (this.getBuildingFromName(Constant.Buildings.TOWN_HALL)) {
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
    }
    if (
      database.getGlobalData.getResearchTopicLevel(
        Constant.Research.Science.WELL_CONSTRUCTION,
      ) &&
      (this.getBuildingFromName(Constant.Buildings.PALACE) ||
        database.getCityCount == 1)
    ) {
      mPop += 50;
    }
    if (
      database.getGlobalData.getResearchTopicLevel(
        Constant.Research.Economy.UTOPIA,
      ) &&
      this.getBuildingFromName(Constant.Buildings.PALACE)
    ) {
      mPop += 200;
    }
    if (
      database.getGlobalData.getResearchTopicLevel(
        Constant.Research.Economy.HOLIDAY,
      )
    ) {
      mPop += 50;
    }
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
    $.each(this.getBuildings, function (idx, building) {
      // Boolean arithmetic in the original; made explicit, same result.
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
    if (!this._capacities.invalid) {
      return this._capacities;
    }
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
    $.each(
      this.getBuildingsFromName(Constant.Buildings.WAREHOUSE),
      function (i, building) {
        ret[Constant.Buildings.WAREHOUSE].storage +=
          Constant.BuildingData[Constant.Buildings.WAREHOUSE].capacity[
            building.getLevel - 1
          ];
        ret[Constant.Buildings.WAREHOUSE].safe += building.getLevel * 480;
      },
    );
    $.each(
      this.getBuildingsFromName(Constant.Buildings.DUMP),
      function (i, building) {
        ret[Constant.Buildings.DUMP].storage +=
          Constant.BuildingData[Constant.Buildings.DUMP].capacity[
            building.getLevel - 1
          ];
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
            Constant.PremiumData[Constant.Premium.STORAGECAPACITY_BONUS].bonus),
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
    var r: any = {
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
      var eventBonus = 0; // bonus for a server transfer / merge
      r.museum.cultural = this.getCulturalGoods * 50 + eventBonus;
      r.museum.level =
        Constant.BuildingData[Constant.Buildings.MUSEUM].basicBonus[
          this.getBuildingFromName(Constant.Buildings.MUSEUM).getLevel
        ];
    }
    r.government =
      Constant.GovernmentData[database.getGlobalData.getGovernmentType]
        .happiness +
      Constant.GovernmentData[database.getGlobalData.getGovernmentType]
        .happinessWithoutTemple *
        Number(
          this.getBuildingFromName(Constant.Buildings.TEMPLE) == undefined,
        ); //todo
    if (this.getBuildingFromName(Constant.Buildings.TAVERN)) {
      var wineUse;
      wineUse = Constant.BuildingData[Constant.Buildings.TAVERN].wineUse;
      if (ikariam.Server() == "s202")
        wineUse = Constant.BuildingData[Constant.Buildings.TAVERN].wineUse2;
      r.tavern.level =
        Constant.BuildingData[Constant.Buildings.TAVERN].basicBonus[
          this.getBuildingFromName(Constant.Buildings.TAVERN).getLevel
        ];
      var consumption = Math.floor(
        this.getResource(Constant.Resources.WINE).getConsumption *
          (100 /
            (100 -
              (this.getBuildingFromName(Constant.Buildings.VINEYARD)
                ? this.getBuildingFromName(Constant.Buildings.VINEYARD).getLevel
                : 0))),
      );
      for (var i = 0; i < wineUse.length; i++) {
        if (Math.abs(wineUse[i] - consumption) <= 1) {
          r.tavern.wineConsumption =
            Constant.BuildingData[Constant.Buildings.TAVERN].wineBonus[i];
          break;
        }
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
    for (var n in r) {
      if (typeof r[n] === "object") {
        for (var o in r[n]) {
          total += r[n][o];
        }
      } else {
        total += r[n];
      }
    }
    r.total = total;
    r.corruption = Math.round(this._population + this._pop.happiness - total);
    return r;
  },
  updatePopulation: function (population) {
    var changed = this._population != population;
    this._population = population;
    this._lastPopUpdate = $.now();
    return changed;
  },
  updateCitizens: function (citizens) {
    var changed = this._citizens != citizens;
    this._citizens = citizens;
    this._lastPopUpdate = $.now();
    return changed;
  },
  projectPopData: function (untilTime) {
    var serverTyp = 1;
    if (ikariam.Server() == "s201" || ikariam.Server() == "s202") serverTyp = 3;
    var plus = this._getSatisfactionData;
    var maxPopulation = this._getMaxPopulation;
    var happiness = (1 - this.getCorruption) * plus.total - this._population;
    var hours = (untilTime - this._lastPopUpdate) / 3600000;
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
    var old = $.extend({}, this._pop);
    this._pop = {
      currentPop: pop,
      maxPop: maxPopulation,
      satisfaction: plus,
      happiness: happiness,
      growth: happiness * 0.02 * serverTyp,
    };
    if (
      Math.floor(old.currentPop) != Math.floor(this._pop.currentPop) ||
      Math.floor(old.maxPop) != Math.floor(this._pop.maxPop) ||
      Math.floor(old.happiness) != Math.floor(this._pop.happiness)
    ) {
      events(Constant.Events.CITY_UPDATED).pub(this.getId, {
        population: true,
      });
    }
  },
  get populationData() {
    return this._pop;
  },
  processUnitBuildList: function () {
    var newList = [];
    var j;
    for (var i = 0; i < this.unitBuildList.length; i++) {
      var list = this.unitBuildList[i];
      if (list.completionTime <= $.now()) {
        for (var uID in list.units) {
          j = this.army.length;
        }
        while (j) {
          j--;
          if (uID == this.army[j].id) {
            this.army[uID] += list.units[uID];
          }
        }
      } else {
        newList.push(list);
      }
    }
    this.unitBuildList = newList;
  },
  clearUnitBuildList: function (type) {
    var newList = [];
    if (type) {
      for (var i = 0; i < this.unitBuildList.length; i++) {
        if (this.unitBuildList[i].type != type) {
          newList.push(this.unitBuildList[i]);
        }
      }
    }
    this.unitBuildList = newList;
  },
  getUnitBuildsByUnit: function () {
    var ret = {};
    for (var i = 0; i < this.unitBuildList.length; i++) {
      for (var uID in this.unitBuildList[i].units) {
        ret[uID] = ret[uID] || [];
        ret[uID].push({
          count: this.unitBuildList[i].units[uID],
          completionTime: this.unitBuildList[i].completionTime,
        });
      }
    }
    return ret;
  },
  getUnitTransportsByUnit: function () {
    var ret = {};
    var data = database.getGlobalData.militaryMovements[this.getId];
    if (data) {
      for (var row in data) {
        for (var uID in data[row].troops) {
          ret[uID] = ret[uID] || [];
          ret[uID].push({
            count: data[row].troops[uID],
            arrivalTime: data[row].arrivalTime,
            origin: data[row].originCityId,
          });
        }
      }
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
    $.each(this.getBuildings, function (idx, building) {
      res = res || building.isUpgrading;
    });
    return res;
  },
};
