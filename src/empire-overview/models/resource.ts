/* eslint-disable */
/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "../jquery";
import { Utils } from "../utils";

export function Resource(city, name) {
  this._current = 0;
  this._production = 0;
  this._consumption = 0;
  this._currentChangedDate = $.now();
  this.city = Utils.wrapInClosure(city);
  this._name = name;
  // The original had `return this;` here. Returning `this` from a constructor
  // called with `new` is a no-op (JS already returns it), but it gives the
  // function a non-void return type, which makes TS reject `new Resource(...)`.
  // Dropped; behaviour is identical.
}

(Resource as any).prototype = {
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
    this._currentChangedDate = $.now();
    return changed;
  },
  project: function () {
    var limit = Math.floor($.now() / 1000);
    var start = Math.floor(this._currentChangedDate / 1000);
    while (limit > start) {
      this._current += this._production;
      if (Math.floor(start / 3600) != Math.floor((start + 1) / 3600)) {
        if (this._current > this._consumption) {
          this._current -= this._consumption;
        } else {
          this.city().projectPopData(start * 1000);
          this._consumption = 0;
        }
      }
      start++;
    }
    this._currentChangedDate = limit * 1000;
    this.city().projectPopData(limit * 1000);
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
