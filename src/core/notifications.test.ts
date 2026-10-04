import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetNotification,
  isNotificationEnabled,
  notify,
  setNotificationEnabled,
  STALE_AFTER_MS,
  type DesktopNotice,
} from "./notifications";

/** Stands in for the browser's `Notification`, recording what was shown. */
class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static shown: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  constructor(
    public title: string,
    public options: NotificationOptions,
  ) {
    FakeNotification.shown.push(this);
  }
  close(): void {}
}

const NOTICE: DesktopNotice = {
  kind: "buildFinished",
  key: "buildFinished:297042:5:1791043536000",
  title: "Finished in W-Athens",
  body: "Academy level 16",
};

beforeEach(() => {
  localStorage.clear();
  FakeNotification.permission = "granted";
  FakeNotification.requestPermission.mockClear();
  FakeNotification.shown = [];
  vi.stubGlobal("Notification", FakeNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("switching a kind on", () => {
  it("starts off, so nothing is shown before the player asks", () => {
    expect(isNotificationEnabled("buildFinished")).toBe(false);
    expect(notify(NOTICE)).toBe(false);
    expect(FakeNotification.shown).toHaveLength(0);
  });

  it("asks the browser for permission when it has not been given", async () => {
    FakeNotification.permission = "default";
    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      FakeNotification.permission = "granted";
      return "granted";
    });

    await expect(setNotificationEnabled("buildFinished", true)).resolves.toBe(
      true,
    );
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(isNotificationEnabled("buildFinished")).toBe(true);
  });

  it("stays off when the browser refuses", async () => {
    FakeNotification.permission = "denied";
    await expect(setNotificationEnabled("buildFinished", true)).resolves.toBe(
      false,
    );
    expect(isNotificationEnabled("buildFinished")).toBe(false);
  });

  it("stays off in a browser with no notifications at all", async () => {
    vi.stubGlobal("Notification", undefined);
    await expect(setNotificationEnabled("arrival", true)).resolves.toBe(false);
    expect(isNotificationEnabled("arrival")).toBe(false);
  });

  it("switches one kind without touching the others", async () => {
    await setNotificationEnabled("wineLow", true);
    await setNotificationEnabled("taskDropped", true);
    await setNotificationEnabled("wineLow", false);
    expect(isNotificationEnabled("wineLow")).toBe(false);
    expect(isNotificationEnabled("taskDropped")).toBe(true);
  });
});

describe("notify", () => {
  beforeEach(async () => {
    await setNotificationEnabled("buildFinished", true);
  });

  it("shows the notice, tagged with its key", () => {
    expect(notify(NOTICE)).toBe(true);
    expect(FakeNotification.shown).toHaveLength(1);
    expect(FakeNotification.shown[0].title).toBe(NOTICE.title);
    expect(FakeNotification.shown[0].options).toEqual({
      body: NOTICE.body,
      tag: NOTICE.key,
    });
  });

  it(
    "says each event once, also when the other script or another tab " +
      "reaches it too — they are separate bundles that share only storage",
    async () => {
      expect(notify(NOTICE)).toBe(true);

      vi.resetModules();
      const otherBundle = await import("./notifications");
      expect(otherBundle.notify(NOTICE)).toBe(false);
      expect(FakeNotification.shown).toHaveLength(1);
    },
  );

  it(
    "does not announce an event from while the game was closed — a load " +
      "finds those finished hours late",
    () => {
      const now = Date.now();
      expect(
        notify({ ...NOTICE, happenedAt: now - STALE_AFTER_MS - 1_000 }),
      ).toBe(false);
      expect(
        notify({ ...NOTICE, key: "recent", happenedAt: now - 1_000 }),
      ).toBe(true);
      // The board fires a few seconds before the end.
      expect(notify({ ...NOTICE, key: "early", happenedAt: now + 4_000 })).toBe(
        true,
      );
    },
  );

  it("shows nothing once permission is withdrawn", () => {
    FakeNotification.permission = "denied";
    expect(notify(NOTICE)).toBe(false);
  });

  it("can say a condition again once it was forgotten", () => {
    expect(notify(NOTICE)).toBe(true);
    expect(notify(NOTICE)).toBe(false);
    forgetNotification(NOTICE.key);
    expect(notify(NOTICE)).toBe(true);
    expect(FakeNotification.shown).toHaveLength(2);
  });
});
