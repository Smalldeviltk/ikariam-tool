/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "../jquery";
import { Constant } from "../constants";
import { MilitaryUnits } from "../models/military";
import { database } from "../database";
import { events } from "../events";

/**
 * Two call shapes, as in the original: either a single object to copy from, or
 * the nine fields spelled out. Everything after `id` is therefore optional.
 */
export function Movement(
  id,
  originCityId?,
  targetCityId?,
  arrivalTime?,
  mission?,
  loadingTime?,
  resources?,
  military?,
  ships?,
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
(Movement as any).prototype = {
  startUpdateTimer: function () {
    this.clearUpdateTimer();
    if (this.isCompleted) {
      this.updateTransportComplete();
    } else {
      this._updateTimer = events.scheduleActionAtTime(
        this.updateTransportComplete.bind(this),
        this._arrivalTime + 1000,
      );
    }
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
    return this._loadingTime - $.now();
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
    return this._arrivalTime < $.now();
  },
  get isLoading() {
    return this._loadingTime > $.now();
  },
  get getRemainingTime() {
    return this._arrivalTime - $.now();
  },
  updateTransportComplete: function () {
    if (this.isCompleted && !this._updatedCity) {
      var city = database.getCityFromId(this._targetCityId);
      var changes = [];
      if (city) {
        for (var resource in Constant.Resources) {
          if (this.getResource(Constant.Resources[resource])) {
            changes.push(Constant.Resources[resource]);
          }
          city
            .getResource(Constant.Resources[resource])
            .increment(this.getResource(Constant.Resources[resource]));
        }
        this._updatedCity = true;
        city = database.getCityFromId(this.originCityId);
        if (city) {
          city.updateActionPoints(city.getAvailableActions + 1);
        }
        if (changes.length) {
          events(Constant.Events.MOVEMENTS_UPDATED).pub([this.getTargetCityId]);
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
    } else if (this._updatedCity) {
      events.scheduleAction(
        function () {
          database.getGlobalData.removeFleetMovement(this._id);
        }.bind(this),
      );
    }
    return false;
  },
};
