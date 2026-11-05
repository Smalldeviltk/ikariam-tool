import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getState, initState } from "../state";

const { ikariamRequest } = vi.hoisted(() => ({ ikariamRequest: vi.fn() }));
vi.mock("@core/ikariam/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/ikariam/http")>()),
  ikariamRequest,
}));

const { notify } = vi.hoisted(() => ({
  notify: vi.fn((_notice: import("@core/notifications").DesktopNotice) => true),
}));
vi.mock("@core/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/notifications")>()),
  notify,
}));

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@core/ui/window", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/ui/window")>()),
  showToast,
}));

vi.mock("@core/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@core/logger")>()),
  logInfo: () => {},
}));

const { switchInFlight } = vi.hoisted(() => ({
  switchInFlight: vi.fn(() => false),
}));
vi.mock("../navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../navigation")>()),
  isTownSwitchInFlight: switchInFlight,
}));

import {
  fetchFortressView,
  fortressPosition,
  isPirateCaptchaPending,
  isPirateCaptureInFlight,
  isPirateRunning,
  lastCapturePoints,
  loadPirateSettings,
  openCaptureLevels,
  PIRATE_CAPTURE_TRACE_KEY,
  PIRATE_FORTRESS_POSITION,
  PIRATE_GIVE_UP_MS,
  PIRATE_MARGIN_MS,
  PIRATE_RETRY_MS,
  PIRATE_RUN_KEY,
  pirateCaptureTraces,
  pirateSettingsOrDefault,
  readFortressView,
  readHeaderCapturePoints,
  resetPirateForTests,
  resumePirate,
  savePirateSettings,
  answerAsksForCaptcha,
  sendCapture,
  setPirateHoldCheck,
  setPirateStateListener,
  startPirate,
  stopPirate,
  storedFortressTowns,
} from "./pirate";

/** The capture table's first three rows, as the game's params give them. */
const LEVELS = [
  {
    buildingLevel: 1,
    duration: 150,
    gold: 40,
    capturePoints: 115,
    name: "Smugglers",
  },
  {
    buildingLevel: 3,
    duration: 450,
    gold: 96,
    capturePoints: 276,
    name: "Fishing Boat",
  },
  {
    buildingLevel: 5,
    duration: 900,
    gold: 173,
    capturePoints: 442,
    name: "Wine Transport",
  },
];

const TOKEN = "0123456789abcdef0123456789abcdef";

/**
 * A fortress view answer with only the fields Pirate reads: the template
 * params (a JSON string inside the JSON), a capture box, and the token.
 */
/** The fortress view's header, as the game draws it, with `points`. */
function pirateHeader(points: string): string {
  return (
    `<div class="pirateHeader"><ul class="resources">` +
    `<li class="capturePoints" title="Capture Points"><span class="textLabel">Capture Points:</span> <span class="value">${points}</span></li>` +
    `<li class="pirateCrew"><span class="textLabel">Crew Strength:</span> <span class="value">2</span></li>` +
    `</ul></div>`
  );
}

function fortressAnswer(
  params: Record<string, unknown>,
  extra: unknown[] = [],
  headerPoints: string | null = "345",
): unknown[] {
  return [
    ["updateGlobalData", { actionRequest: TOKEN }],
    [
      "changeView",
      [
        "pirateFortress",
        (headerPoints === null ? "" : pirateHeader(headerPoints)) +
          `<div id="pirateCaptureBox" class="contentBox01h">  <a href="?action=PiracyScreen&actionRequest=${TOKEN}" class="button capture">Capture</a></div>`,
        [],
      ],
    ],
    [
      "updateTemplateData",
      {
        load_js: {
          params: JSON.stringify({
            view: "pirateFortress",
            buildingLevel: 3,
            capturePoints: "345",
            pirateCaptureLevels: LEVELS,
            ...params,
          }),
        },
      },
    ],
    ...extra,
  ];
}

const UNDER_WAY = fortressAnswer({
  hasOngoingMission: true,
  ongoingMissionType: "capture",
  ongoingMissionTimeRemaining: 150,
  ongoingMissionLevel: 1,
});
const IDLE = fortressAnswer({ hasOngoingMission: false });

const SETTINGS = { cityId: "297057", position: 17, level: 1 };

/** A stand-in for the captcha picture, which the game inlines as a PNG. */
const CAPTCHA_PICTURE = "iVBORw0KGgoAAAANSUhEUg".repeat(200);

/**
 * The capture box when the game asks for the security word, cut down from
 * the one captured on s303 (05/11): the capture table gives way to a form.
 */
function captchaBox(captchaNeeded = "1"): string {
  return (
    `<div id="pirateCaptureBox" class="contentBox01h pirateCaptureBox"><div class="content">` +
    `<form onsubmit="ajaxHandlerCallFromForm(this);return false;" action="index.php" method="POST">` +
    `<input type="hidden" name="action" value="PiracyScreen">` +
    `<input type="hidden" name="function" value="capture">` +
    `<input type="hidden" name="cityId" value="297057">` +
    `<input type="hidden" name="position" value="17">` +
    `<input type="hidden" name="captchaNeeded" value="${captchaNeeded}">` +
    `<input type="hidden" name="buildingLevel" value="1">` +
    `<p>Please enter the security word into the box below to carry out the activity.</p>` +
    `<img id="js_captchaImage" class="captchaImage" src="data:image/png;base64,${CAPTCHA_PICTURE}">` +
    `<input type="text" id="captcha" name="captcha" value="" maxlength="10">` +
    `<input type="submit" class="button" value="Capture"></form></div></div>`
  );
}

function captchaAnswer(captchaNeeded = "1"): unknown[] {
  return [
    ["updateGlobalData", { actionRequest: TOKEN }],
    [
      "changeView",
      ["pirateFortress", pirateHeader("1,035") + captchaBox(captchaNeeded), []],
    ],
    [
      "updateTemplateData",
      {
        load_js: {
          params: JSON.stringify({
            view: "pirateFortress",
            buildingLevel: 3,
            pirateCaptureLevels: LEVELS,
            hasOngoingMission: false,
          }),
        },
      },
    ],
  ];
}

/** Let the capture timer fire and its request settle. */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-05T11:00:00Z") });
  localStorage.clear();
  initState("tester");
  resetPirateForTests();
  ikariamRequest.mockReset();
  notify.mockClear();
  showToast.mockClear();
  switchInFlight.mockReset();
  switchInFlight.mockReturnValue(false);
  document.body.innerHTML =
    `<div id="dropDown_js_citySelectContainer"><div class="bg"><ul>` +
    `<li selectvalue="297057"><a title="Saigon-A">Saigon-A</a></li>` +
    `<li selectvalue="297058"><a title="Saigon-B">Saigon-B</a></li>` +
    `</ul></div></div>`;
});

afterEach(() => {
  stopPirate();
  resetPirateForTests();
  vi.useRealTimers();
});

describe("readFortressView", () => {
  it("reads the levels, the fortress level and a mission under way", () => {
    expect(readFortressView(UNDER_WAY)).toEqual({
      fortressLevel: 3,
      levels: [
        {
          buildingLevel: 1,
          durationSeconds: 150,
          name: "Smugglers",
          gold: 40,
          capturePoints: 115,
        },
        {
          buildingLevel: 3,
          durationSeconds: 450,
          name: "Fishing Boat",
          gold: 96,
          capturePoints: 276,
        },
        {
          buildingLevel: 5,
          durationSeconds: 900,
          name: "Wine Transport",
          gold: 173,
          capturePoints: 442,
        },
      ],
      ongoingMission: { type: "capture", secondsLeft: 150, level: 1 },
      capturePoints: 345,
    });
  });

  it("reads the capture points from the view's header, as the game prints them", () => {
    expect(
      readFortressView(fortressAnswer({}, [], "1,035"))?.capturePoints,
    ).toBe(1035);
    // The header, not the template params, when they differ.
    expect(
      readHeaderCapturePoints(
        fortressAnswer({ capturePoints: "999" }, [], "345"),
      ),
    ).toBe(345);
    expect(readHeaderCapturePoints(fortressAnswer({}, [], null))).toBeNull();
  });

  it("has no mission once the crew is back", () => {
    expect(readFortressView(IDLE)?.ongoingMission).toBeNull();
  });

  it("is null for an answer that is not the fortress view", () => {
    expect(
      readFortressView([
        ["updateTemplateData", { load_js: { params: '{"view":"townHall"}' } }],
      ]),
    ).toBeNull();
    expect(readFortressView([["provideFeedback", []]])).toBeNull();
  });

  it("offers only the capture levels the fortress level allows", () => {
    expect(
      openCaptureLevels(readFortressView(IDLE)!).map(
        (row) => row.buildingLevel,
      ),
    ).toEqual([1, 3]);
  });
});

describe("towns with a fortress, from the board's saved towns", () => {
  function saveBoard(cities: Record<string, unknown>): void {
    localStorage.setItem("***tester***cities", JSON.stringify(cities));
  }

  it("finds them, with the fortress's slot and level", () => {
    saveBoard({
      "297057": {
        _buildings: [
          { _name: "townHall", _position: 0, _level: 20 },
          { _name: "pirateFortress", _position: 17, _level: 3 },
        ],
      },
      "297058": { _buildings: [{ _name: "port", _position: 1, _level: 10 }] },
    });
    expect(storedFortressTowns("tester")).toEqual([
      { cityId: "297057", position: 17, level: 3 },
    ]);
  });

  it("defaults to the first of them at capture level 1, until Settings saves", () => {
    saveBoard({
      "297058": {
        _buildings: [{ _name: "pirateFortress", _position: 17, _level: 1 }],
      },
    });
    expect(pirateSettingsOrDefault()).toEqual({
      cityId: "297058",
      position: 17,
      level: 1,
    });
    savePirateSettings(SETTINGS);
    expect(pirateSettingsOrDefault()).toEqual(SETTINGS);
    expect(loadPirateSettings()).toEqual(SETTINGS);
  });

  it("uses the measured slot 17 for a town the board does not know", () => {
    expect(fortressPosition("297058")).toBe(PIRATE_FORTRESS_POSITION);
    expect(pirateSettingsOrDefault()).toBeNull();
  });
});

describe("sendCapture", () => {
  it("sends the request the fortress's Capture button sends", async () => {
    ikariamRequest.mockResolvedValue(UNDER_WAY);

    await sendCapture({ ...SETTINGS, level: 3 });

    expect(ikariamRequest).toHaveBeenCalledWith({
      action: "PiracyScreen",
      function: "capture",
      buildingLevel: 3,
      view: "pirateFortress",
      cityId: "297057",
      position: 17,
      activeTab: "tabBootyQuest",
      backgroundView: "city",
      currentCityId: "297057",
      templateView: "pirateFortress",
    });
  });

  it("counts a mission under way as started, whatever started it", async () => {
    ikariamRequest.mockResolvedValue(
      fortressAnswer({
        hasOngoingMission: true,
        ongoingMissionType: "raid",
        ongoingMissionTimeRemaining: 42,
      }),
    );
    expect(await sendCapture(SETTINGS)).toEqual({
      kind: "underWay",
      secondsLeft: 42,
      missionType: "raid",
    });
    expect(pirateCaptureTraces()).toEqual([]);
  });

  it(
    "counts an answer without a mission as failed, and keeps a short " +
      "trace of it without the session token",
    async () => {
      ikariamRequest.mockResolvedValue(
        fortressAnswer({ hasOngoingMission: false }, [
          ["provideFeedback", [{ type: 11, text: "Please solve the captcha" }]],
          [
            "popupData",
            {
              html: `<form><input name="actionRequest" value="${TOKEN}"></form>`,
              actionRequest: TOKEN,
            },
          ],
        ]),
      );

      expect(await sendCapture(SETTINGS)).toEqual({
        kind: "failed",
        reason: "Please solve the captcha",
      });

      const [trace] = pirateCaptureTraces();
      expect(trace).toMatchObject({
        cityId: "297057",
        level: 1,
        reason: "Please solve the captcha",
        entries: [
          "updateGlobalData",
          "changeView",
          "updateTemplateData",
          "provideFeedback",
          "popupData",
        ],
        feedback: "type 11: Please solve the captcha",
      });
      expect(trace.captureBox).toContain('id="pirateCaptureBox"');
      expect(trace.popupData).toContain("<form>");
      expect(JSON.stringify(trace)).not.toContain(TOKEN);
    },
  );

  it("keeps the capture points the answer shows, whatever came of the capture", async () => {
    const redraw = vi.fn();
    setPirateStateListener(redraw);

    ikariamRequest.mockResolvedValue(UNDER_WAY);
    await sendCapture(SETTINGS);
    expect(lastCapturePoints()).toEqual({ points: 345, at: Date.now() });
    expect(redraw).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 60_000);
    ikariamRequest.mockResolvedValue(
      fortressAnswer({ hasOngoingMission: false }, [], "460"),
    );
    await sendCapture(SETTINGS);
    expect(lastCapturePoints()).toEqual({ points: 460, at: Date.now() });

    // A failed request shows none: the last ones stay.
    ikariamRequest.mockRejectedValue(new Error("Failed to fetch"));
    await sendCapture(SETTINGS);
    expect(lastCapturePoints()?.points).toBe(460);
  });

  it("keeps the capture points of a fortress view read for Settings or Crawl", async () => {
    ikariamRequest.mockResolvedValue(IDLE);
    await fetchFortressView("297057", 17);
    expect(lastCapturePoints()?.points).toBe(345);
  });

  it("counts a failed request as failed", async () => {
    ikariamRequest.mockRejectedValue(new Error("Failed to fetch"));
    expect(await sendCapture(SETTINGS)).toEqual({
      kind: "failed",
      reason: "Failed to fetch",
    });
    expect(pirateCaptureTraces()[0]).toMatchObject({
      reason: "Failed to fetch",
      entries: null,
    });
  });

  it("keeps the last three failures, each cut short", async () => {
    for (const reason of ["one", "two", "three", "four"]) {
      ikariamRequest.mockRejectedValueOnce(new Error(reason.repeat(1_000)));
      await sendCapture(SETTINGS);
    }
    const traces = pirateCaptureTraces();
    expect(traces.map((trace) => trace.reason.slice(0, 3))).toEqual([
      "two",
      "thr",
      "fou",
    ]);
    expect(traces.every((trace) => trace.reason.length <= 2_000)).toBe(true);
    expect(
      localStorage.getItem(`tester${PIRATE_CAPTURE_TRACE_KEY}`),
    ).not.toBeNull();
  });
});

describe("the schedule", () => {
  beforeEach(() => {
    savePirateSettings(SETTINGS);
  });

  it(
    "captures at once, then again when the mission is over plus 10s, " +
      "not sooner",
    async () => {
      ikariamRequest.mockResolvedValue(UNDER_WAY);

      expect(startPirate()).toBe(true);
      await advance(0);
      expect(ikariamRequest).toHaveBeenCalledTimes(1);

      await advance(150_000 + PIRATE_MARGIN_MS - 1);
      expect(ikariamRequest).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(ikariamRequest).toHaveBeenCalledTimes(2);
      expect(isPirateRunning()).toBe(true);
    },
  );

  it(
    "tries again every 10s while captures fail, and after 30s sends one " +
      "notice, says so, and stops",
    async () => {
      ikariamRequest.mockResolvedValue(IDLE);

      startPirate();
      await advance(0);
      for (let step = 1; step <= 3; step++) {
        await advance(PIRATE_RETRY_MS);
        expect(ikariamRequest).toHaveBeenCalledTimes(step + 1);
      }

      expect(PIRATE_GIVE_UP_MS).toBe(30_000);
      expect(isPirateRunning()).toBe(false);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0]).toMatchObject({
        kind: "pirateCaptureFailed",
        title: "Pirate stopped in Saigon-A",
      });
      const toasts = showToast.mock.calls;
      expect(String(toasts[toasts.length - 1]?.[0])).toContain(
        "Pirate stopped",
      );

      await advance(10 * 60_000);
      expect(ikariamRequest).toHaveBeenCalledTimes(4);
    },
  );

  it("does not give up when a capture starts within the 30s", async () => {
    ikariamRequest
      .mockResolvedValueOnce(IDLE)
      .mockResolvedValueOnce(IDLE)
      .mockResolvedValue(UNDER_WAY);

    startPirate();
    await advance(0);
    await advance(PIRATE_RETRY_MS * 2);
    expect(ikariamRequest).toHaveBeenCalledTimes(3);

    // A new failure later starts its own 30s.
    ikariamRequest.mockResolvedValue(IDLE);
    await advance(150_000 + PIRATE_MARGIN_MS);
    await advance(PIRATE_RETRY_MS * 2);
    expect(isPirateRunning()).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it("gives each stall its own notice key, so a second one is not silenced", async () => {
    ikariamRequest.mockResolvedValue(IDLE);

    startPirate();
    await advance(PIRATE_GIVE_UP_MS);
    vi.setSystemTime(Date.now() + 60 * 60_000);
    startPirate();
    await advance(PIRATE_GIVE_UP_MS);

    expect(notify).toHaveBeenCalledTimes(2);
    const notices = notify.mock.calls.map(([notice]) => notice);
    expect(new Set(notices.map((notice) => notice.key)).size).toBe(2);
    // Dated when Pirate gave up, so the stale-event check lets it through.
    expect(notices[1].happenedAt).toBe(Date.now());
  });

  it("carries on after a page load at the time an earlier page saved", async () => {
    ikariamRequest.mockResolvedValue(UNDER_WAY);
    startPirate();
    await advance(0);
    expect(ikariamRequest).toHaveBeenCalledTimes(1);

    // The page goes away 60s in; the new one resumes from the store.
    await advance(60_000);
    resetPirateForTests();
    const saved = getState().account.getJSON<{ nextAt: number }>(
      PIRATE_RUN_KEY,
      { nextAt: 0 },
    );
    expect(saved.nextAt - Date.now()).toBe(100_000);
    resumePirate();

    await advance(100_000 - 1);
    expect(ikariamRequest).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(ikariamRequest).toHaveBeenCalledTimes(2);
  });

  it("holds back while a town switch of the queue is landing, without counting it as a failure", async () => {
    ikariamRequest.mockResolvedValue(UNDER_WAY);
    switchInFlight.mockReturnValue(true);

    startPirate();
    await advance(60_000);
    expect(ikariamRequest).not.toHaveBeenCalled();
    expect(isPirateRunning()).toBe(true);

    switchInFlight.mockReturnValue(false);
    await advance(5_000);
    expect(ikariamRequest).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("holds back while the task runner is in the middle of a task", async () => {
    ikariamRequest.mockResolvedValue(UNDER_WAY);
    let runnerBusy = true;
    setPirateHoldCheck(() => runnerBusy);

    startPirate();
    await advance(30_000);
    expect(ikariamRequest).not.toHaveBeenCalled();

    runnerBusy = false;
    await advance(5_000);
    expect(ikariamRequest).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("says a capture is out while its request is, and not after", async () => {
    let answer: (entries: unknown[]) => void = () => {};
    ikariamRequest.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );

    startPirate();
    expect(isPirateCaptureInFlight()).toBe(false);
    await advance(0);
    expect(isPirateCaptureInFlight()).toBe(true);
    answer(UNDER_WAY);
    await advance(0);
    expect(isPirateCaptureInFlight()).toBe(false);
  });

  it("is not left in flight by a capture that throws", async () => {
    ikariamRequest.mockRejectedValue(new Error("Failed to fetch"));
    startPirate();
    await advance(0);
    expect(isPirateCaptureInFlight()).toBe(false);
  });

  it("sends nothing more once stopped, even with a request out", async () => {
    let answer: (entries: unknown[]) => void = () => {};
    ikariamRequest.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );

    startPirate();
    await advance(0);
    stopPirate();
    answer(UNDER_WAY);
    await advance(10 * 60_000);

    expect(ikariamRequest).toHaveBeenCalledTimes(1);
    expect(isPirateRunning()).toBe(false);
  });

  it("does not start without a town", () => {
    localStorage.clear();
    initState("tester");
    expect(startPirate()).toBe(false);
    expect(isPirateRunning()).toBe(false);
  });
});

describe("the security word", () => {
  const ajaxHandlerCall = vi.fn();

  beforeEach(() => {
    savePirateSettings(SETTINGS);
    ajaxHandlerCall.mockReset();
    Object.assign(window, { ajaxHandlerCall });
  });

  afterEach(() => {
    delete (window as { ajaxHandlerCall?: unknown }).ajaxHandlerCall;
  });

  it("is seen in the captcha form, and nowhere else", () => {
    expect(answerAsksForCaptcha(captchaAnswer())).toBe(true);
    expect(answerAsksForCaptcha(captchaAnswer("0"))).toBe(false);
    expect(answerAsksForCaptcha(IDLE)).toBe(false);
    expect(answerAsksForCaptcha(UNDER_WAY)).toBe(false);
    expect(
      answerAsksForCaptcha([["provideFeedback", [{ text: "captchaNeeded" }]]]),
    ).toBe(false);
  });

  it("still reads the capture points in the captcha view's header", async () => {
    ikariamRequest.mockResolvedValue(captchaAnswer());
    await sendCapture(SETTINGS);
    expect(lastCapturePoints()?.points).toBe(1035);
  });

  it("makes the capture a captcha, kept without the picture or the token", async () => {
    ikariamRequest.mockResolvedValue(captchaAnswer());

    expect(await sendCapture(SETTINGS)).toEqual({ kind: "captcha" });

    const [trace] = pirateCaptureTraces();
    expect(trace.reason).toBe("the game asks for the security word");
    expect(trace.captureBox).toContain('name="captchaNeeded" value="1"');
    expect(trace.captureBox).toContain("data:image;base64,<image>");
    expect(JSON.stringify(trace)).not.toContain(CAPTCHA_PICTURE.slice(0, 40));
    expect(JSON.stringify(trace)).not.toContain(TOKEN);
  });

  it(
    "sends the notice at once, stops without trying again, and opens the " +
      "Pirate Fortress for the word to be typed in",
    async () => {
      ikariamRequest.mockResolvedValue(captchaAnswer());

      startPirate();
      await advance(0);

      expect(ikariamRequest).toHaveBeenCalledTimes(1);
      expect(isPirateRunning()).toBe(false);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0][0]).toMatchObject({
        kind: "pirateCaptureFailed",
        title: "Pirate needs a captcha in Saigon-A",
        happenedAt: Date.now(),
      });
      expect(String(showToast.mock.calls[0][0])).toContain(
        "asks for the security word",
      );
      expect(ajaxHandlerCall).toHaveBeenCalledWith(
        "?view=pirateFortress&activeTab=tabBootyQuest&cityId=297057&position=17",
      );

      await advance(10 * 60_000);
      expect(ikariamRequest).toHaveBeenCalledTimes(1);
    },
  );

  it("opens the fortress only once the queue's task is over", async () => {
    let runnerBusy = false;
    setPirateHoldCheck(() => runnerBusy);
    ikariamRequest.mockImplementation(async () => {
      // The queue starts a task while the capture is out.
      runnerBusy = true;
      return captchaAnswer();
    });

    startPirate();
    await advance(0);
    expect(notify).toHaveBeenCalledTimes(1);
    await advance(10_000);
    expect(ajaxHandlerCall).not.toHaveBeenCalled();

    runnerBusy = false;
    await advance(2_000);
    expect(ajaxHandlerCall).toHaveBeenCalledTimes(1);
  });

  it("does not open the fortress after a minute of a busy queue", async () => {
    // Not busy at the capture itself, so it goes out; busy ever after.
    let first = true;
    setPirateHoldCheck(() => {
      const busy = !first;
      first = false;
      return busy;
    });
    ikariamRequest.mockResolvedValue(captchaAnswer());

    startPirate();
    await advance(5 * 60_000);

    expect(ajaxHandlerCall).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds the queue after a captcha, across a page load, until Start Pirate", async () => {
    ikariamRequest.mockResolvedValue(captchaAnswer());

    startPirate();
    await advance(0);
    expect(isPirateCaptchaPending()).toBe(true);

    // A page load keeps the wait.
    resetPirateForTests();
    expect(isPirateCaptchaPending()).toBe(true);

    ikariamRequest.mockResolvedValue(UNDER_WAY);
    startPirate();
    expect(isPirateCaptchaPending()).toBe(false);
  });

  it("does not hold the queue after any other stop", async () => {
    ikariamRequest.mockResolvedValue(IDLE);

    startPirate();
    await advance(PIRATE_GIVE_UP_MS);
    expect(isPirateRunning()).toBe(false);
    expect(isPirateCaptchaPending()).toBe(false);

    ikariamRequest.mockResolvedValue(UNDER_WAY);
    startPirate();
    await advance(0);
    stopPirate();
    expect(isPirateCaptchaPending()).toBe(false);
  });

  it("gives each captcha its own notice key", async () => {
    ikariamRequest.mockResolvedValue(captchaAnswer());

    startPirate();
    await advance(0);
    await advance(60_000);
    startPirate();
    await advance(0);

    const keys = notify.mock.calls.map(([notice]) => notice.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});
