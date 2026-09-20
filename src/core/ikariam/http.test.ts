import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionRequestToken,
  clearResponseHandlers,
  fetchTown,
  ikariamRequest,
  onResponse,
  resetHttpState,
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
