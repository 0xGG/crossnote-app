import { beforeEach, describe, expect, it } from "vitest";
import {
  closeNotification,
  dismissNotification,
  getNotificationState,
  notify,
  resetNotifications,
  subscribeToNotifications,
} from "./notifications";

beforeEach(() => {
  resetNotifications();
});

describe("notify", () => {
  it("shows the first message right away", () => {
    notify({ severity: "error", message: "Failed", duration: 5000 });

    const { current, open } = getNotificationState();
    expect(open).toBe(true);
    expect(current).toMatchObject({
      severity: "error",
      message: "Failed",
      duration: 5000,
    });
  });

  it("keeps the current message when another one arrives", () => {
    notify({ severity: "info", message: "first" });
    notify({ severity: "success", message: "second" });

    const { current, open } = getNotificationState();
    expect(current.message).toBe("first");
    expect(open).toBe(true);
  });

  it("falls back to two seconds, the timeout most messages had", () => {
    notify({ severity: "info", message: "hello" });

    expect(getNotificationState().current.duration).toBe(2000);
  });

  it("gives every message its own id", () => {
    notify({ severity: "info", message: "a" });
    const first = getNotificationState().current.id;
    dismissNotification();
    notify({ severity: "info", message: "b" });

    expect(getNotificationState().current.id).not.toBe(first);
  });
});

describe("closeNotification", () => {
  it("starts hiding the current message without dequeuing it", () => {
    notify({ severity: "error", message: "Failed" });
    const shown = getNotificationState().current;

    closeNotification();

    const { current, open } = getNotificationState();
    expect(open).toBe(false);
    expect(current).toBe(shown);
  });

  it("does nothing while nothing is shown", () => {
    let changes = 0;
    subscribeToNotifications(() => changes++);
    const before = getNotificationState();

    closeNotification();

    expect(getNotificationState()).toBe(before);
    expect(changes).toBe(0);
  });
});

describe("dismissNotification", () => {
  it("brings up the next message in the order raised", () => {
    notify({ severity: "info", message: "first" });
    notify({ severity: "success", message: "second" });
    notify({ severity: "error", message: "third" });

    closeNotification();
    dismissNotification();
    expect(getNotificationState()).toMatchObject({
      current: { message: "second" },
      open: true,
    });

    closeNotification();
    dismissNotification();
    expect(getNotificationState()).toMatchObject({
      current: { message: "third" },
      open: true,
    });

    closeNotification();
    dismissNotification();
    expect(getNotificationState()).toEqual({ current: null, open: false });
  });

  it("holds a message raised while the current one is leaving", () => {
    notify({ severity: "info", message: "first" });
    closeNotification();

    notify({ severity: "error", message: "second" });

    // The newcomer must not reopen or replace the message on its way out.
    expect(getNotificationState()).toMatchObject({
      current: { message: "first" },
      open: false,
    });

    dismissNotification();
    expect(getNotificationState()).toMatchObject({
      current: { message: "second" },
      open: true,
    });
  });

  it("does nothing when idle", () => {
    let changes = 0;
    subscribeToNotifications(() => changes++);

    dismissNotification();

    expect(getNotificationState()).toEqual({ current: null, open: false });
    expect(changes).toBe(0);
  });
});

describe("subscription", () => {
  it("tells listeners about every change and stops after unsubscribing", () => {
    let changes = 0;
    const unsubscribe = subscribeToNotifications(() => changes++);

    notify({ severity: "info", message: "a" });
    notify({ severity: "info", message: "b" }); // queued, nothing visible changes
    closeNotification();
    dismissNotification();
    expect(changes).toBe(3);

    unsubscribe();
    closeNotification();
    expect(changes).toBe(3);
  });

  it("keeps the same state object until something changes", () => {
    // useSyncExternalStore compares snapshots by identity; a fresh object on
    // every read would re-render the host forever.
    const idle = getNotificationState();
    expect(getNotificationState()).toBe(idle);

    notify({ severity: "info", message: "a" });
    const shown = getNotificationState();
    expect(shown).not.toBe(idle);
    expect(getNotificationState()).toBe(shown);
  });
});
