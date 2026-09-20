import { beforeEach, describe, expect, it, vi } from "vitest";
import { getState, initState } from "../state";
import {
  buildPanel,
  LAUNCHER_CLASS,
  setAutoBuildButtonLabel,
  setQueueButtonLabel,
  setTransferInfo,
  refreshWineWarning,
  renderWineWarning,
  togglePanel,
  WINDOW_ID,
  WINE_WARNING_ID,
} from "./panel";

vi.mock("@core/logger", () => ({
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

/** The game's left menu, as the live capture found it. */
const GAME_MENU =
  `<div id="js_viewCityMenu"><ul class="menu_slots">` +
  `<li class="expandable slot1"></li>` +
  `<li class="expandable slot2"></li>` +
  `</ul></div>`;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `<div id="container"></div><div id="footer"></div>`;
  document.head.innerHTML = "";
  initState("tester");
});

describe("buildPanel", () => {
  it("creates the window closed, so it does not cover the game on load", () => {
    document.body.innerHTML += GAME_MENU;
    buildPanel();

    const win = document.querySelector<HTMLElement>(`#${WINDOW_ID}`)!;
    expect(win).toBeTruthy();
    expect(win.hidden).toBe(true);
  });

  it("is idempotent — a second call does not build a second window", () => {
    document.body.innerHTML += GAME_MENU;
    buildPanel();
    buildPanel();

    expect(document.querySelectorAll(`#${WINDOW_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll(`.${LAUNCHER_CLASS}`)).toHaveLength(1);
  });

  it("adds its launcher to the game's own menu", () => {
    document.body.innerHTML += GAME_MENU;
    buildPanel();

    const launcher = document.querySelector(`.menu_slots > .${LAUNCHER_CLASS}`);
    expect(launcher).toBeTruthy();
    expect(launcher!.textContent).toContain("Send Resources");
  });

  it(
    "falls back to a fixed button when the game menu is absent — without one " +
      "of the two there is no way to open the window at all",
    () => {
      buildPanel();

      const launcher = document.querySelector<HTMLElement>(
        `button.${LAUNCHER_CLASS}`,
      );
      expect(launcher).toBeTruthy();
      expect(launcher!.style.position).toBe("fixed");
    },
  );

  it("opens and closes from the launcher", () => {
    document.body.innerHTML += GAME_MENU;
    buildPanel();

    const win = document.querySelector<HTMLElement>(`#${WINDOW_ID}`)!;
    const launcher = document.querySelector<HTMLElement>(`.${LAUNCHER_CLASS}`)!;

    launcher.click();
    expect(win.hidden).toBe(false);

    launcher.click();
    expect(win.hidden).toBe(true);
  });

  it("keeps every control, grouped by feature rather than in one row", () => {
    document.body.innerHTML += GAME_MENU;
    buildPanel();
    const win = document.querySelector<HTMLElement>(`#${WINDOW_ID}`)!;

    const groups = [...win.querySelectorAll(".ika-group-title")].map(
      (el) => el.textContent,
    );
    expect(groups).toEqual([
      "Wine",
      "Transport",
      "Build",
      "Queue",
      "Account",
      "Data",
    ]);

    // Every action the old flat panel offered is still reachable.
    const actions = [...win.querySelectorAll("[data-ika-action]")].map((el) =>
      el.getAttribute("data-ika-action"),
    );
    for (const name of [
      "wine.chooseSource",
      "wine.settings",
      "queue.toggle",
      "send.settings",
      "ship.calibrate",
      "build.startNow",
      "build.toggleTimer",
      "build.settings",
      "build.scan",
      "account.update",
      "data.export",
      "data.import",
      "bug.report",
      "log.clear",
    ]) {
      expect(actions).toContain(name);
    }
  });

  it(
    "keeps the account summary and the log inside the window — the summary " +
      "used to sit in a block that was `display:none`, so the Bug Report " +
      "button next to it could never be clicked",
    () => {
      document.body.innerHTML += GAME_MENU;
      buildPanel();
      const win = document.querySelector<HTMLElement>(`#${WINDOW_ID}`)!;

      expect(win.querySelector("#summaryAccountList")).toBeTruthy();
      expect(win.querySelector("#txtLogger")).toBeTruthy();
      expect(win.querySelector("#btnBugReport")).toBeTruthy();
    },
  );
});

describe("live state", () => {
  beforeEach(() => {
    document.body.innerHTML += GAME_MENU;
    buildPanel();
  });

  it("flips the timer labels", () => {
    setQueueButtonLabel(true);
    expect(document.querySelector("#btnStartScript")!.textContent).toBe(
      "Stop Timer",
    );
    setQueueButtonLabel(false);
    expect(document.querySelector("#btnStartScript")!.textContent).toBe(
      "Start Timer",
    );

    setAutoBuildButtonLabel(true);
    expect(document.querySelector("#btnStartAutoBuild")!.textContent).toBe(
      "Stop Timer",
    );
  });

  it("puts the transfer status in the footer", () => {
    setTransferInfo("Nothing is transferring");
    expect(document.querySelector(".ika-window-footer")!.textContent).toBe(
      "Nothing is transferring",
    );
  });

  it(
    "shows how many orders are still queued — the old panel had no way to " +
      "tell, which is why a stalled queue looked identical to an empty one",
    () => {
      getState().queue.push({
        type: "sendResource",
        data: { origin: "0", destination: "1", resource: "wine", amount: 1 },
      });

      setTransferInfo("Sending");

      expect(
        document.querySelector(".ika-window-footer")!.textContent,
      ).toContain("1 queued");
    },
  );

  it("toggles from the Space hotkey", () => {
    const win = document.querySelector<HTMLElement>(`#${WINDOW_ID}`)!;
    expect(win.hidden).toBe(true);
    togglePanel();
    expect(win.hidden).toBe(false);
  });
});

describe("the queue group", () => {
  beforeEach(() => {
    document.body.innerHTML += GAME_MENU;
    buildPanel();
  });

  it("is drawn as soon as the window is built", () => {
    expect(document.querySelector("#ikaQueueList")).toBeTruthy();
    expect(document.querySelector("#ikaQueueList")!.textContent).toContain(
      "queue is empty",
    );
  });

  it("redraws on the status tick, but only while the window is open", () => {
    getState().queue.push({
      type: "sendResource",
      data: { origin: "0", destination: "1", resource: "wine", amount: 7 },
    });

    // Closed: the tick must not spend work redrawing what nobody sees.
    setTransferInfo("x");
    expect(document.querySelector("#ikaQueueList")!.textContent).toContain(
      "queue is empty",
    );

    togglePanel();
    setTransferInfo("x");
    expect(document.querySelector("#ikaQueueList")!.textContent).not.toContain(
      "queue is empty",
    );
  });
});

describe("the wine warning", () => {
  /** The town dropdown `getTownList` reads. */
  function dropdown(...towns: string[]): string {
    return (
      `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
      towns.map((name) => `<li><a title="${name}"> ${name}</a></li>`).join("") +
      `</ul></div></div>`
    );
  }

  /** The Empire Overview board, two wine cells per row as the live page has. */
  function board(rows: Array<[string, string, string]>): string {
    return (
      `<div id="ResTab"><table><tbody>` +
      rows
        .map(
          ([town, stock, consumption]) =>
            `<tr><td class="city_name"><span class="clickable">${town}</span></td>` +
            `<td class="resource wine"><span class="current">${stock}</span></td>` +
            `<td class="resource wine">` +
            `<span class="prodconssubsum consumption Red">${consumption}</span>` +
            `</td></tr>`,
        )
        .join("") +
      `</tbody></table></div>`
    );
  }

  it("has a place in the Wine group to render into", () => {
    document.body.innerHTML += GAME_MENU;
    buildPanel();

    const host = document.querySelector(`#${WINE_WARNING_ID}`)!;
    expect(host).toBeTruthy();
    expect(host.closest(".ika-group")!.textContent).toContain("Wine");
  });

  it(
    "says the figures are missing rather than calling every town comfortable — " +
      "an empty list means the same thing for 'all fine' and 'no idea'",
    () => {
      document.body.innerHTML = dropdown("W-Athens", "M-Corinth");
      expect(renderWineWarning()).toContain("No wine figures yet");
    },
  );

  it("reports all clear once it has figures and nothing is low", () => {
    document.body.innerHTML =
      dropdown("W-Athens") + board([["W-Athens", "100000", "-100"]]);

    const html = renderWineWarning();
    expect(html).toContain("all comfortable");
    expect(html).toContain("1 towns");
  });

  it("lists only the towns that need something, worst first", () => {
    document.body.innerHTML =
      dropdown("W-Athens", "M-Corinth", "M-Aegina") +
      board([
        ["W-Athens", "100000", "-100"],
        ["M-Corinth", "2400", "-100"],
        ["M-Aegina", "300", "-100"],
      ]);

    document.body.innerHTML += `<div id="${WINE_WARNING_ID}"></div>`;
    refreshWineWarning();
    const items = [
      ...document.querySelectorAll(`#${WINE_WARNING_ID} li`),
    ].map((li) => li.textContent);

    expect(items).toHaveLength(2);
    expect(items[0]).toContain("M-Aegina");
    expect(items[1]).toContain("M-Corinth");
  });

  it("colours by severity, so the urgent one is readable at a glance", () => {
    document.body.innerHTML =
      dropdown("W-Athens", "M-Corinth") +
      board([
        ["W-Athens", "300", "-100"],
        ["M-Corinth", "2400", "-100"],
      ]);

    const html = renderWineWarning();
    expect(html).toContain('class="ika-wine-critical"');
    expect(html).toContain('class="ika-wine-warning"');
  });

  it("escapes a town name rather than letting it build markup", () => {
    document.body.innerHTML =
      dropdown("&lt;img src=x onerror=1&gt;") +
      // Escaped in the markup, so the cell's text is the literal string —
      // which is what the board would carry if a town were named this.
      board([["&lt;img src=x onerror=1&gt;", "300", "-100"]]) +
      `<div id="${WINE_WARNING_ID}"></div>`;

    refreshWineWarning();
    const host = document.querySelector(`#${WINE_WARNING_ID}`)!;

    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=1>");
  });

  it("does nothing when the panel has not been built", () => {
    document.body.innerHTML = dropdown("W-Athens");
    expect(() => refreshWineWarning()).not.toThrow();
  });
});
