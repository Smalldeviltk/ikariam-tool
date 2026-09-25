// ==UserScript==
// @name         Ikariam Send Resources
// @namespace    Smalldevil
// @version      21.0.0
// @author       Smalldevil
// @description  Automates the routine tasks in Ikariam: bulk resource shipments, wine distribution and building upgrades.
// @license      GPL version 3 or any later version
// @include      *://*.ikariam.gameforge.*/*
// @exclude      *://board.*.ikariam.gameforge.*/*
// @exclude      *://*.ikariam.gameforge.*/board*
// @exclude      *://*.ikariam.gameforge.*/?view=island*
// @exclude      *://*.ikariam.gameforge.*/?view=worldmap_iso*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  var TIME_FINISHED = "Finished.";
  var WINDOW_CLOSE_TITLE = "Close";
  var BUGS_NONE_RECORDED = "No bugs recorded.";
  var IMPORT_ERRORS = {
    notJson: "That is not valid JSON.",
    notOurFormat:
      "That file was not produced by this tool (missing or wrong format tag).",
    unsupportedVersion: (found, supported) =>
      `Unsupported export version ${found}; this build understands up to ${supported}.`,
    noEntries: "The export contains no entries.",
  };
  var IMPORT_NOTES = {
    keptExisting: (key) => `kept existing ${key}`,
    couldNotWrite: (key, reason) => `could not write ${key}: ${reason}`,
  };
  var IMPORT_SUMMARY = {
    exportedAt: (when) => `Exported ${when}`,
    entries: (count, groups) => `${count} entries (${groups || "none"})`,
    accounts: (accounts) =>
      `Accounts: ${accounts || "none (global data only)"}`,
  };
  var MS_PER_SECOND = 1e3;
  var MS_PER_HOUR = 36e5;
  var MS_PER_DAY = 864e5;
  var SECONDS_PER_HOUR = 3600;
  var TIME_FACTORS = [
    ["Y", 31536e3],
    ["M", 252e4],
    ["D", 86400],
    ["h", 3600],
    ["m", 60],
    ["s", 1],
  ];
  function formatTimeLengthToStr(milliseconds, precision = 2, spacer = " ") {
    const total = milliseconds || 0;
    if (total < 0) return TIME_FINISHED;
    let remaining = Math.ceil(total / MS_PER_SECOND);
    let precisionLeft = precision;
    let out = "";
    for (const [suffix, factor] of TIME_FACTORS) {
      const units = Math.floor(remaining / factor);
      if (Number.isNaN(units)) return out;
      if (precisionLeft > 0 && (units > 0 || out !== "")) {
        remaining -= units * factor;
        if (out !== "") out += spacer;
        out += units === 0 ? "" : units + suffix;
        precisionLeft = units === 0 ? precisionLeft : precisionLeft - 1;
      }
    }
    return out;
  }
  function formatNumToStr(inputNum, outputSign = false, precision) {
    const factor = precision ? Number("10e" + (precision - 1)) : 1;
    const thousandsSep = ",";
    const decimalSep = ".";
    if (!Number.isFinite(inputNum)) return "∞";
    const sign = inputNum > 0 ? 1 : inputNum === 0 ? 0 : -1;
    if (!sign) return inputNum;
    const parts = (Math.floor(Math.abs(inputNum * factor)) / factor + "").split(
      ".",
    );
    const out = parts[1] !== void 0 ? [decimalSep, parts[1]] : [];
    const digits = parts[0].split("");
    let i = digits.length;
    let group = 1;
    while (i--) {
      out.unshift(digits.pop());
      if (i && group % 3 === 0) out.unshift(thousandsSep);
      group++;
    }
    if (outputSign) out.unshift(sign === 1 ? "+" : "-");
    return out.join("");
  }
  function formatInteger(value) {
    return Math.round(value).toLocaleString("en-US");
  }
  function sortKey(value) {
    return typeof value === "string" ? value.toUpperCase() : value;
  }
  function compareValues(key, order = "asc") {
    return (a, b) => {
      if (
        !Object.prototype.hasOwnProperty.call(a, key) ||
        !Object.prototype.hasOwnProperty.call(b, key)
      )
        return 0;
      const valueA = sortKey(a[key]);
      const valueB = sortKey(b[key]);
      let comparison = 0;
      if (valueA > valueB) comparison = 1;
      else if (valueA < valueB) comparison = -1;
      return order === "desc" ? comparison * -1 : comparison;
    };
  }
  function minBy(items, key, filter) {
    const pool = filter ? items.filter(filter) : items;
    if (pool.length === 0) return null;
    return pool.reduce((prev, curr) => (prev[key] < curr[key] ? prev : curr));
  }
  function parseGameNumber(text) {
    if (text === null || text === void 0) return null;
    const clean = text.replace(/,/g, "").replace(/\s/g, "");
    const parsed = parseFloat(clean);
    if (!Number.isFinite(parsed)) return null;
    return /k$/i.test(clean) ? Math.round(parsed * 1e3) : parsed;
  }
  function errorMessage(error) {
    if (error instanceof Error) return error.message;
    return String(error);
  }
  var DEFAULT_TIMEOUT_MS = 15e3;
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function waitFor(predicate, options = {}) {
    const {
      intervalMs = 200,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      label = "waitFor",
    } = options;
    const deadline = timeoutMs === Infinity ? Infinity : Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      let lastError;
      const tick = () => {
        let value;
        try {
          value = predicate();
          lastError = void 0;
        } catch (error) {
          value = null;
          lastError = error;
        }
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() >= deadline) {
          const reason =
            lastError === void 0
              ? ""
              : ` (last check threw: ${errorMessage(lastError)})`;
          reject(
            new Error(`${label}: timed out after ${timeoutMs}ms${reason}`),
          );
          return;
        }
        setTimeout(tick, intervalMs);
      };
      setTimeout(tick, intervalMs);
    });
  }
  function qs(selector, root = document) {
    return root.querySelector(selector);
  }
  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }
  function waitForElement(selector, options = {}) {
    return waitFor(() => qs(selector), {
      label: `waitForElement(${selector})`,
      ...options,
    });
  }
  function waitForElements(selector, min = 1, options = {}) {
    return waitFor(
      () => {
        const list = qsa(selector);
        return list.length >= min ? list : null;
      },
      {
        label: `waitForElements(${selector})`,
        ...options,
      },
    );
  }
  function clickIfPresent(selector, root) {
    const el = qs(selector, root);
    if (!el) return false;
    el.click();
    return true;
  }
  function removeElement(selector) {
    qs(selector)?.remove();
  }
  function addStyle(css) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }
  function setInputValue(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }
  function readNumberOrNull(selector) {
    const el = qs(selector);
    return el ? parseGameNumber(el.textContent) : null;
  }
  var HTML_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
  }
  var SEL = {
    accountName: ".avatarName > a.noViewParameters",
    accountBlock: ".avatarName",
    townListContainer: "#dropDown_js_citySelectContainer > div.bg > ul",
    cityBread: "#js_cityBread",
    changeCityForm: "#changeCityForm",
    changeCityInput: "#js_cityIdOnChange",
    loadingIndicator: "#loadingPreview",
    cityLink: "#js_cityLink > a",
    backlinkButton: "#js_backlinkButton",
    globalMenu: {
      maxActionPoints: "#js_GlobalMenu_maxActionPoints",
      freeTransporters: "#js_GlobalMenu_freeTransporters",
      freeFreighters: "#js_GlobalMenu_freeFreighters",
      wine: "#js_GlobalMenu_wine",
    },
    position: (n) => `#position${n}`,
    cityPositionLink: (n) => `#js_CityPosition${n}Link`,
    buildings: "div[id^='position'].building:not(.buildingGround)",
    winePress: "div[id^='position'].building.vineyard",
    buildingHover: ".hoverable",
    constructionSite: ".constructionSite",
    safehouse: "div.building.safehouse > a",
    buildingUpgradeButton: "#js_buildingUpgradeButton",
    dockCities: ".cities.clearfix > li > a",
    resourceField: (resource) => `#textfield_${resource}`,
    wineField: "#textfield_wine",
    submit: "#submit",
    freightersMaxButton: "#slider_freighters_max",
    setMax: ".setMax",
    buildTabTownNames: "#BuildTab .city_name > span.clickable",
    resTabRows: "#ResTab > table > tbody > tr",
    resTabTownName: "td.city_name > .clickable",
    resTabWineStock: "td.resource.wine span.current",
    resTabWineConsumption: "td.resource.wine span.consumption",
    resTabWineConsumed: "td.resource.wine > span.Red",
    currentWood: "#t_currentwood",
    woodIncome: "#t_woodincome > span.Green",
    barbarianVillageResources: "#barbarianVillage ul.resources",
    barbarianFleetResources: "#barbarianFleet ul.resources",
    unitBlocks: "div.units.clearboth",
    merchantShipTitle: '[title="Merchant Ships"]',
    freighterTitle: '[title="Freighter"]',
    upgradeDesc: ".upgrade_desc",
    container: "#container",
    footer: "#footer",
    closeButton: ".close",
  };
  var DIALOG_ID = "ikaMationTransporterDialog";
  var pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  function getIkariam() {
    return pageWindow.ikariam;
  }
  function getTransportConfig() {
    return pageWindow.transportConfig;
  }
  function getAccountName() {
    const el = qs(SEL.accountName);
    if (!el)
      throw new Error("Account name unavailable (avatar bar not rendered)");
    return el.title;
  }
  function getCurrentTownName() {
    return qs(SEL.cityBread)?.textContent?.trim() ?? "";
  }
  var BUG_REPORT_STORAGE_KEY = "ikaBugReports";
  var MAX_RECORDS = 50;
  var MAX_STACK = 2e3;
  var MAX_MESSAGE = 500;
  var MAX_FINGERPRINT = 300;
  var RESNAPSHOT_INTERVAL_MS = 6e4;
  function isLogWorthy(count) {
    if (count < 1) return false;
    let n = count;
    while (n % 10 === 0) n /= 10;
    return n === 1;
  }
  var buildInfo = null;
  function setBuildInfo(info) {
    buildInfo = info;
  }
  var providers = [];
  function registerContextProvider(provider) {
    providers.push(provider);
  }
  function collectContext(extra) {
    const context = {
      at: Date.now(),
      build: buildInfo ?? void 0,
      ...extra,
    };
    for (const provider of providers)
      try {
        Object.assign(context, provider());
      } catch (e) {
        context.providerError = String(e?.message ?? e);
      }
    return context;
  }
  function load() {
    try {
      const raw = localStorage.getItem(BUG_REPORT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function save(records) {
    try {
      localStorage.setItem(BUG_REPORT_STORAGE_KEY, JSON.stringify(records));
    } catch {}
  }
  function fingerprintOf(kind, message, stack) {
    return `${kind}|${message}|${(stack?.split("\n").find((line) => /\s+at\s+/.test(line)) ?? "").trim()}`.slice(
      0,
      MAX_FINGERPRINT,
    );
  }
  var reporting = false;
  function reportBug(kind, error, extra) {
    if (reporting) return;
    reporting = true;
    try {
      const isError = error instanceof Error;
      const message = String(
        (isError ? error.message : error?.message) ?? error ?? "unknown",
      ).slice(0, MAX_MESSAGE);
      const stack = isError ? error.stack?.slice(0, MAX_STACK) : void 0;
      const fingerprint = fingerprintOf(kind, message, stack);
      const records = load();
      const existing = records.find((r) => r.fingerprint === fingerprint);
      if (existing) {
        const now = Date.now();
        existing.count += 1;
        existing.lastAt = now;
        const newest = existing.contexts[existing.contexts.length - 1];
        if (!newest || now - newest.at >= RESNAPSHOT_INTERVAL_MS)
          existing.contexts = [
            existing.contexts[0],
            ...existing.contexts.slice(1),
            collectContext(extra),
          ]
            .filter(Boolean)
            .slice(-3);
      } else {
        const context = collectContext(extra);
        records.push({
          fingerprint,
          kind,
          message,
          stack,
          count: 1,
          firstAt: context.at,
          lastAt: context.at,
          contexts: [context],
        });
        while (records.length > MAX_RECORDS) records.shift();
      }
      save(records);
      const count = existing ? existing.count : 1;
      if (isLogWorthy(count))
        console.warn(
          `[ika] bug recorded (${kind}): ${message}` +
            (count > 1 ? ` [x${count}]` : ""),
        );
    } catch {
    } finally {
      reporting = false;
    }
  }
  function reportSelectorMiss(selector, extra) {
    reportBug(
      "selector-miss",
      new Error(`No match for selector: ${selector}`),
      extra,
    );
  }
  var handlersInstalled = false;
  function installErrorHandlers() {
    if (handlersInstalled) return;
    handlersInstalled = true;
    window.addEventListener("error", (event) => {
      reportBug("uncaught", event.error ?? new Error(event.message), {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      reportBug("unhandled-rejection", event.reason);
    });
  }
  function getBugs() {
    return load();
  }
  function clearBugs() {
    save([]);
  }
  function environment() {
    const page = pageWindow;
    const own = window;
    return {
      url: location.href,
      view: new URLSearchParams(location.search).get("view"),
      userAgent: navigator.userAgent,
      build: buildInfo,
      hasIkariamModel: !!page.ikariam?.model,
      pageJQuery: page.jQuery?.fn?.jquery ?? null,
      scriptJQuery: own.jQuery?.fn?.jquery ?? null,
      jQueryUi: own.jQuery?.ui?.version ?? null,
      language: navigator.language,
    };
  }
  function buildBugReport() {
    const bugs = load();
    return {
      generatedAt: new Date().toISOString(),
      environment: environment(),
      totalOccurrences: bugs.reduce((sum, bug) => sum + bug.count, 0),
      bugs,
    };
  }
  function exportBugReport() {
    return JSON.stringify(buildBugReport(), null, 2);
  }
  function summariseBugs() {
    const bugs = load();
    if (bugs.length === 0) return BUGS_NONE_RECORDED;
    return bugs
      .slice()
      .sort((a, b) => b.lastAt - a.lastAt)
      .map(
        (bug) =>
          `${new Date(bug.lastAt).toLocaleString()}  x${bug.count}  [${bug.kind}] ${bug.message}`,
      )
      .join("\n");
  }
  var LOGGER_STORAGE_KEY = "loggerInfo";
  var TEXTAREA_ID = "txtLogger";
  var MAX_CHARS = 1e5;
  var accountLabel = "";
  function initLogger(accountName) {
    accountLabel = accountName;
    const box = qs(`#${TEXTAREA_ID}`);
    if (box) box.innerHTML = localStorage.getItem("loggerInfo") ?? "";
  }
  function logInfo(message) {
    const line = `${new Date().toLocaleString()} ${accountLabel} ${message}\n`;
    const box = qs(`#${TEXTAREA_ID}`);
    if (box) {
      let next = line + box.innerHTML;
      if (next.length > MAX_CHARS) next = next.slice(0, MAX_CHARS);
      box.innerHTML = next;
      localStorage.setItem(LOGGER_STORAGE_KEY, next);
    }
    console.log(`[ika] ${line.trimEnd()}`);
  }
  function clearLog() {
    const box = qs(`#${TEXTAREA_ID}`);
    if (box) box.innerHTML = "";
    localStorage.setItem(LOGGER_STORAGE_KEY, "");
  }
  var idCounter = 0;
  function makeTaskId(type) {
    idCounter += 1;
    return `${type}-${Date.now().toString(36)}-${idCounter}`;
  }
  var TaskQueue = class {
    constructor(store, key) {
      this.store = store;
      this.key = key;
    }
    list() {
      return this.store.getJSON(this.key, []);
    }
    write(tasks) {
      this.store.setJSON(this.key, tasks);
    }
    get length() {
      return this.list().length;
    }
    head() {
      return this.list()[0];
    }
    listOfType(type) {
      return this.list().filter((t) => t.type === type);
    }
    push(task) {
      const full = {
        ...task,
        id: task.id ?? makeTaskId(task.type),
      };
      const tasks = this.list();
      tasks.push(full);
      this.write(tasks);
      return full;
    }
    replaceById(id, task) {
      const tasks = this.list();
      const index = tasks.findIndex((t) => t.id === id);
      if (index < 0) return;
      tasks[index] = task;
      this.write(tasks);
    }
    removeById(id) {
      this.write(this.list().filter((t) => t.id !== id));
    }
    moveToBack(id) {
      const tasks = this.list();
      const index = tasks.findIndex((t) => t.id === id);
      if (index < 0) return;
      const [task] = tasks.splice(index, 1);
      tasks.push(task);
      this.write(tasks);
    }
    removeType(type) {
      this.write(this.list().filter((t) => t.type !== type));
    }
    removeByLabel(label) {
      this.write(
        this.list().filter(
          (t) => !(t.type === "sendResource" && t.data.label === label),
        ),
      );
    }
    clear() {
      this.write([]);
    }
  };
  var DEFAULT_MAX_ERRORS = 5;
  var DEFAULT_INTERVAL_MS = 1e3;
  var DEFAULT_DEFER_COOLDOWN_MS = 6e4;
  var TaskRunner = class {
    constructor(queue, options = {}) {
      this.queue = queue;
      this.options = options;
      this.handlers = new Map();
      this.timer = null;
      this.busy = false;
      this.drained = false;
      this.deferStreak = 0;
      this.errorStreaks = new Map();
      this.pausedUntil = 0;
    }
    register(type, handler) {
      this.handlers.set(type, handler);
      return this;
    }
    get isRunning() {
      return this.timer !== null;
    }
    get isBusy() {
      return this.busy;
    }
    start() {
      if (this.timer !== null) return;
      this.drained = false;
      this.timer = window.setInterval(
        () => void this.tick(),
        this.options.intervalMs ?? DEFAULT_INTERVAL_MS,
      );
    }
    stop() {
      if (this.timer === null) return;
      window.clearInterval(this.timer);
      this.timer = null;
    }
    async runOnce() {
      await this.tick();
    }
    async tick() {
      if (this.busy) return;
      if (Date.now() < this.pausedUntil) return;
      const task = this.queue.head();
      if (!task) {
        if (!this.drained) {
          this.drained = true;
          this.deferStreak = 0;
          this.options.onDrain?.();
        }
        return;
      }
      this.drained = false;
      if (this.options.isUiReady && !this.options.isUiReady()) return;
      const handler = this.handlers.get(task.type);
      if (!handler) {
        logInfo(`No handler registered for task "${task.type}", dropping it`);
        this.queue.removeById(task.id);
        return;
      }
      this.busy = true;
      try {
        const result = await handler(task);
        if (result.status !== "defer") this.deferStreak = 0;
        this.errorStreaks.delete(task.id);
        switch (result.status) {
          case "done":
            this.queue.removeById(task.id);
            break;
          case "progress":
            this.queue.replaceById(task.id, result.task);
            break;
          case "retry":
            break;
          case "defer":
            this.queue.moveToBack(task.id);
            this.deferStreak += 1;
            if (this.deferStreak >= this.queue.length) {
              const cooldown =
                this.options.deferCooldownMs ?? DEFAULT_DEFER_COOLDOWN_MS;
              this.pausedUntil = Date.now() + cooldown;
              this.deferStreak = 0;
              logInfo(
                `Nothing in the queue can run right now (${result.reason ?? "deferred"}); pausing for ${Math.round(cooldown / 1e3)}s`,
              );
            }
            break;
          case "failed":
            logInfo(`Task ${task.type} failed: ${result.reason}`);
            reportBug("task-failed", new Error(result.reason), {
              taskType: task.type,
              taskData: task.data,
            });
            this.queue.removeById(task.id);
            break;
        }
      } catch (e) {
        const message = e?.message ?? String(e);
        logInfo(`Error while running task ${task.type}: ${message}`);
        reportBug("task-error", e, {
          taskType: task.type,
          taskData: task.data,
        });
        console.error(e);
        const streak = (this.errorStreaks.get(task.id) ?? 0) + 1;
        if (
          streak >= (this.options.maxConsecutiveErrors ?? DEFAULT_MAX_ERRORS)
        ) {
          logInfo(
            `Task ${task.type} threw ${streak} times in a row, giving up on it: ${message}`,
          );
          this.errorStreaks.delete(task.id);
          this.queue.removeById(task.id);
        } else this.errorStreaks.set(task.id, streak);
      } finally {
        this.busy = false;
      }
    }
  };
  var BUTTON = {
    start: "Start",
    startTimer: "Start Timer",
    stopTimer: "Stop Timer",
    settings: "Settings",
    save: "Save",
    load: "Load",
    close: "Close",
    cancel: "Cancel",
    add: "Add",
  };
  var PANEL = {
    title: "Send Resources",
    launcher: "Send Resources",
    groups: {
      wine: "Wine",
      transport: "Transport",
      build: "Build",
      queue: "Queue",
      account: "Account",
      data: "Data",
    },
    calibrateCargo: "Calibrate Cargo",
    scan: "Scan",
    updateAccount: "Update Account",
    exportData: "Export",
    importData: "Import",
    bugReport: "Bug Report",
    clearLog: "Clear Log",
    footerWithQueue: (status, pending) => `${status}  —  ${pending} queued`,
  };
  var WINE_WARNING = {
    unknown:
      "No wine figures yet — open the Empire Overview board, or visit a town.",
    allComfortable: (towns) => `Wine: ${towns} towns, all comfortable`,
    townLine: (town, left) => `${town} — ${left}`,
  };
  var QUEUE_VIEW = {
    empty: "The queue is empty.",
    more: (count) => `+ ${count} more`,
    headerTask: "Task",
    moveToBack: "Send to the back",
    remove: "Remove",
    clearAll: "Clear all",
    upgrade: (building, town) => `Upgrade ${building} in ${town}`,
    confirmClear: (pending) => `Remove all ${pending} queued task(s)?`,
  };
  var TRANSFER_STATUS = { idle: "Nothing is transferring" };
  var SEND_DIALOG = {
    title: "Mass transport resources",
    from: "From: ",
    destination: "Destination: ",
    resource: "Resource: ",
    amount: "Amount: ",
    removeFirst: "Remove First",
    removeLast: "Remove Last",
    columns: ["Origin", "Destination", "Resource", "Amount", "Source"],
    errors: {
      incomplete: "Please fill in every field.",
      sameTown: "Source and destination are the same!",
      noAmount: "Amount must be greater than 0!",
    },
  };
  var WINE_DIALOG = {
    title: "Auto Wine",
    columns: ["Sender", "Town Name", "Wine/h", "Stock", "Lasts"],
    help: '<b>Sender</b> and <b>Wine/h</b> are the two roles and they are mutually exclusive: tick a town to make it a source, or give it a Wine/h above 0 to make it a receiver. A ticked town is never a receiver.<br/><b>Stock</b> and <b>Lasts</b> come from the Empire Overview board, or from the last time each town was visited. When they show "—" there is no measurement yet and Auto Wine uses the <b>Wine/h</b> you type here, assuming zero stock.',
    previewPlan: "Preview plan",
    chooseSourceTitle: "Choose the wine source town",
    noSourceTicked: "No town is ticked as a wine source!",
  };
  var WINE_PREVIEW = {
    noSpare: "The source town has no spare wine to send.",
    boardUnavailable:
      " (The Empire Overview board is not available, so its stock could not be read.)",
    storageFull: " (storage full)",
    levelEveryone: (hours) => `levelling everyone to <b>~${hours}h</b>.`,
    levelExcept: (hours, towns, count) =>
      `levelling to <b>~${hours}h</b>, except ${towns}: storage full, so ${count === 1 ? "it ends" : "they end"} lower and the rest stays at the source for the next run.`,
    summary: (source, used, spare, unused, levelling) =>
      `<b>Source:</b> ${source} — shipping ${used} wine (spare ${spare}, ${unused} left over), ${levelling}`,
    columns: ["Town", "Stock", "Consume/h", "Send", "Lasts after"],
  };
  var AUTO_WINE = {
    noReceivers: (
      senders,
      towns,
    ) => `No town is set to receive wine — ${senders} of ${towns} towns are ticked as Sender.

Sender and receiver are exclusive roles: tick a town to make it a source, or leave it unticked and give it a Wine/h above 0 to make it a receiver. The Load button fills those figures in.`,
    onlyReceiverIsSource:
      "The only town set to receive wine is the one you are sending from.\n\nPick a different source, or give another town a Wine/h figure.",
    noSpareWine: (reserve) =>
      `The source town has no spare wine (it must hold more than ${reserve}).`,
    nothingToSend:
      "Every receiving town already has enough wine — nothing to send.",
    noFigures:
      "No wine figures are available yet.\n\nThey come from the Empire Overview board, or from visiting a town (each visit records that town's wine). Visit the towns once, or open the board, then press Load again — or just type the Wine/h values.",
  };
  var BUILD_DIALOG = {
    buildingList: "List Building",
    emptyTown: "-empty-",
    savedAsYouGo: "Changes are saved as you add or remove entries.",
    runQueue: "Run queue",
  };
  var SCAN = {
    alreadyRunning: "A scan is already walking the towns.",
    noTownList: "No town list on this page — open a town view and try again.",
    queueRunning:
      "The task queue is running and also changes town.\n\nStop it first, then scan.",
    syncFinished: (synced, total, seconds, failed) =>
      `Sync finished: ${synced}/${total} towns in ${seconds}s` +
      (failed ? `, failed: ${failed}` : ""),
    walkFinished: (visited, total, failed) =>
      `Scan finished: ${visited}/${total} towns visited` +
      (failed ? `, failed: ${failed}` : ""),
  };
  var TRANSPORT_BUTTONS = {
    step: (adding, count, freighter) =>
      `${adding ? "Add" : "Remove"} ${count} ${freighter ? "freighter" : "merchant ship"}${count === 1 ? "" : "s"}`,
    clear: "Clear",
  };
  var ACCOUNT_SUMMARY = {
    columns: ["Account", "Time Left", "Total Wood"],
    woodPerHour: "Wood Per h",
    woodPerWeek: "1 Week",
  };
  var SHIP_CAPACITY = {
    calibrated: (merchant, freighter) =>
      "Calibrated!\n" +
      (merchant ? `Merchant Ship: ${merchant}` : "") +
      (freighter ? `\nFreighter: ${freighter}` : ""),
    notReadable:
      "Could not read cargo capacity. Open the Trading Port or the Shipyard, then click again.",
  };
  var BUG_REPORT = {
    nothingToReport: "No bugs recorded. Nothing to report.",
    copied: (count, summary) =>
      `Copied a report of ${count} distinct issue(s) to the clipboard.\n\n` +
      summary,
    clipboardUnavailable:
      "Clipboard unavailable — the full report was printed to the console (F12). You can also run ikaBugReport().",
    cleared: "Bug reports cleared.",
  };
  var DATA_TRANSFER = {
    groupLabels: {
      config: "settings (wine lists, build queue, cargo calibration)",
      measurements: "measurements (town cache, account summary)",
      runtime: "in-flight work (task queue, running flags)",
      diagnostics: "logs and bug reports",
    },
    nothingToExport: "There is nothing to export yet.",
    saved: (count, description, moved, notMoved) =>
      `Saved ${count} entries.\n\n${description}\n\nMoved: ${moved.join(" and ")}.\n\nNOT moved: ${notMoved}. Two browsers running the same queue would both drive one game account and double-send.`,
    otherAccount: (accounts, current) =>
      `This export holds data for a different account (${accounts}), but you are logged in as "${current}".\n\nOK  = rewrite it onto "${current}"\nCancel = import only the account-independent entries`,
    skippingOtherAccount:
      "Account-specific entries will be skipped. Nothing reads keys belonging to another account.",
    confirmImport: (description) =>
      `Import this?\n\n${description}\n\nExisting settings with the same names will be OVERWRITTEN.`,
    imported: (imported, skipped, notes) =>
      `Imported ${imported} entries, skipped ${skipped}.\n\nReload the page for everything to take effect.` +
      (notes ? `\n\n${notes}` : ""),
    failed: (reason) => `Import failed: ${reason}`,
  };
  var MISC = {
    noSafehouse: "No safehouse in this town!",
    popupUnavailable:
      "Could not open the settings dialog - the game's own popup API is not available on this screen. Try again from the town view.",
  };
  function makeStore(prefix) {
    const fullKey = (key) => prefix + key;
    function get(key, fallback) {
      const raw = localStorage.getItem(fullKey(key));
      if (raw === null && fallback !== void 0) return fallback;
      return raw;
    }
    return {
      get,
      set(key, value) {
        localStorage.setItem(fullKey(key), value);
      },
      remove(key) {
        localStorage.removeItem(fullKey(key));
      },
      getJSON(key, fallback) {
        const raw = localStorage.getItem(fullKey(key));
        if (raw === null) return fallback;
        try {
          return JSON.parse(raw);
        } catch {
          console.warn(
            `[ika] Corrupt JSON at "${fullKey(key)}", using default`,
          );
          return fallback;
        }
      },
      setJSON(key, value) {
        localStorage.setItem(fullKey(key), JSON.stringify(value));
      },
    };
  }
  var globalStore = makeStore("");
  function accountStore(accountName) {
    return makeStore(accountName);
  }
  function empireKeyPrefix(accountName) {
    return `***${accountName}***`;
  }
  var EMPIRE_KEY_PATTERN = /^\*\*\*(.*?)\*\*\*(.*)$/;
  var KEY = {
    resource: "resource",
    listSender: "listSender",
    listReceiver: "listReceiver",
    listAccount: "listAccount",
    listAutoBuild: "listAutoBuild",
    globalTaskQueue: "ikaGlobalTaskQueue",
  };
  var FLAG = {
    isAutoBuildStart: "isAutoBuildStart",
    isAutoReload: "isAutoReload",
    isSendResourceHidden: "isSendResourceHidden",
    reloadedMinute: "reloadedMinute",
    perShipCapacity: "ika_perShipCapacity",
    freighterCapacity: "ika_freighterCapacity",
  };
  var AUTO_WINE_LABEL = "Auto Wine";
  function getFlag(key) {
    return localStorage.getItem(key);
  }
  function setFlag(key, value) {
    localStorage.setItem(key, String(value));
  }
  function isFlagTrue(key) {
    return localStorage.getItem(key) === "true";
  }
  var state = null;
  function initState(accountName) {
    const account = accountStore(accountName);
    state = {
      accountName,
      account,
      global: globalStore,
      queue: new TaskQueue(account, KEY.globalTaskQueue),
    };
    return state;
  }
  function getState() {
    if (!state) throw new Error("State not initialised — call initState first");
    return state;
  }
  function loadSenders() {
    return getState().account.getJSON(KEY.listSender, []);
  }
  function saveSenders(list) {
    getState().account.setJSON(KEY.listSender, list);
  }
  function loadReceivers() {
    return getState().account.getJSON(KEY.listReceiver, []);
  }
  function saveReceivers(list) {
    getState().account.setJSON(KEY.listReceiver, list);
  }
  function loadAccounts() {
    return getState().global.getJSON(KEY.listAccount, []);
  }
  function saveAccounts(list) {
    getState().global.setJSON(KEY.listAccount, list);
  }
  function loadAutoBuild() {
    return getState().global.getJSON(KEY.listAutoBuild, []);
  }
  function saveAutoBuild(list) {
    getState().global.setJSON(KEY.listAutoBuild, list);
  }
  function migrateLegacyQueues() {
    const { account, queue } = getState();
    const legacy = account.getJSON(KEY.resource, {});
    if (!legacy.queue || legacy.queue.length === 0) return 0;
    for (const item of legacy.queue)
      queue.push({
        type: "sendResource",
        data: {
          origin: String(item.origin),
          destination: String(item.destination),
          resource: String(item.resource),
          amount: Number(item.amount),
        },
      });
    const moved = legacy.queue.length;
    account.setJSON(KEY.resource, { isStart: legacy.isStart });
    return moved;
  }
  function isAutoStart() {
    return getState().account.getJSON(KEY.resource, {}).isStart === true;
  }
  function setAutoStart(value) {
    const { account } = getState();
    const data = account.getJSON(KEY.resource, {});
    data.isStart = value;
    account.setJSON(KEY.resource, data);
  }
  var TOWN_SWITCH_TIMEOUT_MS = 15e3;
  function townNodes() {
    const container = qs(SEL.townListContainer);
    return container ? Array.from(container.childNodes) : [];
  }
  function getTownCount() {
    return townNodes().length;
  }
  function townAnchor(townNumber) {
    const node = townNodes()[Number(townNumber)];
    if (!(node instanceof HTMLElement)) return null;
    const anchor = node.querySelector("a") ?? node.firstElementChild;
    return anchor instanceof HTMLElement ? anchor : null;
  }
  function getTownNameFromList(townNumber) {
    const anchor = townAnchor(townNumber);
    if (!anchor) return "";
    return (anchor.getAttribute("title") ?? anchor.innerHTML).trim();
  }
  function getTownList() {
    const list = [];
    for (let i = 0; i < townNodes().length; i++) {
      const townName = getTownNameFromList(i);
      list.push({
        index: Number(townName.split("-")[0]),
        townNumber: i,
        townName,
      });
    }
    list.sort((a, b) => {
      const aNumbered = Number.isFinite(a.index);
      const bNumbered = Number.isFinite(b.index);
      if (aNumbered && bNumbered)
        return a.index - b.index || a.townName.localeCompare(b.townName);
      if (aNumbered) return -1;
      if (bNumbered) return 1;
      return a.townName.localeCompare(b.townName);
    });
    return list;
  }
  function getTownNumberByName(townName) {
    const target = townName.trim();
    for (let i = 0; i < townNodes().length; i++)
      if (getTownNameFromList(i) === target) return i;
    return null;
  }
  async function gotoTown(townNumber) {
    const target = getTownNameFromList(townNumber);
    if (!target) throw new Error(`No town at dropdown index ${townNumber}`);
    if (getCurrentTownName() === target) return;
    if (!switchTown(townNumber, target))
      throw new Error(`No way to switch to "${target}" on this page`);
    await waitFor(() => getCurrentTownName() === target, {
      intervalMs: 100,
      timeoutMs: TOWN_SWITCH_TIMEOUT_MS,
      label: `gotoTown(${target})`,
    });
  }
  function switchTown(townNumber, target) {
    for (const span of qsa(SEL.buildTabTownNames))
      if (span.innerHTML.trim() === target) {
        span.click();
        return true;
      }
    const anchor = townAnchor(townNumber);
    if (anchor) {
      anchor.click();
      return true;
    }
    return false;
  }
  function openPort(includeConstruction = true) {
    const classes = [
      "port",
      ...(includeConstruction ? ["constructionSite"] : []),
    ];
    for (const className of classes)
      for (const position of [1, 2])
        if (qs(SEL.position(position))?.className.includes(className))
          return clickIfPresent(SEL.cityPositionLink(position));
    return false;
  }
  async function clickDestinationTown(adjustedIndex) {
    const link = (await waitForElements(SEL.dockCities, 1))[adjustedIndex];
    if (!link)
      throw new Error(`No destination town at port index ${adjustedIndex}`);
    link.click();
  }
  function adjustDestinationIndex(destination, origin) {
    const dest = Number(destination);
    return dest > Number(origin) ? dest - 1 : dest;
  }
  function backToCity() {
    clickIfPresent(SEL.cityLink);
  }
  function closeGamePopup() {
    clickIfPresent(SEL.closeButton);
  }
  function openSpyBuilding() {
    if (!clickIfPresent(SEL.safehouse)) alert(MISC.noSafehouse);
  }
  function sendAllArmy() {
    qsa(SEL.setMax).forEach((button) => button.click());
  }
  function getModel() {
    const model = pageWindow.ikariam?.model;
    return model && typeof model === "object" ? model : null;
  }
  function hasModel() {
    return getModel() !== null;
  }
  function numberOrNull(value) {
    const parsed = typeof value === "string" ? Number(value) : value;
    return typeof parsed === "number" && Number.isFinite(parsed)
      ? parsed
      : null;
  }
  function modelFreeTransporters() {
    return numberOrNull(getModel()?.freeTransporters);
  }
  function modelFreeFreighters() {
    return numberOrNull(getModel()?.freeFreighters);
  }
  function modelActionPoints() {
    return numberOrNull(getModel()?.maxActionPoints);
  }
  var MODEL_RESOURCE_KEY = {
    wood: "resource",
    wine: "1",
    marble: "2",
    glass: "3",
    sulfur: "4",
  };
  function readResourceRecord(record, resource) {
    if (!record) return null;
    const byName = numberOrNull(record[resource]);
    if (byName !== null) return byName;
    const key = MODEL_RESOURCE_KEY[resource];
    return key === void 0 ? null : numberOrNull(record[key]);
  }
  function modelResource(resource) {
    return readResourceRecord(getModel()?.currentResources, resource);
  }
  function modelMaxResource(resource) {
    return readResourceRecord(getModel()?.maxResources, resource);
  }
  function winePressLevel() {
    if (!qs(SEL.buildings)) return null;
    const press = qs(SEL.winePress);
    if (!press) return 0;
    const match = /\blevel(\d+)\b/.exec(press.className);
    return match ? Number(match[1]) : 0;
  }
  function modelWineConsumption() {
    const spendings = numberOrNull(getModel()?.wineSpendings);
    if (spendings === null) return null;
    const press = winePressLevel();
    if (press === null) return null;
    return (
      (Math.abs(spendings) * (100 - Math.min(100, Math.max(0, press)))) / 100
    );
  }
  function modelCurrentCityId() {
    const selected = getModel()?.relatedCityData?.selectedCity;
    if (typeof selected !== "string") return null;
    return numberOrNull(selected.replace("city_", ""));
  }
  function modelCurrentCityName() {
    const related = getModel()?.relatedCityData;
    const selected = related?.selectedCity;
    if (!related || typeof selected !== "string") return null;
    const city = related[selected];
    if (typeof city !== "object" || city === null) return null;
    const name = city.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }
  function modelOwnCities() {
    const related = getModel()?.relatedCityData;
    if (!related) return [];
    return Object.entries(related)
      .filter(([key]) => key.startsWith("city_"))
      .map(([, value]) => value)
      .filter(
        (city) =>
          typeof city === "object" &&
          city !== null &&
          city.relationship === "ownCity",
      );
  }
  function parseAmount(text) {
    return parseGameNumber(text) ?? 0;
  }
  function getFreeShips() {
    return {
      merchants:
        readNumberOrNull(SEL.globalMenu.freeTransporters) ??
        modelFreeTransporters() ??
        0,
      freighters:
        readNumberOrNull(SEL.globalMenu.freeFreighters) ??
        modelFreeFreighters() ??
        0,
    };
  }
  function getActionPoints() {
    return (
      readNumberOrNull(SEL.globalMenu.maxActionPoints) ??
      modelActionPoints() ??
      0
    );
  }
  function readCurrentWine() {
    return (
      modelResource("wine") ?? parseAmount(qs(SEL.globalMenu.wine)?.textContent)
    );
  }
  var BASE_MERCHANT_CAPACITY = 500;
  var MERCHANT_CAPACITY_PER_LEVEL = 20;
  var BASE_FREIGHTER_CAPACITY = 5e4;
  var FREIGHTER_CAPACITY_PER_LEVEL = 500;
  function readCalibrated(key, fallback) {
    const saved = parseInt(getFlag(key) ?? "0", 10);
    return Number.isFinite(saved) && saved > 0 ? saved : fallback;
  }
  function getPerShipCapacity() {
    return readCalibrated(FLAG.perShipCapacity, BASE_MERCHANT_CAPACITY);
  }
  function getFreighterCapacity() {
    return readCalibrated(FLAG.freighterCapacity, BASE_FREIGHTER_CAPACITY);
  }
  function parseUpgradeDesc(block) {
    const text = qs(SEL.upgradeDesc, block)?.textContent?.trim() ?? "";
    const levelMatch = text.match(/\((\d+)\)/);
    const bonusMatch = text.match(/\+\s*(\d+)/);
    return {
      level: levelMatch ? parseInt(levelMatch[1], 10) - 1 : null,
      currentBonus: bonusMatch ? parseInt(bonusMatch[1], 10) : null,
    };
  }
  function capacityFrom(block, base, perLevel) {
    const { level, currentBonus } = parseUpgradeDesc(block);
    if (currentBonus !== null) return base + currentBonus;
    if (level !== null) return base + level * perLevel;
    return null;
  }
  function calibrateShipCapacity() {
    let perShip = null;
    let freighterCapacity = null;
    try {
      const config = getTransportConfig();
      if (config) {
        if (config.maxCapacityPerTransport)
          perShip = parseInt(String(config.maxCapacityPerTransport), 10);
        if (config.freighterCapacity)
          freighterCapacity = parseInt(String(config.freighterCapacity), 10);
      }
    } catch (e) {
      console.warn("Could not read transportConfig:", e);
    }
    try {
      for (const block of qsa(SEL.unitBlocks)) {
        if (qs(SEL.merchantShipTitle, block))
          perShip =
            capacityFrom(
              block,
              BASE_MERCHANT_CAPACITY,
              MERCHANT_CAPACITY_PER_LEVEL,
            ) ?? perShip;
        if (qs(SEL.freighterTitle, block))
          freighterCapacity =
            capacityFrom(
              block,
              BASE_FREIGHTER_CAPACITY,
              FREIGHTER_CAPACITY_PER_LEVEL,
            ) ?? freighterCapacity;
      }
    } catch (e) {
      console.warn("Could not parse the shipyard DOM:", e);
    }
    if (perShip) setFlag(FLAG.perShipCapacity, perShip);
    if (freighterCapacity) setFlag(FLAG.freighterCapacity, freighterCapacity);
    if (perShip || freighterCapacity)
      alert(
        SHIP_CAPACITY.calibrated(perShip || null, freighterCapacity || null),
      );
    else alert(SHIP_CAPACITY.notReadable);
  }
  var BACK_TO_TOWN_TIMEOUT_MS = 5e3;
  var POST_SUBMIT_TIMEOUT_MS = 5e3;
  var FORM_SETTLE_MS = 500;
  function enqueueSendResource(origin, destination, resource, amount) {
    getState().queue.push({
      type: "sendResource",
      data: {
        origin,
        destination,
        resource,
        amount,
      },
    });
  }
  async function handleSendResource(task) {
    const { origin, destination, resource, amount, reserve, label } = task.data;
    if (origin === destination)
      return {
        status: "failed",
        reason: "Source and destination are the same",
      };
    if (amount <= 0) return { status: "done" };
    if (getFreeShips().merchants <= 0 && getFreeShips().freighters <= 0)
      return {
        status: "retry",
        reason: "No idle ships",
      };
    logInfo(
      `${label ? label + ": " : ""}Start sending ${resource} from ${getTownNameFromList(origin)} to ${getTownNameFromList(destination)}`,
    );
    await gotoTown(origin);
    if (getActionPoints() <= 0)
      return {
        status: "retry",
        reason: "Out of action points",
      };
    let sendable = amount;
    if (reserve && reserve > 0 && resource === "wine") {
      const available = readCurrentWine() - reserve;
      if (available <= 0)
        return {
          status: "defer",
          reason: "Source town has no spare wine",
        };
      sendable = Math.min(amount, available);
    }
    if (!qs(SEL.position(1)) && !qs(SEL.position(2))) {
      backToCity();
      await waitForElement(SEL.position(1), {
        timeoutMs: BACK_TO_TOWN_TIMEOUT_MS,
      }).catch(() => null);
    }
    if (!openPort())
      return {
        status: "defer",
        reason: `${getTownNameFromList(origin)} has no port`,
      };
    await clickDestinationTown(adjustDestinationIndex(destination, origin));
    await waitForElement(SEL.wineField);
    const { merchants, freighters } = getFreeShips();
    if (merchants <= 0 && freighters <= 0)
      return {
        status: "retry",
        reason: "Ships became unavailable en route",
      };
    const useMerchant = merchants > 0;
    const capacity = useMerchant
      ? getPerShipCapacity() * merchants
      : getFreighterCapacity() * freighters;
    if (!useMerchant) {
      await sleep(FORM_SETTLE_MS);
      qs(SEL.freightersMaxButton)?.click();
    }
    const sentAmount = Math.min(capacity, sendable);
    const field = qs(SEL.resourceField(resource));
    if (!field)
      return {
        status: "retry",
        reason: `No input field for ${resource}`,
      };
    setInputValue(field, String(sentAmount));
    await sleep(FORM_SETTLE_MS);
    qs(SEL.submit)?.click();
    await waitForElements(SEL.dockCities, 1, {
      timeoutMs: POST_SUBMIT_TIMEOUT_MS,
    }).catch(() => null);
    logInfo(
      `Sent ${sentAmount} ${resource} ${useMerchant ? "[Merchant]" : "[Freighter]"}`,
    );
    const remaining = amount - sentAmount;
    backToCity();
    if (remaining <= 0) return { status: "done" };
    return {
      status: "progress",
      task: {
        ...task,
        data: {
          ...task.data,
          amount: remaining,
        },
      },
    };
  }
  function describeCurrentTransfer() {
    const head = getState().queue.head();
    if (!head || head.type !== "sendResource") return TRANSFER_STATUS.idle;
    const { amount, resource, origin, destination } = head.data;
    return `${amount} ${resource} from ${getTownNameFromList(origin)} to ${getTownNameFromList(destination)}`;
  }
  var TOWN_STATS_KEY = "ikaTownStats";
  function loadTownStats(store) {
    return store.getJSON(TOWN_STATS_KEY, {});
  }
  function saveTownStats(store, stats) {
    store.setJSON(TOWN_STATS_KEY, stats);
  }
  function recordCurrentTown(store) {
    const townName = (modelCurrentCityName() ?? getCurrentTownName()).trim();
    if (!townName) return null;
    const stock = modelResource("wine");
    const consume = modelWineConsumption();
    if (stock === null || consume === null) return null;
    const stats = loadTownStats(store);
    const entry = {
      stock,
      consume,
      at: Date.now(),
    };
    const capacity = modelMaxResource("wine");
    if (capacity !== null && capacity > 0) entry.capacity = capacity;
    stats[townName] = entry;
    saveTownStats(store, stats);
    return entry;
  }
  function projectedStats(store, townName, now = Date.now()) {
    const entry = loadTownStats(store)[townName.trim()];
    if (!entry) return null;
    const age = now - entry.at;
    if (age > 864e5) return null;
    const drained = (entry.consume * age) / MS_PER_HOUR;
    const projected = {
      stock: Math.max(0, Math.round(entry.stock - drained)),
      consume: entry.consume,
      at: entry.at,
    };
    if (entry.capacity !== void 0) projected.capacity = entry.capacity;
    return projected;
  }
  function pruneTownStats(store, now = Date.now()) {
    const stats = loadTownStats(store);
    let removed = 0;
    for (const [townName, entry] of Object.entries(stats))
      if (now - entry.at > 864e5) {
        delete stats[townName];
        removed++;
      }
    if (removed) saveTownStats(store, stats);
    return removed;
  }
  function distributeWine(towns, supply) {
    const candidates = towns.filter((t) => t.consume > 0);
    const budget = Math.floor(Math.max(0, supply));
    if (candidates.length === 0 || budget <= 0)
      return {
        targetHours: 0,
        allocations: towns.map((t) => ({
          townNumber: t.townNumber,
          townName: t.townName,
          stock: t.stock,
          consume: t.consume,
          add: 0,
          finalHours: t.consume > 0 ? t.stock / t.consume : Infinity,
          storageFull: false,
        })),
        used: 0,
        unused: budget,
      };
    let active = [...candidates];
    let targetHours = 0;
    for (;;) {
      const totalStock = active.reduce((sum, t) => sum + t.stock, 0);
      const totalConsume = active.reduce((sum, t) => sum + t.consume, 0);
      targetHours = (totalStock + budget) / totalConsume;
      const stillNeeding = active.filter(
        (t) => t.stock / t.consume < targetHours,
      );
      if (stillNeeding.length === active.length) break;
      if (stillNeeding.length === 0) {
        active = [];
        break;
      }
      active = stillNeeding;
    }
    const activeIds = new Set(active.map((t) => t.townNumber));
    const exact = new Map();
    for (const town of active)
      exact.set(
        town.townNumber,
        Math.max(0, targetHours * town.consume - town.stock),
      );
    const add = new Map();
    let used = 0;
    for (const town of active) {
      const floored = Math.floor(exact.get(town.townNumber) ?? 0);
      add.set(town.townNumber, floored);
      used += floored;
    }
    let remaining = budget - used;
    const byFraction = [...active].sort(
      (a, b) =>
        ((exact.get(b.townNumber) ?? 0) % 1) -
        ((exact.get(a.townNumber) ?? 0) % 1),
    );
    for (const town of byFraction) {
      if (remaining <= 0) break;
      if ((exact.get(town.townNumber) ?? 0) <= (add.get(town.townNumber) ?? 0))
        continue;
      add.set(town.townNumber, (add.get(town.townNumber) ?? 0) + 1);
      used += 1;
      remaining -= 1;
    }
    const trimmed = new Set();
    for (const town of active) {
      if (town.capacity === void 0) continue;
      const room = Math.max(0, Math.floor(town.capacity - town.stock));
      const share = add.get(town.townNumber) ?? 0;
      if (share > room) {
        add.set(town.townNumber, room);
        used -= share - room;
        trimmed.add(town.townNumber);
      }
    }
    const allocations = towns.map((town) => {
      const amount = activeIds.has(town.townNumber)
        ? (add.get(town.townNumber) ?? 0)
        : 0;
      return {
        townNumber: town.townNumber,
        townName: town.townName,
        stock: town.stock,
        consume: town.consume,
        add: amount,
        finalHours:
          town.consume > 0 ? (town.stock + amount) / town.consume : Infinity,
        storageFull: trimmed.has(town.townNumber),
      };
    });
    return {
      targetHours,
      allocations,
      used,
      unused: Math.max(0, budget - used),
    };
  }
  function readWineBoard() {
    const result = new Map();
    for (const row of qsa(SEL.resTabRows)) {
      const name = qs(SEL.resTabTownName, row)?.textContent?.trim();
      if (!name) continue;
      const stock = parseAmount(qs(SEL.resTabWineStock, row)?.textContent);
      const consumeText =
        qs(SEL.resTabWineConsumption, row)?.textContent ??
        qs(SEL.resTabWineConsumed, row)?.textContent;
      if (!consumeText || !consumeText.trim()) continue;
      result.set(name, {
        stock,
        consume: Math.abs(parseAmount(consumeText)),
      });
    }
    return result;
  }
  function townNameOf(townNumber) {
    return (
      getTownList().find((t) => t.townNumber.toString() === townNumber)
        ?.townName ?? getTownNameFromList(townNumber)
    ).trim();
  }
  function measuredStats(townName, board = readWineBoard()) {
    return (
      board.get(townName.trim()) ?? projectedStats(getState().account, townName)
    );
  }
  function buildWineTowns(receivers, board = readWineBoard()) {
    const store = getState().account;
    return receivers.map((receiver) => {
      const townName = townNameOf(receiver.townNumber);
      const measured = measuredStats(townName, board);
      const town = {
        townNumber: receiver.townNumber,
        townName,
        stock: measured?.stock ?? 0,
        consume: measured?.consume || Number(receiver.winePerHour) || 0,
      };
      const capacity = projectedStats(store, townName)?.capacity;
      if (capacity !== void 0) town.capacity = capacity;
      return town;
    });
  }
  function getSourceReserve(fromTown, board = readWineBoard()) {
    const measured = measuredStats(townNameOf(fromTown), board);
    return measured ? Math.ceil(measured.consume * 1) : 500;
  }
  function getSourceSupply(
    fromTown,
    board = readWineBoard(),
    reserve = getSourceReserve(fromTown, board),
  ) {
    const sourceName = townNameOf(fromTown);
    const measured = board.get(sourceName);
    if (measured) return Math.max(0, measured.stock - reserve);
    if (sourceName === getCurrentTownName().trim())
      return Math.max(0, readCurrentWine() - reserve);
    const cached = projectedStats(getState().account, sourceName);
    return cached ? Math.max(0, cached.stock - reserve) : 0;
  }
  function planWineRun(fromTown) {
    const board = readWineBoard();
    const receivers = loadReceivers().filter((r) => r.townNumber !== fromTown);
    const reserve = getSourceReserve(fromTown, board);
    const supply = getSourceSupply(fromTown, board, reserve);
    return {
      supply,
      reserve,
      boardAvailable: board.size > 0,
      ...distributeWine(buildWineTowns(receivers, board), supply),
    };
  }
  function enqueueWineRun(fromTown) {
    const configured = loadReceivers();
    if (configured.filter((r) => r.townNumber !== fromTown).length === 0) {
      const senderCount = loadSenders().length;
      const townCount = getTownList().length;
      alert(
        configured.length === 0
          ? AUTO_WINE.noReceivers(senderCount, townCount)
          : AUTO_WINE.onlyReceiverIsSource,
      );
      return 0;
    }
    const plan = planWineRun(fromTown);
    if (plan.supply <= 0) {
      alert(AUTO_WINE.noSpareWine(plan.reserve));
      return 0;
    }
    const { queue } = getState();
    queue.removeByLabel(AUTO_WINE_LABEL);
    let added = 0;
    for (const allocation of plan.allocations) {
      if (allocation.add <= 0) continue;
      queue.push({
        type: "sendResource",
        data: {
          origin: fromTown,
          destination: allocation.townNumber,
          resource: "wine",
          amount: allocation.add,
          reserve: plan.reserve,
          label: AUTO_WINE_LABEL,
        },
      });
      added++;
    }
    if (added === 0) {
      alert(AUTO_WINE.nothingToSend);
      return 0;
    }
    logInfo(
      `Auto Wine: levelling to ~${plan.targetHours.toFixed(1)}h, allocating ${plan.used} wine across ${added} towns (${plan.unused} left over)`,
    );
    return added;
  }
  function loadConsumedWine() {
    const board = readWineBoard();
    let filled = 0;
    for (const town of getTownList()) {
      const measured = measuredStats(town.townName, board);
      if (!measured) continue;
      const input = qs(`#txtWine_${town.townNumber}`);
      if (input) {
        input.value = String(Math.round(measured.consume));
        filled++;
      }
    }
    if (filled === 0) alert(AUTO_WINE.noFigures);
  }
  function collectWineSettings() {
    const senders = [];
    const receivers = [];
    for (const row of qsa(".txtWine")) {
      const checkbox = qs("input[type=checkbox]", row);
      if (checkbox?.checked) {
        senders.push(checkbox.id.replace("cbSender_", ""));
        continue;
      }
      const text = qs("input[type=text]", row);
      if (text && Number(text.value) > 0)
        receivers.push({
          townNumber: text.id.replace("txtWine_", ""),
          winePerHour: text.value,
        });
    }
    return {
      senders,
      receivers,
    };
  }
  var DEFAULT_MIN_GAP_MS = 300;
  var REQUEST_TIMEOUT_MS = 15e3;
  var latestToken = null;
  var lastRequestAt = 0;
  var RESPONSE_EVENT = "ika:ajaxResponse";
  function publishResponse(entries) {
    try {
      document.dispatchEvent(
        new CustomEvent(RESPONSE_EVENT, { detail: entries }),
      );
    } catch {}
  }
  function actionRequestToken() {
    const model = pageWindow.ikariam?.model;
    const fromModel =
      typeof model?.actionRequest === "string" ? model.actionRequest : null;
    return latestToken ?? fromModel;
  }
  function absorbToken(entries) {
    for (const entry of entries) {
      if (!Array.isArray(entry)) continue;
      const payload = entry[1];
      if (payload && typeof payload.actionRequest === "string") {
        latestToken = payload.actionRequest;
        return;
      }
    }
  }
  async function ikariamRequest(params, options = {}) {
    const token = actionRequestToken();
    if (!token)
      throw new Error("No actionRequest available - the game has not loaded");
    const gap = options.minGapMs ?? DEFAULT_MIN_GAP_MS;
    const since = Date.now() - lastRequestAt;
    if (lastRequestAt !== 0 && since < gap) await sleep(gap - since);
    lastRequestAt = Date.now();
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      query.set(key, String(value));
    query.set("actionRequest", token);
    query.set("ajax", "1");
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? REQUEST_TIMEOUT_MS,
    );
    let text;
    try {
      const response = await fetch("/index.php?" + query.toString(), {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Ikariam request failed with HTTP ${response.status}`);
      text = await response.text();
    } finally {
      clearTimeout(timeout);
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `Ikariam returned ${text.length} bytes that are not JSON - session expired, or this is a login page`,
      );
    }
    if (!Array.isArray(parsed))
      throw new Error("Ikariam returned JSON that is not a response array");
    absorbToken(parsed);
    publishResponse(parsed);
    return parsed;
  }
  function fetchTown(cityId, options) {
    return ikariamRequest(
      {
        view: "townHall",
        cityId,
        position: 0,
        backgroundView: "city",
        currentCityId: cityId,
      },
      options,
    );
  }
  function ownTownIds() {
    return modelOwnCities()
      .map((city) => Number(city.id))
      .filter((id) => Number.isFinite(id));
  }
  async function syncAllTowns() {
    const startedAt = Date.now();
    const ids = ownTownIds();
    const before = modelCurrentCityId();
    const failed = [];
    let synced = 0;
    for (const id of ids)
      try {
        await fetchTown(id);
        synced++;
      } catch (e) {
        failed.push(id);
        logInfo(`Sync: town ${id} failed - ${errorMessage(e)}`);
      }
    const after = modelCurrentCityId();
    const selectionMoved =
      before !== null && after !== null && before !== after;
    if (selectionMoved)
      try {
        await fetchTown(before);
      } catch (e) {
        logInfo(
          `Sync: could not return to town ${before} - ${errorMessage(e)}`,
        );
      }
    return {
      synced,
      failed,
      selectionMoved,
      elapsedMs: Date.now() - startedAt,
    };
  }
  var UPGRADE_BUTTON_TIMEOUT_MS = 15e3;
  var TOWN_SETTLE_MS = 1200;
  var UPGRADE_CONFIRM_TIMEOUT_MS = 1e4;
  var BUILDING_CLICK_PAUSE_MS = 500;
  function levelOf(label) {
    return Number(label.split(" ").pop());
  }
  function withLevel(label, level) {
    return label.replace(String(label.split(" ").pop()), String(level));
  }
  function findAccount(list, accountName) {
    return list.find((entry) => entry.accountName === accountName);
  }
  function findTown(account, townName) {
    return account?.townList.find((entry) => entry.townName === townName);
  }
  function getTownQueue(townName) {
    const { accountName } = getState();
    return (
      findTown(findAccount(loadAutoBuild(), accountName), townName)?.queue ?? []
    );
  }
  function addBuildingToQueue(positionId, buildingName) {
    const { accountName } = getState();
    const list = loadAutoBuild();
    const townName = getCurrentTownName();
    const account = findAccount(list, accountName);
    const town = findTown(account, townName);
    const alreadyQueued =
      town?.queue.filter((entry) => entry.positionId === positionId).length ??
      0;
    const entry = {
      positionId,
      buildingName: withLevel(
        buildingName,
        levelOf(buildingName) + alreadyQueued + 1,
      ),
    };
    if (town) town.queue.push(entry);
    else if (account)
      account.townList.push({
        townName,
        queue: [entry],
      });
    else
      list.push({
        accountName,
        townList: [
          {
            townName,
            queue: [entry],
          },
        ],
      });
    saveAutoBuild(list);
  }
  function removeBuildingFromQueue(positionId, buildingName, townName) {
    const { accountName } = getState();
    const list = loadAutoBuild();
    const town = findTown(findAccount(list, accountName), townName);
    if (!town) return;
    const index = town.queue.findIndex(
      (entry) =>
        entry.buildingName === buildingName && entry.positionId === positionId,
    );
    if (index >= 0) town.queue.splice(index, 1);
    saveAutoBuild(list);
  }
  function cleanAutoBuildConfig() {
    saveAutoBuild(
      loadAutoBuild()
        .map((account) => ({
          ...account,
          townList: account.townList.filter((town) => town.queue.length > 0),
        }))
        .filter((account) => account.townList.length > 0),
    );
  }
  function enqueueAutoBuild() {
    const { accountName, queue } = getState();
    const account = findAccount(loadAutoBuild(), accountName);
    queue.removeType("upgradeBuilding");
    if (!account) {
      const accounts = loadAccounts();
      const row = accounts.find((entry) => entry.account === accountName);
      if (row) {
        row.isAutoBuildChecked = false;
        saveAccounts(accounts);
      }
      return 0;
    }
    const towns = [...account.townList].sort(compareValues("townName"));
    let added = 0;
    for (const town of towns)
      for (const entry of town.queue) {
        queue.push({
          type: "upgradeBuilding",
          data: {
            townName: town.townName,
            positionId: entry.positionId,
            buildingName: entry.buildingName,
          },
        });
        added++;
      }
    logInfo(`Auto Build: queued ${added} upgrades`);
    return added;
  }
  function slotNumberOf(positionId) {
    return positionId.match(/\d+/)?.[0] ?? null;
  }
  function slotElement(positionId) {
    const slotNumber = slotNumberOf(positionId);
    return slotNumber === null
      ? null
      : document.getElementById(`position${slotNumber}`);
  }
  function isTownBuilding() {
    return qs(SEL.constructionSite) !== null;
  }
  async function handleUpgradeBuilding(task) {
    const { townName, positionId, buildingName } = task.data;
    if (!qs(SEL.cityBread)) {
      backToCity();
      return {
        status: "retry",
        reason: "Not on the town view",
      };
    }
    closeGamePopup();
    const townNumber = getTownNumberByName(townName);
    if (townNumber === null)
      return {
        status: "failed",
        reason: `Town "${townName}" not found`,
      };
    logInfo(`Going to town ${townName}`);
    await gotoTown(townNumber);
    closeGamePopup();
    await sleep(TOWN_SETTLE_MS);
    if (isTownBuilding())
      return {
        status: "defer",
        reason: `${townName} is already building`,
      };
    logInfo(`Start upgrading ${buildingName}`);
    await sleep(BUILDING_CLICK_PAUSE_MS);
    document.getElementById(positionId)?.click();
    const slotNumber = slotNumberOf(positionId);
    const button = await waitForElement(SEL.buildingUpgradeButton, {
      timeoutMs: UPGRADE_BUTTON_TIMEOUT_MS,
    })
      .then((element) => {
        const hrefPosition =
          (element.getAttribute("href") ?? "").match(
            /[?&]position=(\d+)/,
          )?.[1] ?? null;
        if (
          slotNumber !== null &&
          hrefPosition !== null &&
          hrefPosition !== slotNumber
        ) {
          logInfo(
            `Upgrade button points at position ${hrefPosition}, expected ${slotNumber} - ignoring`,
          );
          return null;
        }
        return element;
      })
      .catch(() => null);
    if (!button)
      return {
        status: "defer",
        reason: `${buildingName}: upgrade button unavailable (not enough resources?)`,
      };
    if (isTownBuilding())
      return {
        status: "defer",
        reason: `${townName} started building meanwhile`,
      };
    button.click();
    const started = await waitFor(
      () => slotElement(positionId)?.classList.contains("constructionSite"),
      {
        timeoutMs: UPGRADE_CONFIRM_TIMEOUT_MS,
        label: `upgrade ${buildingName} in ${townName}`,
      },
    ).catch(() => false);
    closeGamePopup();
    if (!started) {
      logInfo(
        `${buildingName} in ${townName}: clicked Upgrade but no building site appeared - leaving it queued`,
      );
      return {
        status: "defer",
        reason: `${buildingName}: the upgrade did not start`,
      };
    }
    logInfo(`Finished upgrading ${buildingName}`);
    removeBuildingFromQueue(positionId, buildingName, townName);
    return { status: "done" };
  }
  var SCAN_SETTLE_MS = 1200;
  var scanning = false;
  async function scanBuildings(maxTowns = 14, queueIsRunning = () => false) {
    if (scanning) {
      alert(SCAN.alreadyRunning);
      return;
    }
    const limit = Math.min(getTownCount(), maxTowns);
    if (limit === 0) {
      alert(SCAN.noTownList);
      return;
    }
    if (queueIsRunning()) {
      alert(SCAN.queueRunning);
      return;
    }
    if (ownTownIds().length > 0) {
      scanning = true;
      try {
        const result = await syncAllTowns();
        const summary = SCAN.syncFinished(
          result.synced,
          result.synced + result.failed.length,
          (result.elapsedMs / MS_PER_SECOND).toFixed(1),
          result.failed.join(", "),
        );
        logInfo(summary);
        alert(summary);
        return;
      } catch (e) {
        logInfo(
          `Sync failed, falling back to walking the towns - ${errorMessage(e)}`,
        );
      } finally {
        scanning = false;
      }
    }
    scanning = true;
    const failed = [];
    let visited = 0;
    try {
      for (let i = 0; i < limit; i++) {
        const townName = getTownNameFromList(i) || `#${i}`;
        try {
          await gotoTown(i);
          await sleep(SCAN_SETTLE_MS);
          recordCurrentTown(getState().account);
          visited++;
        } catch (e) {
          failed.push(townName);
          logInfo(`Scan: could not open ${townName} — ${errorMessage(e)}`);
        }
      }
    } finally {
      scanning = false;
      backToCity();
    }
    const summary = SCAN.walkFinished(visited, limit, failed.join(", "));
    logInfo(summary);
    alert(summary);
  }
  function listBuildingsInCurrentTown() {
    const slots = qsa(SEL.buildings).map((element) => {
      let buildingName =
        qs(SEL.buildingHover, element)
          ?.getAttribute("title")
          ?.trim()
          .replace("(", "")
          .replace(")", "")
          .replace("Under construction", "0") ?? "";
      if (element.classList.contains("constructionSite"))
        buildingName = withLevel(buildingName, levelOf(buildingName) + 1);
      return {
        buildingName,
        positionId: qs(SEL.buildingHover, element)?.id.trim() ?? "",
      };
    });
    slots.sort(compareValues("buildingName"));
    return slots;
  }
  var LOBBY_ACCOUNT_URL =
    "https://lobby.ikariam.gameforge.com/en_GB/accounts?redirectAccount=";
  var MS_PER_MINUTE = 6e4;
  var HOURS_PER_WEEK = 168;
  var isReloadSafe = () => true;
  function setReloadGuard(guard) {
    isReloadSafe = guard;
  }
  function parseRemainingFromTitle() {
    const parts = document.title.toLowerCase().split("-");
    if (parts.length < 2) return 0;
    const units = [
      ["d", MS_PER_DAY],
      ["h", MS_PER_HOUR],
      ["m", MS_PER_MINUTE],
      ["s", MS_PER_SECOND],
    ];
    let total = 0;
    for (const token of parts[1].trim().split(" "))
      for (const [suffix, ms] of units)
        if (token.includes(suffix)) {
          total += Number(token.replace(suffix, "")) * ms;
          break;
        }
    return total;
  }
  function readWoodStats() {
    const current = qs(SEL.currentWood);
    if (!current) return null;
    return {
      totalWood: String(parseGameNumber(current.textContent) ?? 0),
      woodIncome: String(parseGameNumber(qs(SEL.woodIncome)?.textContent) ?? 0),
    };
  }
  function updateCurrentAccount() {
    const { accountName } = getState();
    const accounts = loadAccounts();
    accounts.sort(compareValues("account"));
    let row = accounts.find((entry) => entry.account === accountName);
    if (!row) {
      row = {
        account: accountName,
        time: parseRemainingFromTitle() + Date.now(),
      };
      accounts.push(row);
    } else row.time = parseRemainingFromTitle() + Date.now();
    const wood = readWoodStats();
    if (wood) {
      row.totalWood = wood.totalWood;
      row.woodIncome = wood.woodIncome;
      row.timeWood = Date.now();
    }
    saveAccounts(accounts);
    renderSummary();
  }
  function setAutoBuildChecked(account, checked) {
    const accounts = loadAccounts();
    const row = accounts.find((entry) => entry.account === account);
    if (row) {
      row.isAutoBuildChecked = checked;
      saveAccounts(accounts);
    }
  }
  function clearAccounts() {
    saveAccounts([]);
    renderSummary();
  }
  function renderSummary() {
    const { accountName } = getState();
    const accounts = loadAccounts();
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
    if (container)
      container.innerHTML = buildSummaryHtml(accounts, accountName);
    keepAliveTick();
  }
  function buildSummaryHtml(accounts, currentAccount) {
    if (accounts.length === 0)
      return '<table id="summaryAccountTable"></table>';
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
        return `<tr class="${[currentAccount === account.account ? "active" : "", account.account === soonest ? "min" : ""].filter(Boolean).join(" ")}">
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
  function keepAliveTick() {
    if (!isFlagTrue(FLAG.isAutoBuildStart) && !isAutoStart()) return;
    if (!isReloadSafe()) return;
    const minute = new Date().getUTCMinutes();
    if (minute % 2 !== 0) return;
    if (minute === Number(getFlag(FLAG.reloadedMinute))) return;
    setFlag(FLAG.reloadedMinute, minute);
    setFlag(FLAG.isAutoReload, false);
    backToCity();
  }
  var ESTIMATE_CAPACITY = 520;
  var MARKER_CLASS$1 = "needingShip";
  function annotate(containerSelector, addOne) {
    const container = qs(containerSelector);
    if (!container) return;
    if (qs(`.${MARKER_CLASS$1}`, container)) return;
    const items = qsa("li", container);
    let total = 0;
    for (let i = 1; i < items.length; i++)
      total += parseGameNumber(items[i].textContent) ?? 0;
    const node = document.createElement("li");
    node.className = MARKER_CLASS$1;
    const ships = Math.round(total / ESTIMATE_CAPACITY);
    node.innerHTML = addOne ? String(ships + 1) : `${ships} (${total})`;
    container.appendChild(node);
  }
  function startBarbarianObserver() {
    const target = qs(SEL.container);
    if (!target) return;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const previousId = mutation.previousSibling?.id;
        if (previousId === "barbarianVillage_c") {
          annotate(SEL.barbarianVillageResources, false);
          return;
        }
        if (previousId === "barbarianFleet_c") {
          annotate(SEL.barbarianFleetResources, true);
          return;
        }
      }
    }).observe(target, { childList: true });
  }
  var RESOURCE_OPTIONS = [
    {
      value: "wood",
      label: "Wood",
    },
    {
      value: "wine",
      label: "Wine",
    },
    {
      value: "marble",
      label: "Marble",
    },
    {
      value: "glass",
      label: "Crystal",
    },
    {
      value: "sulfur",
      label: "Sulfur",
    },
  ];
  var handlers = new Map();
  function registerActions(map) {
    for (const [name, handler] of Object.entries(map))
      handlers.set(name, handler);
  }
  function action(name, data) {
    return `data-ika-action="${name}"${
      data
        ? Object.entries(data)
            .map(
              ([key, value]) => ` data-${key}="${escapeHtml(String(value))}"`,
            )
            .join("")
        : ""
    }`;
  }
  var installed$1 = false;
  function installActionDispatcher() {
    if (installed$1) return;
    installed$1 = true;
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target?.closest("[data-ika-action]");
        if (!target) return;
        const name = target.dataset.ikaAction;
        if (!name) return;
        const handler = handlers.get(name);
        if (!handler) {
          console.warn(`[ika] No handler registered for action "${name}"`);
          return;
        }
        event.preventDefault();
        handler(target, event);
      },
      true,
    );
  }
  var MARKER_CLASS = "ika-transport-buttons";
  var TRANSPORT_STYLE_ID = "ika-transport-buttons-style";
  var RESOURCES = RESOURCE_OPTIONS.map((option) => option.value);
  var STEPS = [
    {
      ships: -1,
      kind: "merchant",
    },
    {
      ships: 1,
      kind: "merchant",
    },
    {
      ships: 5,
      kind: "merchant",
    },
    {
      ships: 10,
      kind: "merchant",
    },
    {
      ships: 1,
      kind: "freighter",
    },
  ];
  function transportStyles() {
    return `
#transportGoods ul.resourceAssign > li { height: auto; min-height: 0; overflow: visible; }

.${MARKER_CLASS} {
  display: block;
  clear: both;
  position: relative;
  z-index: 2;
  margin: 2px 0 5px 0;
  padding: 0;
  /* The right edge is pinned to the text field's by alignRowToField, which
     sets padding-right; this is what makes that padding move the group. */
  text-align: right;
  white-space: nowrap;
  line-height: 1;
}

.${MARKER_CLASS} > a.button {
  display: inline-block;
  min-width: 34px;
  width: auto;
  margin: 0;
  padding: 4px 9px !important;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  direction: ltr;
}

/* One strip rather than six loose buttons, the way the game's own button
   groups read. */
.${MARKER_CLASS} > a.button:not(:first-child) { border-left: 1px solid #c9a584; }
.${MARKER_CLASS} > a.button:not(:last-child) { border-right: none; }
`;
  }
  function alignRowToField(field, row) {
    const host = row.parentElement;
    if (!host) return;
    const hostRight = host.getBoundingClientRect().right;
    const fieldRight = field.getBoundingClientRect().right;
    if (hostRight <= 0 || fieldRight <= 0) return;
    const gap = Math.round(hostRight - fieldRight);
    if (gap > 0) row.style.paddingRight = `${gap}px`;
  }
  function installStyles$1() {
    if (document.getElementById("ika-transport-buttons-style")) return;
    const style = document.createElement("style");
    style.id = TRANSPORT_STYLE_ID;
    style.textContent = transportStyles();
    document.head.appendChild(style);
  }
  function capacityOf(kind) {
    return kind === "freighter" ? getFreighterCapacity() : getPerShipCapacity();
  }
  function stepAmount(step) {
    return step.ships * capacityOf(step.kind);
  }
  function stepLabel(step) {
    const amount = stepAmount(step);
    return `${amount < 0 ? "-" : "+"}${formatInteger(Math.abs(amount))}`;
  }
  function stepTitle(step) {
    return TRANSPORT_BUTTONS.step(
      step.ships >= 0,
      Math.abs(step.ships),
      step.kind === "freighter",
    );
  }
  function buttonRow(resource) {
    return (
      `<span class="${MARKER_CLASS}">` +
      STEPS.map(
        (step) =>
          `<a class="button" href="#" title="${stepTitle(step)}" ${action(
            "transport.add",
            {
              "ika-resource": resource,
              "ika-ships": step.ships,
              "ika-kind": step.kind,
            },
          )}>${stepLabel(step)}</a>`,
      ).join("") +
      `<a class="button" href="#" title="${TRANSPORT_BUTTONS.clear}" ${action(
        "transport.add",
        {
          "ika-resource": resource,
          "ika-ships": 0,
          "ika-kind": "merchant",
          "ika-set": "1",
        },
      )}>0</a></span>`
    );
  }
  function applyTransportStep(resource, ships, kind = "merchant", set = false) {
    const field = qs(SEL.resourceField(resource));
    if (!field) return;
    const current = parseInt(field.value.replace(/\D/g, ""), 10) || 0;
    const delta = ships * capacityOf(kind);
    const next = set ? 0 : Math.max(0, current + delta);
    setInputValue(field, String(next));
  }
  function addTransportButtons() {
    let added = false;
    for (const resource of RESOURCES) {
      const field = qs(SEL.resourceField(resource));
      if (!field) continue;
      const host = field.closest("li") ?? field.parentElement;
      if (!host || host.querySelector(`.${MARKER_CLASS}`)) continue;
      installStyles$1();
      host.insertAdjacentHTML("beforeend", buttonRow(resource));
      const row = host.lastElementChild;
      if (row instanceof HTMLElement) alignRowToField(field, row);
      added = true;
    }
    return added;
  }
  function startTransportButtonObserver() {
    const target = qs(SEL.container);
    if (!target) return null;
    addTransportButtons();
    const observer = new MutationObserver(() => {
      addTransportButtons();
    });
    observer.observe(target, {
      childList: true,
      subtree: true,
    });
    return observer;
  }
  var CRITICAL_SELECTORS = {
    cityBread: SEL.cityBread,
    townList: SEL.townListContainer,
    buildTabTownNames: SEL.buildTabTownNames,
    freeTransporters: SEL.globalMenu.freeTransporters,
  };
  function selectorHealth() {
    const health = {};
    for (const [name, selector] of Object.entries(CRITICAL_SELECTORS))
      try {
        health[name] = qsa(selector).length;
      } catch {
        health[name] = -1;
      }
    return health;
  }
  function appContext() {
    const context = {
      town: getCurrentTownName() || null,
      modelTown: modelCurrentCityName(),
      hasModel: hasModel(),
      selectors: selectorHealth(),
      dialogOpen: !!qs(`#${DIALOG_ID}`),
    };
    try {
      const { accountName, queue } = getState();
      const head = queue.head();
      context.account = accountName;
      context.queueLength = queue.length;
      context.queueHead = head
        ? {
            type: head.type,
            id: head.id,
            data: head.data,
          }
        : null;
    } catch {
      context.stateInitialised = false;
    }
    return context;
  }
  var installed = false;
  function installDiagnostics() {
    if (installed) return;
    installed = true;
    registerContextProvider(appContext);
    const anyWindow = window;
    anyWindow.ikaBugs = () => {
      console.log(summariseBugs());
      return getBugs();
    };
    anyWindow.ikaBugReport = () => {
      const json = exportBugReport();
      try {
        const copyToClipboard = anyWindow.copy;
        copyToClipboard?.(json);
      } catch {}
      return json;
    };
    anyWindow.ikaClearBugs = () => {
      clearBugs();
      console.log("[ika] bug reports cleared");
    };
  }
  var TRANSFER_FORMAT = "ikariam-tool/data";
  var DEFAULT_GROUPS = ["config", "measurements"];
  var GLOBAL_KEYS = {
    listAutoBuild: "config",
    ika_perShipCapacity: "config",
    ika_freighterCapacity: "config",
    isSendResourceHidden: "config",
    listAccount: "measurements",
    isAutoBuildStart: "runtime",
    isAutoReload: "runtime",
    reloadedMinute: "runtime",
    [LOGGER_STORAGE_KEY]: "diagnostics",
    [BUG_REPORT_STORAGE_KEY]: "diagnostics",
    ikaDomReports: "diagnostics",
  };
  var ACCOUNT_SUFFIXES = {
    listSender: "config",
    listReceiver: "config",
    ikaTownStats: "measurements",
    ikaGlobalTaskQueue: "runtime",
    resource: "runtime",
  };
  function classifyKey(key) {
    const globalGroup = GLOBAL_KEYS[key];
    if (globalGroup)
      return {
        key,
        group: globalGroup,
        account: null,
        suffix: key,
      };
    const empireMatch = key.match(EMPIRE_KEY_PATTERN);
    if (empireMatch)
      return {
        key,
        group: "config",
        account: empireMatch[1],
        suffix: empireMatch[2],
      };
    const suffixes = Object.keys(ACCOUNT_SUFFIXES).sort(
      (a, b) => b.length - a.length,
    );
    for (const suffix of suffixes)
      if (key.length > suffix.length && key.endsWith(suffix))
        return {
          key,
          group: ACCOUNT_SUFFIXES[suffix],
          account: key.slice(0, -suffix.length),
          suffix,
        };
    return null;
  }
  function exportData(options = {}) {
    const groups = options.groups ?? DEFAULT_GROUPS;
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const classified = classifyKey(key);
      if (!classified || !groups.includes(classified.group)) continue;
      if (
        options.account !== void 0 &&
        classified.account !== null &&
        classified.account !== options.account
      )
        continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      entries.push({
        ...classified,
        value,
      });
    }
    return {
      format: TRANSFER_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      account: options.account ?? null,
      groups,
      entries,
    };
  }
  function parseBundle(json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(IMPORT_ERRORS.notJson);
    }
    const bundle = parsed;
    if (bundle?.format !== "ikariam-tool/data")
      throw new Error(IMPORT_ERRORS.notOurFormat);
    if (typeof bundle.version !== "number" || bundle.version > 1)
      throw new Error(IMPORT_ERRORS.unsupportedVersion(bundle.version, 1));
    if (!Array.isArray(bundle.entries))
      throw new Error(IMPORT_ERRORS.noEntries);
    return bundle;
  }
  function importData(json, options = {}) {
    const bundle = parseBundle(json);
    const groups = options.groups ?? DEFAULT_GROUPS;
    const overwrite = options.overwrite ?? true;
    const result = {
      imported: 0,
      skipped: 0,
      notes: [],
    };
    for (const entry of bundle.entries) {
      if (!groups.includes(entry.group)) {
        result.skipped++;
        continue;
      }
      let targetKey = entry.key;
      if (entry.account !== null && options.remapAccountTo !== void 0)
        if (EMPIRE_KEY_PATTERN.test(entry.key))
          targetKey = empireKeyPrefix(options.remapAccountTo) + entry.suffix;
        else targetKey = `${options.remapAccountTo}${entry.suffix}`;
      if (!overwrite && localStorage.getItem(targetKey) !== null) {
        result.skipped++;
        result.notes.push(IMPORT_NOTES.keptExisting(targetKey));
        continue;
      }
      try {
        localStorage.setItem(targetKey, entry.value);
        result.imported++;
      } catch (e) {
        result.skipped++;
        result.notes.push(
          IMPORT_NOTES.couldNotWrite(targetKey, errorMessage(e)),
        );
      }
    }
    return result;
  }
  function accountsInBundle(bundle) {
    return [
      ...new Set(
        bundle.entries
          .map((entry) => entry.account)
          .filter((account) => !!account),
      ),
    ];
  }
  function describeBundle(bundle) {
    const byGroup = new Map();
    for (const entry of bundle.entries)
      byGroup.set(entry.group, (byGroup.get(entry.group) ?? 0) + 1);
    const parts = [...byGroup.entries()].map(
      ([group, count]) => `${count} ${group}`,
    );
    const accounts = accountsInBundle(bundle);
    return [
      IMPORT_SUMMARY.exportedAt(new Date(bundle.exportedAt).toLocaleString()),
      IMPORT_SUMMARY.entries(bundle.entries.length, parts.join(", ")),
      IMPORT_SUMMARY.accounts(accounts.join(", ")),
    ].join("\n");
  }
  var GROUP_LABELS = DATA_TRANSFER.groupLabels;
  var MAX_NOTES_SHOWN = 5;
  function timestampedFilename(account) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return `ikariam-tool-${account.replace(/[^\w.-]+/g, "_")}-${stamp}.json`;
  }
  function downloadJson(filename, json) {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function exportDataToFile() {
    const { accountName } = getState();
    const bundle = exportData({
      groups: DEFAULT_GROUPS,
      account: accountName,
    });
    if (bundle.entries.length === 0) {
      alert(DATA_TRANSFER.nothingToExport);
      return;
    }
    const json = JSON.stringify(bundle, null, 2);
    downloadJson(timestampedFilename(accountName), json);
    navigator.clipboard?.writeText(json).catch(() => {});
    logInfo(`Exported ${bundle.entries.length} entries`);
    alert(
      DATA_TRANSFER.saved(
        bundle.entries.length,
        describeBundle(bundle),
        [GROUP_LABELS.config, GROUP_LABELS.measurements],
        GROUP_LABELS.runtime,
      ),
    );
  }
  function importDataFromFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      file
        .text()
        .then((json) => {
          const bundle = parseBundle(json);
          const { accountName } = getState();
          const foreign = bundle.entries
            .map((entry) => entry.account)
            .filter((account) => !!account && account !== accountName);
          let remapAccountTo;
          if (foreign.length > 0) {
            const unique = [...new Set(foreign)].join(", ");
            const remap = confirm(
              DATA_TRANSFER.otherAccount(unique, accountName),
            );
            remapAccountTo = remap ? accountName : void 0;
            if (!remap) alert(DATA_TRANSFER.skippingOtherAccount);
          }
          if (!confirm(DATA_TRANSFER.confirmImport(describeBundle(bundle))))
            return;
          const result = importData(json, {
            groups: DEFAULT_GROUPS,
            remapAccountTo,
            overwrite: true,
          });
          logInfo(
            `Imported ${result.imported} entries (${result.skipped} skipped)`,
          );
          alert(
            DATA_TRANSFER.imported(
              result.imported,
              result.skipped,
              result.notes.slice(0, MAX_NOTES_SHOWN).join("\n"),
            ),
          );
        })
        .catch((error) => {
          alert(DATA_TRANSFER.failed(errorMessage(error)));
        });
    });
    input.click();
  }
  function openPopup(title, html) {
    const api = getIkariam();
    if (!api?.createPopup) {
      reportSelectorMiss("window.ikariam.createPopup", { dialogTitle: title });
      alert(MISC.popupUnavailable);
      return;
    }
    api.createPopup(DIALOG_ID, title, html, "???", "class");
  }
  function headerCells(labels) {
    return labels.map((label) => `<th>${label}</th>`).join("");
  }
  function closeDialog() {
    removeElement(`#${DIALOG_ID}`);
  }
  function townOptions() {
    return getTownList()
      .map(
        (town) =>
          `<option value="${town.townNumber}">${escapeHtml(town.townName)}</option>`,
      )
      .join("");
  }
  function renderResourceTable() {
    const rows = getState()
      .queue.listOfType("sendResource")
      .map(
        (task) => `<tr>
        <td>${escapeHtml(getTownNameFromList(task.data.origin))}</td>
        <td>${escapeHtml(getTownNameFromList(task.data.destination))}</td>
        <td>${task.data.resource}</td>
        <td>${task.data.amount}</td>
        <td>${escapeHtml(task.data.label ?? "")}</td>
      </tr>`,
      )
      .join("");
    const body = qs("#resourceTableBody");
    if (body) body.innerHTML = rows;
  }
  function openSendResourcesDialog() {
    const towns = townOptions();
    const resources = RESOURCE_OPTIONS.map(
      (resource) =>
        `<option value="${resource.value}">${resource.label}</option>`,
    ).join("");
    openPopup(
      SEND_DIALOG.title,
      `<div><span>${SEND_DIALOG.from}</span><select id="transporterSendFromTown">${towns}</select></div><br/>
     <div><span>${SEND_DIALOG.destination}</span><select id="transporterSendDestination">${towns}</select></div><br/>
     <div><span>${SEND_DIALOG.resource}</span><select id="transporterSendResource">${resources}</select></div><br/>
     <div><span>${SEND_DIALOG.amount}</span><input id="transporterSendAmount" type="number"></div><br/>
     <button style="margin-right:5px" class="button" ${action("send.add")}>${BUTTON.add}</button>
     <button style="margin-right:5px" class="button" ${action("send.removeFirst")}>${SEND_DIALOG.removeFirst}</button>
     <button style="margin-right:5px" class="button" ${action("send.removeLast")}>${SEND_DIALOG.removeLast}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.close}</button><br/>
     <table id="resourceTable" class="fullTable" border="1" cellpadding="5">
       <thead>${headerCells(SEND_DIALOG.columns)}</thead>
       <tbody id="resourceTableBody"></tbody>
     </table>`,
    );
    renderResourceTable();
  }
  function readSendForm() {
    const origin = qs("#transporterSendFromTown")?.value;
    const destination = qs("#transporterSendDestination")?.value;
    const resource = qs("#transporterSendResource")?.value;
    const amount = Number(qs("#transporterSendAmount")?.value);
    if (!origin || !destination || !resource || !Number.isFinite(amount))
      return null;
    return {
      origin,
      destination,
      resource,
      amount,
    };
  }
  function openAutoWineDialog() {
    const senders = loadSenders();
    const receivers = loadReceivers();
    const board = readWineBoard();
    const rows = getTownList()
      .map((town) => {
        const id = town.townNumber.toString();
        const checked = senders.includes(id) ? "checked" : "";
        const perHour =
          receivers.find((entry) => entry.townNumber === id)?.winePerHour ??
          "0";
        const measured = measuredStats(town.townName, board);
        const stock = measured ? Math.round(measured.stock) : null;
        const hours =
          measured && measured.consume > 0
            ? (measured.stock / measured.consume).toFixed(1) + "h"
            : "—";
        return `<tr class="txtWine">
        <td><input type="checkbox" ${checked} id="cbSender_${id}" name="${escapeHtml(town.townName)}" value="${id}"/></td>
        <td>${escapeHtml(town.townName)}</td>
        <td><input type="text" id="txtWine_${id}" value="${escapeHtml(perHour)}"/></td>
        <td style="text-align:right">${stock === null ? "—" : formatInteger(stock)}</td>
        <td style="text-align:right">${hours}</td>
      </tr>`;
      })
      .join("");
    openPopup(
      WINE_DIALOG.title,
      `<div><table id="autoWineTable" class="fullTable" border="1" cellpadding="5">
       <tr>${headerCells(WINE_DIALOG.columns)}</tr>
       ${rows}
     </table></div><br/>
     <p style="font-size:11px">${WINE_DIALOG.help}</p>
     <button style="margin-right:20px" class="button" ${action("wine.save")}>${BUTTON.save}</button>
     <button style="margin-right:20px" class="button" ${action("wine.load")}>${BUTTON.load}</button>
     <button style="margin-right:20px" class="button" ${action("wine.preview")}>${WINE_DIALOG.previewPlan}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.cancel}</button><br/><br/>
     <div id="winePlanPreview"></div>`,
    );
  }
  function openWineSourceDialog() {
    const senders = loadSenders();
    const buttons = getTownList()
      .filter((town) => senders.includes(town.townNumber.toString()))
      .map(
        (town) =>
          `<button style="margin-right:20px" class="button" ${action("wine.start", { "ika-town": town.townNumber })}>${escapeHtml(town.townName)}</button>`,
      )
      .join("");
    openPopup(
      WINE_DIALOG.chooseSourceTitle,
      `${buttons}<button class="button" ${action("dialog.close")}>${BUTTON.cancel}</button><br/><br/>`,
    );
  }
  function renderWinePlanPreview(fromTown) {
    const target = qs("#winePlanPreview");
    if (!target) return;
    const plan = planWineRun(fromTown);
    if (plan.supply <= 0) {
      target.innerHTML = `<p style="color:red">${WINE_PREVIEW.noSpare}${plan.boardAvailable ? "" : WINE_PREVIEW.boardUnavailable}</p>`;
      return;
    }
    const rows = plan.allocations
      .map(
        (allocation) => `<tr>
        <td>${escapeHtml(allocation.townName)}</td>
        <td style="text-align:right">${formatInteger(allocation.stock)}</td>
        <td style="text-align:right">${formatInteger(allocation.consume)}</td>
        <td style="text-align:right"><b>${formatInteger(allocation.add)}</b></td>
        <td style="text-align:right">${allocation.finalHours.toFixed(1)}h${allocation.storageFull ? WINE_PREVIEW.storageFull : ""}</td>
      </tr>`,
      )
      .join("");
    const storageFull = plan.allocations.filter((a) => a.storageFull);
    const hours = plan.targetHours.toFixed(1);
    const levelling =
      storageFull.length === 0
        ? WINE_PREVIEW.levelEveryone(hours)
        : WINE_PREVIEW.levelExcept(
            hours,
            storageFull.map((a) => escapeHtml(a.townName)).join(", "),
            storageFull.length,
          );
    target.innerHTML = `
    <p>${WINE_PREVIEW.summary(escapeHtml(getTownNameFromList(fromTown)), formatInteger(plan.used), formatInteger(plan.supply), formatInteger(plan.unused), levelling)}</p>
    <table class="fullTable" border="1" cellpadding="4">
      <tr>${headerCells(WINE_PREVIEW.columns)}</tr>
      ${rows}
    </table>`;
  }
  function renderBuildingList() {
    return listBuildingsInCurrentTown()
      .map(
        (slot) =>
          `<span>${escapeHtml(slot.buildingName)}<button class="button" ${action(
            "build.add",
            {
              "ika-position": slot.positionId,
              "ika-building": slot.buildingName,
            },
          )}>+</button></span><br/>`,
      )
      .join("");
  }
  function renderTownQueue(townName) {
    const queue = getTownQueue(townName);
    if (queue.length === 0) return BUILD_DIALOG.emptyTown;
    return queue
      .map(
        (entry, index) =>
          `<span>${index + 1}.${escapeHtml(entry.buildingName)}<button class="button" ${action(
            "build.remove",
            {
              "ika-position": entry.positionId,
              "ika-building": entry.buildingName,
              "ika-town": townName,
            },
          )}>-</button></span><br/>`,
      )
      .join("");
  }
  function openAutoBuildDialog() {
    const townNames = qsa(SEL.buildTabTownNames).map((span) =>
      span.innerHTML.trim(),
    );
    const headers = headerCells(townNames.map(escapeHtml));
    const cells = townNames
      .map(
        (name) =>
          `<td class="tdQueue" data-ika-town-cell="${escapeHtml(name)}">${renderTownQueue(name)}</td>`,
      )
      .join("");
    openPopup(
      getCurrentTownName(),
      `<table id="autoBuildTable" class="fullTable fixTable" border="1" cellpadding="5">
       <tr><th>${BUILD_DIALOG.buildingList}</th>${headers}</tr>
       <tr><td id="tdListBuilding">${renderBuildingList()}</td>${cells}</tr>
     </table><br/>
     <p style="font-size:11px">${BUILD_DIALOG.savedAsYouGo}</p>
     <button style="margin-right:20px" class="button" ${action("build.enqueue")}>${BUILD_DIALOG.runQueue}</button>
     <button class="button" ${action("dialog.close")}>${BUTTON.close}</button><br/><br/>`,
    );
  }
  function refreshTownQueueCell(townName) {
    const cell = qsa("[data-ika-town-cell]").find(
      (element) => element.dataset.ikaTownCell === townName,
    );
    if (cell) cell.innerHTML = renderTownQueue(townName);
  }
  var BODY_BOTTOM_MARGIN = 120;
  var MIN_BODY_HEIGHT = 120;
  var MIN_VISIBLE_WIDTH = 120;
  var MIN_VISIBLE_HEIGHT = 60;
  var DEFAULT_POSITION = {
    left: 120,
    top: 120,
  };
  var WINDOW_STYLE_ID = "ika-window-style";
  function windowStyles() {
    return `
.ika-window {
  position: fixed;
  z-index: 1000;
  min-width: 260px;
  border: 1px solid #b79b6f;
  border-radius: 4px;
  background: #f8e7b3;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .35);
  font-size: 11px;
  color: #3b2c1a;
}
.ika-window[hidden] { display: none !important; }
.ika-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border-bottom: 1px solid #b79b6f;
  background: #e8d199;
  border-radius: 3px 3px 0 0;
  cursor: move;
  user-select: none;
}
.ika-window-title { font-weight: bold; font-size: 12px; }
.ika-window-close {
  cursor: pointer;
  padding: 0 4px;
  font-weight: bold;
  line-height: 1;
}
.ika-window-close:hover { color: #a3301f; }
.ika-window-body { overflow: auto; padding: 8px; }
.ika-window-footer {
  padding: 4px 8px;
  border-top: 1px solid #b79b6f;
  font-size: 10px;
  color: #6b5433;
  min-height: 14px;
}
.ika-group { margin-bottom: 8px; }
.ika-group:last-child { margin-bottom: 0; }
.ika-group-title {
  font-weight: bold;
  border-bottom: 1px dotted #b79b6f;
  margin-bottom: 4px;
  padding-bottom: 2px;
}
.ika-group button { margin: 0 4px 4px 0; }
`;
  }
  function installStyles() {
    if (document.getElementById("ika-window-style")) return;
    addStyle(windowStyles()).id = WINDOW_STYLE_ID;
  }
  function clampToViewport(position) {
    const maxLeft = Math.max(0, window.innerWidth - MIN_VISIBLE_WIDTH);
    const maxTop = Math.max(0, window.innerHeight - MIN_VISIBLE_HEIGHT);
    return {
      left: Math.min(Math.max(0, position.left), maxLeft),
      top: Math.min(Math.max(0, position.top), maxTop),
    };
  }
  function makeDraggable(root, handle, onMoved) {
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    const onPointerMove = (event) => {
      const next = clampToViewport({
        left: originLeft + (event.clientX - startX),
        top: originTop + (event.clientY - startY),
      });
      root.style.left = `${next.left}px`;
      root.style.top = `${next.top}px`;
    };
    const onPointerUp = (event) => {
      handle.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      onMoved({
        left: parseInt(root.style.left, 10) || 0,
        top: parseInt(root.style.top, 10) || 0,
      });
    };
    handle.addEventListener("pointerdown", (event) => {
      if (event.target?.classList.contains("ika-window-close")) return;
      event.preventDefault();
      startX = event.clientX;
      startY = event.clientY;
      originLeft = parseInt(root.style.left, 10) || 0;
      originTop = parseInt(root.style.top, 10) || 0;
      handle.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });
  }
  function createWindow(options) {
    installStyles();
    const positionKey = `ikaWindow_${options.id}`;
    const stored = options.store?.getJSON(positionKey, null);
    const position = clampToViewport(stored ?? DEFAULT_POSITION);
    const root = document.createElement("div");
    root.id = options.id;
    root.className = "ika-window";
    root.hidden = true;
    root.style.left = `${position.left}px`;
    root.style.top = `${position.top}px`;
    if (options.width) root.style.width = options.width;
    root.innerHTML = `
    <div class="ika-window-header">
      <span class="ika-window-title"></span>
      <span class="ika-window-close" title="${WINDOW_CLOSE_TITLE}">&#10005;</span>
    </div>
    <div class="ika-window-body"></div>
    <div class="ika-window-footer"></div>`;
    const header = root.querySelector(".ika-window-header");
    const title = root.querySelector(".ika-window-title");
    const body = root.querySelector(".ika-window-body");
    title.textContent = options.title;
    (document.getElementById("container") ?? document.body).appendChild(root);
    const applyMaxHeight = () => {
      body.style.maxHeight = `${Math.max(MIN_BODY_HEIGHT, window.innerHeight - BODY_BOTTOM_MARGIN)}px`;
    };
    applyMaxHeight();
    window.addEventListener("resize", applyMaxHeight);
    const closeOnEscape = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "Escape" && !root.hidden) api.close();
    };
    makeDraggable(root, header, (moved) => {
      options.store?.setJSON(positionKey, moved);
    });
    const api = {
      root,
      content: body,
      isOpen: () => !root.hidden,
      open() {
        const next = clampToViewport({
          left: parseInt(root.style.left, 10) || 0,
          top: parseInt(root.style.top, 10) || 0,
        });
        root.style.left = `${next.left}px`;
        root.style.top = `${next.top}px`;
        applyMaxHeight();
        root.hidden = false;
      },
      close() {
        if (root.hidden) return;
        root.hidden = true;
        options.onClose?.();
      },
      toggle() {
        if (root.hidden) api.open();
        else api.close();
      },
      setTitle(text) {
        title.textContent = text;
      },
      destroy() {
        window.removeEventListener("resize", applyMaxHeight);
        document.removeEventListener("keydown", closeOnEscape);
        root.remove();
      },
    };
    root
      .querySelector(".ika-window-close")
      .addEventListener("click", () => api.close());
    document.addEventListener("keydown", closeOnEscape);
    return api;
  }
  function setWindowFooter(win, text) {
    const footer = win.root.querySelector(".ika-window-footer");
    if (footer) footer.textContent = text;
  }
  function severityOf(hours) {
    if (hours === null) return "ok";
    if (hours < 12) return "critical";
    if (hours < 48) return "warning";
    return "ok";
  }
  function wineStatus() {
    return getTownList().map((town) => {
      const measured = measuredStats(town.townName);
      const stock = measured?.stock ?? 0;
      const consume = measured?.consume ?? 0;
      const hoursLeft = measured && consume > 0 ? stock / consume : null;
      return {
        townNumber: town.townNumber.toString(),
        townName: town.townName,
        stock,
        consume,
        hoursLeft,
        severity: severityOf(hoursLeft),
      };
    });
  }
  function townsNeedingWine(towns = wineStatus()) {
    return towns
      .filter((town) => town.severity !== "ok")
      .sort((a, b) => (a.hoursLeft ?? Infinity) - (b.hoursLeft ?? Infinity));
  }
  function formatHours(hours) {
    if (hours === null) return "—";
    if (hours < 1) return "<1h";
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    const rest = Math.floor(hours % 24);
    return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
  }
  var QUEUE_LIST_ID = "ikaQueueList";
  var MAX_ROWS = 50;
  function describeTask(task) {
    if (task.type === "sendResource") {
      const { amount, resource, origin, destination, label } = task.data;
      return `${label ? `[${label}] ` : ""}${formatInteger(amount)} ${resource}: ${getTownNameFromList(origin)} → ${getTownNameFromList(destination)}`;
    }
    return QUEUE_VIEW.upgrade(task.data.buildingName, task.data.townName);
  }
  function row(task, index, isHead) {
    const marker = isHead ? " ▶" : "";
    return `<tr data-ika-queue-id="${escapeHtml(task.id)}"${isHead ? ' class="active"' : ""}><td>${index + 1}${marker}</td><td>${escapeHtml(describeTask(task))}</td><td><button class="button" title="${QUEUE_VIEW.moveToBack}" ${action("queue.moveToBack", { "ika-task": task.id })}>↓</button><button class="button" title="${QUEUE_VIEW.remove}" ${action("queue.remove", { "ika-task": task.id })}>✕</button></td></tr>`;
  }
  function renderQueue() {
    const queue = getState().queue;
    const tasks = queue.list();
    if (tasks.length === 0)
      return `<p class="ika-queue-empty">${QUEUE_VIEW.empty}</p>`;
    const head = queue.head();
    const shown = tasks.slice(0, MAX_ROWS);
    const overflow =
      tasks.length > MAX_ROWS
        ? `<p class="ika-queue-empty">${QUEUE_VIEW.more(tasks.length - MAX_ROWS)}</p>`
        : "";
    return (
      `<table class="fullTable ika-queue-table"><tr><th>#</th><th>${QUEUE_VIEW.headerTask}</th><th></th></tr>` +
      shown
        .map((task, index) => row(task, index, head?.id === task.id))
        .join("") +
      `</table>` +
      overflow +
      `<button class="button" ${action("queue.clear")}>${QUEUE_VIEW.clearAll}</button>`
    );
  }
  function refreshQueueView() {
    const host = qs(`#${QUEUE_LIST_ID}`);
    if (host) host.innerHTML = renderQueue();
  }
  function buildStyles() {
    return `
#autoWineTable th, #autoWineTable td { padding: 7px; }

.fullTable { width: 100%; overflow: hidden; display: block; }

#summaryAccountTable td, #summaryAccountTable th { padding: 1.5px; }
#summaryAccountTable tr:hover { background-color: white; }
#summaryAccountTable td:hover { color: red; background-color: #f0f0f0; }

/* The wine warning in the panel. Red is "act now", amber is "worth
   knowing"; the thresholds live in features/wine-warning.ts. */
.ika-wine-list { margin: 4px 0 0 0; padding: 0; list-style: none; }
.ika-wine-list li { font-size: 11px; line-height: 15px; }
.ika-wine-critical { color: #c00000; font-weight: bold; }
.ika-wine-warning { color: #b36b00; }
.ika-wine-ok, .ika-wine-unknown { font-size: 11px; color: #5a4632; margin-top: 4px; }

.active { font-weight: bold; }
.min { border: 1px solid red; }
th { font-weight: bold; }

/* The window manages its own visibility through the hidden attribute, so it
   is not listed here: a display rule would either do nothing or fight the
   toggle. The flag still hides the Empire Overview board, which has no such
   mechanism of its own. */
#empireBoard { display: ${isFlagTrue(FLAG.isSendResourceHidden) ? "none" : "block"}; }

/* The zoom toggle now scales the window in place rather than nudging a
   fixed-position panel back onto the screen. */
.zoom { transform: scale(0.8); transform-origin: top left; }
.ika-queue-table { font-size: 10px; }
.ika-queue-table th, .ika-queue-table td { padding: 2px 4px; text-align: left; }
.ika-queue-table tr.active { background: #efdca8; font-weight: bold; }
.ika-queue-table button { padding: 0 4px; margin-left: 2px; height: 18px; line-height: 1; }
.ika-queue-empty { font-style: italic; color: #6b5433; margin: 2px 0 4px; }

.needingShip {
  background: url("cdn/all/both/characters/fleet/40x40/ship_transport_r_40x40.png") no-repeat 0 0;
  background-size: 22px 19px;
}
#logger textarea:hover { z-index: 99999; }

/* Popup styles — declared but never attached in the original. */
#${DIALOG_ID} .popupContent,
#${DIALOG_ID} .popupMessage { width: max-content !important; }
#${DIALOG_ID} #autoBuildTable { overflow: auto; max-height: 501px; }
#${DIALOG_ID} #autoBuildTable button { float: right; }
#${DIALOG_ID} #autoBuildTable span { float: left; width: 100%; border-bottom: 1px dotted gray; }
#${DIALOG_ID} #autoBuildTable th { padding: 2px; }
#${DIALOG_ID} #tdListBuilding,
#${DIALOG_ID} .tdQueue { vertical-align: top; padding: 1px 1px 0 1px; text-align: left; }
#${DIALOG_ID} .fullTable { width: 100%; overflow: hidden; display: block; }
#${DIALOG_ID} .fixTable { max-height: 500px !important; }
#${DIALOG_ID} #resourceTable th,
#${DIALOG_ID} #resourceTable td { padding: 7px; }
`;
  }
  var WINDOW_ID = "ikaSendResourcesWindow";
  var LAUNCHER_CLASS = "ika-send-menu";
  var WINE_WARNING_ID = "ikaWineWarning";
  var panelWindow = null;
  function group(title, body) {
    return `<div class="ika-group"><div class="ika-group-title">${title}</div>${body}</div>`;
  }
  function windowContent() {
    return (
      group(
        PANEL.groups.wine,
        `<button class="button" id="btnStartScriptAutoWine" ${action("wine.chooseSource")}>${BUTTON.start}</button><button class="button" ${action("wine.settings")}>${BUTTON.settings}</button><div id="${WINE_WARNING_ID}"></div>`,
      ) +
      group(
        PANEL.groups.transport,
        `<button class="button" id="btnStartScript" ${action("queue.toggle")}>${BUTTON.startTimer}</button><button class="button" ${action("send.settings")}>${BUTTON.settings}</button><button class="button" id="calibratePerShipCapacity" ${action("ship.calibrate")}>${PANEL.calibrateCargo}</button>`,
      ) +
      group(
        PANEL.groups.build,
        `<button class="button" ${action("build.startNow")}>${BUTTON.start}</button><button class="button" id="btnStartAutoBuild" ${action("build.toggleTimer")}>${BUTTON.startTimer}</button><button class="button" ${action("build.settings")}>${BUTTON.settings}</button><button class="button" id="btnStartScanBuilding" ${action("build.scan")}>${PANEL.scan}</button>`,
      ) +
      group(PANEL.groups.queue, `<div id="${QUEUE_LIST_ID}"></div>`) +
      group(
        PANEL.groups.account,
        `<button class="button" ${action("account.update")}>${PANEL.updateAccount}</button><div id="summaryAccountList"></div>`,
      ) +
      group(
        PANEL.groups.data,
        `<button class="button" id="btnExportData" ${action("data.export")}>${PANEL.exportData}</button><button class="button" id="btnImportData" ${action("data.import")}>${PANEL.importData}</button><button class="button" id="btnBugReport" ${action("bug.report")}>${PANEL.bugReport}</button><button class="button" ${action("log.clear")}>${PANEL.clearLog}</button>`,
      ) +
      `<div id="logger"><textarea rows="4" cols="60" id="txtLogger" style="font-size:9px; display:none"></textarea></div>`
    );
  }
  function buildLauncher(onClick) {
    const launcher = document.createElement("button");
    launcher.className = `button ${LAUNCHER_CLASS}`;
    launcher.textContent = PANEL.launcher;
    launcher.style.cssText =
      "position:fixed; z-index:1000; left:8px; bottom:8px; cursor:pointer;";
    launcher.addEventListener("click", onClick);
    document.body.appendChild(launcher);
  }
  function buildPanel() {
    if (qs(`#ikaSendResourcesWindow`)) return;
    addStyle(buildStyles());
    panelWindow = createWindow({
      id: WINDOW_ID,
      title: PANEL.title,
      store: getState().account,
    });
    panelWindow.content.innerHTML = windowContent();
    refreshQueueView();
    buildLauncher(() => panelWindow?.toggle());
    const footer = qs("#footer");
    if (footer) footer.style.zIndex = "2";
  }
  function setQueueButtonLabel(running) {
    const button = qs("#btnStartScript");
    if (button) button.textContent = timerLabel(running);
  }
  function setAutoBuildButtonLabel(running) {
    const button = qs("#btnStartAutoBuild");
    if (button) button.textContent = timerLabel(running);
  }
  function timerLabel(running) {
    return running ? BUTTON.stopTimer : BUTTON.startTimer;
  }
  function renderWineWarning() {
    const towns = wineStatus();
    const measured = towns.filter((town) => town.hoursLeft !== null);
    if (measured.length === 0)
      return `<div class="ika-wine-unknown">${WINE_WARNING.unknown}</div>`;
    const needing = townsNeedingWine(towns);
    if (needing.length === 0)
      return `<div class="ika-wine-ok">${WINE_WARNING.allComfortable(measured.length)}</div>`;
    const line = (town) =>
      `<li class="ika-wine-${town.severity}">${WINE_WARNING.townLine(escapeHtml(town.townName), formatHours(town.hoursLeft))}</li>`;
    return `<ul class="ika-wine-list">${needing.map(line).join("")}</ul>`;
  }
  function refreshWineWarning() {
    const host = qs(`#${WINE_WARNING_ID}`);
    if (host) host.innerHTML = renderWineWarning();
  }
  function setTransferInfo(text) {
    if (!panelWindow) return;
    if (panelWindow.isOpen()) {
      refreshQueueView();
      refreshWineWarning();
    }
    const pending = getState().queue.length;
    setWindowFooter(
      panelWindow,
      pending > 0 ? PANEL.footerWithQueue(text, pending) : text,
    );
  }
  function togglePanel() {
    panelWindow?.toggle();
  }
  function toggleZoom() {
    panelWindow?.root.classList.toggle("zoom");
  }
  var QUEUE_INTERVAL_MS = 1e3;
  var SUMMARY_INTERVAL_MS = 1e4;
  var STATUS_INTERVAL_MS = 1e3;
  var TOWN_SNAPSHOT_INTERVAL_MS = 5e3;
  var KEY_TOGGLE_PANEL = "Space";
  var KEY_SEND_ALL_ARMY = "KeyA";
  var KEY_AUTO_BUILD = "KeyB";
  var KEY_SAFEHOUSE = "KeyS";
  var BUG_SUMMARY_PREVIEW_CHARS = 800;
  var runner;
  function isUiReady() {
    if (qs(`#ikaMationTransporterDialog`)) return false;
    if (!qs(SEL.cityBread)) return false;
    return true;
  }
  function syncRunnerToFlags() {
    const wanted = isAutoStart() || isFlagTrue(FLAG.isAutoBuildStart);
    if (wanted && !runner.isRunning) runner.start();
    else if (!wanted && runner.isRunning) runner.stop();
  }
  function toggleQueueRunner() {
    const running = isAutoStart();
    setAutoStart(!running);
    setQueueButtonLabel(!running);
    syncRunnerToFlags();
  }
  function startWineRun(fromTown) {
    if (enqueueWineRun(fromTown) > 0) refreshQueueView();
  }
  function registerUiActions() {
    registerActions({
      "dialog.close": closeDialog,
      "send.settings": openSendResourcesDialog,
      "send.add": () => {
        const form = readSendForm();
        if (!form) {
          alert(SEND_DIALOG.errors.incomplete);
          return;
        }
        if (form.origin === form.destination) {
          alert(SEND_DIALOG.errors.sameTown);
          return;
        }
        if (form.amount <= 0) {
          alert(SEND_DIALOG.errors.noAmount);
          return;
        }
        enqueueSendResource(
          form.origin,
          form.destination,
          form.resource,
          form.amount,
        );
        renderResourceTable();
      },
      "send.removeFirst": () => {
        const { queue } = getState();
        const first = queue.listOfType("sendResource")[0];
        if (first) queue.removeById(first.id);
        renderResourceTable();
      },
      "send.removeLast": () => {
        const { queue } = getState();
        const all = queue.listOfType("sendResource");
        const last = all[all.length - 1];
        if (last) queue.removeById(last.id);
        renderResourceTable();
      },
      "queue.toggle": toggleQueueRunner,
      "wine.settings": openAutoWineDialog,
      "wine.save": () => {
        const { senders, receivers } = collectWineSettings();
        saveSenders(senders);
        saveReceivers(receivers);
        closeDialog();
      },
      "wine.load": loadConsumedWine,
      "wine.preview": () => {
        const senders = loadSenders();
        if (senders.length === 0) {
          alert(WINE_DIALOG.noSourceTicked);
          return;
        }
        renderWinePlanPreview(senders[0]);
      },
      "wine.chooseSource": () => {
        const senders = loadSenders();
        if (senders.length === 0) {
          alert(WINE_DIALOG.noSourceTicked);
          return;
        }
        if (senders.length === 1) {
          startWineRun(senders[0]);
          return;
        }
        openWineSourceDialog();
      },
      "wine.start": (element) => {
        const town = element.dataset.ikaTown;
        if (!town) return;
        closeDialog();
        startWineRun(town);
      },
      "build.settings": openAutoBuildDialog,
      "build.add": (element) => {
        const { ikaPosition, ikaBuilding } = element.dataset;
        if (!ikaPosition || !ikaBuilding) return;
        addBuildingToQueue(ikaPosition, ikaBuilding);
        refreshTownQueueCell(getCurrentTownName());
      },
      "build.remove": (element) => {
        const { ikaPosition, ikaBuilding, ikaTown } = element.dataset;
        if (!ikaPosition || !ikaBuilding || !ikaTown) return;
        removeBuildingFromQueue(ikaPosition, ikaBuilding, ikaTown);
        refreshTownQueueCell(ikaTown);
      },
      "build.enqueue": () => {
        closeDialog();
        if (enqueueAutoBuild() > 0) runner.start();
      },
      "build.startNow": () => {
        if (enqueueAutoBuild() > 0) runner.start();
      },
      "build.toggleTimer": () => {
        const running = isFlagTrue(FLAG.isAutoBuildStart);
        setFlag(FLAG.isAutoBuildStart, !running);
        setAutoBuildButtonLabel(!running);
        if (running) getState().queue.removeType("upgradeBuilding");
        else enqueueAutoBuild();
        syncRunnerToFlags();
        refreshQueueView();
      },
      "build.scan": () => void scanBuildings(void 0, () => runner.isRunning),
      "transport.add": (element) => {
        const { ikaResource, ikaShips, ikaKind, ikaSet } = element.dataset;
        if (!ikaResource) return;
        applyTransportStep(
          ikaResource,
          Number(ikaShips) || 0,
          ikaKind === "freighter" ? "freighter" : "merchant",
          ikaSet === "1",
        );
      },
      "queue.remove": (element) => {
        const id = element.dataset.ikaTask;
        if (!id) return;
        getState().queue.removeById(id);
        refreshQueueView();
      },
      "queue.moveToBack": (element) => {
        const id = element.dataset.ikaTask;
        if (!id) return;
        getState().queue.moveToBack(id);
        refreshQueueView();
      },
      "queue.clear": () => {
        const pending = getState().queue.length;
        if (pending === 0) return;
        if (!confirm(QUEUE_VIEW.confirmClear(pending))) return;
        getState().queue.clear();
        refreshQueueView();
      },
      "account.update": updateCurrentAccount,
      "account.clear": clearAccounts,
      "data.export": exportDataToFile,
      "data.import": importDataFromFile,
      "bug.report": () => {
        const bugs = getBugs();
        if (bugs.length === 0) {
          alert(BUG_REPORT.nothingToReport);
          return;
        }
        const report = exportBugReport();
        navigator.clipboard
          ?.writeText(report)
          .then(() =>
            alert(
              BUG_REPORT.copied(
                bugs.length,
                summariseBugs().slice(0, BUG_SUMMARY_PREVIEW_CHARS),
              ),
            ),
          )
          .catch(() => {
            console.log(report);
            alert(BUG_REPORT.clipboardUnavailable);
          });
      },
      "bug.clear": () => {
        clearBugs();
        alert(BUG_REPORT.cleared);
      },
      "ship.calibrate": calibrateShipCapacity,
      "panel.toggleZoom": toggleZoom,
      "log.clear": clearLog,
    });
    document.addEventListener("change", (event) => {
      const element = event.target?.closest(".js-ika-autobuild");
      if (!element) return;
      const account = element.dataset.ikaAccount;
      if (account) setAutoBuildChecked(account, element.checked);
    });
  }
  function registerHotkeys() {
    document.addEventListener("keydown", (event) => {
      const tag = event.target?.nodeName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      switch (event.code) {
        case KEY_TOGGLE_PANEL:
          togglePanel();
          break;
        case KEY_SEND_ALL_ARMY:
          sendAllArmy();
          break;
        case KEY_SAFEHOUSE:
          openSpyBuilding();
          break;
        case KEY_AUTO_BUILD:
          openAutoBuildDialog();
          break;
      }
    });
  }
  function start() {
    let accountName;
    try {
      accountName = getAccountName();
    } catch {
      if (!sessionStorage.getItem("ikaReloadedOnce")) {
        sessionStorage.setItem("ikaReloadedOnce", "1");
        location.reload();
      }
      return;
    }
    sessionStorage.removeItem("ikaReloadedOnce");
    initState(accountName);
    buildPanel();
    initLogger(accountName);
    installDiagnostics();
    installErrorHandlers();
    installActionDispatcher();
    registerUiActions();
    registerHotkeys();
    startBarbarianObserver();
    startTransportButtonObserver();
    const moved = migrateLegacyQueues();
    if (moved > 0)
      logInfo(`Migrated ${moved} shipment orders into the unified queue`);
    runner = new TaskRunner(getState().queue, {
      intervalMs: QUEUE_INTERVAL_MS,
      isUiReady,
      onDrain: () => {
        runner.stop();
        setAutoStart(false);
        setQueueButtonLabel(false);
        cleanAutoBuildConfig();
        setFlag(FLAG.isAutoReload, true);
        backToCity();
      },
    })
      .register("sendResource", handleSendResource)
      .register("upgradeBuilding", handleUpgradeBuilding);
    setReloadGuard(() => !runner.isBusy);
    updateCurrentAccount();
    pruneTownStats(getState().account);
    recordCurrentTown(getState().account);
    window.setInterval(
      () => recordCurrentTown(getState().account),
      TOWN_SNAPSHOT_INTERVAL_MS,
    );
    window.setInterval(renderSummary, SUMMARY_INTERVAL_MS);
    window.setInterval(
      () => setTransferInfo(describeCurrentTransfer()),
      STATUS_INTERVAL_MS,
    );
    const autoStart = isAutoStart();
    const autoBuildStart = isFlagTrue(FLAG.isAutoBuildStart);
    setQueueButtonLabel(autoStart);
    setAutoBuildButtonLabel(autoBuildStart);
    if (autoBuildStart) enqueueAutoBuild();
    syncRunnerToFlags();
  }
  setBuildInfo({
    packaging: "userscript",
    script: "send-resources",
    version: "21.0.0",
  });
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
