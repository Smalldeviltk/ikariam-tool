/**
 * Wine levelling across accounts.
 *
 * Goal: every town of every account runs out of wine at the same moment.
 *
 * Input: every Crawl Wine file (`ikariam-wine-<account>-<UTC time>.js`) in the
 * `input-wine-transport` folder beside this script. Each one holds
 *
 *     const csv = `
 *     account,town,stock,consume,maxSupply
 *     Smalldevil1, S-Nuithanh    , 0    , 194    , 65000
 *     `;
 *
 * where `consume` is the town's hourly need net of its island's production,
 * and `maxSupply` is what the account's source town can spare (its stock less
 * one hour of its own consumption) — the same on every row.
 *
 * How the target is found:
 *  1. For each account alone, the level its supply could lift its towns to,
 *     by water filling: towns already holding out longer than the level are
 *     left out and the level recomputed, so the supply is never overdrawn.
 *  2. The common target is the LOWEST of those levels — the account that can
 *     do least decides it, since wine does not move between accounts.
 *  3. Every account tops its towns up to that target. What an account does
 *     not need for it stays at its source town.
 *
 * A town already holding out past the target gets nothing and runs out
 * later: wine cannot be taken back from it. It is named in the output.
 *
 * When two files belong to the same account, only the newest (by the time in
 * the file name) is used.
 *
 * Output: one file per account read, in the `output-wine-transport` folder
 * beside this script (created when missing; no file is ever overwritten):
 * `ikariam-wine-transport-<account>-<UTC time>.json`, holding
 *
 *     {
 *       "kind": "ikariam-wine-transport",
 *       "version": 1,
 *       "account": "Dark Lord",
 *       "createdAt": "2026-11-05T10:00:00.000Z",
 *       "crawlFile": "ikariam-wine-Dark_Lord-2026-11-05-09-21-47.js",
 *       "targetHours": 1979.07,
 *       "shipments": [{ "town": "C_Dungeon", "wine": 1234 }]
 *     }
 *
 * `shipments` lists the towns getting wine, fewest hours left first; an
 * account with nothing to send gets an empty list. Send Resources' Auto Wine
 * Settings imports the file and queues the shipments.
 *
 * Run: node tools/wine-transport.js
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const INPUT_FOLDER_NAME = "input-wine-transport";
const OUTPUT_FOLDER_NAME = "output-wine-transport";
const TRANSPORT_FILE_KIND = "ikariam-wine-transport";
const TRANSPORT_FILE_VERSION = 1;
const CRAWL_FILE_PATTERN = /^ikariam-wine-.*\.js$/;
const CRAWL_FILE_TIME_PATTERN = /(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.js$/;
const REQUIRED_COLUMNS = ["account", "town", "stock", "consume", "maxSupply"];

// ==========================
// Reading the crawl files
// ==========================

/** The CSV text inside `const csv = \`…\`;`, with the template escapes undone. */
function extractCsvText(fileText) {
  const start = fileText.indexOf("`");
  const end = fileText.lastIndexOf("`");
  if (start < 0 || end <= start) return null;
  // Crawl Wine escapes `\`, "`" and "${" with a backslash; undo all three.
  return fileText.slice(start + 1, end).replace(/\\([\\`$])/g, "$1");
}

/** Rows of one crawl file as objects; throws on a missing column. */
function parseCrawlCsv(csvText, fileName) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) {
      throw new Error(`${fileName}: column "${column}" is missing`);
    }
  }

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const row = {};
    headers.forEach((header, index) => (row[header] = cells[index]));
    return {
      account: row.account,
      town: row.town,
      stock: Number(row.stock),
      consume: Number(row.consume),
      maxSupply: Number(row.maxSupply),
    };
  });
}

/**
 * When the file was saved, in epoch milliseconds: the UTC time in its name,
 * else its mtime (a browser's "… (1).js" copy has no time in its name).
 */
function crawlFileTime(folder, fileName) {
  const match = CRAWL_FILE_TIME_PATTERN.exec(fileName);
  if (match) {
    const [year, month, day, hour, minute, second] = match[1]
      .split("-")
      .map(Number);
    return Date.UTC(year, month - 1, day, hour, minute, second);
  }
  return statSync(join(folder, fileName)).mtimeMs;
}

/**
 * One entry per account — from its newest crawl file — with its towns and the
 * wine its source can spare.
 */
function loadAccounts(folder) {
  const fileNames = readdirSync(folder)
    .filter((name) => CRAWL_FILE_PATTERN.test(name))
    .sort();

  const newestByAccount = new Map();
  for (const fileName of fileNames) {
    const csvText = extractCsvText(
      readFileSync(join(folder, fileName), "utf8"),
    );
    if (csvText === null) {
      console.warn(`Skipped ${fileName}: no csv inside backticks`);
      continue;
    }
    const rows = parseCrawlCsv(csvText, fileName);
    if (rows.length === 0) {
      console.warn(`Skipped ${fileName}: no towns in it`);
      continue;
    }

    const time = crawlFileTime(folder, fileName);
    for (const account of new Set(rows.map((row) => row.account))) {
      const entry = {
        fileName,
        time,
        rows: rows.filter((row) => row.account === account),
      };
      const previous = newestByAccount.get(account);
      if (!previous) {
        newestByAccount.set(account, entry);
        continue;
      }
      const [newer, older] =
        entry.time > previous.time ? [entry, previous] : [previous, entry];
      console.warn(
        `Account "${account}" is in two files; using ${newer.fileName}, ` +
          `ignoring ${older.fileName}`,
      );
      newestByAccount.set(account, newer);
    }
  }

  const accounts = [];
  for (const [name, entry] of newestByAccount) {
    const supplies = new Set(entry.rows.map((row) => row.maxSupply));
    if (supplies.size > 1) {
      console.warn(
        `Account "${name}" has different maxSupply values in ` +
          `${entry.fileName}; using the first, ${entry.rows[0].maxSupply}`,
      );
    }
    accounts.push({
      name,
      fileName: entry.fileName,
      supply: Math.max(0, Math.floor(entry.rows[0].maxSupply || 0)),
      towns: entry.rows.map((row) => ({
        name: row.town,
        stock: Math.max(0, row.stock || 0),
        consume: row.consume,
      })),
    });
  }
  return accounts;
}

// ==========================
// Levelling
// ==========================

/** Hours a town's stock lasts at its consumption. */
function hoursLeft(town) {
  return town.stock / town.consume;
}

/**
 * The hours `supply` could lift these towns to, never overdrawing it: the
 * towns are taken from the shortest-lasting up, and a town already lasting
 * longer than the level reached stays out. Infinity when no town drinks.
 */
function waterFillingLevel(towns, supply) {
  const drinking = towns
    .filter((town) => town.consume > 0)
    .sort((a, b) => hoursLeft(a) - hoursLeft(b));
  if (drinking.length === 0) return Infinity;

  let totalStock = 0;
  let totalConsume = 0;
  let level = 0;
  for (let index = 0; index < drinking.length; index++) {
    totalStock += drinking[index].stock;
    totalConsume += drinking[index].consume;
    level = (totalStock + supply) / totalConsume;
    const next = drinking[index + 1];
    if (!next || level <= hoursLeft(next)) break;
  }
  return level;
}

/**
 * Wine for each town of one account to reach `targetHours`, in whole units,
 * never more than the account's supply. What it does not need stays at the
 * source.
 */
function allocateAccount(account, targetHours) {
  const towns = account.towns.map((town) => {
    const exact =
      town.consume > 0 && Number.isFinite(targetHours)
        ? Math.max(0, targetHours * town.consume - town.stock)
        : 0;
    return { ...town, exact, add: Math.floor(exact) };
  });

  let used = towns.reduce((sum, town) => sum + town.add, 0);

  // Hand out what flooring left, largest fraction first, only to towns still
  // short of the target.
  const byFraction = [...towns].sort((a, b) => (b.exact % 1) - (a.exact % 1));
  for (const town of byFraction) {
    if (used >= account.supply) break;
    if (town.exact <= town.add) continue;
    town.add += 1;
    used += 1;
  }

  return {
    account: account.name,
    fileName: account.fileName,
    supply: account.supply,
    sent: used,
    keptAtSource: account.supply - used,
    towns: towns.map((town) => {
      const finalStock = town.stock + town.add;
      const hoursNow = town.consume > 0 ? hoursLeft(town) : Infinity;
      let note = "";
      if (town.consume <= 0) note = "drinks none";
      else if (town.add === 0 && hoursLeft(town) >= targetHours)
        note = "already past the target";
      return {
        town: town.name,
        stock: town.stock,
        consume: town.consume,
        add: town.add,
        finalStock,
        finalHours:
          town.consume > 0
            ? Number((finalStock / town.consume).toFixed(2))
            : "-",
        note,
        hoursNow,
      };
    }),
  };
}

/** The common target, which account set it, and each account's shipments. */
function levelAcrossAccounts(accounts) {
  let targetHours = Infinity;
  let setBy = null;
  for (const account of accounts) {
    account.level = waterFillingLevel(account.towns, account.supply);
    if (account.level < targetHours) {
      targetHours = account.level;
      setBy = account.name;
    }
  }
  return {
    targetHours,
    setBy,
    accounts: accounts.map((account) => ({
      ...allocateAccount(account, targetHours),
      ownLevel: account.level,
    })),
  };
}

// ==========================
// Writing the transport files
// ==========================

/** `2026-11-05-10-00-00`, as Send Resources stamps its file names (UTC). */
function fileTimeStamp(date) {
  return date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** Write `text` to a new file in `folder`, never over an existing one. */
function writeNewFile(folder, baseName, extension, text) {
  for (let attempt = 1; ; attempt++) {
    const name =
      attempt === 1
        ? `${baseName}.${extension}`
        : `${baseName}-${attempt}.${extension}`;
    try {
      writeFileSync(join(folder, name), text, { flag: "wx" });
      return name;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

/** The transport file of one account, as Auto Wine's import reads it. */
function transportFileContent(account, targetHours, createdAt) {
  const shipments = account.towns
    .filter((town) => town.add > 0)
    .sort((a, b) => a.hoursNow - b.hoursNow)
    .map((town) => ({ town: town.town, wine: town.add }));
  return {
    kind: TRANSPORT_FILE_KIND,
    version: TRANSPORT_FILE_VERSION,
    account: account.account,
    createdAt: createdAt.toISOString(),
    crawlFile: account.fileName,
    targetHours: Number.isFinite(targetHours)
      ? Number(targetHours.toFixed(2))
      : null,
    shipments,
  };
}

/** One file per account in `folder`; returns the names written. */
function writeTransportFiles(folder, result) {
  mkdirSync(folder, { recursive: true });
  const createdAt = new Date();
  const stamp = fileTimeStamp(createdAt);
  return result.accounts.map((account) => {
    const safeAccount = account.account.replace(/[^\w.-]+/g, "_");
    const content = transportFileContent(
      account,
      result.targetHours,
      createdAt,
    );
    return writeNewFile(
      folder,
      `${TRANSPORT_FILE_KIND}-${safeAccount}-${stamp}`,
      "json",
      JSON.stringify(content, null, 2) + "\n",
    );
  });
}

// ==========================
// Run
// ==========================

const toolFolder = fileURLToPath(new URL(".", import.meta.url));
const inputFolder = join(toolFolder, INPUT_FOLDER_NAME);
const outputFolder = join(toolFolder, OUTPUT_FOLDER_NAME);

if (!existsSync(inputFolder)) {
  console.log(
    `No input folder: create ${inputFolder} and put the Crawl Wine files in it.`,
  );
} else {
  const accounts = loadAccounts(inputFolder);

  if (accounts.length === 0) {
    console.log(`No ikariam-wine-*.js file with towns in ${inputFolder}`);
  } else {
    const result = levelAcrossAccounts(accounts);

    if (!Number.isFinite(result.targetHours)) {
      console.log("No town drinks any wine: nothing to send.");
    } else {
      console.log(
        `Target: ${result.targetHours.toFixed(2)} h ` +
          `(~${Math.round(result.targetHours)} h), set by account "${result.setBy}"`,
      );
      for (const account of result.accounts) {
        console.log("================================");
        console.log(`Account: ${account.account}  (${account.fileName})`);
        console.log(
          `Supply: ${account.supply}  Sent: ${account.sent}  ` +
            `Kept at source: ${account.keptAtSource}  ` +
            `Own level: ${
              Number.isFinite(account.ownLevel)
                ? account.ownLevel.toFixed(2) + " h"
                : "-"
            }`,
        );
        console.table(account.towns.map(({ hoursNow, ...shown }) => shown));
      }
    }

    const written = writeTransportFiles(outputFolder, result);
    console.log("================================");
    console.log(`Wrote ${written.length} file(s) to ${outputFolder}:`);
    for (const name of written) console.log(`  ${name}`);
  }
}
