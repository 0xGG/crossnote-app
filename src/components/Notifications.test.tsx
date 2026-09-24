import { Dialog } from "@mui/material";
import i18next from "i18next";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import "../i18n/i18n";
import {
  closeNotification,
  notify,
  resetNotifications,
} from "../lib/notifications";
import Notifications from "./Notifications";

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetNotifications();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  act(() => root.unmount());
  container.remove();
  await act(() => i18next.changeLanguage("en-US"));
});

function shownMessage(): HTMLElement {
  return document.querySelector('[role="alert"]');
}

it("drops a message closed before it was shown instead of stalling the queue", () => {
  act(() => root.render(<Notifications />));

  act(() => {
    notify({ severity: "info", message: "first" });
    closeNotification();
    notify({ severity: "error", message: "second" });
  });

  expect(shownMessage()?.textContent).toBe("second");
});

it("keeps a message raised while a dialog is open audible", () => {
  act(() =>
    root.render(
      <>
        <Dialog open={true}>
          <p>An open dialog</p>
        </Dialog>
        <Notifications />
      </>,
    ),
  );
  // MUI hides everything outside an open dialog, the app root included.
  expect(container.getAttribute("aria-hidden")).toBe("true");

  act(() => notify({ severity: "error", message: "Failed" }));

  expect(shownMessage()?.textContent).toBe("Failed");
  expect(shownMessage().closest('[aria-hidden="true"]')).toBeNull();
});

it("names the close button in the current language", async () => {
  act(() => root.render(<Notifications />));
  act(() => notify({ severity: "error", message: "Failed" }));

  await act(() => i18next.changeLanguage("zh-CN"));

  const close = shownMessage().querySelector("button");
  expect(close.getAttribute("aria-label")).toBe("关闭");
});
