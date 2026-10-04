import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetHttpState } from "@core/ikariam/http";
import { ownTownIds, syncAllTowns } from "./sync-towns";

// Silence the logger, but keep its other exports (its storage key is read by
// the data export).
vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
  logInfo: () => {},
  clearLog: () => {},
  initLogger: () => {},
}));

const TOWN_IDS = [297034, 297035, 297036];

/**
 * `ikariam.model` with three own towns plus one that is not ours.
 *
 * `selectedCity` is a live getter so a test can make the selection move the
 * way the server would, if it turns out that asking for a town selects it.
 */
function installModel(selected: () => number) {
  const related: Record<string, unknown> = {
    get selectedCity() {
      return `city_${selected()}`;
    },
    additionalInfo: {},
    city_999999: { id: 999999, name: "Someone else", relationship: "ally" },
  };
  for (const id of TOWN_IDS) {
    related[`city_${id}`] = { id, name: `Town ${id}`, relationship: "ownCity" };
  }
  Object.assign(window, {
    ikariam: {
      model: { actionRequest: "token", relatedCityData: related },
    },
  });
}

/** One response, shaped like the live probe's. */
function response(cityId: number) {
  return JSON.stringify([
    ["updateGlobalData", { backgroundData: { id: cityId, position: [] } }],
  ]);
}

function mockFetch(failFor: number[] = []) {
  return vi.fn(async (url: string) => {
    const id = Number(new URL(url, "https://x").searchParams.get("cityId"));
    if (failFor.includes(id)) {
      return {
        ok: false,
        status: 500,
        headers: { get: () => "" },
        text: async () => "",
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "text/html; charset=UTF-8" },
      text: async () => response(id),
    };
  });
}

beforeEach(() => {
  resetHttpState();
  installModel(() => TOWN_IDS[0]);
});

describe("ownTownIds", () => {
  it("lists only the towns this account owns", () => {
    expect(ownTownIds()).toEqual(TOWN_IDS);
  });

  it("is empty when the game has not loaded", () => {
    delete window.ikariam;
    expect(ownTownIds()).toEqual([]);
  });
});

describe("syncAllTowns", () => {
  it("asks for every town, once each", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncAllTowns();

    expect(result.synced).toBe(3);
    expect(result.failed).toEqual([]);
    const asked = fetchMock.mock.calls.map((call) =>
      Number(new URL(String(call[0]), "https://x").searchParams.get("cityId")),
    );
    expect(asked).toEqual(TOWN_IDS);
  }, 20_000);

  it(
    "REGRESSION: one unreachable town does not abandon the rest — the " +
      "walking version used to abort the whole scan into an unhandled promise",
    async () => {
      vi.stubGlobal("fetch", mockFetch([TOWN_IDS[1]]));

      const result = await syncAllTowns();

      expect(result.synced).toBe(2);
      expect(result.failed).toEqual([TOWN_IDS[1]]);
    },
    20_000,
  );

  it(
    "puts the selected town back when asking moved it — whether the game " +
      "does that is NOT known, so the behaviour must be correct either way",
    async () => {
      // Stand in town 0; the server follows whichever town was asked for last.
      let selected = TOWN_IDS[0];
      installModel(() => selected);
      const fetchMock = vi.fn(async (url: string) => {
        selected = Number(new URL(url, "https://x").searchParams.get("cityId"));
        return {
          ok: true,
          status: 200,
          headers: { get: () => "text/html" },
          text: async () => response(selected),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await syncAllTowns();

      expect(result.selectionMoved).toBe(true);
      // Three towns, then one more to return to where the player was.
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(selected).toBe(TOWN_IDS[0]);
    },
    20_000,
  );

  it("sends nothing extra when the selection stays put", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncAllTowns();

    expect(result.selectionMoved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 20_000);

  it("does nothing at all when the game has not loaded", async () => {
    delete window.ikariam;
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncAllTowns();

    expect(result.synced).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the sync announcement", () => {
  function listen(): string[] {
    const heard: string[] = [];
    document.addEventListener("ika:syncStarted", () => heard.push("started"));
    document.addEventListener("ika:syncFinished", () => heard.push("finished"));
    return heard;
  }

  it("tells the page when a refresh of every town starts and ends", async () => {
    (globalThis as any).fetch = mockFetch();
    const heard = listen();
    const syncing = syncAllTowns();
    expect(heard).toEqual(["started"]);
    await syncing;
    expect(heard).toEqual(["started", "finished"]);
  });

  it(
    "says it ended even when the refresh throws — the board's sync mark " +
      "would otherwise spin until the page reloads",
    async () => {
      const heard = listen();
      Object.defineProperty(window, "ikariam", {
        configurable: true,
        get() {
          throw new Error("model gone");
        },
      });
      try {
        await expect(syncAllTowns()).rejects.toThrow("model gone");
      } finally {
        Object.defineProperty(window, "ikariam", {
          configurable: true,
          writable: true,
          value: undefined,
        });
      }
      expect(heard).toEqual(["started", "finished"]);
    },
  );
});
