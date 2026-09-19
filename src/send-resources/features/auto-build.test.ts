import { beforeEach, describe, expect, it, vi } from "vitest";
import { initState } from "../state";
import { handleUpgradeBuilding, scanBuildings } from "./auto-build";
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
      .addEventListener("click", () => void (clicked = true));

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
