/* eslint-disable */
/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $ from "../jquery";
import { Constant } from "../constants";
import { Utils } from "../utils";
import { database } from "../database";
import { ikariam } from "../game-api";

export function CityResearch(city) {
  this._researchersLastUpdate = 0;
  this._researchers = 0;
  this._researchCostLastUpdate = 0;
  this._researchCost = 0;
  this.city = Utils.wrapInClosure(city);
}

(CityResearch as any).prototype = {
  updateResearchers: function (researchers) {
    var changed = this._researchers !== researchers;
    this._researchers = researchers;
    this._researchersLastUpdate = $.now();
    this._researchCost = this.getResearchCost;
    return changed;
  },
  updateCost: function (cost) {
    var changed = this._researchCost !== cost;
    this._researchCost = cost;
    this._researchCostLastUpdate = $.now();
    this._researchers = this.getResearchers;
    return changed;
  },
  get getResearchers() {
    if (this._researchersLastUpdate < this._researchCostLastUpdate) {
      return Math.floor(this._researchCost / this._researchCostModifier);
    } else {
      return this._researchers;
    }
  },
  get getResearch() {
    return this.researchData.total;
  },
  get researchData() {
    if (!this._researchData) {
      this._researchData = Utils.cacheFunction(
        this.researchDataCached.bind(this),
        1000,
      );
    }
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
        ? 0 + Constant.PremiumData[Constant.Premium.RESEARCH_POINTS_BONUS].bonus
        : 0;
    var goods =
      Constant.GovernmentData[database.getGlobalData.getGovernmentType]
        .researchPerCulturalGood * this.city()._culturalGoods;
    var researchers = this.getResearchers;
    var corruptionSpend = researchers * this.city().getCorruption;
    var nonCorruptedResearchers = researchers * (1 - this.city().getCorruption);
    var premiumResBonus = nonCorruptedResearchers * premBon;
    var researchBonus = nonCorruptedResearchers * resBon;
    var premiumGoodsBonus = goods * premBon;
    var serverTyp = 1;
    if (ikariam.Server() == "s201" || ikariam.Server() == "s202") serverTyp = 3;
    return {
      scientists: researchers,
      researchBonus: researchBonus,
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
    if (ikariam.Server() == "s201" || ikariam.Server() == "s202") serverTyp = 3;
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
