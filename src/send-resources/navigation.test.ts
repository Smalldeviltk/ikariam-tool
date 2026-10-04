import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backToCity,
  closeGamePopup,
  getTownCount,
  getTownList,
  getTownNameFromList,
  getTownNumberByName,
  gotoTown,
  openShipmentForm,
  townHasPort,
} from "./navigation";

/**
 * Town dropdown markup, copied from a live page (tools/output/output1.json):
 *
 *   <li selectvalue="78038" class="ownCity first-child">
 *     <a title="W-Athens"> W-Athens</a>
 *   </li>
 *
 * Two details that matter and are reproduced here:
 *  - the anchor's text has a LEADING SPACE, while `title` is clean;
 *  - there is NO whitespace between the `<li>`s. `getTownList` walks
 *    `childNodes` (as the original did), which counts text nodes too, so
 *    indentation between items would shift every town index.
 */
function townDropdown(names: string[]): string {
  const items = names
    .map(
      (n, i) =>
        `<li selectvalue="${78038 + i}" class="ownCity"><a title="${n}"> ${n}</a></li>`,
    )
    .join("");
  return `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>${items}</ul></div></div>`;
}

const TOWNS = ["3-Athens", "1-Sparta", "2-Corinth"];

beforeEach(() => {
  document.body.innerHTML = townDropdown(TOWNS);
  sessionStorage.clear();
});

describe("town list", () => {
  it("counts towns", () => {
    expect(getTownCount()).toBe(3);
  });

  it("maps a dropdown index to a name", () => {
    expect(getTownNameFromList(0)).toBe("3-Athens");
    expect(getTownNameFromList("2")).toBe("2-Corinth");
  });

  it("strips the leading space the game puts inside the anchor", () => {
    // Live markup is `<a title="W-Athens"> W-Athens</a>`. `getTownList` used to
    // keep that raw innerHTML while `getTownNameFromList` trimmed it, so the
    // same town had two spellings depending on which function you asked.
    expect(getTownNameFromList(0)).toBe("3-Athens");
    expect(getTownList().map((t) => t.townName)).not.toContain(" 3-Athens");
    expect(getTownList().every((t) => t.townName === t.townName.trim())).toBe(
      true,
    );
  });

  it("returns an empty string for an out-of-range index", () => {
    expect(getTownNameFromList(99)).toBe("");
  });

  it("sorts by the ordinal prefix but keeps the original dropdown index", () => {
    // Sorting is display-only: `townNumber` must stay the navigation index.
    expect(getTownList().map((t) => t.townName)).toEqual([
      "1-Sparta",
      "2-Corinth",
      "3-Athens",
    ]);
    expect(getTownList().map((t) => t.townNumber)).toEqual([1, 2, 0]);
  });

  it("looks a town number up by name", () => {
    expect(getTownNumberByName("2-Corinth")).toBe(2);
    expect(getTownNumberByName("nope")).toBeNull();
  });

  it("reports no towns when the dropdown is absent", () => {
    document.body.innerHTML = "";
    expect(getTownCount()).toBe(0);
    expect(getTownList()).toEqual([]);
  });

  it(
    "REGRESSION: sorts letter-prefixed towns alphabetically instead of " +
      "silently not sorting at all",
    () => {
      // Real town names from a live account (tools/output/output1.json). The
      // prefix is a letter for the traded resource, not a number — so the
      // original's `Number(prefix)` was NaN for every town and its comparator
      // returned 0 for every pair, making the sort a no-op.
      const real = [
        "W-Athens",
        "M-Corinth",
        "M-Aegina",
        "M-Rhodes",
        "C-Thebes",
        "S-Sparta",
        "M-Syracuse",
        "M-Argos",
        "M-Eretria",
      ];
      document.body.innerHTML = townDropdown(real);

      expect(getTownList().map((t) => t.townName)).toEqual([
        "C-Thebes",
        "M-Aegina",
        "M-Argos",
        "M-Corinth",
        "M-Eretria",
        "M-Rhodes",
        "M-Syracuse",
        "S-Sparta",
        "W-Athens",
      ]);
    },
  );

  it("keeps townNumber as the dropdown position after any sort", () => {
    const real = ["W-Athens", "C-Thebes"];
    document.body.innerHTML = townDropdown(real);
    const sorted = getTownList();
    // Display order flipped, but navigation indices must not move.
    expect(sorted[0].townName).toBe("C-Thebes");
    expect(sorted[0].townNumber).toBe(1);
    expect(getTownNameFromList(sorted[0].townNumber)).toBe("C-Thebes");
  });

  it("puts numbered towns before unnumbered ones when both are present", () => {
    document.body.innerHTML = townDropdown(["W-Athens", "2-Delos", "1-Naxos"]);
    expect(getTownList().map((t) => t.townName)).toEqual([
      "1-Naxos",
      "2-Delos",
      "W-Athens",
    ]);
  });
});

describe("townHasPort", () => {
  const slots = (c1: string, c2: string) =>
    `<div id="position1" class="${c1}"></div><a id="js_CityPosition1Link"></a>
     <div id="position2" class="${c2}"></div><a id="js_CityPosition2Link"></a>`;

  it("finds a port in either sea slot, without clicking it", () => {
    let clicked = false;
    for (const [c1, c2] of [
      ["building port", "building x"],
      ["building barracks", "building port"],
    ]) {
      document.body.innerHTML = slots(c1, c2);
      for (const link of document.querySelectorAll("a")) {
        (link as HTMLElement).onclick = () => void (clicked = true);
      }
      expect(townHasPort()).toBe(true);
    }
    expect(clicked).toBe(false);
  });

  it("accepts a port under construction, as the original did", () => {
    document.body.innerHTML = slots("building constructionSite", "building x");
    expect(townHasPort()).toBe(true);
  });

  it("is false when the town has no port at all", () => {
    document.body.innerHTML = slots("building barracks", "building academy");
    expect(townHasPort()).toBe(false);
  });
});

describe("openShipmentForm", () => {
  /**
   * The game's `ajaxHandlerCall`: records the URL, and draws the shipment
   * form for `formFor` — the town the URL asks for, unless told otherwise.
   */
  function installAjax(formFor?: (requested: string) => string) {
    const calls: string[] = [];
    Object.assign(window, {
      ajaxHandlerCall: (url: string) => {
        calls.push(url);
        const requested =
          new URLSearchParams(url.split("?")[1]).get("destinationCityId") ?? "";
        const shown = formFor ? formFor(requested) : requested;
        document.body.insertAdjacentHTML(
          "beforeend",
          `<form id="transportForm"><input type="hidden" name="destinationCityId" value="${shown}"></form>`,
        );
      },
    });
    return calls;
  }

  afterEach(() => {
    delete (window as { ajaxHandlerCall?: unknown }).ajaxHandlerCall;
    vi.useRealTimers();
  });

  it(
    "asks the game for the transport view of the destination's city id — " +
      'the call behind the transport panel\'s "Transport goods" link',
    async () => {
      const calls = installAjax();

      await openShipmentForm(2);

      expect(calls).toEqual(["?view=transport&destinationCityId=78040"]);
    },
  );

  it("does not settle for a form opened for another town", async () => {
    vi.useFakeTimers();
    installAjax(() => "78038");

    const opening = openShipmentForm(2);
    const failed = expect(opening).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(16_000);
    await failed;
  });

  it("throws, sending nothing, when the page has no ajaxHandlerCall", async () => {
    await expect(openShipmentForm(2)).rejects.toThrow(/ajaxHandlerCall/);
  });

  it("throws when the dropdown entry has no city id", async () => {
    const calls = installAjax();
    document.querySelectorAll("li")[2].removeAttribute("selectvalue");

    await expect(openShipmentForm(2)).rejects.toThrow(/No city id/);
    expect(calls).toEqual([]);
  });
});

describe("gotoTown town switching", () => {
  it(
    "REGRESSION: falls back to the game's own dropdown when the Empire " +
      "Overview board is absent",
    async () => {
      // `#BuildTab` belongs to the Empire Overview userscript, not the game. A
      // live capture with only the game running matched it zero times, so
      // without this fallback Send Resources could never change town on its own.
      document.body.innerHTML =
        townDropdown(["W-Athens", "C-Thebes"]) +
        `<div id="js_cityBread">W-Athens</div>`;

      let clickedTitle = "";
      document
        .querySelectorAll("#dropDown_js_citySelectContainer a")
        .forEach((a) =>
          a.addEventListener("click", () => {
            clickedTitle = a.getAttribute("title") ?? "";
            // Simulate the game swapping the breadcrumb.
            document.getElementById("js_cityBread")!.textContent = clickedTitle;
          }),
        );

      await gotoTown(1);
      expect(clickedTitle).toBe("C-Thebes");
    },
  );

  it("uses the Empire Overview board when the game's form is not there", async () => {
    document.body.innerHTML =
      townDropdown(["W-Athens", "C-Thebes"]) +
      `<div id="js_cityBread">W-Athens</div>` +
      `<div id="BuildTab"><div class="city_name">` +
      `<span class="clickable">C-Thebes</span></div></div>`;

    let via = "";
    document
      .querySelector("#BuildTab span.clickable")!
      .addEventListener("click", () => {
        via = "board";
        document.getElementById("js_cityBread")!.textContent = "C-Thebes";
      });
    document
      .querySelectorAll("#dropDown_js_citySelectContainer a")
      .forEach((a) =>
        a.addEventListener("click", () => void (via = "dropdown")),
      );

    await gotoTown(1);
    expect(via).toBe("board");
  });

  it("returns immediately when already in the target town", async () => {
    document.body.innerHTML =
      townDropdown(["W-Athens"]) + `<div id="js_cityBread">W-Athens</div>`;
    await expect(gotoTown(0)).resolves.toBeUndefined();
  });

  it("throws for an index with no town", async () => {
    document.body.innerHTML = townDropdown(["W-Athens"]);
    await expect(gotoTown(9)).rejects.toThrow(/No town at dropdown index/);
  });
});

describe("a dropdown that shows coordinates", () => {
  /**
   * Live markup from an account with the game's "show coordinates" option on
   * (pasted from the console, 26/09). The `title` carries the coordinates and
   * two spaces; the breadcrumb, and the name Auto Build stores, do not.
   */
  const COORDS_DROPDOWN =
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    `<li selectvalue="297124" class="ownCity coords first-child"><a title="[41:98]  W-Clone1"> [41:98]  W-Clone1</a></li>` +
    `<li selectvalue="297155" class="ownCity coords"><a title="[42:96]  M-Clone1"> [42:96]  M-Clone1</a></li>` +
    `<li selectvalue="297348" class="ownCity coords last-child"><a title="[42:97]  S-Clone1"> [42:97]  S-Clone1</a></li>` +
    `</ul></div></div>`;

  const MODEL_TOWNS: Record<string, string> = {
    "297124": "W-Clone1",
    "297155": "M-Clone1",
    "297348": "S-Clone1",
  };

  function installModel(selectedId: string) {
    const related: Record<string, unknown> = {
      selectedCity: `city_${selectedId}`,
    };
    for (const [id, name] of Object.entries(MODEL_TOWNS)) {
      related[`city_${id}`] = {
        id,
        name,
        coords: "[42:97]",
        relationship: "ownCity",
      };
    }
    Object.assign(window, { ikariam: { model: { relatedCityData: related } } });
  }

  afterEach(() => {
    Reflect.deleteProperty(window, "ikariam");
    Reflect.deleteProperty(window, "ajaxHandlerCallFromForm");
  });

  it(
    "REGRESSION: finds a town by the name the breadcrumb shows, not the " +
      "dropdown's title",
    () => {
      // Every Auto Build task on this account failed with `Town "S-Clone1"
      // not found`: the name came from the breadcrumb, the lookup compared it
      // with `"[42:97]  S-Clone1"`.
      document.body.innerHTML = COORDS_DROPDOWN;
      installModel("297124");

      expect(getTownNameFromList(2)).toBe("S-Clone1");
      expect(getTownNumberByName("S-Clone1")).toBe(2);
    },
  );

  it("REGRESSION: switches town through the game's own form and sees it land", async () => {
    // Clicking a dropdown `<a>` does not change town (measured, 25/09), and
    // the breadcrumb never shows the coordinates the old target carried.
    document.body.innerHTML =
      COORDS_DROPDOWN +
      `<span id="js_cityBread">W-Clone1</span>` +
      `<form id="changeCityForm"><input id="js_cityIdOnChange" name="cityId"></form>`;
    installModel("297124");

    const submitted: string[] = [];
    Object.assign(window, {
      ajaxHandlerCallFromForm: (form: HTMLFormElement) => {
        const cityId =
          form.querySelector<HTMLInputElement>("#js_cityIdOnChange")!.value;
        submitted.push(cityId);
        // What the game does with the response.
        document.getElementById("js_cityBread")!.textContent =
          MODEL_TOWNS[cityId];
      },
    });

    await gotoTown(2);
    expect(submitted).toEqual(["297348"]);
  });

  /** The page with the form and the board, the form landing in the target. */
  function installFormAndBoard(): {
    submitted: string[];
    boardClicks: () => number;
  } {
    document.body.innerHTML =
      COORDS_DROPDOWN +
      `<span id="js_cityBread">W-Clone1</span>` +
      `<form id="changeCityForm"><input id="js_cityIdOnChange" name="cityId"></form>` +
      `<div id="BuildTab"><div class="city_name">` +
      `<span class="clickable">S-Clone1</span></div></div>`;
    installModel("297124");

    const submitted: string[] = [];
    Object.assign(window, {
      ajaxHandlerCallFromForm: (form: HTMLFormElement) => {
        const cityId =
          form.querySelector<HTMLInputElement>("#js_cityIdOnChange")!.value;
        submitted.push(cityId);
        document.getElementById("js_cityBread")!.textContent =
          MODEL_TOWNS[cityId];
      },
    });
    let clicks = 0;
    document
      .querySelector("#BuildTab span.clickable")!
      .addEventListener("click", () => void clicks++);
    return { submitted, boardClicks: () => clicks };
  }

  /** What the page before the reload left behind: a switch sent `ago` ms back. */
  function switchSentBeforeTheReload(target: string, ago: number): void {
    sessionStorage.setItem(
      "ika_pendingTownSwitch",
      JSON.stringify({ target, sentAt: Date.now() - ago }),
    );
  }

  it(
    "switches through the game's own form before the board — measured 02/10, " +
      "the form lands; the reload loop it was blamed for was the coordinates",
    async () => {
      const page = installFormAndBoard();

      await gotoTown(2);

      expect(page.submitted).toEqual(["297348"]);
      expect(page.boardClicks()).toBe(0);
      expect(sessionStorage.getItem("ika_pendingTownSwitch")).toBeNull();
    },
  );

  it(
    "REGRESSION: does not send a switch again when the reload it caused " +
      "landed in another town — every load would send it, and reload, again",
    async () => {
      const page = installFormAndBoard();
      switchSentBeforeTheReload("S-Clone1", 1_000);

      await expect(gotoTown(2)).rejects.toThrow(/did not land/);
      expect(page.submitted).toEqual([]);
    },
  );

  it(
    "REGRESSION: says the same thing however long ago the switch was sent — " +
      "the seconds were in the message, so the bug reporter, which groups " +
      "repeats by message, filed a new record every second",
    async () => {
      installFormAndBoard();
      const messageAfter = async (ago: number) => {
        switchSentBeforeTheReload("S-Clone1", ago);
        return gotoTown(2).then(
          () => "",
          (e: Error) => e.message,
        );
      };

      const early = await messageAfter(2_000);
      const later = await messageAfter(17_000);

      expect(early).toMatch(/did not land/);
      expect(later).toBe(early);
    },
  );

  it("sends it again once the last attempt is long past", async () => {
    const page = installFormAndBoard();
    switchSentBeforeTheReload("S-Clone1", 31_000);

    await gotoTown(2);

    expect(page.submitted).toEqual(["297348"]);
  });

  it("forgets the switch once the reload brought the page to the town", async () => {
    installFormAndBoard();
    document.getElementById("js_cityBread")!.textContent = "S-Clone1";
    switchSentBeforeTheReload("S-Clone1", 1_000);

    await gotoTown(2);

    expect(sessionStorage.getItem("ika_pendingTownSwitch")).toBeNull();
  });
});

describe("backToCity", () => {
  afterEach(() => vi.restoreAllMocks());

  it(
    "logs who sent the page back to the town view — the reload loops of " +
      "26/09 could not be told apart without it",
    () => {
      document.body.innerHTML = `<div id="js_cityLink"><a href="#"></a></div>`;
      let clicked = false;
      document
        .querySelector("#js_cityLink > a")!
        .addEventListener("click", (event) => {
          event.preventDefault();
          clicked = true;
        });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      backToCity("keep-alive (even minute)");

      expect(clicked).toBe(true);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          "Back to the town view: keep-alive (even minute)",
        ),
      );
    },
  );

  it("logs nothing when there is no town link to click", () => {
    document.body.innerHTML = "";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    backToCity("keep-alive (even minute)");

    expect(log).not.toHaveBeenCalled();
  });
});

describe("closeGamePopup", () => {
  /**
   * The game's transport panel, from a live page (26/09). It sits in every
   * page hidden, ahead of any popup, and its `.close` is the first in the
   * document. Measured: clicking it SHOWS the panel.
   */
  const HIDDEN_TRANSPORT_PANEL =
    `<div id="js_transportPanel" class="transportPanel variableMainBox" style="display: none;">` +
    `<div class="transportPanel_header variableMainHeader">Transport <div class="close"></div></div>` +
    `<div class="variableMainContent"></div></div>`;

  it(
    "REGRESSION: leaves the hidden transport panel alone — clicking the " +
      "first .close in the page opened it on every Auto Build task",
    () => {
      document.body.innerHTML =
        HIDDEN_TRANSPORT_PANEL +
        `<div id="buildingPopup"><div class="close"></div></div>`;
      const clicked: string[] = [];
      document
        .querySelectorAll(".close")
        .forEach((button) =>
          button.addEventListener("click", () =>
            clicked.push(button.parentElement!.id || "transportPanel"),
          ),
        );

      closeGamePopup();
      expect(clicked).toEqual(["buildingPopup"]);
    },
  );

  it("clicks nothing when no close button is on screen", () => {
    document.body.innerHTML = HIDDEN_TRANSPORT_PANEL;
    let clicks = 0;
    document
      .querySelector(".close")!
      .addEventListener("click", () => void clicks++);

    closeGamePopup();
    expect(clicks).toBe(0);
  });
});
