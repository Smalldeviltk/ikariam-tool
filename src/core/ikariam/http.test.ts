import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionRequestToken,
  clearResponseHandlers,
  fetchTown,
  findUpgradeLink,
  ikariamRequest,
  onResponse,
  quickUpgradeTraces,
  resetHttpState,
  responseFeedback,
  SUCCESS_FEEDBACK_TYPE,
  upgradeBuildingNow,
} from "./http";

/**
 * A response shaped like the one the live probe returned, trimmed to the parts
 * this module cares about. See `docs/improvement-plan.md` §1 for the capture.
 */
const TOWN_RESPONSE = [
  [
    "updateGlobalData",
    {
      actionRequest: "token-from-response",
      headerData: {},
      backgroundData: { id: 297042, position: [] },
    },
  ],
  ["changeView", ["city", "<div></div>"]],
  ["updateBacklink", { link: "?view=city", title: "" }],
];

function mockFetch(
  body: unknown,
  init: { status?: number; contentType?: string } = {},
) {
  // Typed parameters so the assertions below can read back the url and init.
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: { get: () => init.contentType ?? "text/html; charset=UTF-8" },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }));
  (globalThis as any).fetch = fn;
  return fn;
}

beforeEach(() => {
  resetHttpState();
  clearResponseHandlers();
  (window as any).ikariam = { model: { actionRequest: "token-from-model" } };
});

afterEach(() => {
  delete (window as any).ikariam;
});

describe("ikariamRequest", () => {
  it("sends the token and the ajax flag the game requires", async () => {
    const fetchMock = mockFetch(TOWN_RESPONSE);
    await ikariamRequest({ view: "townHall", cityId: 297042 });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("view=townHall");
    expect(url).toContain("cityId=297042");
    expect(url).toContain("actionRequest=token-from-model");
    expect(url).toContain("ajax=1");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("same-origin");
  });

  it(
    "accepts the body as JSON even though the game answers text/html — " +
      "measured on the live game, so gating on Content-Type would reject " +
      "every response",
    async () => {
      mockFetch(TOWN_RESPONSE, { contentType: "text/html; charset=UTF-8" });
      await expect(ikariamRequest({ view: "townHall" })).resolves.toHaveLength(
        3,
      );
    },
  );

  it("refuses to send anything when the game has not loaded", async () => {
    delete (window as any).ikariam;
    const fetchMock = mockFetch(TOWN_RESPONSE);

    await expect(ikariamRequest({ view: "townHall" })).rejects.toThrow(
      /No actionRequest/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an HTTP failure rather than parsing the error page", async () => {
    mockFetch("<html>Gateway timeout</html>", { status: 504 });
    await expect(ikariamRequest({ view: "townHall" })).rejects.toThrow(
      /HTTP 504/,
    );
  });

  it("says what happened when the session has expired into a login page", async () => {
    mockFetch("<!doctype html><html>login</html>");
    await expect(ikariamRequest({ view: "townHall" })).rejects.toThrow(
      /not JSON/,
    );
  });

  it("rejects JSON that is not a response array", async () => {
    mockFetch({ error: "nope" });
    await expect(ikariamRequest({ view: "townHall" })).rejects.toThrow(
      /not a response array/,
    );
  });
});

describe("the action request token", () => {
  it("starts from the model", () => {
    expect(actionRequestToken()).toBe("token-from-model");
  });

  it(
    "prefers one the server sent back — the module never applies responses " +
      "to the game, so the model's copy would go stale if it ever rotated, " +
      "and a stale token is accepted, does nothing, and reports no error",
    async () => {
      const fetchMock = mockFetch(TOWN_RESPONSE);
      await ikariamRequest({ view: "townHall" });
      expect(actionRequestToken()).toBe("token-from-response");

      await ikariamRequest({ view: "townHall" }, { minGapMs: 0 });
      expect(String(fetchMock.mock.calls[1][0])).toContain(
        "actionRequest=token-from-response",
      );
    },
  );

  it("keeps the old token when a response carries none", async () => {
    mockFetch([["changeView", ["city", ""]]]);
    await ikariamRequest({ view: "townHall" });
    expect(actionRequestToken()).toBe("token-from-model");
  });
});

describe("response handlers", () => {
  it("hands every response to whoever registered", async () => {
    const seen: unknown[][] = [];
    onResponse((entries) => seen.push(entries));
    mockFetch(TOWN_RESPONSE);

    await ikariamRequest({ view: "townHall" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(3);
  });

  it("a throwing handler does not fail the request or the others", async () => {
    const good = vi.fn();
    onResponse(() => {
      throw new Error("handler is broken");
    });
    onResponse(good);
    mockFetch(TOWN_RESPONSE);

    await expect(ikariamRequest({ view: "townHall" })).resolves.toBeTruthy();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("unregisters", async () => {
    const handler = vi.fn();
    onResponse(handler)();
    mockFetch(TOWN_RESPONSE);

    await ikariamRequest({ view: "townHall" });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("throttling", () => {
  it("spaces requests out rather than bursting", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = mockFetch(TOWN_RESPONSE);
      await ikariamRequest({ view: "townHall" }, { minGapMs: 500 });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const second = ikariamRequest({ view: "townHall" }, { minGapMs: 500 });
      await vi.advanceTimersByTimeAsync(100);
      // Still waiting out the gap.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      await second;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not delay the first request of a run", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = mockFetch(TOWN_RESPONSE);
      const first = ikariamRequest({ view: "townHall" }, { minGapMs: 5000 });
      await vi.advanceTimersByTimeAsync(0);
      await first;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchTown", () => {
  it("asks for the Town Hall, which is the view that carries the layout", async () => {
    const fetchMock = mockFetch(TOWN_RESPONSE);
    await fetchTown(297042);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("view=townHall");
    expect(url).toContain("position=0");
    expect(url).toContain("backgroundView=city");
    expect(url).toContain("cityId=297042");
    expect(url).toContain("currentCityId=297042");
  });
});

describe("the bridge between the two scripts", () => {
  /**
   * Send Resources and Empire Overview are separate bundles, so each carries
   * its OWN instance of this module. `vi.resetModules()` reproduces exactly
   * that: two imports that share no module state, only the page.
   */
  async function twoBundles() {
    vi.resetModules();
    const board = await import("./http");
    vi.resetModules();
    const sender = await import("./http");
    return { board, sender };
  }

  beforeEach(() => {
    (window as any).ikariam = { model: { actionRequest: "token" } };
  });

  it(
    "delivers a town fetched by one script to a subscriber in the other — " +
      "with the handlers held in a module array they sat in different copies " +
      "and never met, so a scan updated nothing",
    async () => {
      const { board, sender } = await twoBundles();
      board.resetHttpState();
      sender.resetHttpState();

      const seen: unknown[][] = [];
      const off = board.onResponse((entries) => seen.push(entries));

      (globalThis as any).fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => JSON.stringify([["updateGlobalData", { id: 297034 }]]),
      }));

      await sender.fetchTown(297034);

      expect(seen).toHaveLength(1);
      expect(seen[0][0]).toEqual(["updateGlobalData", { id: 297034 }]);
      off();
    },
  );

  it("stops delivering once the subscriber unregisters", async () => {
    const { board, sender } = await twoBundles();
    board.resetHttpState();
    sender.resetHttpState();

    const seen: unknown[][] = [];
    board.onResponse((entries) => seen.push(entries))();

    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => JSON.stringify([["updateGlobalData", {}]]),
    }));

    await sender.fetchTown(297034);

    expect(seen).toHaveLength(0);
  });

  it("carries on when one subscriber throws", async () => {
    const { board, sender } = await twoBundles();
    board.resetHttpState();
    sender.resetHttpState();

    const seen: string[] = [];
    const offBad = board.onResponse(() => {
      throw new Error("bad subscriber");
    });
    const offGood = board.onResponse(() => seen.push("good"));

    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => JSON.stringify([["updateGlobalData", {}]]),
    }));

    await expect(sender.fetchTown(297034)).resolves.toBeDefined();
    expect(seen).toEqual(["good"]);

    offBad();
    offGood();
  });
});

describe("the sync announcement (plan item 2.6)", () => {
  it(
    "reaches the other script's copy of this module — the board hears when " +
      "Send Resources starts and ends a refresh of every town",
    async () => {
      vi.resetModules();
      const board = await import("./http");
      vi.resetModules();
      const sender = await import("./http");

      const heard: boolean[] = [];
      const off = board.onSyncChange((running) => heard.push(running));

      sender.announceSync(true);
      sender.announceSync(false);
      off();
      sender.announceSync(true);

      expect(heard).toEqual([true, false]);
    },
  );
});

describe("quick upgrade (plan §4.2 item E)", () => {
  /** A building view as the game sends it, with its upgrade button. */
  function buildingView(href: string): unknown[] {
    return [
      ["updateGlobalData", { actionRequest: "token-after-view" }],
      [
        "changeView",
        [
          "academy",
          `<div id="buildingUpgrade"><a id="js_buildingUpgradeButton" class="button" href="${href}">Upgrade</a></div>`,
        ],
      ],
    ];
  }

  const UPGRADE_LINK =
    "?action=CityScreen&function=upgradeBuilding&cityId=297042&position=5&level=15&actionRequest=token-in-link";

  function feedback(type: number, text = ""): unknown[] {
    return [["provideFeedback", [{ location: 1, type, text }]]];
  }

  /** Answer each request with the next body, in order. */
  function mockFetchSequence(bodies: unknown[]) {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
      const body = bodies.shift();
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => JSON.stringify(body),
      };
    });
    (globalThis as any).fetch = fn;
    return fn;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it("finds the button's link wherever it sits in the response", () => {
    expect(findUpgradeLink(buildingView(UPGRADE_LINK))).toBe(UPGRADE_LINK);
    expect(findUpgradeLink(TOWN_RESPONSE)).toBeNull();
  });

  it("treats a button that leads nowhere as no button", () => {
    expect(findUpgradeLink(buildingView("#"))).toBeNull();
  });

  it("reads the game's verdict, as plain text", () => {
    expect(
      responseFeedback(feedback(11, "<b>Not enough</b>   resources")),
    ).toEqual({ type: 11, text: "Not enough resources" });
    expect(responseFeedback(feedback(10))).toEqual({ type: 10, text: null });
    expect(responseFeedback(TOWN_RESPONSE)).toBeNull();
  });

  it(
    "opens the building, then sends the button's own link with a fresh " +
      "token — not a link put together here",
    async () => {
      const fetchMock = mockFetchSequence([
        buildingView(UPGRADE_LINK),
        feedback(SUCCESS_FEEDBACK_TYPE),
      ]);

      await expect(
        upgradeBuildingNow(297042, "academy", 5, { minGapMs: 0 }),
      ).resolves.toEqual({ started: true, reason: null });

      const viewUrl = String(fetchMock.mock.calls[0][0]);
      expect(viewUrl).toContain("view=academy");
      expect(viewUrl).toContain("position=5");
      expect(viewUrl).toContain("currentCityId=297042");

      const upgradeUrl = new URLSearchParams(
        String(fetchMock.mock.calls[1][0]).split("?")[1],
      );
      expect(upgradeUrl.get("function")).toBe("upgradeBuilding");
      expect(upgradeUrl.get("level")).toBe("15");
      expect(upgradeUrl.get("actionRequest")).toBe("token-after-view");
      expect(upgradeUrl.getAll("actionRequest")).toHaveLength(1);
    },
  );

  it("passes on the game's reason when it does not start", async () => {
    mockFetchSequence([
      buildingView(UPGRADE_LINK),
      feedback(11, "Another building is under construction"),
    ]);
    await expect(
      upgradeBuildingNow(297042, "academy", 5, { minGapMs: 0 }),
    ).resolves.toEqual({
      started: false,
      reason: "Another building is under construction",
    });
  });

  it("sends nothing more when the view has no live button", async () => {
    const fetchMock = mockFetchSequence([buildingView("#")]);
    await expect(
      upgradeBuildingNow(297042, "academy", 5, { minGapMs: 0 }),
    ).resolves.toEqual({ started: false, reason: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(
    "keeps what the game answered for Bug Report — these answers had never " +
      "been captured, so the first runs on the game are the check",
    async () => {
      mockFetchSequence([
        buildingView(UPGRADE_LINK),
        feedback(SUCCESS_FEEDBACK_TYPE),
      ]);
      await upgradeBuildingNow(297042, "academy", 5, { minGapMs: 0 });

      const [trace] = quickUpgradeTraces();
      expect(trace).toMatchObject({
        cityId: "297042",
        buildingView: "academy",
        position: "5",
        upgradeLink: UPGRADE_LINK,
        outcome: { started: true, reason: null },
        error: null,
      });
      expect(trace.upgradeButton).toContain("js_buildingUpgradeButton");
      expect(trace.viewResponse).toContain("changeView");
      expect(trace.upgradeResponse).toContain("provideFeedback");
    },
  );

  it("keeps a run that failed too, with its error, and still fails it", async () => {
    mockFetchSequence(["<html>login</html>"]);
    await expect(
      upgradeBuildingNow(297042, "academy", 5, { minGapMs: 0 }),
    ).rejects.toThrow(/not a response array|not JSON/);
    expect(quickUpgradeTraces()[0].error).toMatch(
      /not a response array|not JSON/,
    );
  });

  it("keeps only the last five runs", async () => {
    for (let run = 0; run < 7; run++) {
      mockFetchSequence([buildingView("#")]);
      await upgradeBuildingNow(297042, "academy", run, { minGapMs: 0 });
    }
    expect(quickUpgradeTraces().map((trace) => trace.position)).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });
});
