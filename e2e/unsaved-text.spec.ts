import type { Page } from "@playwright/test";
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
