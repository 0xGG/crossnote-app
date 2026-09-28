import type { Page } from "@playwright/test";
import type { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";

// An editor saves its text 300 ms after the last keystroke. Reading the
// notebook again in that time, as collapsing it in the sidebar does, used to
// put the saved text back in the editor, dropping what had just been typed
// and sending the caret to the start.

type Window = {
  pfs: { readFile: (path: string, opts: object) => Promise<string> };
};

const onDisk = (page: Page, file: string) =>
  page.evaluate(
    (file) =>
      (window as unknown as Window).pfs.readFile(file, { encoding: "utf8" }),
    file,
  );

type Editor = {
  CodeMirror: {
    focus(): void;
    execCommand(command: string): void;
    replaceSelection(text: string): void;
    getValue(): string;
    getCursor(): { line: number; ch: number };
  };
};

const editorState = (app: CrossnoteApp) =>
  app.editor.evaluate((element) => {
    const editor = (element as HTMLElement & Editor).CodeMirror;
    return { text: editor.getValue(), caret: editor.getCursor() };
  });

// Deleting another note has the notebook read its notes again from disk.
async function readNotesAgain(app: CrossnoteApp, page: Page, name: string) {
  await app.selectTab("Drafts");
  // Not app.createNote(): with two notes open there are two editors.
  await app.notesPanel.getByRole("button", { name: "New note" }).click();
  const other = page.getByRole("textbox", { name: "Title" });
  await expect(other).not.toHaveValue(name);
  await expect(other).not.toHaveValue("");
  await page.getByRole("button", { name: "Note menu" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await app.selectTab(name);
}

// Front matter as people write it. The notebook writes it out in a layout
// of its own, and hands the note out that way once it has read its notes
// again from disk.
const frontMatter = "---\ntags: [a, b]\n---\n\n";

async function writeFrontMatter(app: CrossnoteApp, page: Page, file: string) {
  await app.modeButton("Source code").click();
  await app.editor.click();
  await page.keyboard.type(`${frontMatter}Body text`);
  await expect.poll(() => onDisk(page, file)).toContain("Body text");
}

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openNotes();
  await app.createNote();
  await expect(app.noteTitle).not.toHaveValue("");
});

test("keeps what was just typed, and the caret, when the notebook is collapsed", async ({
  app,
  page,
}) => {
  const file = `${await app.notebookFolder()}/${await app.noteTitle.inputValue()}.md`;
  await app.typeInEditor("First line");
  await expect.poll(() => onDisk(page, file)).toContain("First line");

  // Typed, and the notebook collapsed before the text is saved: in one go,
  // so that however busy the machine is, the collapse comes first.
  await app.editor.evaluate((element) => {
    const editor = (element as HTMLElement & Editor).CodeMirror;
    editor.focus();
    editor.execCommand("goDocEnd");
    editor.replaceSelection(" and more");
    (
      document.querySelector(
        '[role="treeitem"] button[aria-label="Collapse"]',
      ) as HTMLElement
    ).click();
  });

  await expect.poll(() => onDisk(page, file)).toContain("First line and more");
  expect(
    await app.editor.evaluate((element) => {
      const editor = (element as HTMLElement & Editor).CodeMirror;
      return { text: editor.getValue(), caret: editor.getCursor() };
    }),
  ).toMatchObject({
    text: "First line and more",
    caret: { line: 0, ch: "First line and more".length },
  });
});

test("still shows a change made to the note elsewhere when the notebook is read again", async ({
  app,
  page,
}) => {
  const name = await app.noteTitle.inputValue();
  const file = `${await app.notebookFolder()}/${name}.md`;
  await app.typeInEditor("Mine");
  await expect.poll(() => onDisk(page, file)).toContain("Mine");

  // Changed by something other than this editor, as a pull does; deleting
  // another note then has the notebook read its notes again.
  await page.evaluate(
    (file) =>
      (
        window as unknown as {
          pfs: { writeFile: (path: string, data: string) => Promise<void> };
        }
      ).pfs.writeFile(file, "Changed elsewhere"),
    file,
  );
  await readNotesAgain(app, page, name);

  await app
    .notebook("Drafts")
    .getByRole("button", { name: "Collapse" })
    .click();
  await expect
    .poll(() =>
      app.editor.evaluate((element) =>
        (element as HTMLElement & Editor).CodeMirror.getValue(),
      ),
    )
    .toBe("Changed elsewhere");
});

test("keeps what was just typed below front matter of its own when the notebook is read again", async ({
  app,
  page,
}) => {
  const name = await app.noteTitle.inputValue();
  const file = `${await app.notebookFolder()}/${name}.md`;
  await writeFrontMatter(app, page, file);
  await readNotesAgain(app, page, name);

  // Typed, and the notebook collapsed before the text is saved, in one go.
  await app.editor.evaluate((element) => {
    const editor = (element as HTMLElement & Editor).CodeMirror;
    editor.focus();
    editor.execCommand("goDocEnd");
    editor.replaceSelection(" and more");
    (
      document.querySelector(
        '[role="treeitem"] button[aria-label="Collapse"]',
      ) as HTMLElement
    ).click();
  });

  await expect.poll(() => onDisk(page, file)).toContain("Body text and more");
  expect(await editorState(app)).toMatchObject({
    text: `${frontMatter}Body text and more`,
    caret: { line: 4, ch: "Body text and more".length },
  });
});

test("keeps front matter as it was written, and the caret, when the notebook is read again", async ({
  app,
  page,
}) => {
  const name = await app.noteTitle.inputValue();
  const file = `${await app.notebookFolder()}/${name}.md`;
  await writeFrontMatter(app, page, file);
  await readNotesAgain(app, page, name);

  // Nothing unsaved this time: the caret at the end, the notebook collapsed.
  await app.editor.evaluate((element) => {
    const editor = (element as HTMLElement & Editor).CodeMirror;
    editor.focus();
    editor.execCommand("goDocEnd");
  });
  await app
    .notebook("Drafts")
    .getByRole("button", { name: "Collapse" })
    .click();

  // Typing on goes in where the caret is. If the notebook's layout had been
  // put in the editor, the caret would have gone to the start, or the typing
  // would have been dropped; either way it would not be saved after the body.
  await app.editor.evaluate((element) =>
    (element as HTMLElement & Editor).CodeMirror.focus(),
  );
  await page.keyboard.type(" X");
  await expect.poll(() => onDisk(page, file)).toContain("Body text X");
  expect((await editorState(app)).text).toBe(`${frontMatter}Body text X`);
});
