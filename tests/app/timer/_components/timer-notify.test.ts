// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyPhaseComplete,
  requestNotificationPermission,
} from "@/app/timer/_components/timer-notify";

function stubNotification(
  permission: NotificationPermission,
  requested: NotificationPermission = permission
) {
  const ctor = vi.fn();
  Object.assign(ctor, {
    permission,
    requestPermission: vi.fn().mockResolvedValue(requested),
  });
  vi.stubGlobal("Notification", ctor);
  window.Notification = ctor as unknown as typeof Notification;
  return ctor as unknown as ReturnType<typeof vi.fn> & {
    requestPermission: ReturnType<typeof vi.fn>;
  };
}

function enable(on: boolean) {
  window.localStorage.setItem(
    "timer-color-preferences-v1",
    JSON.stringify({ notificationsEnabled: on })
  );
}

describe("timer-notify", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error cleanup for the unsupported-browser case
    delete window.Notification;
  });

  it("requests permission and resolves true when granted", async () => {
    const ctor = stubNotification("default", "granted");
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(ctor.requestPermission).toHaveBeenCalled();
  });

  it("resolves false when denied, without prompting", async () => {
    const ctor = stubNotification("denied");
    await expect(requestNotificationPermission()).resolves.toBe(false);
    expect(ctor.requestPermission).not.toHaveBeenCalled();
  });

  it("resolves true without prompting when already granted", async () => {
    const ctor = stubNotification("granted");
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(ctor.requestPermission).not.toHaveBeenCalled();
  });

  it("resolves false when the browser has no Notification API or the prompt throws", async () => {
    // @ts-expect-error simulate an unsupported browser
    delete window.Notification;
    await expect(requestNotificationPermission()).resolves.toBe(false);

    const ctor = stubNotification("default");
    ctor.requestPermission.mockRejectedValue(new Error("nope"));
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it("shows a notification when enabled and granted", () => {
    const ctor = stubNotification("granted");
    enable(true);
    notifyPhaseComplete("Focus complete", "Great work.");
    expect(ctor).toHaveBeenCalledWith(
      "Focus complete",
      expect.objectContaining({ body: "Great work." })
    );
  });

  it("does nothing when the pref is off, permission is missing, or the browser is unsupported", () => {
    const ctor = stubNotification("granted");
    enable(false);
    notifyPhaseComplete("a", "b");

    stubNotification("default");
    enable(true);
    notifyPhaseComplete("a", "b");

    // @ts-expect-error simulate an unsupported browser
    delete window.Notification;
    notifyPhaseComplete("a", "b");

    expect(ctor).not.toHaveBeenCalled();
  });

  it("swallows constructor errors", () => {
    const ctor = stubNotification("granted");
    ctor.mockImplementation(() => {
      throw new Error("illegal constructor");
    });
    enable(true);
    expect(() => notifyPhaseComplete("a", "b")).not.toThrow();
  });
});
