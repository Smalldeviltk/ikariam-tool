import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetHttpState } from "@core/ikariam/http";
import { ownTownIds, syncAllTowns } from "./sync-towns";

vi.mock("@core/logger", () => ({
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
  (window as any).ikariam = {
    model: { actionRequest: "token", relatedCityData: related },
  };
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
    delete (window as any).ikariam;
    expect(ownTownIds()).toEqual([]);
  });
});

describe("syncAllTowns", () => {
  it("asks for every town, once each", async () => {
    const fetchMock = mockFetch();
    (globalThis as any).fetch = fetchMock;

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
      (globalThis as any).fetch = mockFetch([TOWN_IDS[1]]);

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
      (globalThis as any).fetch = fetchMock;

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
    (globalThis as any).fetch = fetchMock;

    const result = await syncAllTowns();

    expect(result.selectionMoved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 20_000);

  it("does nothing at all when the game has not loaded", async () => {
    delete (window as any).ikariam;
    const fetchMock = mockFetch();
    (globalThis as any).fetch = fetchMock;

    const result = await syncAllTowns();

    expect(result.synced).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
