import moment from "moment";
import React, { act, useEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import "../i18n/i18n";
import type Crossnote from "../lib/crossnote";
import { pfs } from "../lib/fs";
import { Notebook } from "../lib/notebook";
import { CrossnoteContainer } from "./crossnote";

// Tells React it runs under a test, so act() flushes renders and effects.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The container as the app's components get it, handed out once rendered.
let crossnote: ReturnType<typeof CrossnoteContainer.useContainer>;
function Probe(): null {
  const container = CrossnoteContainer.useContainer();
  useEffect(() => {
    crossnote = container;
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// A notebook whose notes have been read, on the browser file system the app
// uses. Every test has one of its own.
async function notebookAt(dir: string): Promise<Notebook> {
  await pfs.mkdirp(dir);
  const notebook = new Notebook();
  notebook._id = dir;
  notebook.dir = dir;
  notebook.name = dir;
  notebook.isLocal = true;
  notebook.initSearch();
  await notebook.refreshNotesIfNotLoaded({
    dir: "./",
    includeSubdirectories: true,
  });
  const listed = { listNotebooks: async () => [notebook] };
  await act(async () =>
    root.render(
      <CrossnoteContainer.Provider
        initialState={{ crossnote: listed as unknown as Crossnote }}
      >
        <Probe />
      </CrossnoteContainer.Provider>,
    ),
  );
  return notebook;
}

// A file put there by something other than this notebook's list: another
// tab of the app, a program working on the same folder, or a list that is
// being read again at that moment.
const read = (notebook: Notebook, fileName: string) =>
  pfs.readFile(`${notebook.dir}/${fileName}`, { encoding: "utf8" });

it("gives a new note a name no file has, whether the list knows the file or not", async () => {
  const notebook = await notebookAt("/notebooks/unlisted-today");
  const today = `${moment().format("YYYY-MM-DD")}.md`;
  await pfs.writeFile(`${notebook.dir}/${today}`, "# Today\n\nKept");

  const note = await crossnote.createNewNote(notebook, "", "");
  expect(note.filePath).not.toBe(today);
  expect(await read(notebook, today)).toBe("# Today\n\nKept");
});

it("opens a note it is asked to create at a path that has one", async () => {
  const notebook = await notebookAt("/notebooks/unlisted-named");
  await pfs.writeFile(`${notebook.dir}/Plans.md`, "# Plans\n\nKept");

  // What following a link to the note does.
  const note = await crossnote.createNewNote(notebook, "Plans.md", "");
  expect(note.markdown).toBe("# Plans\n\nKept");
  expect(await read(notebook, "Plans.md")).toBe("# Plans\n\nKept");
});
