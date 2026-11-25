import React, { act } from "react";
import { Root } from "react-dom/client";
import {
  mountTestRoot,
  unmountTestRoot,
  buttonByText,
} from "../test/component";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../i18n/i18n";
import AddNotebookDialog from "./AddNotebookDialog";

// An add that never settles, so the dialog stays as it is after the click.
const { addNotebook, clone } = vi.hoisted(() => ({
  addNotebook: vi.fn((name: string) => new Promise<never>(() => {})),
  clone: { pending: false },
}));

vi.mock("../containers/crossnote", () => ({
  CrossnoteContainer: {
    useContainer: () => ({
      addNotebook,
      isAddingNotebook: clone.pending,
      openLocalNotebook: () => {},
    }),
  },
}));

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  addNotebook.mockClear();
  clone.pending = false;
  ({ container, root } = mountTestRoot());
});

afterEach(() => {
  unmountTestRoot(container, root);
});

it("names a notebook from a link after its repository", async () => {
  // A link to a repository opens the dialog this way. GitHub Pages
  // repositories are named like hosts, with .git in the middle of the name.
  act(() =>
    root.render(
      <AddNotebookDialog
        open={true}
        onClose={() => {}}
        canCancel={true}
        gitURL={"https://github.com/alice/alice.github.io.git"}
        gitBranch={"main"}
        hideOpeningLocal={true}
      />,
    ),
  );
  const add = buttonByText(document, "Add");
  await act(async () => add.click());

  expect(addNotebook).toHaveBeenCalledTimes(1);
  expect(addNotebook.mock.calls[0][0]).toBe("alice.github.io");
});

it("opens with no repository to name the notebook after", () => {
  // The URL is one of the props a caller may leave out.
  act(() =>
    root.render(
      <AddNotebookDialog open={true} onClose={() => {}} canCancel={true} />,
    ),
  );
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});

it("keeps submitted clone values fixed until a failed attempt can be corrected", async () => {
  let rejectAdd: (reason: Error) => void;
  addNotebook.mockImplementationOnce(
    () => new Promise<never>((_, reject) => (rejectAdd = reject)),
  );
  const url = "https://example.test/notes.git";
  const render = () =>
    root.render(
      <AddNotebookDialog open onClose={() => {}} canCancel gitURL={url} />,
    );
  act(render);
  await act(async () => buttonByText(document, "Add").click());
  clone.pending = true;
  act(render);
  const fields = [
    ...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input'),
  ];
  expect(fields).toHaveLength(5);
  expect(fields.every((field) => field.matches(":disabled"))).toBe(true);

  clone.pending = false;
  await act(async () => {
    rejectAdd(new Error("Remote unavailable"));
    render();
  });
  expect(fields.every((field) => !field.matches(":disabled"))).toBe(true);
  expect(fields[0].value).toBe(url);
});
import i18next from "i18next";
import * as notifications from "../lib/notifications";

it("uses the language at completion", async () => {
  let rejectAdd: (reason: Error) => void;
  addNotebook.mockImplementationOnce(
    () =>
      new Promise<never>((_, reject) => {
        rejectAdd = reject;
      }),
  );
  const notify = vi.spyOn(notifications, "notify");
  await act(() => i18next.changeLanguage("en-US"));
  act(() =>
    root.render(<AddNotebookDialog open onClose={() => {}} canCancel />),
  );
  await act(async () => buttonByText(document, "Add").click());
  await act(() => i18next.changeLanguage("zh-CN"));
  await act(async () =>
    rejectAdd(new Error("error/failed-to-download-notebook")),
  );
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ message: "下载笔记本失败" }),
  );
  notify.mockRestore();
  await act(() => i18next.changeLanguage("en-US"));
});

it("preserves an external error message", async () => {
  addNotebook.mockImplementationOnce(() =>
    Promise.reject(new Error("error/external-server-detail")),
  );
  const notify = vi.spyOn(notifications, "notify");
  act(() =>
    root.render(<AddNotebookDialog open onClose={() => {}} canCancel />),
  );
  await act(async () => buttonByText(document, "Add").click());
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ message: "error/external-server-detail" }),
  );
  notify.mockRestore();
});
