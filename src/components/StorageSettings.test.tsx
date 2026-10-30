import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import "../i18n/i18n";
import StorageSettings from "./StorageSettings";

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

// jsdom has no navigator.storage; each test puts in the one it needs.
function stubStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, "storage", {
    value: storage,
    configurable: true,
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  stubStorage(undefined);
});

async function render() {
  await act(async () => root.render(<StorageSettings />));
}

function askAgain(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Ask again",
  );
}

it("says the browser may clear the notes, and asks again when told to", async () => {
  let granted = false;
  stubStorage({
    persisted: async () => granted,
    persist: async () => (granted = true),
  });
  await render();
  expect(container.textContent).toContain(
    "Off: when space runs low, the browser may clear the notes this site stores.",
  );

  await act(async () => askAgain().click());
  expect(container.textContent).toContain(
    "On: the browser does not clear the notes this site stores to free up space.",
  );
  expect(askAgain()).toBeUndefined();
});

it("says so where the browser does not offer it", async () => {
  stubStorage(undefined);
  await render();
  expect(container.textContent).toContain("Not offered by this browser.");
  expect(askAgain()).toBeUndefined();
});
