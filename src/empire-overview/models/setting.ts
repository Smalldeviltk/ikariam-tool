/* eslint-disable */
/**
 * Mechanically ported from the original "Quan ly Ika Perseus -VN- V2.js".
 * The logic is line-for-line the same; only the module split, the imports and
 * the type annotations are new. Fixes to genuine bugs found during the port are
 * marked inline with a comment explaining the original behaviour.
 */
import { Constant } from "../constants";
import { database } from "../database";
import { empire } from "../empire";

export function Setting(name) {
  this._name = name;
  this._value = null;
}
(Setting as any).prototype = {
  get name() {
    return database.getGlobalData.getLocalisedString(this._name);
  },
  get type() {
    return Constant.SettingData[this._name].type;
  },
  get description() {
    return database.getGlobalData.getLocalisedString(
      this._name + "_description",
    );
  },
  get value() {
    return this._value !== null
      ? this._value
      : Constant.SettingData[this._name].default;
  },
  get categories() {
    return Constant.SettingData[this._name].categories;
  },
  get choices() {
    return Constant.SettingData[this._name].choices || false;
  },
  get selection() {
    return Constant.SettingData[this._name].selection || false;
  },
  set value(value) {
    if (this.type === "boolean") {
      this._value = !!value;
    } else if (this.type === "number") {
      if (!isNaN(value)) {
        this._value = value;
      }
    } else if (this.type === "buildings") {
      if (!isNaN(value)) {
        this._value = value;
      }
    } else if (this.type === "language") {
      this._value = value;
    } else if (this.type === "array" || this.type === "orderedList") {
      if (Object.prototype.toString.call(value) === "[object Array]") {
        this._value = value;
      }
    }
  },
  toJSON: function () {
    return { value: this._value };
  },
};
/***********************************************************************************************************************
 * empire
 **********************************************************************************************************************/
