/* eslint-disable */
/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "../jquery";
import { Utils } from "../utils";

export function Changes(city, type, changes) {
  this.city = city || null;
  this.type = type || null;
  this.changes = changes || [];
}
export function Population(city) {
  this._population = 0;
  this._citizens = 0;
  this._resourceWorkers = 0;
  this._tradeWorkers = 0;
  this._priests = 0;
  this._culturalGoods = 0;

  this._popChanged = $.now();
  this._citizensChanged = $.now();
  this._culturalGoodsChanged = $.now();
  this._priestsChanged = $.now();
  this.city = Utils.wrapInClosure(city);
}
(Population as any).prototype = {
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
    this._popChanged = $.now();
  },
  get citizens() {
    return this._citizens;
  },
  set citizens(newVal) {
    this._citizens = newVal;
    this._citizensChanged = $.now();
  },
  get priests() {
    return this._priests;
  },
  set priests(newVal) {
    this._priests = newVal;
    this._priestsChanged = $.now();
  },
};
