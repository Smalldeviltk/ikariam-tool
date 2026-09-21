import { beforeEach, describe, expect, it, vi } from "vitest";
import { initState, saveAutoBuild } from "../state";
import {
  getTownQueue,
  handleUpgradeBuilding,
  scanBuildings,
} from "./auto-build";
import { resetHttpState } from "@core/ikariam/http";
import type { Task } from "@core/task-queue";

vi.mock("@core/logger", () => ({
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

function upgradeTask(
  positionId: string,
): Extract<Task, { type: "upgradeBuilding" }> {
  return {
    id: "t1",
    type: "upgradeBuilding",
    data: { townName: "W-Athens", positionId, buildingName: "Warehouse 26" },
  };
}

/** Town view markup, shaped like the live capture. */
function townView(currentTown: string, upgradeHref: string | null): string {
  const dropdown =
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    `<li selectvalue="297034" class="ownCity"><a title="W-Athens"> W-Athens</a></li>` +
    `</ul></div></div>`;
  const button =
    upgradeHref === null
      ? ""
      : `<a id="js_buildingUpgradeButton" href="${upgradeHref}">Upgrade</a>`;
  return (
    `<div id="js_cityBread">${currentTown}</div>` +
    dropdown +
    `<div id="position5" class="position5 building warehouse level25">` +
    `<a class="hoverable" id="js_CityPosition5Link" title="Warehouse (25)"></a>` +
    `</div>` +
    button
  );
}

beforeEach(() => {
  localStorage.clear();
  initState("Smalldevil");
  vi.useFakeTimers();
});

describe("handleUpgradeBuilding", () => {
  it(
    "REGRESSION: ignores an upgrade button belonging to a different slot — a " +
      "live capture found a stale one whose href pointed at another building",
    async () => {
      // We are upgrading slot 5, but the leftover button targets position 1.
      document.body.innerHTML = townView(
        "W-Athens",
        "?action=UpgradeExistingBuilding&cityId=297034&position=1&level=25",
      );

      const promise = handleUpgradeBuilding(
        upgradeTask("js_CityPosition5Link"),
      );
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await promise;

      // Clicking it would have upgraded the wrong building.
      expect(result.status).toBe("defer");
    },
  );

  it("accepts the button when its position matches the slot", async () => {
    document.body.innerHTML = townView(
      "W-Athens",
      "?action=UpgradeExistingBuilding&cityId=297034&position=5&level=25",
    );
    let clicked = false;
    document
      .getElementById("js_buildingUpgradeButton")!
      .addEventListener("click", () => {
        clicked = true;
        // What the game does when an upgrade actually starts: the slot turns
        // into a building site. A live capture of a town mid-build reads
        // `position8 building constructionSite animated`.
        document.getElementById("position5")!.className =
          "position5 building constructionSite animated";
      });

    const promise = handleUpgradeBuilding(upgradeTask("js_CityPosition5Link"));
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;

    expect(clicked).toBe(true);
    expect(result.status).toBe("done");
  });

  it("defers when no upgrade button appears at all", async () => {
    document.body.innerHTML = townView("W-Athens", null);
    const promise = handleUpgradeBuilding(upgradeTask("js_CityPosition5Link"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await promise).status).toBe("defer");
  });

  it("retries rather than acting when not on a town view", async () => {
    document.body.innerHTML = "";
    const result = await handleUpgradeBuilding(
      upgradeTask("js_CityPosition5Link"),
    );
    expect(result.status).toBe("retry");
  });

  /** The configured upgrade this account has queued for W-Athens. */
  function configureQueue(): void {
    saveAutoBuild([
      {
        accountName: "Smalldevil",
        townList: [
          {
            townName: "W-Athens",
            queue: [
              {
                positionId: "js_CityPosition5Link",
                buildingName: "Warehouse 26",
              },
            ],
          },
        ],
      },
    ]);
  }

  it(
    "REGRESSION: waits for the town view to catch up before deciding it is " +
      "free — the breadcrumb and the building slots arrive in separate ajax " +
      "boxes, so a busy town read as idle and had its upgrade clicked",
    async () => {
      document.body.innerHTML = townView(
        "W-Athens",
        "?action=UpgradeExistingBuilding&cityId=297034&position=5&level=25",
      );
      configureQueue();

      // The slots land after the breadcrumb, not with it. A live capture of a
      // busy town reads exactly this on the working slot:
      // `position8 building constructionSite animated`.
      setTimeout(() => {
        const slot = document.createElement("div");
        slot.id = "position8";
        slot.className = "position8 building constructionSite animated";
        document.body.appendChild(slot);
      }, 800);

      let clicked = false;
      document
        .getElementById("js_buildingUpgradeButton")!
        .addEventListener("click", () => void (clicked = true));

      const promise = handleUpgradeBuilding(
        upgradeTask("js_CityPosition5Link"),
      );
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await promise;

      expect(result.status).toBe("defer");
      expect(clicked).toBe(false);
      expect(getTownQueue("W-Athens")).toHaveLength(1);
    },
  );

  it(
    "REGRESSION: clicking Upgrade without the slot turning into a building " +
      "site does not consume the queue entry — the game refuses the click " +
      "while the town is busy, and the queue used to count down anyway",
    async () => {
      document.body.innerHTML = townView(
        "W-Athens",
        "?action=UpgradeExistingBuilding&cityId=297034&position=5&level=25",
      );
      configureQueue();

      let clicked = false;
      document
        .getElementById("js_buildingUpgradeButton")!
        // Deliberately does NOT mark the slot: this is the refused click.
        .addEventListener("click", () => void (clicked = true));

      const promise = handleUpgradeBuilding(
        upgradeTask("js_CityPosition5Link"),
      );
      await vi.advanceTimersByTimeAsync(40_000);
      const result = await promise;

      expect(clicked).toBe(true);
      expect(result.status).toBe("defer");
      expect(getTownQueue("W-Athens")).toHaveLength(1);
    },
  );
});

describe("scanBuildings", () => {
  /** Town dropdown with `names.length` entries, shaped like the live capture. */
  function dropdown(names: string[]): string {
    return (
      `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
      names
        .map(
          (n, i) =>
            `<li selectvalue="${297034 + i}" class="ownCity">` +
            `<a title="${n}"> ${n}</a></li>`,
        )
        .join("") +
      `</ul></div></div>`
    );
  }

  const TOWNS = ["W-Athens", "M-Corinth", "M-Aegina"];

  beforeEach(() => {
    localStorage.clear();
    initState("tester");
    (window as any).alert = vi.fn();
    document.body.innerHTML =
      `<div id="js_cityBread">W-Athens</div>` +
      dropdown(TOWNS) +
      `<div id="js_cityLink"><a></a></div>`;
    // Clicking a dropdown anchor switches town for real on the live page; here
    // it just rewrites the breadcrumb.
    document
      .querySelectorAll("#dropDown_js_citySelectContainer a")
      .forEach((anchor) =>
        anchor.addEventListener("click", () => {
          const name = anchor.getAttribute("title") ?? "";
          // M-Aegina refuses to load — the case the whole test is about.
          if (name === "M-Aegina") return;
          document.querySelector("#js_cityBread")!.textContent = name;
        }),
      );
  });

  it("refuses to run while the task runner is navigating", async () => {
    await scanBuildings(undefined, () => true);
    expect((window as any).alert).toHaveBeenCalledWith(
      expect.stringContaining("task queue is running"),
    );
    expect(document.querySelector("#js_cityBread")!.textContent).toBe(
      "W-Athens",
    );
  });

  it("says so when there is no town list to walk", async () => {
    document.body.innerHTML = "";
    await scanBuildings();
    expect((window as any).alert).toHaveBeenCalledWith(
      expect.stringContaining("No town list"),
    );
  });

  it(
    "REGRESSION: one unreachable town no longer aborts the rest — the caller " +
      "invokes this as `void scanBuildings()`, so the rejection used to vanish " +
      "into an unhandled promise with nothing logged and most towns unvisited",
    async () => {
      vi.useFakeTimers();
      try {
        const done = scanBuildings();
        await vi.advanceTimersByTimeAsync(120_000);
        await done;
      } finally {
        vi.useRealTimers();
      }

      const summary = String((window as any).alert.mock.calls.at(-1)[0]);
      // W-Athens is already current, M-Corinth switches, M-Aegina never does.
      expect(summary).toContain("2/3 towns visited");
      expect(summary).toContain("M-Aegina");
    },
    30_000,
  );
});

describe("scanBuildings: the fast path", () => {
  const TOWN_IDS = [297034, 297035];

  beforeEach(() => {
    localStorage.clear();
    initState("tester");
    // The file-level beforeEach installs fake timers. The fast path waits
    // out a real throttle between requests, so it needs real ones.
    vi.useRealTimers();
    resetHttpState();
    (window as any).alert = vi.fn();
    document.body.innerHTML =
      `<div id="js_cityBread">W-Athens</div>` +
      `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
      `<li><a title="W-Athens"> W-Athens</a></li>` +
      `<li><a title="M-Corinth"> M-Corinth</a></li>` +
      `</ul></div></div>` +
      `<div id="js_cityLink"><a></a></div>`;
  });

  function installModel() {
    const related: Record<string, unknown> = { selectedCity: "city_297034" };
    for (const id of TOWN_IDS) {
      related[`city_${id}`] = { id, name: `T${id}`, relationship: "ownCity" };
    }
    (window as any).ikariam = {
      model: { actionRequest: "token", relatedCityData: related },
    };
  }

  it(
    "asks the game for every town rather than walking to each — 2367 ms per " +
      "town walking against 328-841 ms per request, measured on the live game",
    async () => {
      installModel();
      const fetchMock = vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () =>
          JSON.stringify([
            [
              "updateGlobalData",
              {
                backgroundData: {
                  id: Number(
                    new URL(url, "https://x").searchParams.get("cityId"),
                  ),
                  position: [],
                },
              },
            ],
          ]),
      }));
      (globalThis as any).fetch = fetchMock;

      // No clicking: the dropdown anchors carry no handlers in this fixture,
      // so the walking path could not have produced this result.
      await scanBuildings();

      expect(fetchMock).toHaveBeenCalledTimes(TOWN_IDS.length);
      expect(String((window as any).alert.mock.calls.at(-1)[0])).toContain(
        "Sync finished: 2/2",
      );
    },
    20_000,
  );

  it("falls back to walking when the model is not readable", async () => {
    delete (window as any).ikariam;
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    vi.useFakeTimers();
    try {
      const done = scanBuildings();
      await vi.advanceTimersByTimeAsync(120_000);
      await done;
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(String((window as any).alert.mock.calls.at(-1)[0])).toContain(
      "Scan finished",
    );
  }, 30_000);
});
