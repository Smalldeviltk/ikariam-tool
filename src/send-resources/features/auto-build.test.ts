import { beforeEach, describe, expect, it, vi } from "vitest";
import { getState, initState, saveAutoBuild } from "../state";
import {
  addBuildingToQueue,
  BUILDING_LEVEL_CLASS,
  buildingsFromPositions,
  enqueueAutoBuild,
  getTownQueue,
  hasConfiguredUpgrades,
  plannedLevels,
  positionsFromResponse,
  handleUpgradeBuilding,
  listBuildingsInCurrentTown,
  moveBuildingInQueue,
  pruneCompletedInCurrentTown,
  readTownSlots,
  removeCompletedUpgrades,
  removeHighestLevel,
  removeUpgradeAndLater,
  scanBuildings,
  showBuildingLevels,
  slotStatesFromPositions,
  startBuildingLevelObserver,
} from "./auto-build";
import {
  completedUpgrades,
  nameNotepadCopies,
  splitRunnableTowns,
  type SavedUpgrade,
  type SlotState,
} from "./build-queue-validation";
import { resetHttpState } from "@core/ikariam/http";
import type { Task } from "@core/task-queue";

// Silence the logger, but keep its other exports (its storage key is read by
// the data export).
vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

// Messages are toasts now. Capture them, but keep the module's real window.
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@core/ui/window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/ui/window")>()),
  showToast,
}));

// The notepad's own behaviour is tested in `queue-note.test.ts`; here, when
// the handler claims and what it does with each answer.
const { claimUpgrade } = vi.hoisted(() => ({
  claimUpgrade: vi.fn(
    async (
      _townName: string,
      _positionId: string,
      _buildingName: string,
    ): Promise<{ status: "go" } | { status: "gone" }> => ({
      status: "go",
    }),
  ),
}));
vi.mock("../queue-note", () => ({ claimUpgrade }));

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
  // Reset, not clear: a one-off answer a test left unused (a visit that
  // ended before its claim) would otherwise answer the next test's claim.
  claimUpgrade.mockReset();
  claimUpgrade.mockResolvedValue({ status: "go" });
});

describe("handleUpgradeBuilding", () => {
  // The visit's own upgrade (`upgradeTask`), saved as a lap leaves it: a
  // visit whose upgrade is no longer saved ends without opening anything.
  beforeEach(() => {
    saveWAthens([upgrade(5, "Warehouse 26")]);
  });

  it(
    "REGRESSION: ignores an upgrade button belonging to a different slot — a " +
      "live capture found a stale one whose href pointed at another building",
    async () => {
      // We are upgrading slot 5, but the leftover button targets position 1.
      document.body.innerHTML = townView(
        "W-Athens",
        "?action=UpgradeExistingBuilding&cityId=297034&position=1&level=25",
      );
      let clicked = false;
      document
        .getElementById("js_buildingUpgradeButton")!
        .addEventListener("click", () => void (clicked = true));

      const promise = handleUpgradeBuilding(
        upgradeTask("js_CityPosition5Link"),
      );
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await promise;

      // Clicking it would have upgraded the wrong building.
      expect(clicked).toBe(false);
      expect(result.status).toBe("done");
    },
  );

  it(
    "REGRESSION: waits for the right slot's button when the previous " +
      "building's is still on screen — it gave up on the first one it saw, " +
      "and logged 'Upgrade button points at position 4, expected 23' before " +
      "deferring as 'not enough resources?' when there were enough",
    async () => {
      // The previous building's button, still there when slot 5 is clicked.
      document.body.innerHTML = townView(
        "W-Athens",
        "?action=UpgradeExistingBuilding&cityId=297034&position=1&level=25",
      );
      // Clicking slot 5 makes the game swap in its view, a round trip later.
      document
        .getElementById("js_CityPosition5Link")!
        .addEventListener("click", () =>
          setTimeout(() => {
            const button = document.getElementById("js_buildingUpgradeButton")!;
            button.setAttribute(
              "href",
              "?action=UpgradeExistingBuilding&cityId=297034&position=5&level=25",
            );
            button.addEventListener("click", () => {
              document.getElementById("position5")!.className =
                "position5 building constructionSite animated";
            });
          }, 700),
        );

      const promise = handleUpgradeBuilding(
        upgradeTask("js_CityPosition5Link"),
      );
      await vi.advanceTimersByTimeAsync(20_000);

      expect((await promise).status).toBe("done");
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

  it("ends the town's turn when no upgrade button appears at all", async () => {
    document.body.innerHTML = townView("W-Athens", null);
    const promise = handleUpgradeBuilding(upgradeTask("js_CityPosition5Link"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await promise).status).toBe("done");
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

      // The turn is over, and the saved upgrade waits for the next lap.
      expect(result.status).toBe("done");
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
      expect(result.status).toBe("done");
      expect(getTownQueue("W-Athens")).toHaveLength(1);
    },
  );
});

describe("handleUpgradeBuilding and the game's notepad", () => {
  // The visit's own upgrade (`upgradeTask`), saved as a lap leaves it: a
  // visit whose upgrade is no longer saved ends without opening anything.
  beforeEach(() => {
    saveWAthens([upgrade(5, "Warehouse 26")]);
  });

  it(
    "a switch to the town that did not land ends the visit rather than " +
      "throwing - thrown, the runner dropped it with a 'task dropped' notice",
    async () => {
      const town = readyTown();
      // The page landed in another town moments after the switch was sent.
      document.getElementById("js_cityBread")!.textContent = "M-Corinth";
      sessionStorage.setItem(
        "ika_pendingTownSwitch",
        JSON.stringify({ target: "W-Athens", sentAt: Date.now() }),
      );
      try {
        await expect(
          handleUpgradeBuilding(upgradeTask("js_CityPosition5Link")),
        ).resolves.toEqual({ status: "done" });
      } finally {
        sessionStorage.clear();
      }

      expect(claimUpgrade).not.toHaveBeenCalled();
      expect(town.opens()).toBe(0);
      expect(labels(getTownQueue("W-Athens"))).toEqual(["Warehouse 26"]);
    },
  );

  /**
   * A town whose slot 5 starts building when its button is clicked. Counts
   * how often the building was opened and its Upgrade button clicked.
   */
  function readyTown(): { opens: () => number; clicks: () => number } {
    document.body.innerHTML = townView(
      "W-Athens",
      "?action=UpgradeExistingBuilding&cityId=297034&position=5&level=25",
    );
    let opens = 0;
    let clicks = 0;
    document
      .getElementById("js_CityPosition5Link")!
      .addEventListener("click", () => void opens++);
    document
      .getElementById("js_buildingUpgradeButton")!
      .addEventListener("click", () => {
        clicks++;
        document.getElementById("position5")!.className =
          "position5 building constructionSite animated";
      });
    return { opens: () => opens, clicks: () => clicks };
  }

  async function run(): Promise<{ status: string; reason?: string }> {
    const promise = handleUpgradeBuilding(upgradeTask("js_CityPosition5Link"));
    await vi.advanceTimersByTimeAsync(20_000);
    return promise;
  }

  it(
    "REGRESSION: claims the upgrade before its building is opened - claimed " +
      "just before the click, the notepad's save made the button's " +
      "actionRequest stale and the game refused it, ten laps in a row",
    async () => {
      const town = readyTown();
      let opensAtClaim = -1;
      claimUpgrade.mockImplementationOnce(async () => {
        opensAtClaim = town.opens();
        return { status: "go" };
      });

      expect((await run()).status).toBe("done");
      expect(claimUpgrade).toHaveBeenCalledWith(
        "W-Athens",
        "js_CityPosition5Link",
        "Warehouse 26",
      );
      expect(opensAtClaim).toBe(0);
      expect(town.opens()).toBe(1);
      expect(town.clicks()).toBe(1);
    },
  );

  it("neither opens nor clicks an upgrade another computer already started", async () => {
    const town = readyTown();
    claimUpgrade.mockResolvedValueOnce({ status: "gone" });

    expect((await run()).status).toBe("done");
    expect(town.opens()).toBe(0);
    expect(town.clicks()).toBe(0);
  });

  it("claims nothing for a town that is already building", async () => {
    readyTown();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="position8" class="position8 building constructionSite animated"></div>`,
    );

    await run();

    expect(claimUpgrade).not.toHaveBeenCalled();
  });
});

describe("enqueueAutoBuild", () => {
  const WAREHOUSE = {
    positionId: "js_CityPosition4Link",
    buildingName: "Warehouse 3",
  };
  const PORT = {
    positionId: "js_CityPosition1Link",
    buildingName: "Trading Port 5",
  };

  /** Saved upgrades on the `SClone1` layout: two each in M and W, one in S. */
  function configureThreeTowns(): void {
    saveAutoBuild([
      {
        accountName: "Smalldevil",
        townList: [
          { townName: "M-Clone1", queue: [WAREHOUSE, PORT] },
          { townName: "S-Clone1", queue: [WAREHOUSE] },
          { townName: "W-Clone1", queue: [PORT, WAREHOUSE] },
        ],
      },
    ]);
  }

  /** The dropdown in `SClone1`'s order: W, M, S. */
  const DROPDOWN =
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    [
      ["297124", "W-Clone1"],
      ["297155", "M-Clone1"],
      ["297348", "S-Clone1"],
    ]
      .map(
        ([id, name]) =>
          `<li selectvalue="${id}" class="ownCity"><a title="${name}"> ${name}</a></li>`,
      )
      .join("") +
    `</ul></div></div>`;

  function queuedTowns(): string[] {
    return getState()
      .queue.listOfType("upgradeBuilding")
      .map((task) => `${task.data.townName}: ${task.data.buildingName}`);
  }

  it(
    "REGRESSION: queues one visit per town, for its first saved upgrade — " +
      "queueing every upgrade had a busy town's entries circle the queue, " +
      "switching town every second",
    () => {
      document.body.innerHTML = DROPDOWN;
      configureThreeTowns();

      expect(enqueueAutoBuild()).toBe(3);
      expect(queuedTowns()).toEqual([
        "W-Clone1: Trading Port 5",
        "M-Clone1: Warehouse 3",
        "S-Clone1: Warehouse 3",
      ]);
    },
  );

  it("follows the board's order, which the player can drag", () => {
    document.body.innerHTML =
      DROPDOWN +
      `<div id="BuildTab">` +
      ["S-Clone1", "W-Clone1", "M-Clone1"]
        .map(
          (name) =>
            `<div class="city_name"><span class="clickable">${name}</span></div>`,
        )
        .join("") +
      `</div>`;
    configureThreeTowns();

    enqueueAutoBuild();

    expect(queuedTowns().map((line) => line.split(":")[0])).toEqual([
      "S-Clone1",
      "W-Clone1",
      "M-Clone1",
    ]);
  });
});

describe("listBuildingsInCurrentTown", () => {
  function slot(position: number, title: string, building = false): string {
    return (
      `<div id="position${position}" class="building${building ? " constructionSite" : ""}">` +
      `<a class="hoverable" id="js_CityPosition${position}Link" title="${title}"></a></div>`
    );
  }

  it(
    "reads a first level being built from the class, not from the words — " +
      "matching 'Under construction' broke on any other game language",
    () => {
      document.body.innerHTML =
        slot(1, "Warehouse (12)") +
        slot(2, "Academy (5)", true) +
        slot(3, "Tavern (Under construction)", true) +
        slot(4, "Museum (Đang xây dựng)", true);

      expect(
        listBuildingsInCurrentTown().map((entry) => entry.buildingName),
      ).toEqual(["Academy 6", "Museum 1", "Tavern 1", "Warehouse 12"]);
    },
  );
});

describe("buildingsFromPositions", () => {
  it(
    "reads another town's buildings from the position array the game " +
      "sends, with the ids and labels the city view gives them",
    () => {
      const positions = [
        { buildingId: 0, name: "Town Hall", level: 12, building: "townHall" },
        { buildingId: 3, name: "Trading Port", level: "7", building: "port" },
        { buildingId: null, building: "buildingGround land" },
        {
          buildingId: 7,
          name: "Warehouse",
          level: 9,
          isBusy: true,
          building: "warehouse",
        },
        {
          buildingId: 4,
          name: "Academy",
          level: 0,
          completed: 1_800_000_000,
          building: "academy",
        },
      ];

      expect(buildingsFromPositions(positions)).toEqual([
        { buildingName: "Academy 1", positionId: "js_CityPosition4Link" },
        { buildingName: "Town Hall 12", positionId: "js_CityPosition0Link" },
        { buildingName: "Trading Port 7", positionId: "js_CityPosition1Link" },
        { buildingName: "Warehouse 10", positionId: "js_CityPosition3Link" },
      ]);
    },
  );

  it("finds no buildings in something that is not a position array", () => {
    expect(buildingsFromPositions(null)).toEqual([]);
    expect(buildingsFromPositions({ 0: { name: "Town Hall" } })).toEqual([]);
  });
});

describe("positionsFromResponse", () => {
  const POSITIONS = [{ name: "Town Hall", level: 3, building: "townHall" }];

  it("takes the position array of the town that was asked for", () => {
    const entries = [
      [
        "updateGlobalData",
        { backgroundData: { id: "297035", position: POSITIONS } },
      ],
    ];
    expect(positionsFromResponse(entries, "297035")).toEqual(POSITIONS);
  });

  it("falls back on updateBackgroundData when the global entry has none", () => {
    const entries = [
      ["updateGlobalData", { headerData: {} }],
      ["updateBackgroundData", { id: 297035, position: POSITIONS }],
    ];
    expect(positionsFromResponse(entries, "297035")).toEqual(POSITIONS);
  });

  it(
    "refuses another town's buildings, so their slots are not saved " +
      "under the town that was asked for",
    () => {
      const entries = [
        [
          "updateGlobalData",
          { backgroundData: { id: "297034", position: POSITIONS } },
        ],
      ];
      expect(positionsFromResponse(entries, "297035")).toBeNull();
    },
  );
});

describe("addBuildingToQueue", () => {
  it(
    "saves the upgrade under the town it is given, not the town on " +
      "screen, counting levels up within that town",
    () => {
      document.body.innerHTML = `<div id="js_cityBread">W-Athens</div>`;

      addBuildingToQueue("js_CityPosition9Link", "Academy 7", "M-Corinth");
      addBuildingToQueue("js_CityPosition9Link", "Academy 7", "M-Corinth");

      expect(
        getTownQueue("M-Corinth").map((entry) => entry.buildingName),
      ).toEqual(["Academy 8", "Academy 9"]);
      expect(getTownQueue("W-Athens")).toEqual([]);
    },
  );
});

/* ─────────────────────── Checks on the saved queue ─────────────────────── */

function upgrade(slot: number, label: string): SavedUpgrade {
  return { positionId: `js_CityPosition${slot}Link`, buildingName: label };
}

function slotState(
  slot: number,
  name: string,
  level: number | null,
  upgrading = false,
): SlotState {
  return { positionId: `js_CityPosition${slot}Link`, name, level, upgrading };
}

/** Saved upgrades of Smalldevil's W-Athens. */
function saveWAthens(queue: SavedUpgrade[]): void {
  saveAutoBuild([
    { accountName: "Smalldevil", townList: [{ townName: "W-Athens", queue }] },
  ]);
}

function labels(queue: readonly SavedUpgrade[]): string[] {
  return queue.map((entry) => entry.buildingName);
}

describe("completedUpgrades", () => {
  const TAVERN_13_TO_16 = [
    upgrade(9, "Tavern 13"),
    upgrade(9, "Tavern 14"),
    upgrade(9, "Tavern 15"),
    upgrade(9, "Tavern 16"),
  ];

  it(
    "counts every level up to the one built as done: a tavern upgraded by " +
      "hand to 15 has its saved 13, 14 and 15 done, and 16 still to build",
    () => {
      expect(
        labels(
          completedUpgrades(TAVERN_13_TO_16, [slotState(9, "Tavern", 15)]),
        ),
      ).toEqual(["Tavern 13", "Tavern 14", "Tavern 15"]);
    },
  );

  it("at level 14, only 13 and 14 are done", () => {
    expect(
      labels(completedUpgrades(TAVERN_13_TO_16, [slotState(9, "Tavern", 14)])),
    ).toEqual(["Tavern 13", "Tavern 14"]);
  });

  it("below the first saved level, nothing is done", () => {
    expect(
      completedUpgrades(TAVERN_13_TO_16, [slotState(9, "Tavern", 12)]),
    ).toEqual([]);
  });

  it(
    "does not count a level still being built: at 14 going on 15, the " +
      "saved 15 stays until the game has finished it",
    () => {
      expect(
        labels(
          completedUpgrades(TAVERN_13_TO_16, [
            slotState(9, "Tavern", 14, true),
          ]),
        ),
      ).toEqual(["Tavern 13", "Tavern 14"]);
    },
  );

  it("keeps an upgrade whose slot was not read", () => {
    expect(
      completedUpgrades(TAVERN_13_TO_16, [slotState(8, "Tavern", 20)]),
    ).toEqual([]);
  });

  it(
    "keeps an upgrade whose slot now holds another building - the reading " +
      "may be another town's, or the building was replaced",
    () => {
      expect(
        completedUpgrades(TAVERN_13_TO_16, [slotState(9, "Warehouse", 20)]),
      ).toEqual([]);
    },
  );

  it(
    "keeps an upgrade copied from another computer's notepad, which has " +
      "no building name to check",
    () => {
      expect(
        completedUpgrades(
          [upgrade(9, "Position 9 13")],
          [slotState(9, "Tavern", 20)],
        ),
      ).toEqual([]);
    },
  );

  it("keeps an upgrade when the slot's level could not be read", () => {
    expect(
      completedUpgrades(TAVERN_13_TO_16, [slotState(9, "Tavern", null)]),
    ).toEqual([]);
  });

  it("keeps an upgrade whose label carries no level", () => {
    expect(
      completedUpgrades([upgrade(9, "Tavern")], [slotState(9, "Tavern", 20)]),
    ).toEqual([]);
  });

  it(
    "judges each slot by its own level: two warehouses, one at 20, one " +
      "at 10, and the saved 15 belongs to the one at 10",
    () => {
      expect(
        completedUpgrades(
          [upgrade(5, "Warehouse 15")],
          [slotState(4, "Warehouse", 20), slotState(5, "Warehouse", 10)],
        ),
      ).toEqual([]);
    },
  );

  it("reads names with spaces and levels in the hundreds", () => {
    expect(
      labels(
        completedUpgrades(
          [upgrade(0, "Town Hall 12"), upgrade(0, "Town Hall 100")],
          [slotState(0, "Town Hall", 12)],
        ),
      ),
    ).toEqual(["Town Hall 12"]);
  });
});

describe("nameNotepadCopies", () => {
  const placeholder = (slot: number, level: number) =>
    `Position ${slot} ${level}`;

  it("names a notepad copy after the building its slot holds", () => {
    const { queue, named } = nameNotepadCopies(
      [upgrade(9, "Position 9 13"), upgrade(4, "Warehouse 8")],
      [slotState(9, "Tavern", 12), slotState(4, "Warehouse", 7)],
      placeholder,
    );

    expect(labels(queue)).toEqual(["Tavern 13", "Warehouse 8"]);
    expect(labels(named)).toEqual(["Tavern 13"]);
  });

  it("leaves a copy whose slot was not read, or has no name", () => {
    const queue = [upgrade(9, "Position 9 13"), upgrade(4, "Position 4 8")];

    const result = nameNotepadCopies(
      queue,
      [slotState(4, "  ", 7)],
      placeholder,
    );

    expect(labels(result.queue)).toEqual(["Position 9 13", "Position 4 8"]);
    expect(result.named).toEqual([]);
  });

  it("never renames an entry that is not a copy of its own slot", () => {
    // "Position 4 8" saved under slot 9 is not slot 9's placeholder.
    const queue = [upgrade(9, "Position 4 8"), upgrade(9, "Tavern 13")];

    const result = nameNotepadCopies(
      queue,
      [slotState(9, "Tavern", 12)],
      placeholder,
    );

    expect(labels(result.queue)).toEqual(["Position 4 8", "Tavern 13"]);
    expect(result.named).toEqual([]);
  });
});

describe("splitRunnableTowns", () => {
  const towns = [{ townName: "W-Athens" }, { townName: "Gone" }];

  it("does not run a town the game's town list does not have", () => {
    expect(splitRunnableTowns(towns, ["W-Athens", "M-Corinth"])).toEqual({
      runnable: [{ townName: "W-Athens" }],
      notInDropdown: [{ townName: "Gone" }],
    });
  });

  it("matches names whatever the spaces around them", () => {
    expect(
      splitRunnableTowns([{ townName: " W-Athens " }], ["W-Athens"]).runnable,
    ).toEqual([{ townName: " W-Athens " }]);
  });

  it(
    "holds nothing back when the page has no town list at all - an " +
      "unloaded page is not a reason to stop building",
    () => {
      expect(splitRunnableTowns(towns, [])).toEqual({
        runnable: towns,
        notInDropdown: [],
      });
    },
  );
});

describe("the town's slots as Auto Build checks them", () => {
  function slotHtml(position: number, title: string, building = false): string {
    return (
      `<div id="position${position}" class="building${building ? " constructionSite" : ""}">` +
      `<a class="hoverable" id="js_CityPosition${position}Link" title="${title}"></a></div>`
    );
  }

  it("reads the city view: name, level built, and a level going up", () => {
    document.body.innerHTML =
      slotHtml(9, "Tavern (15)") +
      slotHtml(4, "Warehouse (7)", true) +
      slotHtml(3, "Museum (Under construction)", true);

    expect(readTownSlots()).toEqual([
      slotState(9, "Tavern", 15),
      slotState(4, "Warehouse", 7, true),
      slotState(3, "Museum", 0, true),
    ]);
  });

  it("reads the game's position array the same way", () => {
    expect(
      slotStatesFromPositions([
        { name: "Town Hall", level: 12, building: "townHall" },
        { buildingId: null, building: "buildingGround land" },
        { name: "Tavern", level: "15", isBusy: true, building: "tavern" },
      ]),
    ).toEqual([
      slotState(0, "Town Hall", 12),
      slotState(2, "Tavern", 15, true),
    ]);
  });

  it("removes the saved upgrades already reached, and only those", () => {
    saveWAthens([
      upgrade(9, "Tavern 14"),
      upgrade(4, "Warehouse 8"),
      upgrade(9, "Tavern 15"),
      upgrade(9, "Tavern 16"),
    ]);

    const removed = removeCompletedUpgrades("W-Athens", [
      slotState(9, "Tavern", 15),
      slotState(4, "Warehouse", 7),
    ]);

    expect(labels(removed)).toEqual(["Tavern 14", "Tavern 15"]);
    expect(labels(getTownQueue("W-Athens"))).toEqual([
      "Warehouse 8",
      "Tavern 16",
    ]);
  });

  it(
    "names the notepad's copies first, so a level already built comes off " +
      "and the rest keep the building's name",
    () => {
      saveWAthens([upgrade(9, "Position 9 15"), upgrade(9, "Position 9 16")]);

      const removed = removeCompletedUpgrades("W-Athens", [
        slotState(9, "Tavern", 15),
      ]);

      expect(labels(removed)).toEqual(["Tavern 15"]);
      expect(labels(getTownQueue("W-Athens"))).toEqual(["Tavern 16"]);
    },
  );

  it("saves a rename even when nothing is removed; a level being built is not done", () => {
    saveWAthens([upgrade(9, "Position 9 16")]);

    expect(
      removeCompletedUpgrades("W-Athens", [slotState(9, "Tavern", 15, true)]),
    ).toEqual([]);
    expect(labels(getTownQueue("W-Athens"))).toEqual(["Tavern 16"]);
  });

  it(
    "checks the town on screen only when the breadcrumb names it - " +
      "another town's tavern would otherwise clear this one's",
    () => {
      saveWAthens([upgrade(9, "Tavern 14")]);
      document.body.innerHTML =
        `<div id="js_cityBread">M-Corinth</div>` + slotHtml(9, "Tavern (20)");

      expect(pruneCompletedInCurrentTown("W-Athens")).toEqual([]);
      expect(labels(getTownQueue("W-Athens"))).toEqual(["Tavern 14"]);

      document.getElementById("js_cityBread")!.textContent = "W-Athens";
      expect(labels(pruneCompletedInCurrentTown("W-Athens"))).toEqual([
        "Tavern 14",
      ]);
      expect(getTownQueue("W-Athens")).toEqual([]);
    },
  );
});

describe("removeHighestLevel", () => {
  it(
    "takes off the highest saved level of that slot only: 26 27, and 26 " +
      "is left",
    () => {
      saveWAthens([
        upgrade(5, "Warehouse 26"),
        upgrade(6, "Warehouse 30"),
        upgrade(5, "Warehouse 27"),
      ]);

      removeHighestLevel("js_CityPosition5Link", "W-Athens");

      expect(labels(getTownQueue("W-Athens"))).toEqual([
        "Warehouse 26",
        "Warehouse 30",
      ]);
    },
  );

  it("takes off the highest even when it is not last in the list", () => {
    saveWAthens([upgrade(5, "Warehouse 27"), upgrade(5, "Warehouse 26")]);

    removeHighestLevel("js_CityPosition5Link", "W-Athens");

    expect(labels(getTownQueue("W-Athens"))).toEqual(["Warehouse 26"]);
  });

  it("changes nothing for a slot with nothing saved", () => {
    saveWAthens([upgrade(6, "Warehouse 30")]);

    removeHighestLevel("js_CityPosition5Link", "W-Athens");

    expect(labels(getTownQueue("W-Athens"))).toEqual(["Warehouse 30"]);
  });
});

describe("removeUpgradeAndLater", () => {
  it(
    "removing a level also removes the later levels of that building: " +
      "11 12 13 14, remove 13, and 11 12 are left",
    () => {
      saveWAthens([
        upgrade(9, "Tavern 11"),
        upgrade(4, "Warehouse 8"),
        upgrade(9, "Tavern 12"),
        upgrade(9, "Tavern 13"),
        upgrade(5, "Warehouse 13"),
        upgrade(9, "Tavern 14"),
      ]);

      removeUpgradeAndLater("js_CityPosition9Link", "Tavern 13", "W-Athens");

      expect(labels(getTownQueue("W-Athens"))).toEqual([
        "Tavern 11",
        "Warehouse 8",
        "Tavern 12",
        "Warehouse 13",
      ]);
    },
  );

  it("leaves another town's same slot alone", () => {
    saveAutoBuild([
      {
        accountName: "Smalldevil",
        townList: [
          { townName: "W-Athens", queue: [upgrade(9, "Tavern 13")] },
          { townName: "M-Corinth", queue: [upgrade(9, "Tavern 14")] },
        ],
      },
    ]);

    removeUpgradeAndLater("js_CityPosition9Link", "Tavern 13", "W-Athens");

    expect(getTownQueue("W-Athens")).toEqual([]);
    expect(labels(getTownQueue("M-Corinth"))).toEqual(["Tavern 14"]);
  });
});

describe("handleUpgradeBuilding and the saved levels already reached", () => {
  /** W-Athens' warehouse in slot 5 at level 25, ready to be upgraded. */
  function readyWarehouse(): { clicks: () => number } {
    document.body.innerHTML = townView(
      "W-Athens",
      "?action=UpgradeExistingBuilding&cityId=297034&position=5&level=25",
    );
    let clicks = 0;
    document
      .getElementById("js_buildingUpgradeButton")!
      .addEventListener("click", () => {
        clicks++;
        document.getElementById("position5")!.className =
          "position5 building constructionSite animated";
      });
    return { clicks: () => clicks };
  }

  async function runTask(buildingName: string) {
    const promise = handleUpgradeBuilding({
      id: "t1",
      type: "upgradeBuilding",
      data: {
        townName: "W-Athens",
        positionId: "js_CityPosition5Link",
        buildingName,
      },
    });
    await vi.advanceTimersByTimeAsync(20_000);
    return promise;
  }

  it(
    "does not upgrade a level the warehouse already has that came from the " +
      "notepad without a name: at 25, a copy of 25 comes off, nothing is clicked",
    async () => {
      const town = readyWarehouse();
      saveWAthens([upgrade(5, "Position 5 25")]);

      const result = await runTask("Position 5 25");

      expect(result.status).toBe("done");
      expect(claimUpgrade).not.toHaveBeenCalled();
      expect(town.clicks()).toBe(0);
      expect(getTownQueue("W-Athens")).toEqual([]);
    },
  );

  it(
    "skips the levels the warehouse already has and builds the next one " +
      "saved: at 25, saved 24 25 26 27, it claims and builds 26",
    async () => {
      const town = readyWarehouse();
      saveWAthens([
        upgrade(5, "Warehouse 24"),
        upgrade(5, "Warehouse 25"),
        upgrade(5, "Warehouse 26"),
        upgrade(5, "Warehouse 27"),
      ]);

      const result = await runTask("Warehouse 24");

      expect(result.status).toBe("done");
      expect(claimUpgrade).toHaveBeenCalledWith(
        "W-Athens",
        "js_CityPosition5Link",
        "Warehouse 26",
      );
      expect(town.clicks()).toBe(1);
      expect(labels(getTownQueue("W-Athens"))).toEqual(["Warehouse 27"]);
    },
  );

  it(
    "builds nothing when its own upgrade was removed in the dialog after " +
      "the lap was queued - the old code still claimed and built it",
    async () => {
      const town = readyWarehouse();
      // The lap was queued for 26; the player then removed 26, and 27 with it.
      saveWAthens([]);

      const result = await runTask("Warehouse 26");

      expect(result.status).toBe("done");
      expect(claimUpgrade).not.toHaveBeenCalled();
      expect(town.clicks()).toBe(0);
    },
  );

  it(
    "goes to the town's next saved upgrade when its own was removed in " +
      "the dialog",
    async () => {
      readyWarehouse();
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="position6" class="position6 building tavern level3">` +
          `<a class="hoverable" id="js_CityPosition6Link" title="Tavern (3)"></a></div>`,
      );
      saveWAthens([upgrade(6, "Tavern 4")]);

      await runTask("Warehouse 26");

      expect(claimUpgrade).toHaveBeenCalledWith(
        "W-Athens",
        "js_CityPosition6Link",
        "Tavern 4",
      );
    },
  );

  it("clicks nothing when every saved level is already reached", async () => {
    const town = readyWarehouse();
    saveWAthens([upgrade(5, "Warehouse 24"), upgrade(5, "Warehouse 25")]);

    const result = await runTask("Warehouse 24");

    expect(result.status).toBe("done");
    expect(claimUpgrade).not.toHaveBeenCalled();
    expect(town.clicks()).toBe(0);
    expect(getTownQueue("W-Athens")).toEqual([]);
  });

  it(
    "a finished upgrade removes its own level only, not the later ones " +
      "of the same building",
    async () => {
      readyWarehouse();
      saveWAthens([
        upgrade(5, "Warehouse 26"),
        upgrade(5, "Warehouse 27"),
        upgrade(5, "Warehouse 28"),
      ]);

      await runTask("Warehouse 26");

      expect(labels(getTownQueue("W-Athens"))).toEqual([
        "Warehouse 27",
        "Warehouse 28",
      ]);
    },
  );
});

describe("towns missing from the game's town list", () => {
  const DROPDOWN =
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    `<li selectvalue="297034" class="ownCity"><a title="W-Athens"> W-Athens</a></li>` +
    `</ul></div></div>`;

  function saveTowns(names: string[]): void {
    saveAutoBuild([
      {
        accountName: "Smalldevil",
        townList: names.map((townName) => ({
          townName,
          queue: [upgrade(5, "Warehouse 26")],
        })),
      },
    ]);
  }

  function queuedTownNames(): string[] {
    return getState()
      .queue.listOfType("upgradeBuilding")
      .map((task) => task.data.townName);
  }

  beforeEach(() => {
    getState().queue.removeType("upgradeBuilding");
  });

  it("queues no visit to a town the town list does not have, and keeps its saved upgrades", () => {
    document.body.innerHTML = DROPDOWN;
    saveTowns(["W-Athens", "Old Name"]);

    expect(enqueueAutoBuild()).toBe(1);
    expect(queuedTownNames()).toEqual(["W-Athens"]);
    expect(labels(getTownQueue("Old Name"))).toEqual(["Warehouse 26"]);
  });

  it(
    "does not count such a town as something left to build, so Build's " +
      "timer goes off when it is all that is left",
    () => {
      document.body.innerHTML = DROPDOWN;
      saveTowns(["Old Name"]);

      expect(hasConfiguredUpgrades()).toBe(false);
      expect(enqueueAutoBuild()).toBe(0);
    },
  );

  it(
    "with no town list on the page, queues every town and still counts " +
      "them, so an unloaded page does not switch Build's timer off",
    () => {
      document.body.innerHTML = "";
      saveTowns(["W-Athens", "Old Name"]);

      expect(hasConfiguredUpgrades()).toBe(true);
      expect(enqueueAutoBuild()).toBe(2);
    },
  );
});

describe("plannedLevels", () => {
  it(
    "gives each slot the highest level saved for it, by slot rather than " +
      "by name, so two warehouses do not share one plan",
    () => {
      saveAutoBuild([
        {
          accountName: "Smalldevil",
          townList: [
            {
              townName: "W-Athens",
              queue: [
                {
                  positionId: "js_CityPosition4Link",
                  buildingName: "Warehouse 21",
                },
                {
                  positionId: "js_CityPosition9Link",
                  buildingName: "Tavern 16",
                },
                {
                  positionId: "js_CityPosition4Link",
                  buildingName: "Warehouse 22",
                },
                {
                  positionId: "js_CityPosition9Link",
                  buildingName: "Tavern 17",
                },
              ],
            },
          ],
        },
      ]);

      expect(Object.fromEntries(plannedLevels("W-Athens"))).toEqual({
        js_CityPosition4Link: 22,
        js_CityPosition9Link: 17,
      });
      expect(plannedLevels("M-Corinth").size).toBe(0);
    },
  );
});

describe("building levels on the city view", () => {
  function slot(position: number, title: string, building = false): string {
    return (
      `<div id="position${position}" class="building${building ? " constructionSite" : ""}">` +
      `<a class="hoverable" id="js_CityPosition${position}Link" title="${title}"></a></div>`
    );
  }

  function labels(): (string | null)[] {
    return [...document.querySelectorAll("div[id^='position']")].map(
      (element) =>
        element.querySelector(`.${BUILDING_LEVEL_CLASS}`)?.textContent ?? null,
    );
  }

  // The file-level beforeEach installs fake timers; these tests wait on real
  // ones for the observer's batches.
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("labels each building with its level, and an upgrade with the level being built", () => {
    document.body.innerHTML =
      slot(1, "Warehouse (12)") +
      slot(2, "Academy (5)", true) +
      slot(3, "Tavern (Under construction)", true) +
      slot(4, "No brackets here");

    showBuildingLevels();
    expect(labels()).toEqual(["12", "5→6", "0→1", null]);
  });

  it("does not add a second label when it runs again", () => {
    document.body.innerHTML = slot(1, "Warehouse (12)");
    showBuildingLevels();
    showBuildingLevels();
    expect(document.querySelectorAll(`.${BUILDING_LEVEL_CLASS}`)).toHaveLength(
      1,
    );
  });

  it(
    "follows the game when an upgrade starts, and settles instead of " +
      "reacting to its own label forever",
    async () => {
      document.body.innerHTML = slot(1, "Warehouse (12)");
      const observer = startBuildingLevelObserver();
      let changes = 0;
      const watcher = new MutationObserver((records) => {
        changes += records.length;
      });
      try {
        expect(labels()).toEqual(["12"]);

        document.querySelector("#position1")!.classList.add("constructionSite");
        await vi.waitFor(() => expect(labels()).toEqual(["12→13"]));

        // Its own writes wake it once more; that pass finds nothing to change.
        watcher.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(changes).toBe(0);
      } finally {
        observer.disconnect();
        watcher.disconnect();
      }
    },
  );
});

describe("moveBuildingInQueue", () => {
  const WAREHOUSE_4 = {
    positionId: "js_CityPosition4Link",
    buildingName: "Warehouse 4",
  };
  const WAREHOUSE_5 = {
    positionId: "js_CityPosition4Link",
    buildingName: "Warehouse 5",
  };
  const PORT = {
    positionId: "js_CityPosition1Link",
    buildingName: "Trading Port 5",
  };
  const ACADEMY = {
    positionId: "js_CityPosition2Link",
    buildingName: "Academy 9",
  };

  function configure(queue: { positionId: string; buildingName: string }[]) {
    saveAutoBuild([
      {
        accountName: "Smalldevil",
        townList: [{ townName: "W-Athens", queue }],
      },
    ]);
  }

  function savedNames(): string[] {
    return getTownQueue("W-Athens").map((entry) => entry.buildingName);
  }

  it("moves an upgrade one place, past one other building only", () => {
    configure([WAREHOUSE_4, PORT, ACADEMY]);

    moveBuildingInQueue(
      ACADEMY.positionId,
      ACADEMY.buildingName,
      "W-Athens",
      "up",
    );
    expect(savedNames()).toEqual([
      "Warehouse 4",
      "Academy 9",
      "Trading Port 5",
    ]);

    moveBuildingInQueue(
      WAREHOUSE_4.positionId,
      WAREHOUSE_4.buildingName,
      "W-Athens",
      "down",
    );
    expect(savedNames()).toEqual([
      "Academy 9",
      "Warehouse 4",
      "Trading Port 5",
    ]);
  });

  it("does nothing past either end of the list", () => {
    configure([WAREHOUSE_4, PORT]);

    moveBuildingInQueue(
      WAREHOUSE_4.positionId,
      WAREHOUSE_4.buildingName,
      "W-Athens",
      "up",
    );
    moveBuildingInQueue(PORT.positionId, PORT.buildingName, "W-Athens", "down");

    expect(savedNames()).toEqual(["Warehouse 4", "Trading Port 5"]);
  });

  it(
    "leaves two entries of the same building as they are — renumbered after " +
      "a swap, their levels would come out exactly as before",
    () => {
      configure([WAREHOUSE_4, WAREHOUSE_5]);

      moveBuildingInQueue(
        WAREHOUSE_5.positionId,
        WAREHOUSE_5.buildingName,
        "W-Athens",
        "up",
      );

      expect(savedNames()).toEqual(["Warehouse 4", "Warehouse 5"]);
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
    showToast.mockClear();
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
    // Auto Wine's Start goes on only after a scan that ran.
    expect(await scanBuildings(undefined, () => true)).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("task queue is running"),
    );
    expect(document.querySelector("#js_cityBread")!.textContent).toBe(
      "W-Athens",
    );
  });

  it(
    "tells a caller that asks why it refused, and leaves the toast to it - " +
      "Crawl Wine showed the same words twice",
    async () => {
      const reasons: string[] = [];
      expect(
        await scanBuildings(
          undefined,
          () => true,
          (reason) => reasons.push(reason),
        ),
      ).toBe(false);
      document.body.innerHTML = "";
      expect(
        await scanBuildings(undefined, undefined, (reason) =>
          reasons.push(reason),
        ),
      ).toBe(false);

      expect(reasons).toHaveLength(2);
      expect(reasons[0]).toContain("task queue is running");
      expect(reasons[1]).toContain("No town list");
      expect(showToast).not.toHaveBeenCalled();
    },
  );

  it("says so when there is no town list to walk", async () => {
    document.body.innerHTML = "";
    await scanBuildings();
    expect(showToast).toHaveBeenCalledWith(
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

      const summary = String(showToast.mock.lastCall?.[0]);
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
    showToast.mockClear();
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
    Object.assign(window, {
      ikariam: {
        model: { actionRequest: "token", relatedCityData: related },
      },
    });
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
      vi.stubGlobal("fetch", fetchMock);

      // No clicking: the dropdown anchors carry no handlers in this fixture,
      // so the walking path could not have produced this result.
      expect(await scanBuildings()).toBe(true);

      expect(fetchMock).toHaveBeenCalledTimes(TOWN_IDS.length);
      expect(String(showToast.mock.lastCall?.[0])).toContain(
        "Sync finished: 2/2",
      );
    },
    20_000,
  );

  it("falls back to walking when the model is not readable", async () => {
    delete window.ikariam;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    try {
      const done = scanBuildings();
      await vi.advanceTimersByTimeAsync(120_000);
      await done;
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(String(showToast.mock.lastCall?.[0])).toContain("Scan finished");
  }, 30_000);
});
