import React, { act } from "react";
import { expect, it, vi } from "vitest";
import { CrossnoteContainer } from "../containers/crossnote";
import "../i18n/i18n";
import type Crossnote from "../lib/crossnote";
import { Notebook } from "../lib/notebook";
import {
  buttonByText,
  mountTestRoot,
  unmountTestRoot,
} from "../test/component";
import { Home } from "./Home";

vi.mock("../components/MainPanel", () => ({ MainPanel: () => null }));
vi.mock("../components/AddNotebookDialog", () => ({ default: () => null }));
vi.mock("../components/LanguageSelectorDialog", () => ({
  default: () => null,
}));
vi.mock("../components/NotebookTreeView", () => ({ default: () => null }));
vi.mock("../components/ConfigureNotebookDialog", () => ({
  default: () => null,
}));

it("keeps a newer recovery prompt when a previous notebook finishes releasing files", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  class DownloadURL extends URL {
    static createObjectURL() {
      return "blob:backup";
    }
    static revokeObjectURL() {}
  }
  vi.stubGlobal("URL", DownloadURL);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  const notebooks = ["First", "Second"].map((name) =>
    Object.assign(new Notebook(), {
      _id: name,
      name,
      dir: "/notebooks/" + name,
    }),
  );
  const directory = ".crossnote-recovered";
  const snapshot = new Map([["Draft.md", new Uint8Array([42])]]);
  let finishRelease: () => void;
  const release = vi.fn(
    () => new Promise<void>((resolve) => (finishRelease = resolve)),
  );
  const readRecoveryFiles = vi.fn(async () => snapshot);
  const crossnote = {
    listNotebooks: async () => notebooks,
    readRecoveryFiles,
    releaseRecoveryFiles: release,
  } as unknown as Crossnote;
  let showCollision: ReturnType<
    typeof CrossnoteContainer.useContainer
  >["setRecoveryCollision"];
  function Page() {
    showCollision = CrossnoteContainer.useContainer().setRecoveryCollision;
    return <Home queryParams={{}} />;
  }

  const { root, container } = mountTestRoot();
  try {
    await act(async () =>
      root.render(
        <CrossnoteContainer.Provider initialState={{ crossnote }}>
          <Page />
        </CrossnoteContainer.Provider>,
      ),
    );
    act(() =>
      showCollision({ notebook: notebooks[0], directory, canRelease: true }),
    );
    await act(async () => {
      buttonByText(document, "Download recovery files").click();
      await vi.dynamicImportSettled();
    });
    act(() => buttonByText(document, "I saved the files").click());
    expect(release).toHaveBeenCalledWith(
      notebooks[0],
      directory,
      snapshot,
      expect.any(Function),
    );
    act(() =>
      showCollision({ notebook: notebooks[1], directory, canRelease: false }),
    );
    const prompt = () => document.querySelector('[role="dialog"]')?.textContent;
    expect(prompt()).toContain("Second");
    await act(async () => finishRelease());
    expect(prompt()).toContain("Second");
    expect(buttonByText(document, "I saved the files")).toBeUndefined();
    await act(async () => {
      buttonByText(document, "Download recovery files").click();
      await vi.dynamicImportSettled();
    });
    expect(readRecoveryFiles).toHaveBeenLastCalledWith(notebooks[1], directory);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2);
    act(() => buttonByText(document, "Close").click());
    expect(prompt()).toBeUndefined();
  } finally {
    unmountTestRoot(container, root);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
