/* eslint-disable */
/**
 * Mechanically ported from the original `legacy/Quản lý Ika Perseus -VN- V2.js`.
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "../jquery";
import { Constant } from "../constants";
import { Utils } from "../utils";
import { database } from "../database";
import { events } from "../events";
import { REDUCTION_BUILDING_MAX_PERCENT } from "@core/ikariam/model";
import { accountBuildTimeBuff } from "@core/storage";
import { accountName } from "../empire";

/**
 * Each level of Chronos' Forge leaves 80% of the construction time: its help
 * page lists -20% at level 1, -36% at 2, -48.8% at 3 ... -89.263% at 10,
 * which is exactly 1 - 0.8^level.
 */
const CHRONOS_FORGE_TIME_FACTOR_PER_LEVEL = 0.8;

export function Building(city, pos) {
  this._position = pos;
  this._level = 0;
  this._name = null;
  this.city = Utils.wrapInClosure(city);
  this._updateTimer = null;
  this._statusPoll = null;
}
(Building as any).prototype = {
  startUpgradeTimer: function () {
    if (this._updateTimer) {
      this._updateTimer();
      delete this._updateTimer;
    }
    if (this._statusPoll) {
      this._statusPoll();
      delete this._statusPoll;
    }
    if (this._completionTime) {
      if (this._completionTime - $.now() < 5000) {
        this.completeUpgrade();
      } else {
        this._updateTimer = events.scheduleActionAtTime(
          this.completeUpgrade.bind(this),
          this._completionTime - 4000,
        );
      }
    }
    // Two fixes to the original, both visible only at runtime.
    //
    // 1. The IIFE was called bare — `})(this.isUpgradable, ...)` — so its own
    //    `this` was the global object in the original's sloppy mode, and the
    //    `.bind(this)` below therefore bound the callback to `window`. It read
    //    `window.isUpgradable` (undefined) and published one bogus
    //    BUILDINGS_UPDATED with `position: undefined` before going quiet. The
    //    bundle is strict-mode ESM, where that `this` is `undefined` instead,
    //    so it threw `Cannot read properties of undefined` every 3 seconds —
    //    once per building, per town. `.call(this, ...)` is what was meant.
    //
    // 2. The returned canceller was dropped on the floor. `startUpgradeTimer`
    //    runs once per building from `city.init()` and again from `update()`
    //    whenever a completion time appears, so the intervals stacked up for
    //    the life of the session. It is now stored and cleared like
    //    `_updateTimer` directly above.
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
        3000,
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
      !!completion != this.isUpgrading; // todo
    if (changed) {
      changes = {
        position: this._position,
        name: this.getName,
        upgraded: this.isUpgrading != !completion,
      }; //todo
    }
    if (completion) {
      this._completionTime = completion * 1000;
      this.startUpgradeTimer();
    } else if (this._completionTime) {
      delete this._completionTime;
    }
    this._name = name;
    this._level = level;
    if (changed) {
      return changes;
    }
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
    if (this.isEmpty) {
      return {
        wood: Infinity,
        glass: 0,
        marble: 0,
        sulfur: 0,
        wine: 0,
        time: 0,
      };
    }
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
    // The research discounts (`bon`, 14% at most) and the reduction
    // building's (1% per level, 50% at most) add up and come off the base
    // cost once: 64% at most, never compounded.
    const reductionBy = (buildingName: string) => {
      const building = this.city().getBuildingFromName(buildingName);
      return building
        ? Math.min(building.getLevel, REDUCTION_BUILDING_MAX_PERCENT) / 100
        : 0;
    };
    // Seconds per level from the game's help pages, like the costs below:
    // index = current level. Levels past the table have no figure yet.
    // The server's construction-time buff for this account comes off first,
    // then this town's Chronos' Forge, which does not speed up its own
    // upgrades.
    const forge =
      this._name === Constant.Buildings.CHRONOSFORGE
        ? null
        : this.city().getBuildingFromName(Constant.Buildings.CHRONOSFORGE);
    const upgradeSeconds =
      (time[level] || 0) *
      (1 - accountBuildTimeBuff(accountName)) *
      Math.pow(CHRONOS_FORGE_TIME_FACTOR_PER_LEVEL, forge ? forge.getLevel : 0);
    const reducedCost = (resource: string, buildingName: string) =>
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
      // The seconds above with the government's modifier, rounded to a whole
      // second, then in milliseconds.
      time: Math.round(upgradeSeconds * bonTime) * 1000,
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
    return this._completionTime > $.now();
  },
  subtractUpgradeResourcesFromCity: function () {
    var cost = this.getUpgradeCost;
    $.each(
      Constant.Resources,
      function (key, resourceName) {
        this.city()
          .getResource(resourceName)
          .increment(cost[resourceName] * -1);
      }.bind(this),
    );
    this._completionTime = $.now() + cost.time;
  },
  get isUpgradable() {
    if (this.isEmpty || this.isMaxLevel) {
      return false;
    }
    var cost = this.getUpgradeCost;
    var upgradable = true;
    $.each(
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
  // The original left this body empty, so the accessor always returned
  // undefined. Behaviour is unchanged; it is only written out explicitly so TS
  // stops reporting "a 'get' accessor must return a value".
  get getCompletionDate() {
    return undefined;
  },
  get isMaxLevel() {
    // The game has no level cap any more. `maxLevel` is the level where the
    // building's effect stops growing, as its help page describes, and 0 for
    // a building whose page names none. Upgrading past it is still possible.
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
      { position: this._position, name: this.getName, upgraded: true },
    ]);
  },
};
