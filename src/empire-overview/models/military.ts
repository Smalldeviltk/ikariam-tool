/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "../jquery";
import { Constant } from "../constants";
import { Utils } from "../utils";
import { events } from "../events";

export function Military(city) {
  this.city = Utils.wrapInClosure(city);
  this._units = new MilitaryUnits();
  this._advisorLastUpdate = 0;
  this.armyTraining = [];
  this._trainingTimer = null;
}
(Military as any).prototype = {
  init: function () {
    this._trainingTimer = null;
    this._startTrainingTimer();
  },
  _getTrainingTotals: function () {
    var ret = {};
    $.each(this.armyTraining, function (index, training) {
      $.each(Constant.UnitData, function (unitId, info) {
        ret[unitId] = ret[unitId]
          ? ret[unitId] + (training.units[unitId] || 0)
          : training.units[unitId] || 0;
      });
    });
    return ret;
  },
  get getTrainingTotals() {
    if (!this._trainingTotals) {
      this._trainingTotals = Utils.cacheFunction(
        this._getTrainingTotals.bind(this),
        1000,
      );
    }
    return this._trainingTotals();
  },
  _getIncomingTotals: function () {
    var ret = {};
    $.each(this.city().getIncomingMilitary, function (index, element) {
      for (var unitName in Constant.UnitData) {
        ret[unitName] = ret[unitName]
          ? ret[unitName] + (element.getMilitary.totals[unitName] || 0)
          : element.getMilitary.totals[unitName] || 0;
      }
    });
    return ret;
  },
  get getIncomingTotals() {
    if (!this._incomingTotals) {
      this._incomingTotals = Utils.cacheFunction(
        this._getIncomingTotals.bind(this),
        1000,
      );
    }
    return this._incomingTotals();
  },
  getTrainingForUnit: function (unit) {
    var ret = [];
    $.each(this.armyTraining, function (index, training) {
      $.each(training.units, function (unitId, count) {
        if (unitId === unit) {
          ret.push({ count: count, time: training.completionTime });
        }
      });
    });
    return ret;
  },
  setTraining: function (trainingQueue) {
    if (!trainingQueue.length) return false;
    this._stopTrainingTimer();
    var type = trainingQueue[0].type;
    var changes = this._clearTrainingForType(type);
    $.each(
      trainingQueue,
      function (index, training) {
        this.armyTraining.push(training);
        $.each(training.units, function (unitId, count) {
          changes.push(unitId);
        });
      }.bind(this),
    );
    this.armyTraining.sort(function (a, b) {
      return a.completionTime - b.completionTime;
    });
    this._startTrainingTimer();
    return $.exclusive(changes);
  },
  _clearTrainingForType: function (type) {
    var oldTraining = this.armyTraining.filter(function (item) {
      return item.type === type;
    });
    this.armyTraining = this.armyTraining.filter(function (item) {
      return item.type !== type;
    });
    var changes = [];
    $.each(oldTraining, function (index, training) {
      $.each(training.units, function (unitId, count) {
        changes.push(unitId);
      });
    });
    return changes;
  },
  _completeTraining: function () {
    if (this.armyTraining.length) {
      if (this.armyTraining[0].completionTime < $.now() + 5000) {
        var changes = [];
        var training = this.armyTraining.shift();
        $.each(
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
    if (this.armyTraining.length) {
      this._trainingTimer = events.scheduleActionAtTime(
        this._completeTraining.bind(this),
        this.armyTraining[0].completionTime,
      );
    }
  },
  _stopTrainingTimer: function () {
    if (this._trainingTimer) {
      this._trainingTimer();
    }
    this._trainingTimer = null;
  },
  updateUnits: function (counts) {
    var changes = [];
    $.each(
      counts,
      function (unitId, count) {
        if (this._units.setUnit(unitId, count)) {
          changes.push(unitId);
        }
      }.bind(this),
    );
    return changes;
  },
  get getUnits() {
    return this._units;
  },
};
// `obj` is optional: several call sites construct an empty MilitaryUnits.
export function MilitaryUnits(obj?) {
  this._units = obj !== undefined ? obj._units : {};
}
(MilitaryUnits as any).prototype = {
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
