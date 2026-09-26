import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { NoteAliasPopover } from "./NoteAliasPopover";

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const addAlias = vi.fn();

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  addAlias.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// The popover renders in a portal with its one text field.
const aliasField = () => document.querySelector("input") as HTMLInputElement;

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    value,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("leaves an Enter that confirms an input method's candidate alone", () => {
  act(() =>
    root.render(
      <NoteAliasPopover
        anchorElement={container}
        onClose={() => {}}
        addAlias={addAlias}
        deleteAlias={() => {}}
        aliases={[]}
      />,
    ),
  );
  // Half of 会議メモ, its first word just confirmed: Chromium sends a keydown
  // flagged as composing, then a plain keyup once the composition has ended.
  act(() => type(aliasField(), "会議"));
  act(() => {
    aliasField().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 229,
        isComposing: true,
        bubbles: true,
      }),
    );
    aliasField().dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }),
    );
  });
  expect(addAlias).not.toHaveBeenCalled();
  expect(aliasField().value).toBe("会議");

  // The rest of the alias, then a plain Enter adds it.
  act(() => type(aliasField(), "会議メモ"));
  act(() => {
    aliasField().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 13,
        bubbles: true,
      }),
    );
  });
  expect(addAlias).toHaveBeenCalledTimes(1);
  expect(addAlias).toHaveBeenCalledWith("会議メモ");
});
