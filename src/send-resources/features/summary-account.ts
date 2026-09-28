/**
 * Multi-account summary: time remaining, wood held, wood income.
 *
 * Ported from `updateListAccount` / `refreshSummaryAccount` /
 * `checkBoxAutoBuildChanged` / `clearListAccount`.
 *
 * The data lives in `globalStore` (no account prefix), so every account on the
 * server sees one shared table — matching the original's `isGlobal = true`.
 */

import { escapeHtml, qs } from "@core/dom";
import {
  compareValues,
  formatNumToStr,
  formatTimeLengthToStr,
  minBy,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_SECOND,
  parseGameNumber,
  SECONDS_PER_HOUR,
} from "@core/format";
import { SEL } from "@core/ikariam/selectors";
import { backToCity } from "../navigation";
import {
  FLAG,
  getFlag,
  getState,
  isAutoStart,
  isFlagTrue,
  loadAccounts,
  saveAccounts,
  setFlag,
} from "../state";
import { ACCOUNT_SUMMARY } from "../messages";
import type { AccountSummary } from "../types";

/** Where an account name links to: the game lobby, which switches to it. */
const LOBBY_ACCOUNT_URL =
  "https://lobby.ikariam.gameforge.com/en_GB/accounts?redirectAccount=";

const MS_PER_MINUTE = 60_000;
const HOURS_PER_WEEK = 24 * 7;

/**
 * Returns whether it is safe to trigger the keep-alive reload right now.
 * Wired to the task runner so a reload never lands mid-shipment.
 */
let isReloadSafe: () => boolean = () => true;

export function setReloadGuard(guard: () => boolean): void {
  isReloadSafe = guard;
}

/** Parse the time remaining out of the tab title, e.g. `"... - 1d 3h 20m 5s"`. */
export function parseRemainingFromTitle(): number {
  const parts = document.title.toLowerCase().split("-");
  if (parts.length < 2) return 0;

  const units: ReadonlyArray<readonly [suffix: string, ms: number]> = [
    ["d", MS_PER_DAY],
    ["h", MS_PER_HOUR],
    ["m", MS_PER_MINUTE],
    ["s", MS_PER_SECOND],
  ];

  let total = 0;
  for (const token of parts[1].trim().split(" ")) {
    for (const [suffix, ms] of units) {
      if (token.includes(suffix)) {
        total += Number(token.replace(suffix, "")) * ms;
        break;
      }
    }
  }
  return total;
}

/** Read wood figures from the Resource tab (only present when the board is open). */
function readWoodStats(): { totalWood: string; woodIncome: string } | null {
  const current = qs(SEL.currentWood);
  if (!current) return null;
  // Stored as strings, as the original stored them; the parse is only what
  // strips the thousands separators and the income's leading "+".
  return {
    totalWood: String(parseGameNumber(current.textContent) ?? 0),
    woodIncome: String(parseGameNumber(qs(SEL.woodIncome)?.textContent) ?? 0),
  };
}

/** Record the current account's figures in the shared table. */
export function updateCurrentAccount(): void {
  const { accountName } = getState();
  const accounts = loadAccounts();
  accounts.sort(compareValues<AccountSummary>("account"));

  let row = accounts.find((entry) => entry.account === accountName);
  if (!row) {
    row = {
      account: accountName,
      time: parseRemainingFromTitle() + Date.now(),
    };
    accounts.push(row);
  } else {
    row.time = parseRemainingFromTitle() + Date.now();
  }

  const wood = readWoodStats();
  if (wood) {
    row.totalWood = wood.totalWood;
    row.woodIncome = wood.woodIncome;
    row.timeWood = Date.now();
  }

  saveAccounts(accounts);
  renderSummary();
}

export function setAutoBuildChecked(account: string, checked: boolean): void {
  const accounts = loadAccounts();
  const row = accounts.find((entry) => entry.account === account);
  if (row) {
    row.isAutoBuildChecked = checked;
    saveAccounts(accounts);
  }
}

export function clearAccounts(): void {
  saveAccounts([]);
  renderSummary();
}

/** Redraw the table and run the keep-alive check. */
export function renderSummary(): void {
  const { accountName } = getState();
  const accounts = loadAccounts();

  // Refresh wood figures while the Empire Overview board is open.
  const wood = readWoodStats();
  if (wood) {
    const row = accounts.find((entry) => entry.account === accountName);
    if (row) {
      row.totalWood = wood.totalWood;
      row.woodIncome = wood.woodIncome;
      row.timeWood = Date.now();
      saveAccounts(accounts);
    }
  }

  const container = qs("#summaryAccountList");
  if (container) container.innerHTML = buildSummaryHtml(accounts, accountName);

  keepAliveTick();
}

function buildSummaryHtml(
  accounts: AccountSummary[],
  currentAccount: string,
): string {
  if (accounts.length === 0) return '<table id="summaryAccountTable"></table>';

  // The auto-build account finishing soonest gets a red outline.
  const soonest = minBy(
    accounts,
    "time",
    (a) => !!a.isAutoBuildChecked,
  )?.account;

  const rows = accounts
    .map((account) => {
      const incomePerSecond = Number(account.woodIncome) / SECONDS_PER_HOUR;
      const projectedWood =
        Number(account.totalWood) +
        Math.round(
          incomePerSecond *
            ((Date.now() - (account.timeWood ?? 0)) / MS_PER_SECOND),
        );

      const classes = [
        currentAccount === account.account ? "active" : "",
        account.account === soonest ? "min" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `<tr class="${classes}">
        <td><input type="checkbox" ${account.isAutoBuildChecked ? "checked" : ""}
             data-ika-account="${escapeHtml(account.account.trim())}" class="js-ika-autobuild"/></td>
        <td><a href="${LOBBY_ACCOUNT_URL}${encodeURIComponent(account.account)}">${escapeHtml(account.account)}</a></td>
        <td style="text-align: right">${formatTimeLengthToStr(account.time - Date.now(), 3, " ")}</td>
        <td style="text-align: right">${formatNumToStr(projectedWood, false, 0)}</td>
        <td style="text-align: right" class="woodWeek">${formatNumToStr(Number(account.woodIncome))}</td>
        <td style="text-align: right" class="woodWeek">${formatNumToStr(Number(account.woodIncome) * HOURS_PER_WEEK)}</td>
      </tr>`;
    })
    .join("");

  return `<table id="summaryAccountTable" border="1" cellpadding="10px">
    <tr><th></th>${ACCOUNT_SUMMARY.columns.map((label) => `<th>${label}</th>`).join("")}
        <th class="woodWeek">${ACCOUNT_SUMMARY.woodPerHour}</th><th class="woodWeek">${ACCOUNT_SUMMARY.woodPerWeek}</th></tr>
    ${rows}
  </table>`;
}

/**
 * Light reload every two minutes while automation is on, to keep the session
 * alive and refresh the DOM.
 *
 * The `isReloadSafe` guard is new: the original reloaded regardless, which
 * could navigate away in the middle of a shipment. `reloadedMinute` still
 * prevents firing twice within the same minute.
 */
function keepAliveTick(): void {
  if (!isFlagTrue(FLAG.isAutoBuildStart) && !isAutoStart()) return;
  if (!isReloadSafe()) return;

  const minute = new Date().getUTCMinutes();
  if (minute % 2 !== 0) return;
  if (minute === Number(getFlag(FLAG.reloadedMinute))) return;

  setFlag(FLAG.reloadedMinute, minute);
  setFlag(FLAG.isAutoReload, false);
  backToCity("keep-alive (even minute)");
}
