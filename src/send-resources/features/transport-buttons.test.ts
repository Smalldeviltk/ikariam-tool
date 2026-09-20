import { beforeEach, describe, expect, it } from "vitest";
import { initState, FLAG, setFlag } from "../state";
import {
  addTransportButtons,
  alignRowToField,
  applyTransportStep,
  capacityOf,
  removeTransportButtons,
  startTransportButtonObserver,
  TRANSPORT_STYLE_ID,
} from "./transport-buttons";

/** The shipment form, copied from the live page. */
function shipmentForm(values: Partial<Record<string, string>> = {}): string {
  const field = (resource: string) =>
    `<li class="${resource}" title="Send along ${resource}:">` +
    `<label class="accesshint" for="textfield_${resource}"></label>` +
    `<div class="sliderinput">` +
    `<div class="sliderbg" title="0">` +
    `<div class="actualValue valuebg"></div><div class="sliderthumb"></div>` +
    `</div>` +
    `<a id="slider_${resource}_min" class="setMin" href="#reset"></a>` +
    `<a id="slider_${resource}_max" class="setMax" href="#max"></a>` +
    `<input class="textfield" id="textfield_${resource}" type="text" ` +
    `name="cargo_${resource}" value="${values[resource] ?? "0"}" size="4"/>` +
    `</div></li>`;
  return (
    `<div id="container"><div id="transportGoods"><ul class="resourceAssign">` +
    ["wood", "wine", "marble", "glass", "sulfur"].map(field).join("") +
    `</ul></div><input id="submit"/></div>`
  );
}

beforeEach(() => {
  localStorage.clear();
  initState("tester");
  document.body.innerHTML = `<div id="container"></div>`;
  document.head.innerHTML = "";
});

describe("capacityOf", () => {
  it("falls back to the game's base figures before any calibration", () => {
    expect(capacityOf("merchant")).toBe(500);
    expect(capacityOf("freighter")).toBe(50_000);
  });

  it(
    "uses the measured capacity once Calibrate Cargo has run — 620 and 53,000 " +
      "were the figures the live game reported through `transportConfig`",
    () => {
      setFlag(FLAG.perShipCapacity, 620);
      setFlag(FLAG.freighterCapacity, 53_000);

      expect(capacityOf("merchant")).toBe(620);
      expect(capacityOf("freighter")).toBe(53_000);
    },
  );
});

describe("addTransportButtons", () => {
  it("adds a row beside every resource field", () => {
    document.body.innerHTML = shipmentForm();

    expect(addTransportButtons()).toBe(true);
    expect(document.querySelectorAll(".ika-transport-buttons")).toHaveLength(5);
  });

  it("adds them once, however many times it runs", () => {
    document.body.innerHTML = shipmentForm();

    addTransportButtons();
    addTransportButtons();
    addTransportButtons();

    expect(document.querySelectorAll(".ika-transport-buttons")).toHaveLength(5);
  });

  it("does nothing on a page with no shipment form", () => {
    expect(addTransportButtons()).toBe(false);
    expect(document.querySelectorAll(".ika-transport-buttons")).toHaveLength(0);
  });

  it(
    "labels the steps with the MEASURED cargo, not a hard-coded 500 — at 620 " +
      "per ship a 500 button fills no whole number of ships at all",
    () => {
      setFlag(FLAG.perShipCapacity, 620);
      setFlag(FLAG.freighterCapacity, 53_000);
      document.body.innerHTML = shipmentForm();
      addTransportButtons();

      const labels = [
        ...document.querySelectorAll(".ika-transport-buttons")[0].children,
      ].map((el) => el.textContent);

      expect(labels).toEqual([
        "-620",
        "+620",
        "+3,100",
        "+6,200",
        "+53,000",
        "0",
      ]);
    },
  );

  it("says what each button means, in ships", () => {
    document.body.innerHTML = shipmentForm();
    addTransportButtons();

    const titles = [
      ...document.querySelectorAll(".ika-transport-buttons")[0].children,
    ].map((el) => el.getAttribute("title"));

    expect(titles).toEqual([
      "Remove 1 merchant ship",
      "Add 1 merchant ship",
      "Add 5 merchant ships",
      "Add 10 merchant ships",
      "Add 1 freighter",
      "Clear",
    ]);
  });

  it(
    "puts the row after the slider, as the last child of the resource row — " +
      "inside `.sliderinput` it wraps past the row's height and the next " +
      "resource's slider paints over it",
    () => {
      document.body.innerHTML = shipmentForm();
      addTransportButtons();

      const row = document.querySelector(".ika-transport-buttons")!;
      expect(row.parentElement!.tagName).toBe("LI");
      expect(row.previousElementSibling!.className).toBe("sliderinput");
    },
  );

  it("falls back to the field's own box on a form without the list markup", () => {
    document.body.innerHTML =
      `<div id="container"><div class="resource-row">` +
      `<input id="textfield_wine" value="0"/></div></div>`;

    expect(addTransportButtons()).toBe(true);
    expect(
      document.querySelector(".ika-transport-buttons")!.parentElement!.className,
    ).toBe("resource-row");
  });

  it("installs its stylesheet once, however many rows it draws", () => {
    document.body.innerHTML = shipmentForm();
    addTransportButtons();
    addTransportButtons();

    expect(document.querySelectorAll(`#${TRANSPORT_STYLE_ID}`)).toHaveLength(1);
  });

  it("does not add a stylesheet to a page with no form to style", () => {
    addTransportButtons();
    expect(document.getElementById(TRANSPORT_STYLE_ID)).toBeNull();
  });

  it("removes them again", () => {
    document.body.innerHTML = shipmentForm();
    addTransportButtons();
    removeTransportButtons();
    expect(document.querySelectorAll(".ika-transport-buttons")).toHaveLength(0);
  });
});

describe("applyTransportStep", () => {
  const wineField = () =>
    document.querySelector<HTMLInputElement>("#textfield_wine")!;

  beforeEach(() => {
    document.body.innerHTML = shipmentForm({ wine: "1000" });
  });

  it("adds whole ships to what is already there", () => {
    setFlag(FLAG.perShipCapacity, 620);
    applyTransportStep("wine", 5);
    expect(wineField().value).toBe(String(1000 + 5 * 620));
  });

  it("subtracts a ship", () => {
    setFlag(FLAG.perShipCapacity, 620);
    applyTransportStep("wine", -1);
    expect(wineField().value).toBe("380");
  });

  it("uses the freighter capacity when asked for one", () => {
    setFlag(FLAG.freighterCapacity, 53_000);
    applyTransportStep("wine", 1, "freighter");
    expect(wineField().value).toBe("54000");
  });

  it(
    "reads the capacity when pressed, not when drawn — recalibrating takes " +
      "effect without rebuilding the buttons",
    () => {
      setFlag(FLAG.perShipCapacity, 500);
      applyTransportStep("wine", 1);
      expect(wineField().value).toBe("1500");

      setFlag(FLAG.perShipCapacity, 620);
      applyTransportStep("wine", 1);
      expect(wineField().value).toBe("2120");
    },
  );

  it(
    "clamps at zero — the game refuses a negative amount and then declines to " +
      "submit the whole form, with nothing on screen to say why",
    () => {
      applyTransportStep("wine", -100);
      expect(wineField().value).toBe("0");
    },
  );

  it("clears when asked to set rather than add", () => {
    applyTransportStep("wine", 0, "merchant", true);
    expect(wineField().value).toBe("0");
  });

  it("reads a value the game has formatted with separators", () => {
    setFlag(FLAG.perShipCapacity, 500);
    wineField().value = "12,500";
    applyTransportStep("wine", 1);
    expect(wineField().value).toBe("13000");
  });

  it(
    "fires the events the game listens to — a bare `.value =` leaves the ship " +
      "count and mission summary showing the previous convoy",
    () => {
      const seen: string[] = [];
      for (const type of ["input", "change", "blur"]) {
        wineField().addEventListener(type, () => seen.push(type));
      }

      applyTransportStep("wine", 1);

      expect(seen).toEqual(["input", "change", "blur"]);
    },
  );

  it("ignores a resource the form is not showing", () => {
    expect(() => applyTransportStep("ambrosia", 1)).not.toThrow();
  });
});

describe("the observer", () => {
  it("adds the buttons when the game injects the form later", async () => {
    const observer = startTransportButtonObserver();
    expect(document.querySelectorAll(".ika-transport-buttons")).toHaveLength(0);

    document.querySelector("#container")!.innerHTML =
      `<div id="transportGoods"><ul class="resourceAssign"><li class="wine">` +
      `<div class="sliderinput"><input id="textfield_wine" value="0"/></div>` +
      `</li></ul></div>`;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelectorAll(".ika-transport-buttons")).toHaveLength(1);
    observer?.disconnect();
  });

  it("catches a form that is already on screen when it starts", () => {
    document.body.innerHTML = shipmentForm();
    const observer = startTransportButtonObserver();

    expect(document.querySelectorAll(".ika-transport-buttons")).toHaveLength(5);
    observer?.disconnect();
  });

  it("does not attach to a page without the game's container", () => {
    document.body.innerHTML = "";
    expect(startTransportButtonObserver()).toBeNull();
  });
});

describe("alignRowToField", () => {
  /** happy-dom has no layout engine, so the rectangles are supplied. */
  function stubRight(element: Element, right: number): void {
    element.getBoundingClientRect = () =>
      ({ right, left: 0, width: right, height: 0 }) as DOMRect;
  }

  function setUp(): { field: Element; li: Element; row: HTMLElement } {
    document.body.innerHTML = shipmentForm();
    addTransportButtons();
    const field = document.querySelector("#textfield_wood")!;
    const li = field.closest("li")!;
    return {
      field,
      li,
      row: li.querySelector<HTMLElement>(".ika-transport-buttons")!,
    };
  }

  it("pads the row so the group's right edge meets the field's", () => {
    const { field, li, row } = setUp();
    stubRight(li, 600);
    stubRight(field, 540);

    alignRowToField(field, row);

    expect(row.style.paddingRight).toBe("60px");
  });

  it(
    "leaves the row alone when the form has no layout yet — the transport box " +
      "is built before it is shown",
    () => {
      const { field, row } = setUp();

      alignRowToField(field, row);

      expect(row.style.paddingRight).toBe("");
    },
  );

  it("leaves it alone when the field already reaches the edge", () => {
    const { field, li, row } = setUp();
    stubRight(li, 600);
    stubRight(field, 600);

    alignRowToField(field, row);

    expect(row.style.paddingRight).toBe("");
  });
});
