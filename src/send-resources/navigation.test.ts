import { beforeEach, describe, expect, it } from "vitest";
import {
  adjustDestinationIndex,
  getTownCount,
  getTownList,
  getTownNameFromList,
  getTownNumberByName,
  gotoTown,
  openPort,
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

describe("adjustDestinationIndex", () => {
  // The port's town list omits the town you are standing in, so every index
  // above the source shifts down by one.
  it("shifts destinations above the source down by one", () => {
    expect(adjustDestinationIndex(5, 2)).toBe(4);
  });

  it("leaves destinations below the source untouched", () => {
    expect(adjustDestinationIndex(1, 3)).toBe(1);
  });

  it("leaves an equal index untouched", () => {
    expect(adjustDestinationIndex(2, 2)).toBe(2);
  });

  it("accepts string indices, as the stored queue supplies them", () => {
    expect(adjustDestinationIndex("5", "2")).toBe(4);
  });
});

describe("openPort", () => {
  const slots = (c1: string, c2: string) =>
    `<div id="position1" class="${c1}"></div><a id="js_CityPosition1Link"></a>
     <div id="position2" class="${c2}"></div><a id="js_CityPosition2Link"></a>`;

  it("prefers a finished port in slot 1", () => {
    document.body.innerHTML = slots("building port", "building port");
    let clicked = "";
    document.getElementById("js_CityPosition1Link")!.onclick = () =>
      void (clicked = "1");
    expect(openPort()).toBe(true);
    expect(clicked).toBe("1");
  });

  it("falls through to slot 2", () => {
    document.body.innerHTML = slots("building barracks", "building port");
    let clicked = "";
    document.getElementById("js_CityPosition2Link")!.onclick = () =>
      void (clicked = "2");
    expect(openPort()).toBe(true);
    expect(clicked).toBe("2");
  });

  it("accepts a port under construction by default", () => {
    document.body.innerHTML = slots("building constructionSite", "building x");
    expect(openPort()).toBe(true);
  });

  it("rejects a port under construction when asked to (Auto Wine)", () => {
    document.body.innerHTML = slots("building constructionSite", "building x");
    expect(openPort(false)).toBe(false);
  });

  it("returns false when the town has no port at all", () => {
    document.body.innerHTML = slots("building barracks", "building academy");
    expect(openPort()).toBe(false);
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

  it("prefers the Empire Overview board when it is present", async () => {
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
