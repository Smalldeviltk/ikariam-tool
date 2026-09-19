/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import $, { isChrome } from "./jquery";
import { Constant } from "./constants";
import { Utils } from "./utils";
import { database } from "./database";
import { empire } from "./empire";
import { events } from "./events";
import { ikariam } from "./game-api";

export const render: any = {
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
      if (render.toolTip.timer) {
        render.toolTip.timer();
      }
      var f = (function (shiftKey) {
        return function (_alsoShiftKey?) {
          var elem;
          elem = $(event.target).attr("data-tooltip")
            ? event.target
            : $(event.target).parents("[data-tooltip]");

          render.toolTip.elem.html(
            render.toolTip.dynamicTip(
              $(event.target).parents("tr").attr("id")
                ? $(event.target).parents("tr").attr("id").split("_").pop()
                : 0,
              elem,
            ),
          );
          return render.toolTip.elem.html();
        };
      })(event.originalEvent.shiftKey);
      if (f(event.originalEvent.shiftKey)) {
        render.toolTip.show();
        render.toolTip.timer = events.scheduleActionAtInterval(f, 1000);
      }
    },
    mouseMove: function (event) {
      if (render.toolTip.timer && render.toolTip.elem) {
        var l = parseInt(render.mainContentBox.css("left").split("px")[0]);
        var t = parseInt(render.mainContentBox.css("top").split("px")[0]);
        var x = event.pageX - 15 - l;
        var y = event.pageY + 20 - t;

        if (render.mainContentBox.height() - render.toolTip.elem.height() < y) {
          y = event.pageY - render.toolTip.elem.height() - 15 - t;
        }
        if (render.mainContentBox.width() - render.toolTip.elem.width() < x) {
          x = event.pageX - render.toolTip.elem.width() + 15 - l;
        }
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
          $(
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
      var $elem = $(elem);
      var tiptype;
      if ($elem.attr("data-tooltip") === "dynamic") {
        tiptype = $elem.attr("class").split(" ");
      } else {
        return $elem.attr("data-tooltip") || "";
      }
      var city = database.getCityFromId(id);
      var resourceName;
      if (city) {
        resourceName = $elem.is("td")
          ? $elem.attr("class").split(" ").pop()
          : $elem.parent("td").attr("class").split(" ").pop();
      }
      var total;
      switch (tiptype.shift()) {
        case "incoming":
          return getIncomingTip();
          break;
        case "current":
          return "";
          break;
        case "progressbar":
          if (resourceName !== Constant.Resources.GOLD) return getProgressTip();
          break;
        case "total":
          switch ($elem.attr("id").split("_").pop()) {
            case "sigma":
              return getResourceTotalTip();
              break;
            case "goldincome":
              return getGoldIncomeTip();
              break;
            case "research":
              var researchDat;
              $.each(database.cities, function (cityId, city) {
                if (researchDat) {
                  $.each(city.research.researchData, function (key, value) {
                    researchDat[key] += value;
                  });
                } else researchDat = $.extend({}, city.research.researchData);
              });
              return getResearchTip(researchDat);
              break;
            case "army":
              return "soon";
              break;
            case "wineincome":
              total = 0;
              var consumption = 0;
              resourceName = $elem
                .attr("id")
                .split("_")
                .pop()
                .split("income")
                .shift();
              $.each(database.cities, function (cityId, c) {
                total += c.getResource(resourceName).getProduction;
                consumption += c.getResource(resourceName).getConsumption;
              });
              return getProductionConsumptionSubSumTip(
                total * 3600,
                consumption,
                true,
              );
              break;
            default:
              total = 0;
              resourceName = $elem
                .attr("id")
                .split("_")
                .pop()
                .split("income")
                .shift();
              $.each(database.cities, function (cityId, c) {
                total += c.getResource(resourceName).getProduction;
              });
              return getProductionTip(total * 3600);
              break;
          }
        case "pop":
          return getPopulationTip();
          break;
        case "happy":
          return getGrowthTip();
          break;
        case "garrisonlimit":
          return getActionPointsTip();
          break;
        case "wonder":
          return city.getBuildingFromName(Constant.Buildings.TEMPLE)
            ? getWonderTip()
            : getNoWonderTip();
          break;
        case "prodconssubsum consumption Red":
          return getFinanceTip();
          break;
        case "scientists":
          return getResearchTip();
          break;
        case "prodconssubsum":
          return resourceName === Constant.Resources.GOLD
            ? getFinanceTip()
            : getProductionConsumptionSubSumTip(
                city.getResource(resourceName).getProduction * 3600,
                city.getResource(resourceName).getConsumption,
              );
          break;
        case "building":
          var bName = tiptype.shift();
          var index = parseInt(bName.slice(-1));
          bName = bName.slice(0, -1);
          return getBuildingTooltip(city.getBuildingsFromName(bName)[index]);
        case "army":
          switch (tiptype.shift()) {
            case "unit":
              return "";
              break;
            case "movement":
              return getArmyMovementTip(tiptype.pop());
              break;
            case "incoming":
              // UNIMPLEMENTED IN THE ORIGINAL. This called
              // `getIncomeMovementTip(...)`, a function that is defined nowhere
              // in the 10,767 lines of the source script, so hovering an
              // incoming-army cell threw a ReferenceError. (Note it is NOT the
              // same as `getIncomingTip()` above, which is the RESOURCE
              // incoming tooltip and does exist.)
              //
              // Returning "" matches how the author handled the other
              // unimplemented tooltip in this very switch (`case "unit"`), and
              // how the commented-out `case "plunder"` was parked. Writing an
              // implementation would mean inventing both the markup and the
              // data source, so the feature stays off until it is specified.
              return "";
            /*   case "plunder":
        return getPlunderMovementTip(tiptype.pop());
        break	*/
          }
          break;
        default:
          return "";
          break;
      }

      function getGoldIncomeTip() {
        var researchCost = 0;
        var income = 0;
        var sigmaIncome = 0;
        $.each(database.cities, function (cityID, city) {
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
        $.each(city.military.getTrainingForUnit(unit), function (index, data) {
          rows += Utils.format(
            '<tr class="data">\n    <td><b>+</b></td>\n    <td >{0}</td>\n    <td ><i>« {1}</i></td>\n</tr>',
            [data.count, Utils.FormatTimeLengthToStr(data.time - $.now(), 3)],
          );
          total += data.count;
        });

        if (rows === "") {
          return "";
        } else {
          return Utils.format(table, [getImage(unit), rows, total]);
        }
      }
      function getPopulationTip() {
        var populationData = city.populationData;
        var popDiff = populationData.maxPop - populationData.currentPop;
        var Tip = "";
        if (popDiff !== 0) {
          Tip =
            '<tr class="data"><tfoot>&nbsp;' +
            Utils.FormatTimeLengthToStr(
              (popDiff / populationData.growth) * 3600000,
              4,
            ) +
            "<td> « " +
            Constant.LanguageData[lang].time_to_full +
            "</td>\n    </tr>\n</tfoot>";
        }
        var populationTip =
          '<table>\n    <thead>\n    <th colspan="2"><div align="center">\n <img src="cdn/all/both/resources/icon_population.png" style="height: 15px; float: left"><b>{0}</b></div></th>\n    </thead>\n    <tbody>\n ' +
          '<tr class="data">\n        <td>{1}</td>\n        <td>« {5}</td>\n    </tr>\n' +
          '<tr class="data">\n        <td>{2}</td>\n        <td>« {0}</td>\n    </tr>\n' +
          '<tr class="data">\n        <td>{3}</td>\n        <td>« {6}</td>\n    </tr>\n' +
          '<tr class="data">\n        <td>{4}</td>\n        <td>« {7}</td>\n    </tr></tbody>\n </table>{8}';
        return Utils.format(populationTip, [
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
        ]);
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
        if (popDiff > 0) {
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
                : Utils.FormatNumToStr(populationData.growth * 24, false, 2)) +
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
        }
        var corruption = "<td>" + city.CorruptionCity + "";
        if (city.CorruptionCity > 0) {
          corruption = '<td class="red">' + city.CorruptionCity + "";
        }
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
          '_x25.png" style="height: 18px; float: left"><b>{0}</b></div></th>\n    </thead>\n    <tbody>\n ' +
          '<tr class="data">\n        <td>{1}</td>\n        <td>« {2}</td>\n    </tr>\n' +
          '<tr class="data">\n            {3}</td>\n        <td>« {4}</td>\n    </tr>\n' +
          '<tr class="data">\n        <td>{5}</td>\n        <td>« {6}</td>\n    </tr>\n' +
          '<tr class="data">\n        <td>{7}</td>\n        <td>« {8}</td>\n    </tr></tbody>\n  </table> {9}';
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
          Math.floor(city.tavernlevel) + "/" + Math.floor(city.maxtavernlevel),
          Constant.LanguageData[lang].level_tavern,
          Tip,
        ]);
      }
      function getActionPointsTip() {
        var garrisonTip =
          '<table>\n    <thead>\n    <th colspan="3"><div align="center">\n <b>{0}</b></div></th>\n    </thead>\n    <tbody>\n ' +
          '<tr class="data">\n        <td>{1}</td>\n        <td>{2}</td>\n        <td>« {3}</td>\n    </tr>\n' +
          '<tr class="data">\n        <td>{4}</td>\n        <td>{5}</td>\n        <td>« {6}</td>\n    </tr>\n</tfoot></table>';
        return Utils.format(garrisonTip, [
          Constant.LanguageData[lang].garrision,
          '<img src="cdn/all/both/advisors/military/bang_soldier.png" style="height: 15px;">',
          city.garrisonland,
          Constant.LanguageData[lang].Inland,
          '<img src="cdn/all/both/advisors/military/bang_ship.png" style="height: 15px;">',
          city.garrisonsea,
          Constant.LanguageData[lang].Sea,
        ]);
      }
      function getWonderTip() {
        var populationData = city.populationData;
        var wonderTip =
          '<table>\n    <thead>\n    <th colspan="3"><div align="center">\n <img src="cdn/all/both/wonder/w{0}.png" style="height: 25px; float: left">{1}</div></th>\n    </thead>\n    <tbody>\n ' +
          '<tr class="data">\n        <td>{2}</td>\n        <td>« {3}</td>\n    </tr>\n' +
          '<tr class="data">\n        <td>{4}%</td>\n       <td>« {5}</td>\n    </tr>\n' +
          "</tbody></table>";
        return Utils.format(wonderTip, [
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
        ]);
      }
      function getNoWonderTip() {
        var populationData = city.populationData;
        var size = 25;
        /*if (city.getWonder == 4 || 5)
		size = 30;*/
        var noWonderTip =
          '<table><thead><th colspan="3"><div align="center"><img src="cdn/all/both/wonder/w{0}.png" style="height: {4}px; float: left">{1}</div></th></thead>\n    <tbody>\n ' +
          '<tr class="data">\n        <td>{2}</td>\n        <td> {3}</td>\n    </tr>\n' +
          "</tbody></table>";
        return Utils.format(noWonderTip, [
          city.getWonder,
          "Brunnen des<br>Poseidon",
          "kein Tempel in",
          city._name,
          size,
        ]);
      }
      function getFinanceTip() {
        var totCity = Math.floor(city.getIncome + city.getExpenses);
        var Tip = "";
        if (city.getExpenses < 0) {
          Tip =
            "<td></td><td>" +
            Utils.FormatNumToStr(city.getExpenses, true, 0) +
            "</td><td>" +
            Utils.FormatNumToStr(city.getExpenses * 24, true, 0) +
            "</td><td><i>" +
            Utils.FormatNumToStr(city.getExpenses * 24 * 7, true, 0) +
            "</i></td><td></td></tr></tbody><tfoot><tr><td>\u03A3<b> " +
            (totCity > 0 ? "+&nbsp;" : "-&nbsp;") +
            "</b></td><td>" +
            Utils.FormatNumToStr(totCity, false, 0) +
            "</td><td>" +
            Utils.FormatNumToStr(totCity * 24, false, 0) +
            "</td><td><i>" +
            Utils.FormatNumToStr(totCity * 7 * 24, false, 0) +
            "</i></td><td></td></tr></tfoot>";
        }
        var financeTip =
          '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_upkeep.png" style="height: 14px;"></td><td><b>{0}</b></td><td><b>{1}</b></td><td><b>{2}</b></div><td></td></th>\n    </thead>\n    <tbody>\n ' +
          '<tr class="data">\n        <td></td>\n        <td>{3}</td>\n        <td>{4}</td>\n        <td><i>{5}</i></td>\n        <td></td>\n    </tbody></tr>\n{6}</table>';
        return Utils.format(financeTip, [
          "1 " + Constant.LanguageData[lang].hour,
          "1 " + Constant.LanguageData[lang].day,
          "1 " + Constant.LanguageData[lang].week,
          Utils.FormatNumToStr(city.getIncome, true, 0),
          Utils.FormatNumToStr(city.getIncome * 24, false, 0),
          Utils.FormatNumToStr(city.getIncome * 24 * 7, false, 0),
          Tip,
        ]);
      }
      function getResearchTip(researchData?) {
        researchData = researchData || city.research.researchData;
        var tooltip =
          researchData.scientists > 0
            ? '<table>\n    <thead>\n  <th colspan="5"><div align="center">\n <img src="cdn/all/both/buildings/y50/y50_academy.png" style="height: 20px; float: left"><b>{0}</b></div></th>\n    </thead>\n    <tbody>\n ' +
              '<tr class="data">\n        <td>{1}</td>\n        <td colspan="4">« {2}</td>\n    </tr>\n' +
              '<tr class="data">\n        <td>{3}</td>\n        <td colspan="4">« {4}</td>\n    </tr>\n' +
              '<thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_research_time.png" style="height: 14px;">  <td><b>{5}</b></td><td><b>{6}</b></td><td><b>{7}</b></div><td></td></th>\n    </thead>\n    <tbody>\n  ' +
              '<tr class="data">\n        <td>{11}</td>\n        <td>{8}</td>\n        <td>{9}</td>\n    <td><i>{10}</i></td>\n        <td></td></tr>\n</table>'
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
        var test: any = ""; //ToDo
        test = $("#js_MilitaryMovementsEventRow1546373TargetLink");
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
            if (!$.isNumeric(movID)) {
              break;
            }
            if (rMov[movID].getResources[resourceName]) {
              var origin = database.getCityFromId(rMov[movID].getOriginCityId);
              var tMov = Utils.format(row, [
                rMov[movID].getMission,
                Utils.FormatNumToStr(
                  rMov[movID].getResources[resourceName],
                  false,
                  0,
                ),
                origin ? origin.getName : rMov[movID].getOriginCityId,
                Utils.FormatRemainingTime(rMov[movID].getArrivalTime - $.now()),
                rMov[movID].isLoading
                  ? Constant.LanguageData[lang].loading +
                    ": " +
                    Utils.FormatRemainingTime(rMov[movID].getLoadingTime, false)
                  : rMov[movID].getArrivalTime > $.now()
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
          if (trades === "" && transp === "" && plunder === "") {
            return "";
          }
          var body =
            trades +
            transp +
            plunder +
            Utils.format(subtotal, [
              Utils.FormatNumToStr(movTotal, false, 0),
              "« " + Constant.LanguageData[lang].total_ + "",
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
          var time: any = 0;
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
                building.city().getResource(key).getCurrent < resourceCost[key]
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
                  : Constant.LanguageData[lang].next_Level + " " + costlevel) +
                "</b></th></tr></thead><tbody>" +
                elem +
                "</tbody><tfoot>" +
                time +
                "</tfoot></table>"
              : '<table><thead><tr><th colspan="3" align="center">' +
                Constant.LanguageData[lang].max_Level +
                "</th></tr></thead></table>";
          if (uConst) {
            elem =
              '<table><thead><tr><th colspan="3" align="center"><b>' +
              Constant.LanguageData[lang].constructing +
              "</b></th></tr></thead>" +
              "<tbody><tr><td></td><td>" +
              Utils.FormatFullTimeToDateString(
                building.getCompletionTime,
                true,
              ) +
              "</td></tr>" +
              '<tr><td><img src="cdn/all/both/resources/icon_time.png" style="height: 11px; float: left;"></td><td><i>(' +
              Utils.FormatTimeLengthToStr(
                building.getCompletionTime - $.now(),
                3,
                " ",
              ) +
              ")</i></td></tr></tbody></table>" +
              elem;
          }
          return elem;
        }
      }
      function getResourceTotalTip() {
        var totals = {};
        var res;
        $.each(database.cities, function (cityId, city) {
          $.each(Constant.Resources, function (key, resourceName) {
            res = city.getResource(resourceName);
            if (!totals[resourceName]) {
              totals[resourceName] = {};
            }
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
        var finalSums: any = { income: 0, total: 0, day: 0, week: 0 };
        $.each(totals, function (resourceName: string, data: any) {
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
        if (r === "") {
          return "";
        } else {
          return Utils.format(
            "<table>\n    <thead>\n    <td></td>\n    <td><b>1 {5}</b></td>\n    <td><b>{6}</b></td>\n    <td><b>+24 {7}</b></td>\n    <td><b> +1 {8}</b></td>\n  <td></td>  </thead>\n    <tbody>\n    {0}\n    <tfoot>\n    <td><b>\u03A3&nbsp;</b></td>\n    <td>{1}</td>\n    <td>{2}</td>\n    <td>{3}</td>\n    <td><i>{4}</i></td>\n  <td></td>  </tfoot>\n    </tbody>\n</td></table>",
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
      }
      function getProgressTip() {
        if (resourceName == "population" || resourceName == "ui-corner-all") {
          return "";
        }
        var storage = city.maxResourceCapacities;
        var current = city.getResource(resourceName).getCurrent;
        var fulltime =
          (city.getResource(resourceName).getFullTime ||
            0 - city.getResource(resourceName).getEmptyTime) * 3600000;
        var gold = "";
        var serverTyp = 1;
        if (ikariam.Server() == "s201" || ikariam.Server() == "s202")
          serverTyp = 3;
        if (city.plundergold > 0 && serverTyp != 1) {
          gold =
            '<td><img src="cdn/all/both/resources/icon_gold.png" style="height: 12px;"></td><td>' +
            Utils.FormatNumToStr(city.plundergold) +
            "</td><td>\u221E</td><td> « " +
            Constant.LanguageData[lang].plundergold +
            "";
        }
        var progTip =
          '<table>\n <thead>\n <tr>\n <th><img src="cdn/all/both/premium/safecapacity_small.png" style="height: 16px;"></th>\n <th><b>{12}</b></th>\n <th colspan="2"><b>{13}</b></th>\n        \n    </tr>\n    </thead>\n    <tbody>{0}{11}<tr class="total" style="border-top:1px solid #daa520">\n        <td>{9}</td>\n        <td>{1}</td>\n        <td>{2}</td>\n        <td><i>« {14}</i></td>\n    </tr>\n    <tr class="total">\n        <td></td>\n        <td>{16}</td>\n        <td>{17}</td>\n        <td><i>« {18}</i></td>\n    </tr>\n    <tr>\n        <td></td>\n        <td>{19}</td>\n        <td>{20}</td>\n        <td></td>\n    </tr>\n        <tr class="total" style="border-top:1px solid #daa520">\n        <td>{10}</td>\n        <td>{3}</td>\n        <td>{4}</td>\n        <td><i>« {15}</i></td>\n    </tr>\n    <tr>\n        <td></td>\n        <td>{5}</td>\n        <td>{6}</td>\n        <td></td>\n    </tr>\n    </tbody>\n    <tfoot>\n    <tr>\n        <td colspan="3">{7}</td>\n        <td>« {8}</td>\n    </tr>\n    </tfoot>\n</table>';
        var progTr =
          '<tr class="data">\n <td style="width:20px; background: url(\'{0}\'); background-size: auto 23px; background-position: -1px -1px; \n background-repeat: no-repeat;">\n </td>\n <td>{1}</td>\n <td>{2}</td>\n <td>« {3}</td>\n</tr>';
        var rows = "";
        $.each(storage.buildings, function (buildingName, data) {
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
            // The original wrote `2 === 0` here, i.e. a constant false, which
            // `FormatNumToStr` treats as precision 0. Kept as a plain 0.
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
            // The original wrote `2 === 0` here, i.e. a constant false, which
            // `FormatNumToStr` treats as precision 0. Kept as a plain 0.
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
        ) {
          return "";
        } else
          return Utils.format(
            '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_{0}.png" style="height: 14px;">  <td><b>{1}</b></td><td><b>{2}</b></td><td><b>{3}</b></div><td></td></th>\n    </thead>\n    <tbody>\n  ' +
              '<tr class="data">\n            <td></td>\n            <td>{4}</td>\n            <td>{5}</td>\n            <td><i>{6}</i></td>\n        <td></td></tr>\n    </tbody>\n</table>',
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
      function getProductionTip(income, force?) {
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
        if (income === 0 && !force) {
          return "";
        } else
          return Utils.format(
            '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_{0}.png" style="height: 14px;">  <td><b>{1}</b></td><td><b>{2}</b></td><td><b>{3}</b></div><td></td></th>\n    </thead>\n    <tbody>\n  ' +
              '<tr class="data">\n        <td>{7}</td>\n        <td>{4}</td>\n        <td>{5}</td>\n        <td><i>{6}</i></td>\n    <td></td></tr>\n    </tbody>\n</table>',
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
      function getProductionConsumptionSubSumTip(income, consumption, force?) {
        if (income === 0 && consumption === 0 && !force) {
          return "";
        } else if (resourceName !== Constant.Resources.WINE) {
          return getProductionTip(income, force);
        } else if (income === 0) {
          return getConsumptionTooltip(consumption, force);
        } else
          return Utils.format(
            '<table>\n    <thead>\n    <th><div align="center">\n <img src="cdn/all/both/resources/icon_{0}.png" style="height: 14px;">  <td><b>{1}</b></td><td><b>{2}</b></td><td><b>{3}</b></div><td></td></th>\n    </thead>\n    <tbody>\n  ' +
              '<tr class="data">\n            <td>{14}</td>\n        <td>{4}</td>\n            <td>{5}</td>\n            <td><i>{6}</i></td>\n        <td></td></tr>\n    ' +
              '<tr class="data">\n            <td></td>\n            <td>{7}</td>\n            <td>{8}</td>\n            <td><i>{9}</i></td>\n        <td></td></tr>\n    </tbody><tfoot> ' +
              '<tr class="total">\n           <td>{10}</td>\n        <td>{11}</td>\n           <td>{12}</td>\n           <td><i>{13}</i></td>\n       <td></td></tr>\n    </tfoot>\n</table>',
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
              income > consumption ? "\u03A3 +&nbsp;" : "\u03A3 -&nbsp;",
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
    events(Constant.Events.TAB_CHANGED).pub(database.settings.window.activeTab);
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
    $("#empireBoard tr.current,#empireBoard tr.selected").removeClass(
      "selected current",
    );
    if (city) {
      this.getAllRowsForCity(city)
        .addClass("selected")
        .addClass(isChrome ? "current" : "selected");
    }
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
      "" +
      "<hr>" +
      '<span class="categories">' +
      Constant.LanguageData[lang].Reset_Position +
      "</span> " +
      Constant.LanguageData[lang].Right_click +
      "" +
      "<hr>" +
      '<span class="categories">' +
      Constant.LanguageData[lang].Hotkeys +
      "</span>" +
      "" +
      Constant.LanguageData[lang].Navigate +
      "<br>" +
      "" +
      Constant.LanguageData[lang].Navigate_to_City +
      "<br>" +
      "" +
      Constant.LanguageData[lang].Navigate_to +
      "<br>" +
      "" +
      Constant.LanguageData[lang].Navigate_to_World +
      "<br>" +
      "" +
      Constant.LanguageData[lang].Spacebar +
      "" +
      "<hr>" +
      '<span class="categories">' +
      Constant.LanguageData[lang].Initialize_Board +
      "</span>" +
      ' 1. <span id="helpTownhall" class="clickable"><b>> ' +
      Constant.LanguageData[lang].click_ +
      " <</b></span> " +
      Constant.LanguageData[lang].on_your_Town_Hall +
      "<br>" +
      ' 2. <span id="helpResearch" class="clickable"><b>> ' +
      Constant.LanguageData[lang].click_ +
      " <</b></span> " +
      Constant.LanguageData[lang].on_Research_Advisor +
      "<br>" +
      ' 3. <span id="helpPalace" class="clickable"><b>> ' +
      Constant.LanguageData[lang].click_ +
      " <</b></span> " +
      Constant.LanguageData[lang].on_your_Palace +
      "<br>" +
      ' 4. <span id="helpFinance" class="clickable"><b>> ' +
      Constant.LanguageData[lang].click_ +
      " <</b></span> " +
      Constant.LanguageData[lang].on_your_Finance +
      "<br>" +
      //+ ' 5. <span id="helpShop" class="clickable"><b>> '+ Constant.LanguageData[lang].click_ +' <</b></span> '+ Constant.LanguageData[lang].on_the_Ambrosia +'<br>'
      ' 5. <span id="helpMilitary" class="clickable"><b>> ' +
      Constant.LanguageData[lang].click_ +
      " <</b></span> " +
      Constant.LanguageData[lang].on_the_Troops +
      "" +
      "</div>";
    elems += features + '<div style="clear:left"></div>';
    elems += "</div></div>";
    return elems;
  },
  getSettingsTable: function () {
    var lang = database.settings.languageChange.value;
    var wineOut = "";
    var server = ikariam.Nationality();
    if (server == "de") {
      wineOut =
        ' <span><input type="checkbox" id="empire_wineOut" ' +
        (database.settings.wineOut.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].wineOut_description +
        '"> ' +
        Constant.LanguageData[lang].wineOut +
        "</nobr></span>";
    }
    var piracy = "";
    if (
      database.getGlobalData.getResearchTopicLevel(
        Constant.Research.Seafaring.PIRACY,
      )
    ) {
      piracy =
        ' <span><input type="checkbox" id="empire_noPiracy" ' +
        (database.settings.noPiracy.value ? 'checked="checked"' : "") +
        '/><nobr data-tooltip="' +
        Constant.LanguageData[lang].noPiracy_description +
        '"> ' +
        Constant.LanguageData[lang].noPiracy +
        "</nobr></span>";
    }
    var elems = '<div id="SettingsTab"><div>';
    var inits =
      '<div class="options" style="clear:right"><span class="categories">' +
      Constant.LanguageData[lang].building_category +
      "</span>" +
      ' <span><input type="checkbox" id="empire_alternativeBuildingList" ' +
      (database.settings.alternativeBuildingList.value
        ? 'checked="checked"'
        : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].alternativeBuildingList_description +
      '"> ' +
      Constant.LanguageData[lang].alternativeBuildingList +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_compressedBuildingList" ' +
      (database.settings.compressedBuildingList.value
        ? 'checked="checked"'
        : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].compressedBuildingList_description +
      '"> ' +
      Constant.LanguageData[lang].compressedBuildingList +
      "</nobr></span>" +
      " <hr>" +
      ' <span class="categories">' +
      Constant.LanguageData[lang].resource_category +
      "</span>" +
      ' <span><input type="checkbox" id="empire_hourlyRess" ' +
      (database.settings.hourlyRess.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].hourlyRes_description +
      '"> ' +
      Constant.LanguageData[lang].hourlyRes +
      "</nobr></span>" +
      " " +
      wineOut +
      "" +
      ' <span><input type="checkbox" id="empire_dailyBonus" ' +
      (database.settings.dailyBonus.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].dailyBonus_description +
      '"> ' +
      Constant.LanguageData[lang].dailyBonus +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_wineWarning" ' +
      (database.settings.wineWarning.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].wineWarning_description +
      '"> ' +
      Constant.LanguageData[lang].wineWarning +
      "</nobr></span>" +
      ' <span><select id="empire_wineWarningTime"><option value="0"' +
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
      "</nobr></span>" +
      " <hr>" +
      ' <span class="categories">' +
      Constant.LanguageData[lang].language_category +
      "</span>" +
      ' <span><select id="empire_languageChange"><option value="en"' +
      (database.settings.languageChange.value == "en"
        ? "selected=selected"
        : "") +
      "> " +
      Constant.LanguageData[lang].en +
      '</option></select><nobr data-tooltip="' +
      Constant.LanguageData[lang].languageChange_description +
      '"> ' +
      Constant.LanguageData[lang].languageChange +
      "</nobr></span>" +
      "</div>";
    var features =
      '<div class="options">' +
      ' <span class="categories">' +
      Constant.LanguageData[lang].visibility_category +
      "</span>" +
      ' <span><input type="checkbox" id="empire_hideOnWorldView" ' +
      (database.settings.hideOnWorldView.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].hideOnWorldView_description +
      '"> ' +
      Constant.LanguageData[lang].hideOnWorldView +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_hideOnIslandView" ' +
      (database.settings.hideOnIslandView.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].hideOnIslandView_description +
      '"> ' +
      Constant.LanguageData[lang].hideOnIslandView +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_hideOnCityView" ' +
      (database.settings.hideOnCityView.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].hideOnCityView_description +
      '"> ' +
      Constant.LanguageData[lang].hideOnCityView +
      "</nobr></span>" +
      " <hr>" +
      ' <span class="categories">' +
      Constant.LanguageData[lang].army_category +
      "</span>" +
      ' <span><input type="checkbox" id="empire_fullArmyTable" ' +
      (database.settings.fullArmyTable.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].fullArmyTable_description +
      '"> ' +
      Constant.LanguageData[lang].fullArmyTable +
      "</nobr></span>" +
      // + ' <span><input type="checkbox" id="empire_playerInfo" ' + (database.settings.playerInfo.value ? 'checked="checked"' : '') + '/><nobr data-tooltip="'+ Constant.LanguageData[lang].playerInfo_description +'"> '+ Constant.LanguageData[lang].playerInfo +'</nobr></span>'
      ' <span><input type="checkbox" id="empire_onIkaLogs" ' +
      (database.settings.onIkaLogs.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].onIkaLogs_description +
      '"> ' +
      Constant.LanguageData[lang].onIkaLogs +
      "</nobr></span>" +
      " <hr>" +
      ' <span class="categories">' +
      Constant.LanguageData[lang].global_category +
      "</span>" +
      ' <span><input type="checkbox" id="empire_autoUpdates" ' +
      (database.settings.autoUpdates.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].autoUpdates_description +
      '"> ' +
      Constant.LanguageData[lang].autoUpdates +
      "</nobr></span>" +
      "</div>";
    var display =
      '<div class="options">' +
      ' <span class="categories">' +
      Constant.LanguageData[lang].display_category +
      "</span>" +
      ' <span><input type="checkbox" id="empire_onTop" ' +
      (database.settings.onTop.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].onTop_description +
      '"> ' +
      Constant.LanguageData[lang].onTop +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_windowTennis" ' +
      (database.settings.windowTennis.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].windowTennis_description +
      '"> ' +
      Constant.LanguageData[lang].windowTennis +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_smallFont" ' +
      (database.settings.smallFont.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].smallFont_description +
      '"> ' +
      Constant.LanguageData[lang].smallFont +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_GoldShort" ' +
      (database.settings.GoldShort.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].goldShort_description +
      '"> ' +
      Constant.LanguageData[lang].goldShort +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_newsTicker" ' +
      (database.settings.newsTicker.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].newsticker_description +
      '"> ' +
      Constant.LanguageData[lang].newsticker +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_event" ' +
      (database.settings.event.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].event_description +
      '"> ' +
      Constant.LanguageData[lang].event +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_logInPopup" ' +
      (database.settings.logInPopup.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].logInPopup_description +
      '"> ' +
      Constant.LanguageData[lang].logInPopup +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_birdSwarm" ' +
      (database.settings.birdSwarm.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].birdswarm_description +
      '"> ' +
      Constant.LanguageData[lang].birdswarm +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_walkers" ' +
      (database.settings.walkers.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].walkers_description +
      '"> ' +
      Constant.LanguageData[lang].walkers +
      "</nobr></span>" +
      " " +
      piracy +
      "" +
      ' <span><input type="checkbox" id="empire_controlCenter" ' +
      (database.settings.controlCenter.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].control_description +
      '"> ' +
      Constant.LanguageData[lang].control +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_withoutFable" ' +
      (database.settings.withoutFable.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].unnecessaryTexts_description +
      '"> ' +
      Constant.LanguageData[lang].unnecessaryTexts +
      "</nobr></span>" +
      ' <span><input type="checkbox" id="empire_ambrosiaPay" ' +
      (database.settings.ambrosiaPay.value ? 'checked="checked"' : "") +
      '/><nobr data-tooltip="' +
      Constant.LanguageData[lang].ambrosiaPay_description +
      '"> ' +
      Constant.LanguageData[lang].ambrosiaPay +
      "</nobr></span>" +
      "</div>";
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
      '<div class="buttons">' +
      '<button data-tooltip="' +
      Constant.LanguageData[lang].reset +
      '" id="empire_Reset_Button">Reset</button>' +
      '<button data-tooltip="' +
      Constant.LanguageData[lang].goto_website +
      '" id="empire_Website_Button">' +
      Constant.LanguageData[lang].website +
      "</button>" +
      '<button data-tooltip="' +
      Constant.LanguageData[lang].Check_for_updates +
      '" id="empire_Update_Button">' +
      Constant.LanguageData[lang].check +
      "</button>" +
      '<button data-tooltip="' +
      Constant.LanguageData[lang].Report_bug +
      '" id="empire_Bug_Button">' +
      Constant.LanguageData[lang].report +
      "</button>" +
      '<button data-tooltip="Check All" id="empire_CheckAll_Button">Check All</button>' +
      '<button data-tooltip="Check" id="empire_Check_Button">Check</button>' +
      '<button data-tooltip="' +
      Constant.LanguageData[lang].save_settings +
      '" id="empire_Save_Button" onclick="ajaxHandlerCall(\'?view=city&oldBackgroundView\')">' +
      Constant.LanguageData[lang].save +
      "</button>";
    return elems;
  },
  DrawHelp: function () {
    var lang = database.settings.languageChange.value;
    $("#HelpTab")
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
        if (capital) {
          ikariam.loadUrl(
            ikariam.viewIsCity,
            "city",
            capital.getBuildingFromName(Constant.Buildings.PALACE).getUrlParams,
          );
        } else alert(Constant.LanguageData[lang].alert_palace);
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
    $("#SettingsTab")
      .html(this.getSettingsTable())
      .on("change", "#empire_onTop", function () {
        database.settings.onTop.value = this.checked;
        render.mainContentBox.css("z-index", this.checked ? 65112 : 61);
      })
      .on("change", "#empire_windowTennis", function () {
        database.settings.windowTennis.value = this.checked;
        if (!this.checked) {
          render.mainContentBox.css(
            "z-index",
            database.settings.onTop.value ? 65112 : 61,
          );
        } else {
          render.mainContentBox.trigger("mouseenter");
        }
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
        if (this.checked) {
          GM_addStyle("#empireBoard {font-size:8pt}");
        } else {
          GM_addStyle("#empireBoard {font-size:inherit}");
        }
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
        //if (this.checked)
        //alert(Constant.LanguageData[lang].alert_daily);
      })
      .on("change", "#empire_alternativeBuildingList", function () {
        database.settings.alternativeBuildingList.value = this.checked;
        render.cityRows.building = {};
        if (
          database.settings.alternativeBuildingList.value == this.checked &&
          database.settings.compressedBuildingList.value == 1
        ) {
          alert(Constant.LanguageData[lang].alert);
        }
        $("table.buildings").html(render.getBuildingTable());
        render.updateCitiesBuildingData();
        $.each(database.cities, function (cityId, city) {
          render.setCityName(city);
          render.setActionPoints(city);
          $.each(
            database.settings[Constant.Settings.CITY_ORDER].value,
            function (idx, val) {
              $("#" + "building" + "_" + val).appendTo(
                $("#" + "building" + "_" + val).parent(),
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
        ) {
          alert(Constant.LanguageData[lang].alert);
        }
        render.cityRows.building = {};
        $("table.buildings").html(render.getBuildingTable());
        render.updateCitiesBuildingData();
        $.each(database.cities, function (cityId, city) {
          render.setCityName(city);
          render.setActionPoints(city);
          $.each(
            database.settings[Constant.Settings.CITY_ORDER].value,
            function (idx, val) {
              $("#" + "building" + "_" + val).appendTo(
                $("#" + "building" + "_" + val).parent(),
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
      .on("click", "#empire_Website_Button", function () {
        //GM_openInTab('https://greasyfork.org/scripts/764-empire-overview');
      })
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
      .on("click", "#empire_Bug_Button", function () {
        //GM_openInTab('https://greasyfork.org/scripts/764-empire-overview/feedback');
      })
      .on("change", "input[type='checkbox']", function () {
        this.blur();
      });
    $(document).ready(function () {
      //todo
      if (
        $("#empire_dailyBonus").attr("checked") &&
        $("#dailyActivityBonus form")
      ) {
        $("#dailyActivityBonus form").submit();
      }
      if ($("#empire_logInPopup").attr("checked")) {
        GM_addStyle("#multiPopup {display: none;}");
      }
      if (
        $("#empire_dailyBonus").attr("checked") &&
        $("#empire_logInPopup").attr("checked")
      ) {
        GM_addStyle("#multiPopup {display: none;}");
      }
    });
    $("#empire_Reset_Button").button({
      icons: { primary: "ui-icon-alert" },
      text: true,
    });
    $("#empire_Website_Button").button({
      icons: { primary: "ui-icon-home" },
      text: true,
    });
    $("#empire_Update_Button").button({
      icons: { primary: "ui-icon-info" },
      text: true,
    });
    $("#empire_Bug_Button").button({
      icons: { primary: "ui-icon-notice" },
      text: true,
    });
    $("#empire_CheckAll_Button").button({
      icons: { primary: "ui-icon-notice" },
      text: true,
    });
    $("#empire_Check_Button").button({
      icons: { primary: "ui-icon-notice" },
      text: true,
    });
    $("#empire_Save_Button").button({
      icons: { primary: "ui-icon-check" },
      text: true,
    });
    $("#empire_Allianz").button({ text: true });
    $("#empire_Allianz_einlesen").button({ text: true });
  },
  toast: function (sMessage) {
    $("<div>")
      .addClass("ui-tooltip-content ui-widget-content")
      .text(sMessage)
      .appendTo(
        $(document.createElement("div"))
          .addClass("ui-helper-reset ui-tooltip ui-tooltip-pos-bc ui-widget")
          .css({
            position: "relative",
            display: "inline-block",
            left: "auto",
            top: "auto",
          })
          .show()
          .appendTo(
            $(document.createElement("div"))
              .addClass("toast")
              .appendTo(document.body)
              .delay(100)
              .fadeIn("slow", function () {
                $(this)
                  .delay(2000)
                  .fadeOut("slow", function () {
                    $(this).remove();
                  });
              }),
          ),
      );
  },
  toastAlert: function (sMessage) {
    $('<div class="red">')
      .addClass("ui-tooltip-content ui-widget-content")
      .text(sMessage)
      .appendTo(
        $(document.createElement("div"))
          .addClass("ui-helper-reset ui-tooltip ui-tooltip-pos-bc ui-widget")
          .css({
            position: "relative",
            display: "inline-block",
            left: "auto",
            top: "-20px",
          })
          .show()
          .appendTo(
            $(document.createElement("div"))
              .addClass("toastAlert")
              .appendTo(document.body)
              .delay(100)
              .fadeIn("slow", function () {
                $(this)
                  .delay(3000)
                  .fadeOut("slow", function () {
                    $(this).remove();
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
    $("#js_viewCityMenu")
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
    $(document).on("keydown", function (event) {
      var index: any = -1;
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
        } else {
          switch (event.which) {
            case 81:
              $("#js_worldMapLink").find("a").click();
              break;
            case 87:
              $("#js_islandLink").find("a").click();
              break;
            case 69:
              $("#js_cityLink").find("a").click();
              break;
          }
        }
      } else {
        var keycodes: any = "";
        var codeTyp = ikariam.Nationality();
        switch (codeTyp) {
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
          case "hu": // code 0,0 ü ó
          case "il":
          case "lt":
          case "nl":
          case "tw":
          case "us":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 173, 61]; //EN - =
            if (isChrome)
              keycodes = [
                49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 189, 187, 8, 220, 221,
                219,
              ]; //US - =
            break;
          case "de":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 63, 192]; //DE ß ´
            if (isChrome)
              keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 219, 221]; //DE ß ´
            break;
          case "it":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 222, 160]; //IT + \
            break;
          case "es":
          case "rs":
          case "si":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 222, 171]; //ES, RS, SI ' +
            break;
          case "ar":
          case "cl":
          case "co":
          case "mx":
          case "pe":
          case "pt":
          case "ve":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 222, 0]; //AR, CL, CO, MX, VE, PE ' ¿  PT ' «
            break;
          case "fr":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 169, 61]; //FR ) =
            break;
          case "cz":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 61, 169]; //CZ = )
            break;
          case "bg":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 173, 190]; //BG - .
            break;
          case "dk":
          case "fi":
          case "ee":
          case "se":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 171, 192]; //DK, FI, EE, SE + ´
            break;
          case "no":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 171, 222]; //NO + \
            break;
          case "tr":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 170, 173]; //TR * -
            break;
          case "sk":
            keycodes = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 61, 0]; //SK = ´
            break;
        }
        index = keycodes.indexOf(event.which);
        if (index !== -1) {
          if (index < database.settings.cityOrder.value.length) {
            $(
              "#resource_" +
                database.settings.cityOrder.value[index] +
                " .city_name .clickable",
            ).trigger("click");
            return false;
          }
        } else {
          switch (event.which) {
            case 81:
              $("#js_GlobalMenu_cities").click();
              break;
            case 87:
              $("#js_GlobalMenu_military").click();
              break;
            case 69:
              $("#js_GlobalMenu_research").click();
              break;
            case 82:
              $("#js_GlobalMenu_diplomacy").click();
              break;
          }
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
    if ($(this.mainContentBox)) {
      $("#ArmyTab").html(this.getArmyTable());
      $("#ResTab").html(this.getResourceTable());
      $("#BuildTab").html(this.getBuildingTable());
      $("#WorldmapTab").html(this.getWorldmapTable());
      this.DrawSettings();
      this.DrawHelp();
      this.toolTip.init();
      $("#ResTab, #BuildTab, #ArmyTab").each(function () {
        // NOTE: `container: "tbody"` below is not a real jQuery UI sortable
        // option (the actual one is `containment`), so it has always been
        // ignored. Kept verbatim rather than guessing at the intended layout
        // change; the cast is what lets the invalid key compile.
        ($(this) as any).sortable({
          helper: function (e, ui: any) {
            $(ui)
              .children("td")
              .each(function () {
                $(this).width(Math.round($(this).width()));
                $(this).hasClass("building");
                // The original wrote `if ($(this).css(...));` — a stray
                // semicolon made the `if` body empty. The `.css()` call still ran
                // (it sits in the condition) so the border was still applied; only
                // the `if` was redundant. Dropped.
                $(this).css("border", "1px solid transparent");
              });
            $(ui)
              .parents("div[role=tabpanel]")
              .each(function () {
                $(this).width(Math.round($(this).width()));
              });
            return ui;
          },
          handle: ".city_name .icon",
          cursor: "move",
          axis: "y",
          items: "tbody tr",
          container: "tbody",
          revert: 200,
          stop: function (event, ui: any) {
            ui.item.parents("div[role=tabpanel]").css("width", "");
            ui.item.children("td").css("width", "").css("border", "");
            database.settings[Constant.Settings.CITY_ORDER].value = ui.item
              .parents(".ui-sortable")
              .sortable("toArray")
              .map(function (item) {
                return parseInt(item.split("_").pop());
              });
            $.each(["building", "resource", "army"], function (idx, type) {
              if ($(this).parents(".ui-sortable").attr("id") !== type) {
                $.each(
                  database.settings[Constant.Settings.CITY_ORDER].value,
                  function (idx, val) {
                    $("#" + type + "_" + val).appendTo(
                      $("#" + type + "_" + val).parent(),
                    );
                  },
                );
              }
            });
          },
        });
      });
      $.each(["building", "resource", "army"], function (idx, type) {
        $.each(
          database.settings[Constant.Settings.CITY_ORDER].value,
          function (idx, val) {
            $("#" + type + "_" + val).appendTo(
              $("#" + type + "_" + val).parent(),
            );
          },
        );
      });
    }
    this.AttachClickHandlers();
  },
  getResourceTable: function () {
    var lang = database.settings.languageChange.value;
    //var header = '<colgroup span="3"/>\n   <colgroup span="2"/>\n    <colgroup span="2"/>\n    <colgroup span="2"/>\n    <colgroup span="2"/>\n    <colgroup span="2"/>\n    <colgroup span="2"/>\n   <colgroup span="2"/>\n    <colgroup span="2"/>\n<thead>\n<tr class="header_row">\n    <th class="city_name" data-tooltip="{10}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=18\')">{0}</th>\n    <th class="action_points icon actionpointImage" data-tooltip="{1}"></th>\n    \n    <th class="wonder"></th>\n    <th class="empireactions">\n       <div class="trading" data-tooltip="'+ Constant.LanguageData[lang].transport +'" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=militaryAdvisor\')"></div>\n<div class="agora" data-tooltip="'+ Constant.LanguageData[lang].agora +'" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=diplomacyIslandBoard&amp=&islandId\')"></div> <div class="member" data-tooltip="'+ Constant.LanguageData[lang].member +'" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=diplomacyAllyMemberlist\')"></div>\n  </th>\n    <th class="citizen_header icon populationImage" data-tooltip="{2}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=3\');return false;"></th>\n    \n    <th class="growth_header icon growthImage" data-tooltip="'+ Constant.LanguageData[lang].satisfaction +'"   style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=3\');return false;"></th>\n    <th class="research_header icon researchImage" data-tooltip="{3}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=researchAdvisor\');return false;"></th>\n    <th class="gold_header icon goldImage" colspan="2" data-tooltip="{4}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=finances\');return false;"></th>\n    <th class="wood_header icon woodImage" colspan="2" data-tooltip="{5}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=5\');return false;"></th>\n    <th class="wine_header icon wineImage" colspan="2" data-tooltip="{6}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=6\');return false;"></th>\n    <th class="marble_header icon marbleImage" colspan="2" data-tooltip="{7}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=6\');return false;"></th>\n    <th class="glass_header icon glassImage" colspan="2" data-tooltip="{8}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=6\');return false;"></th>\n    <th class="sulfur_header icon sulfurImage" colspan="2" data-tooltip="{9}" style="cursor:pointer;" onclick="ajaxHandlerCall(\'?view=ikipedia&helpId=6\');return false;"></th>\n  \n</tr>\n</thead>';
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
    //var resourceRow = '<tr id="resource_{0}">\n    <td class="city_name">\n        <span></span>\n        <span class="clickable"></span>\n        <sub></sub>\n        <span class="Red" data-tooltip="{6}">&nbsp;&nbsp;<b>{5}</b>&nbsp;&nbsp;</span>\n         </td>\n    <td class="action_points"><span class="ap"></span>&nbsp;<br><span class="garrisonlimit"  data-tooltip="dynamic"><img height="18" hspace="3"></span></td>\n        <td class="wonder" data-tooltip="dynamic"  style="cursor:pointer;">\n        <div class="wonder" style="background: url(cdn/all/both/wonder/w{7}.png) no-repeat center center; background-size: {8}px auto;"></div></td>\n    <td class="empireactions">\n        <div class="worldmap" data-tooltip="'+ Constant.LanguageData[lang].to_world +'" style="cursor:pointer;"></div>        <div class="city" data-tooltip="'+ Constant.LanguageData[lang].to_town_hall +' {2}" style="cursor:pointer;"></div>\n    <div class="island" data-tooltip="'+ Constant.LanguageData[lang].to_island +'" style="cursor:pointer;"></div>\n  <br> <div class="islandwood" data-tooltip="'+ Constant.LanguageData[lang].to_saw_mill +'" style="cursor:pointer;"></div>\n    <div class="islandgood" style="background: url(cdn/all/both/resources/icon_{3}.png) no-repeat center center; background-size: 18px auto; cursor: pointer;" data-tooltip="'+ Constant.LanguageData[lang].to_mine +'"></div>\n <div class="transport" data-tooltip="'+ Constant.LanguageData[lang].transporting +' {2}" style="cursor:pointer;"></div>\n        </td>\n    <td class="population" data-tooltip="dynamic">\n        <span class= "pop" data-tooltip="dynamic"></span>\n        <span></span>\n        <div class="progressbarPop ui-progressbar ui-widget ui-widget-content ui-corner-all" data-tooltip="dynamic">\n            <div class="ui-progressbar-value ui-widget-header ui-corner-left" style="width: 95%"></div>\n        </div>\n    </td>\n    \n    <td class="population_happiness">   <span class="happy"  data-tooltip="dynamic"><img align=right height="18" hspace="8" vspace="2"></span><br><span class="growth clickbar"></span>\n </td>\n    <td class="research" data-tooltip="dynamic">\n        <span class="scientists" data-tooltip="dynamic"></span>\n        <span></span>\n    {4}   \n   </div>\n    </td>\n    {1}\n    </tr>\n';
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
    //var footer = '<tr>\n    <td colspan="3"></td>\n   <td id="t_sigma" class="total" data-tooltip="dynamic">Σ</td>\n    <td id="t_population" class="total"></td><td id="t_growth" class="total"></td>\n    <td id="t_research" class="total" data-tooltip="dynamic"></td>\n        <td id="t_currentgold" class="total"></td>\n    <td id="t_goldincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n      <span class="Red"></span>\n         <td id="t_currentwood" class="total"></td>\n    <td id="t_woodincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n    <td id="t_currentwine" class="total"></td>\n    <td id="t_wineincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n    <td id="t_currentmarble" class="total"></td>\n    <td id="t_marbleincome" class="total"data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n    <td id="t_currentglass" class="total"></td>\n    <td id="t_glassincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n    <td id="t_currentsulfur" class="total"></td>\n    <td id="t_sulfurincome" class="total" data-tooltip="dynamic">\n        <span class="Green"></span>\n        <span class="Red"></span>\n    </td>\n</tr>';
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
      $.each(database.cities, function (cityId, city) {
        var resourceCells = "";
        var info = city.isUpgrading === true ? "!" : "";
        var progSci = "";
        if (this.getBuildingFromName(Constant.Buildings.ACADEMY)) {
          progSci =
            '<div class="progressbarSci ui-progressbar ui-widget ui-widget-content ui-corner-all" data-tooltip="dynamic">\n <div class="ui-progressbar-value ui-widget-header ui-corner-left" style="width: 95%"></span></div>';
        }
        var wonder_size = 20;
        if (city.getWonder == 7 || 1) wonder_size = 25;
        $.each(Constant.Resources, function (key, resourceName) {
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
    var costCell = "";
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
        $.each(Constant.unitOrder[category], function (index, value) {
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
      $.each(database.cities, function (cityId, city) {
        var rowCells = "";
        var divbarracks = "";
        if (this.getBuildingFromName(Constant.Buildings.BARRACKS)) {
          divbarracks =
            '<div class="barracks" data-tooltip="' +
            Constant.LanguageData[lang].to_barracks +
            '&nbsp;{2}" style="cursor:pointer;"></div>';
        }
        var divshipyard = "&nbsp;";
        if (this.getBuildingFromName(Constant.Buildings.SHIPYARD)) {
          divshipyard =
            '<div class="shipyard" data-tooltip="' +
            Constant.LanguageData[lang].to_shipyard +
            '&nbsp;{2}" style="cursor:pointer;"></div>';
        }
        // TODO: only ever computed for hoplites in the original; every unit type
        // still needs wiring up. Left disabled as it was.
        // city.military.getUnits.getUnit('phalanx') * Constant.UnitData.phalanx.baseCost
        var cost = 0;
        for (var category in Constant.unitOrder) {
          $.each(Constant.unitOrder[category], function (index, value) {
            var builds = city.getUnitBuildsByUnit(value);
            rowCells += Utils.format(bodyCell, [
              value,
              city.military.getUnits.getUnit(value) || "",
              builds[value] ? builds[value] : "",
              "",
            ]);
          });
        }
        body += Utils.format(bodyRow, [
          city.getId,
          rowCells,
          city._name,
          divbarracks,
          divshipyard,
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
      for (var category in Constant.unitOrder) {
        $.each(Constant.unitOrder[category], function (index, value) {
          footerCells += Utils.format(footerCell, [value]);
        });
      }
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
    var buildingCell = '<td class="building {0}" data-tooltip="dynamic"></td>';
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
        $.each(buildingOrder[category], function (index, value) {
          if (value == "colonyBuilding") {
            if (
              !database.settings.compressedBuildingList.value ||
              !counts[value]
            ) {
              return true;
            }
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
            ) {
              return true;
            }
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
            cols += '<col span="' + counts[value] + '">'; //Constant.LanguageData[lang][value]
            headerCells += Utils.format(headerCell, [
              Constant.LanguageData[lang][value],
              Constant.BuildingData[value].icon,
              counts[value],
              "?view=buildingDetail&helpId=1&buildingId=" +
                Constant.BuildingData[value].buildingId,
            ]);
          }
        });
        if (cols !== "") {
          colgroup += "<colgroup>" + cols + "</colgroup>";
        }
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
      $.each(database.cities, function (cityId, city) {
        var rowCells = "";
        for (var category in buildingOrder) {
          $.each(buildingOrder[category], function (index, value) {
            if (
              (value == "productionBuilding" || value == "colonyBuilding") &&
              !database.settings.compressedBuildingList.value
            )
              return false;
            var i = 0;
            while (i < counts[value]) {
              var cssClass = "";
              if (value == "colonyBuilding") {
                cssClass = city.isCapital
                  ? Constant.Buildings.PALACE
                  : Constant.Buildings.GOVERNORS_RESIDENCE;
              } else if (value == "productionBuilding") {
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
              } else {
                cssClass = value;
              }
              cssClass += +i;
              rowCells += Utils.format(buildingCell, [cssClass]);
              i++;
            }
          });
        }
        body += Utils.format(buildingRow, [city.getId, rowCells, city._name]);
      });
      return body;
    }
  },
  AddIslandCSS: function () {
    if (!/.*view=island.*/.test(window.document.location.href))
      if (!this.cssResLoaded())
        Utils.addStyleSheet(
          '@import "https://' +
            ikariam.Host() +
            "/skin/compiled-" +
            ikariam.Nationality() +
            '-island.css";',
        );
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
      var data1 = city.military.getUnits.getUnit(type) || 0;
      var data2 = city.military.getIncomingTotals[type] || 0;
      var data3 = city.military.getTrainingTotals[type] || 0;
      var cells = $node.find("td." + type);
      cells.get(0).textContent = Utils.FormatNumToStr(data1, false, 0) || "";
      cells = cells.eq(1).children("span");
      cells.get(0).textContent = Utils.FormatNumToStr(data2, true, 0) || "";
      cells.get(1).textContent = Utils.FormatNumToStr(data3, true, 0) || "";
      delete this.cityRows.army[cityId];
      if (celllevel) {
        Utils.setClone($row, $node);
        this.setArmyTotals(undefined, type);
      }
    } catch (e) {
      empire.error("updateCityArmyCell", e);
    } finally {
    }
  },
  updateCityArmyRow: function (cityId, $node) {
    var $row;
    var rowLevel = !$node;
    if (rowLevel) {
      $row = this.getArmyRow(cityId);
      $node = Utils.getClone($row);
    }
    for (var armyId in Constant.UnitData) {
      this.updateCityArmyCell(cityId, armyId, $node);
    }
    if (rowLevel) {
      Utils.setClone($row, $node);
      this.setArmyTotals();
      delete this.cityRows.army[cityId];
    }
  },
  updateCitiesArmyData: function () {
    var $node = $("#ArmyTab").find("table.army");
    var $clone = Utils.getClone($node);
    for (var cityId in database.cities) {
      empire.time(
        this.updateCityArmyRow.bind(
          this,
          cityId,
          $clone.find("#army_" + cityId),
        ),
        "updateArmyRow",
      );
    }
    this.setArmyTotals($clone);
    Utils.setClone($node, $clone);
    this.cityRows.army = {};
  },
  updateChangesForCityMilitary: function (cityId, changes) {
    if (changes && changes.length < 5) {
      $.each(
        changes,
        function (index, unit) {
          this.updateCityArmyCell(cityId, unit);
        }.bind(render),
      );
      this.setArmyTotals();
    } else {
      this.updateCityArmyRow(cityId);
    }
  },
  updateGlobalData: function (changes) {
    this.setAllResourceData();
    return true;
  },
  updateMovementsForCity: function (changedCityIds) {
    if (changedCityIds.length)
      $.each(
        changedCityIds,
        function (index, id) {
          var city = database.getCityFromId(id);
          if (city) {
            this.setMovementDataForCity(city);
          }
        }.bind(render),
      );
  },
  updateResourcesForCity: function (cityId, changes) {
    var city = database.getCityFromId(cityId);
    if (city) {
      events.scheduleAction(this.updateResourceCounters.bind(render, true), 0);
    }
  },
  updateCityDataForCity: function (cityId, changes) {
    var city = database.getCityFromId(cityId);
    if (city) {
      var research = 0,
        population = 0,
        finance = 0;
      for (var key in changes) {
        switch (key) {
          case "research":
            research += changes[key];
            break;
          case "priests":
            if (Constant.Government.THEOCRACY === database.getGovernmentType) {
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
      }
      if (!!population) {
        this.setPopulationData(city);
      }
      if (!!research) {
        this.setResearchData(city);
      }
      if (!!finance) {
        this.setFinanceData(city);
      }
    }
  },
  setArmyTotals: function ($node, unitId) {
    var data = database.getArmyTotals;
    if (!$node) {
      $node = $("#ArmyTab");
    }
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
      ) {
        $node.find("td." + unitId + " ,th." + unitId).show();
      } else {
        $node.find("td." + unitId + " ,th." + unitId).hide();
      }
    } else {
      $.each(Constant.UnitData, function (unit: string, info: any) {
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
        ) {
          $node.find("td." + unit + " ,th." + unit).show();
        } else {
          $node.find("td." + unit + " ,th." + unit).hide();
        }
      });
    }
  },
  updateChangesForCityBuilding: function (cityID, changes) {
    try {
      var city = database.getCityFromId(cityID);
      if (city) {
        if (changes.length) {
          $.each(
            changes,
            function (key, data) {
              var building = city.getBuildingFromPosition(data.position);
              if (building.getName === data.name) {
                this.updateCityBuildingPosition(city, data.position);
              } else {
                this.updateCityBuildingRow(city);
                return false;
              }
            }.bind(render),
          );
        }
      }
    } catch (e) {
      empire.error("updateChangesForCityBuilding", e);
    } finally {
    }
  },
  updateCityBuildingPosition: function (city, position, $node) {
    var building = city.getBuildingFromPosition(position);
    var idx: any = 0;
    //var cellOnly = ($node == undefined);
    var cellOnly = $node === undefined;
    $.each(city.getBuildingsFromName(building.getName), function (index, b) {
      if (b.getPosition == building.getPosition) {
        idx = index;
        return false;
      }
    });
    var cell;
    if (cellOnly) {
      $node = render.getBuildingsRow(city);
      cell = $node.find("td.building." + building.getName + idx);
    } else {
      cell = $node.find("td.building." + building.getName + idx);
    }
    if (!building.isEmpty) {
      if (cell.length) {
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
      } else {
        return false;
      }
    }
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
      $.each(
        city.getBuildings,
        function (position, building) {
          success = this.updateCityBuildingPosition(city, position, $node);
          return success;
        }.bind(render),
      );

      if (cellLevel) {
        render.cityRows.building[city.getId] = undefined;
        $node.find("table.buildings").html(render.getBuildingTable);

        if (!success) {
          render.updateCitiesBuildingData();
          $.each(database.cities, function (cityId, city) {
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
    } finally {
    }
  },
  updateCitiesBuildingData: function ($redraw) {
    try {
      var success = true;
      var i = 0;
      var $node = $("#BuildTab").find("table.buildings");
      var $clone = $redraw || Utils.getClone($node);
      $.each(
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
        if (!$redraw) {
          render.updateCitiesBuildingData($clone);
        }
      }
      if (!$redraw) {
        this.cityRows.building = {};
        Utils.setClone($node, $clone);
      } else {
        $.each(database.cities, function (cityId, city) {
          render.setCityName(city);
          render.setActionPoints(city);
        });
      }
    } catch (e) {
      empire.error("updateCitiesBuildingData", e);
    } finally {
    }
  },
  redrawSettings: function () {
    $("#SettingsTab").html(render.getSettingsTable());
    $("#empire_Reset_Button").button({
      icons: { primary: "ui-icon-alert" },
      text: true,
    });
    $("#empire_Website_Button").button({
      icons: { primary: "ui-icon-home" },
      text: true,
    });
    $("#empire_Update_Button").button({
      icons: { primary: "ui-icon-info" },
      text: true,
    });
    $("#empire_Bug_Button").button({
      icons: { primary: "ui-icon-notice" },
      text: true,
    });
    $("#empire_CheckAll_Button").button({
      icons: { primary: "ui-icon-notice" },
      text: true,
    });
    $("#empire_Check_Button").button({
      icons: { primary: "ui-icon-notice" },
      text: true,
    });
    $("#empire_Save_Button").button({
      icons: { primary: "ui-icon-check" },
      text: true,
    });
  },
  DrawContentBox: function () {
    var lang = database.settings.languageChange.value;
    var that = this;
    if (!this.mainContentBox) {
      //<li><a href="#WorldmapTab" data-tooltip="Not yet implemented">Worldmap</a></li>
      $("#container").after(
        '<div id="empireBoard" class="ui-widget" style="display:none;z-index:' +
          (database.settings.onTop.value ? 65112 : 61) +
          ';position: absolute; left:70px;top:180px;">\
<div id="empire_Tabs">\
<ul>\
<li><a href="#ResTab">' +
          Constant.LanguageData[lang].economy +
          '</a></li>\
<li><a href="#BuildTab">' +
          Constant.LanguageData[lang].buildings +
          '</a></li>\
<li><a href="#ArmyTab">' +
          Constant.LanguageData[lang].military +
          '</a></li>\
<li><a href="#SettingsTab" data-tooltip="' +
          Constant.LanguageData[lang].options +
          '"><span class="ui-icon ui-icon-gear"/></a></li>\
<li><a href="#HelpTab" data-tooltip="' +
          Constant.LanguageData[lang].help +
          '"><span class="ui-icon ui-icon-help"/></a></li>\
</ul>\
<div id="ResTab"></div>\
<div id="BuildTab"></div>\
<div id="ArmyTab"></div>\
<div id="WorldmapTab"></div>\
<div id="SettingsTab"></div>\
<div id="HelpTab"></div>\
</div>\
</div>',
      );
      this.mainContentBox = $("#empireBoard");
      // NOTE: `selected` was removed in jQuery UI 1.9 (superseded by
      // `active`), so this option has been inert ever since the script moved
      // to 1.9.2. Left as-is rather than silently changing which tab opens;
      // switching to `active: false` would start the board collapsed.
      this.$tabs = ($("#empire_Tabs") as any).tabs({
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
          if (database.settings.windowTennis.value) {
            render.mainContentBox.css("z-index", "65112");
          }
        })
        .on("mouseleave", function () {
          if (database.settings.windowTennis.value) {
            render.mainContentBox.css("z-index", "2");
          }
        });
    }
  },
  AttachClickHandlers: function () {
    $("body").on("click", "#js_buildingUpgradeButton", function (e) {
      var upgradeSuccessCheck;
      var href = this.getAttribute("href");
      if (href !== "#") {
        var params = $.decodeUrlParam(href);
        if (params["function"] === "upgradeBuilding") {
          upgradeSuccessCheck = (function upgradeSuccess() {
            var p = params;
            return function (response) {
              var len = response.length;
              var feedback = 0;
              while (len--) {
                if (response[len][0] == "provideFeedback") {
                  feedback = response[len][1][0].type;
                  break;
                }
              }
              if (feedback == 10) {
                //success
                render.updateChangesForCityBuilding(
                  p.cityId || ikariam.getCurrentCity,
                  [],
                );
              }
              events("ajaxResponse").unsub(upgradeSuccessCheck);
            };
          })();
        }
        events("ajaxResponse").sub(upgradeSuccessCheck);
      }
    });
    render.mainContentBox
      .on("click", "td.city_name span.clickable", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var classes = target.parents("td").attr("class");
        var params: any = { cityId: city.getId };
        if (!city.isCurrentCity) {
          $("#js_cityIdOnChange").val(city.getId);
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
              } else {
                params.currentIslandId = ikariam.getCurrentCity.getIslandID;
              }
            }
          }
          ikariam.loadUrl(true, ikariam.mainView, params);
        }
        return false;
      })
      .on("click", "td.empireactions div.transport", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("td").parents("tr").attr("id").split("_").pop(),
        );
        if (!city.isCurrentCity && ikariam.getCurrentCity) {
          ikariam.loadUrl(true, ikariam.mainView, {
            view: "transport",
            destinationCityId: city.getId,
            templateView: Constant.Buildings.TRADING_PORT,
          });
        }
        return false;
      })
      .on("click", "td.empireactions div[class*=deployment]", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var type = target
          .attr("class")
          .split(" ")
          .pop()
          .split("deployment")
          .pop();
        if (ikariam.currentCityId === city.getId) {
          return false;
        }
        var params = {
          cityId: ikariam.CurrentCityId,
          view: "deployment",
          deploymentType: type,
          destinationCityId: city.getId,
        };
        ikariam.loadUrl(true, null, params);
      });
    $("#empire_Tabs")
      .on("click", "td.empireactions div.worldmap", function (event) {
        var target = $(event.target);
        var className = target.parents("td").attr("class").split(" ").pop();
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var params = {
          cityId: city.getId,
          view: "worldmap_iso",
        };
        ikariam.loadUrl(true, "city", params);
        return false;
      })
      .on("click", "td.empireactions div.island", function (event) {
        var target = $(event.target);
        var className = target.parents("td").attr("class").split(" ").pop();
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var params = {
          cityId: city.getId,
          view: "island",
        };
        ikariam.loadUrl(true, null, params);
        return false;
      })
      .on("click", "td.empireactions div.city", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var className = target.parents("td").attr("class").split(" ").pop();
        var building = city.getBuildingFromName(Constant.Buildings.TOWN_HALL);
        var params = building.getUrlParams;
        if (unsafeWindow.ikariam.templateView)
          unsafeWindow.ikariam.templateView.id = null;
        ikariam.loadUrl(true, "city", params);
        return false;
      })
      .on("click", "td.population_happiness", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var className = target.parents("td").attr("class").split(" ").pop();
        var building = city.getBuildingFromName(Constant.Buildings.TAVERN);
        var params = building.getUrlParams;
        if (unsafeWindow.ikariam.templateView)
          unsafeWindow.ikariam.templateView.id = null;
        ikariam.loadUrl(true, "city", params);
        return false;
      })
      .on("click", "td.research span", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var className = target.parents("td").attr("class").split(" ").pop();
        var building = city.getBuildingFromName(Constant.Buildings.ACADEMY);
        var params = building.getUrlParams;
        if (unsafeWindow.ikariam.templateView)
          unsafeWindow.ikariam.templateView.id = null;
        ikariam.loadUrl(true, "city", params);
        return false;
      })
      .on("click", "td.empireactions div.barracks", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var className = target.parents("td").attr("class").split(" ").pop();
        var building = city.getBuildingFromName(Constant.Buildings.BARRACKS);
        var params = building.getUrlParams;
        if (unsafeWindow.ikariam.templateView)
          unsafeWindow.ikariam.templateView.id = null;
        ikariam.loadUrl(true, "city", params);
        return false;
      })
      .on("click", "td.empireactions div.shipyard", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var className = target.parents("td").attr("class").split(" ").pop();
        var building = city.getBuildingFromName(Constant.Buildings.SHIPYARD);
        var params = building.getUrlParams;
        if (unsafeWindow.ikariam.templateView)
          unsafeWindow.ikariam.templateView.id = null;
        ikariam.loadUrl(true, "city", params);
        return false;
      })
      .on("click", "td.wonder", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var className = target.parents("td").attr("class").split(" ").pop();
        var building = city.getBuildingFromName(Constant.Buildings.TEMPLE);
        var params = building.getUrlParams;
        if (unsafeWindow.ikariam.templateView)
          unsafeWindow.ikariam.templateView.id = null;
        ikariam.loadUrl(true, "city", params);
        return false;
      })
      .on("click", "th.empireactions div.spio", function () {
        ikariam.loadUrl(
          ikariam.viewIsCity,
          "city",
          ikariam.getCurrentCity.getBuildingFromName(Constant.Buildings.HIDEOUT)
            .getUrlParams,
        ); //tabReports
      })
      .on("click", "th.empireactions div.combat", function () {
        ikariam.loadUrl(ikariam.viewIsCity, "city", {
          view: "militaryAdvisor",
          activeTab: "combatReports",
        });
      })
      .on("click", "span.production", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var resource = target.parents("td").attr("class").split(" ").pop();
        var params: any = {
          cityId: city.getId,
        };
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
        if (ikariam.viewIsIsland) {
          params.currentIslandId = ikariam.getCurrentCity.getIslandID;
        }
        ikariam.loadUrl(true, ikariam.mainView, params);
        render.AddIslandCSS();
        return false;
      })
      .on("click", "td.empireactions div.islandgood", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var resource = target.parents("td").attr("class").split(" ").pop();
        var params: any = {
          cityId: city.getId,
        };
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
        if (ikariam.viewIsIsland) {
          params.currentIslandId = ikariam.getCurrentCity.getIslandID;
        }
        ikariam.loadUrl(true, ikariam.mainView, params);
        render.AddIslandCSS();
        return false;
      })
      .on("click", "td.empireactions div.islandwood", function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var resource = target.parents("td").attr("class").split(" ").pop();
        var params: any = {
          cityId: city.getId,
        };
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
        if (ikariam.viewIsIsland) {
          params.currentIslandId = ikariam.getCurrentCity.getIslandID;
        }
        ikariam.loadUrl(true, ikariam.mainView, params);
        render.AddIslandCSS();
        return false;
      });
    $("#empire_Tabs").on(
      "click",
      "td.building span.clickable",
      function (event) {
        var target = $(event.target);
        var city = database.getCityFromId(
          target.parents("tr").attr("id").split("_").pop(),
        );
        var className = target.parents("td").attr("class").split(" ").pop();
        var building = city.getBuildingsFromName(className.slice(0, -1))[
          className.charAt(className.length - 1)
        ];
        var params = building.getUrlParams;
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
      5000,
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
      this.cityRows[type][city.getId] = $("#" + type + "_" + city.getId);
    return this.cityRows[type][city.getId];
  },
  getAllRowsForCity: function (city) {
    return this.getResourceRow(city)
      .add(this.getBuildingsRow(city))
      .add(this.getArmyRow(city));
  },
  setCityName: function (city, rows) {
    if (!rows) {
      rows = this.getAllRowsForCity(city);
    }
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
    if (!rows) {
      rows = this.getAllRowsForCity(city);
    }
    rows.find("span.ap").text(city.getAvailableActions + "/" + city.maxAP);
    rows
      .find("span.garrisonlimit img")
      .attr("src", "cdn/all/both/advisors/military/bang_soldier.png");
  },
  setFinanceData: function (city, row) {
    if (!row) {
      row = this.getResourceRow(city);
    }
  },
  setPopulationData: function (city, row) {
    if (!row) {
      row = this.getResourceRow(city);
    }
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
    if (populationData.growth < -1) {
      img = "outraged";
    } else if (populationData.growth < 0) {
      img = "sad";
    } else if (populationData.growth < 1) {
      img = "neutral";
    } else if (populationData.growth < 6) {
      img = "happy";
    } else {
      img = "ecstatic";
    }
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
    if (!row) {
      row = this.getResourceRow(city);
    }
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
    if (!row) {
      row = this.getResourceRow(city);
    }
    var totalIncoming = {
      wood: 0,
      wine: 0,
      marble: 0,
      glass: 0,
      sulfur: 0,
      gold: 0,
    };
    $.each(city.getIncomingResources, function (index, element) {
      for (var resourceName in Constant.Resources) {
        totalIncoming[Constant.Resources[resourceName]] += element.getResource(
          Constant.Resources[resourceName],
        );
      }
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
    $.each(
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
        var tot = { wood: 0, wine: 0, marble: 0, glass: 0, sulfur: 0 };
        var inc = { wood: 0, wine: 0, marble: 0, glass: 0, sulfur: 0 };
        var conWine = 0;
        var income = 0;
        var researchCost = 0;
        var researchTot = 0;
        var populationTot = 0;
        var populationMaxTot = 0;
        var growthTot = 0;
        var citygrowth = 0;
        var popDiffTot = 0;
        $.each(
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
            // The original wrote `Math.floor(<comparison>)`, i.e. floor of a
            // boolean. It only feeds a ternary, so the comparison alone is
            // exactly equivalent.
            citygrowth =
              city.populationData.maxPop - city._population > 0
                ? city.populationData.growth
                : 0;
            growthTot += citygrowth;
            popDiffTot = Math.floor(populationMaxTot - populationTot);
            var storage = city.maxResourceCapacities;
            $.each(
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
                  time =
                    time > 1
                      ? Math.floor(time) + (60 - new Date().getMinutes()) / 60
                      : 0;
                  if (!isFinite(time)) {
                    time = currentResource.getFullTime;
                    time =
                      time > 1
                        ? Math.floor(time) + (60 - new Date().getMinutes()) / 60
                        : 0;
                  }
                  time *= 3600000;
                  rescells
                    .find("span.emptytime")
                    .removeClass("Red Green")
                    .addClass(
                      time > database.settings.wineWarningTime.value * 3600000
                        ? "Green"
                        : "Red",
                    )
                    .get(0).textContent =
                    database.settings.wineWarningTime.value > 0
                      ? Utils.FormatTimeLengthToStr(time, 2)
                      : "";
                  if (
                    time < database.settings.wineWarningTime.value * 3600000 &&
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
                  time *= 3600000;
                  rescells
                    .find("span.emptytime")
                    .removeClass("Red Green")
                    .addClass(
                      time > database.settings.wineWarningTime.value * 3600000
                        ? "Green"
                        : "Red",
                    )
                    .get(0).textContent = Utils.FormatTimeLengthToStr(time, 2);
                }
                if (resourceName === Constant.Resources.GOLD) {
                  rescells.find("span.current").get(0).textContent =
                    city.getIncome + city.getExpenses >= 0
                      ? Utils.FormatNumToStr(city.getIncome + city.getExpenses)
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
                rescells
                  .find("div.progressbar")
                  .find("div.ui-progressbar-value")
                  .width(fillperc + "%")
                  .removeClass("normal warning almostfull full")
                  .addClass(
                    fillperc > 90
                      ? fillperc > 96
                        ? "full"
                        : "almostfull"
                      : fillperc > 70
                        ? "warning"
                        : "normal",
                  );
                var diffGold = Math.floor(city.getIncome + city.getExpenses);
                var fillpercG =
                  (100 / (city.populationData.maxPop * 3)) * diffGold;
                if (resourceName === Constant.Resources.GOLD) {
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
                }
                if (storage.safe > current) {
                  rescells.find("span.safeImage").show();
                } else {
                  rescells.find("span.safeImage").hide();
                }
                if (resourceName === Constant.Resources.GOLD) {
                  rescells.find("span.safeImage").hide();
                }
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
        var currentGold: any = 0;
        currentGold = Utils.FormatNumToStr(
          database.getGlobalData.finance.currentGold,
        );
        if (
          database.settings.GoldShort.value == 1 &&
          database.getGlobalData.finance.currentGold > 10000
        )
          currentGold =
            Utils.FormatNumToStr(
              database.getGlobalData.finance.currentGold / 1000,
            ) + "k";
        $("#t_currentgold").get(0).textContent = currentGold;
        $("#t_currentwood").get(0).textContent = Utils.FormatNumToStr(
          Math.round(tot[Constant.Resources.WOOD]),
          false,
        );
        $("#t_currentwine").get(0).textContent = Utils.FormatNumToStr(
          Math.round(tot[Constant.Resources.WINE]),
          false,
        );
        $("#t_currentmarble").get(0).textContent = Utils.FormatNumToStr(
          Math.round(tot[Constant.Resources.MARBLE]),
          false,
        );
        $("#t_currentglass").get(0).textContent = Utils.FormatNumToStr(
          Math.round(tot[Constant.Resources.GLASS]),
          false,
        );
        $("#t_currentsulfur").get(0).textContent = Utils.FormatNumToStr(
          Math.round(tot[Constant.Resources.SULFUR]),
          false,
        );
        $("#t_goldincome")
          .children("span")
          .removeClass("Red Green")
          .addClass(sigmaIncome >= 0 ? "Green" : "Red")
          .eq(0)
          .text(Utils.FormatNumToStr(sigmaIncome, true, 0))
          .siblings("span")
          .eq(0)
          .text(
            sigmaIncome > 0
              ? "\u221E"
              : Utils.FormatTimeLengthToStr(
                  (database.getGlobalData.finance.currentGold / sigmaIncome) *
                    60 *
                    60 *
                    1000,
                  true,
                  0,
                ),
          );
        $("#t_woodincome").find("span").get(0).textContent =
          Utils.FormatNumToStr(Math.round(inc[Constant.Resources.WOOD]), true);
        $("#t_wineincome")
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
        $("#t_marbleincome").find("span").get(0).textContent =
          Utils.FormatNumToStr(
            Math.round(inc[Constant.Resources.MARBLE]),
            true,
          );
        $("#t_glassincome").find("span").get(0).textContent =
          Utils.FormatNumToStr(Math.round(inc[Constant.Resources.GLASS]), true);
        $("#t_sulfurincome").find("span").get(0).textContent =
          Utils.FormatNumToStr(
            Math.round(inc[Constant.Resources.SULFUR]),
            true,
          );
        $("#t_population").get(0).textContent =
          Utils.FormatNumToStr(Math.round(populationTot), false) +
          "(" +
          Utils.FormatNumToStr(Math.round(populationMaxTot), false) +
          ")";
        $("#t_growth").get(0).textContent =
          popDiffTot > 0
            ? Utils.FormatNumToStr(growthTot, true, 2)
            : "0" + Constant.LanguageData[lang].decimalPoint + "00";
        $("#t_research").get(0).textContent = researchTot
          ? Utils.FormatNumToStr(researchTot, true, 0)
          : "0" + Constant.LanguageData[lang].decimalPoint + "00";
        tot = inc = null;
      }
    } catch (e) {
      empire.error("UpdateResourceCounters", e);
    }
  },
};
