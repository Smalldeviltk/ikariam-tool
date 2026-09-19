/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "../jquery";
import { Constant } from "../constants";
import { Movement } from "../models/movement";
import { database } from "../database";
import { empire } from "../empire";

export function GlobalData() {
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

(GlobalData as any).prototype = {
  init: function () {
    var lang = database.settings.languageChange.value;
    $.each(Constant.LanguageData[lang], this.addLocalisedString.bind(this));
    $.each(
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
      ? this.premium[feature].endTime > $.now() ||
          this.premium[feature].continuous
      : false;
  },
  setPremiumFeature: function (feature, endTime, continuous) {
    var ret = !this.hasPremiumFeature(feature) && endTime > $.now();
    this.premium[feature] = { endTime: endTime, continuous: continuous };
    return ret;
  },
  getPremiumTimeRemaining: function (feature) {
    return this.premium[feature] ? this.premium[feature].endTime > $.now() : 0;
  },
  getPremiumTimeContinuous: function (feature) {
    return this.premium[feature] ? this.premium[feature].continuous : false;
  },
  removeFleetMovement: function (id) {
    var index = -1;
    $.each(
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

      $.each(transport.getResources, function (resourceName, value) {
        changes.push(resourceName);
      });
      return changes;
    } catch (e) {
      empire.error("addFleetMovement", e);
    }
  },
  getMovementById: function (id) {
    for (var i in this.fleetMovements) {
      if (this.fleetMovements[i].getId == id) {
        return this.fleetMovements[i];
      }
    }
    return false;
  },
  clearFleetMovements: function () {
    var changes = [];
    $.each(this.fleetMovements, function (index, item) {
      changes.push(item.getTargetCityId);
      item.clearUpdateTimer();
    });
    this.fleetMovements.length = 0;
    return $.exclusive(changes);
  },
  getResourceMovementsToCity: function (cityID) {
    return this.fleetMovements.filter(function (el) {
      if (el.getTargetCityId == cityID) {
        return (
          el.getMission == "trade" ||
          el.getMission == "transport" ||
          el.getMission == "plunder"
        );
      }
    });
  },
  getMilitaryMovementsToCity: function (cityID) {
    return this.fleetMovements.filter(function (el) {
      if (el.getOriginCityId == cityID) {
        return (
          el.getMission != "trade" &&
          el.getMission != "transport" &&
          el.getMission == "plunder" &&
          el.getMission == "deploy"
        );
      }
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
    var lString;
    lString =
      this.localStrings[string.replace(/([A-Z])/g, "_$1").toLowerCase()];
    if (lString == undefined)
      lString = this.localStrings[string.toLowerCase().split(" ").join("_")];
    return lString == undefined ? string : lString;
  },
  addLocalisedString: function (string, value) {
    if (this.getLocalisedString(string) == string)
      this.localStrings[string.toLowerCase().split(" ").join("_")] = value;
  },
  isOldVersion: function () {
    return this._version.latestVersion < this._version.installedVersion;
  },
};
