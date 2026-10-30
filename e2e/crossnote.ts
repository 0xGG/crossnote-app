import { expect, type Locator, type Page } from "@playwright/test";
import type { EditorHost, TextPosition } from "../src/editor/handle";

export type { EditorHost, TextPosition };

/**
 * Drives the app the way a user does: through roles, visible text and the few
 * global class names the app itself relies on (its print stylesheet targets
 * them), never through generated MUI class names, so the specs survive the
 * UI-stack migration. Nor through the editor's own markup: the editors and
 * the preview are found by test id, and what an editor holds is read and
 * changed through the handle the app hangs on it (src/editor/handle.ts), so
 * the specs survive the editor being replaced too.
 */
export class CrossnoteApp {
  readonly sidebar: Locator;
  readonly notesPanel: Locator;
  readonly editor: Locator;
  readonly preview: Locator;

  constructor(readonly page: Page) {
    this.sidebar = page.getByRole("navigation");
    // The note editor embeds a second notes panel for back references; the
    // notebook's own list is the one headed "Notes".
    this.notesPanel = page
      .locator(".notes-panel")
      .filter({ has: page.getByRole("heading", { name: "Notes" }) });
    // A note's editor stays on the page once its tab has been shown, hidden
    // or not, so with two notes open there can be two; a spec then picks the
    // visible one. Hidden ones are not filtered out here, or a check that the
    // editor is hidden would pass on finding none.
    this.editor = page.getByTestId("note-editor");
    this.preview = page.getByTestId("note-preview");
  }

  async open() {
    await this.page.goto("/");
    await this.waitUntilReady();
  }

  // Has the page start from this saved layout, as a returning user's does.
  // It is put back on every load of the page, reloads included.
  async seedLayout(layout: object | string) {
    await this.page.addInitScript(
      (saved) => {
        localStorage.setItem("layoutModel", saved);
      },
      typeof layout === "string" ? layout : JSON.stringify(layout),
    );
  }

  // The notebook tree renders only once the browser file system is up and
  // the default notebook exists; on a fresh origin that includes creating it.
  async waitUntilReady() {
    await expect(this.notebook("Drafts")).toBeVisible();
  }

  // The browser file system keeps its directory tree in memory and writes it
  // to IndexedDB half a second after the last change on its own; the app
  // writes it before it shows a change as done, so that a reload straight
  // afterwards finds the change. Checks, without waiting, that the stored
  // tree holds the path, as the next page load would read it. The unit tests
  // read the same storage (src/test/storedTree.ts); the two change together.
  async expectStored(filePath: string) {
    const stored = await this.page.evaluate(
      (parts) =>
        new Promise<boolean>((resolve) => {
          const open = indexedDB.open("fs");
          // Only asked when the database does not exist yet: creating it
          // here would leave out the store the file system adds when it
          // creates it, so it is left to the file system.
          open.onupgradeneeded = () => open.transaction!.abort();
          open.onerror = () => resolve(false);
          open.onsuccess = () => {
            const db = open.result;
            const read = db
              .transaction("fs_files")
              .objectStore("fs_files")
              .get("!root");
            read.onerror = () => {
              db.close();
              resolve(false);
            };
            read.onsuccess = () => {
              let node = read.result?.get("/");
              for (const part of parts) {
                node = node?.get(part);
              }
              db.close();
              resolve(node !== undefined);
            };
          };
        }),
      filePath.split("/").filter(Boolean),
    );
    expect(stored, `${filePath} is in the stored directory tree`).toBe(true);
  }

  // Reads a stored file's bytes as text straight from the same storage, or,
  // given text, puts it there in their place: for content the app itself
  // would not write, such as Windows line endings from another machine. The
  // app reads the new bytes on its next load. A file not stored yet reads as
  // undefined, so a poll can wait for it. Like expectStored, this knows how
  // the browser file system lays out its storage: the tree under "!root",
  // each file's stat under the key 0 of its entry, its bytes under its inode.
  async storedText(
    filePath: string,
    replacement?: string,
  ): Promise<string | undefined> {
    return this.page.evaluate(
      ({ parts, text }) =>
        new Promise<string | undefined>((resolve, reject) => {
          const open = indexedDB.open("fs");
          // As in expectStored: a database created here would lack the
          // store the file system adds when it creates it.
          open.onupgradeneeded = () => open.transaction!.abort();
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const fail = (request: IDBRequest) => () => {
              db.close();
              reject(request.error);
            };
            const transaction = db.transaction(
              "fs_files",
              text === undefined ? "readonly" : "readwrite",
            );
            const files = transaction.objectStore("fs_files");
            const root = files.get("!root");
            root.onerror = fail(root);
            root.onsuccess = () => {
              let node = root.result?.get("/");
              for (const part of parts) {
                node = node?.get(part);
              }
              const ino = node?.get(0)?.ino;
              if (ino === undefined) {
                db.close();
                if (text === undefined) {
                  resolve(undefined);
                } else {
                  reject(new Error(`${parts.join("/")} is not stored`));
                }
              } else if (text === undefined) {
                const read = files.get(ino);
                read.onerror = fail(read);
                read.onsuccess = () => {
                  db.close();
                  // Every byte, a byte order mark at the start included,
                  // which a decoder otherwise takes off.
                  resolve(
                    new TextDecoder("utf-8", { ignoreBOM: true }).decode(
                      read.result,
                    ),
                  );
                };
              } else {
                files.put(new TextEncoder().encode(text), ino);
                // The bytes are stored only once the transaction commits,
                // which comes after the write's own success; a test that
                // reloads the page next must not leave before that. A failed
                // write aborts the transaction.
                transaction.oncomplete = () => {
                  db.close();
                  resolve(text);
                };
                transaction.onabort = () => {
                  db.close();
                  reject(transaction.error);
                };
              }
            };
          };
        }),
      { parts: filePath.split("/").filter(Boolean), text: replacement },
    );
  }

  // Has the browser's storage refuse every write to its files, as a full disk
  // does, until this is called again with false. Reading still works,
  // storedText's included. Each write refused is kept, as "file" for a
  // file's content and by its key for anything else, such as "!root" for
  // the directory tree; see refusedWrites.
  async refuseWrites(refuse = true) {
    await this.page.evaluate((refuse) => {
      const store = IDBObjectStore.prototype;
      const kept = window as unknown as {
        allowedWrites?: Pick<IDBObjectStore, "put" | "delete">;
        refusedWrites?: string[];
      };
      kept.allowedWrites ??= { put: store.put, delete: store.delete };
      kept.refusedWrites ??= [];
      const allowed = kept.allowedWrites;
      const refused = (key: unknown) => {
        kept.refusedWrites!.push(
          typeof key === "number" ? "file" : String(key),
        );
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
      };
      store.put = function (this: IDBObjectStore, ...args) {
        return refuse && this.name === "fs_files"
          ? refused(args[1])
          : allowed.put.apply(this, args);
      } as IDBObjectStore["put"];
      store.delete = function (this: IDBObjectStore, ...args) {
        return refuse && this.name === "fs_files"
          ? refused(args[0])
          : allowed.delete.apply(this, args);
      } as IDBObjectStore["delete"];
    }, refuse);
  }

  // The writes refused since refuseWrites was first called, in order.
  async refusedWrites(): Promise<string[]> {
    return this.page.evaluate(
      () =>
        (window as unknown as { refusedWrites?: string[] }).refusedWrites ?? [],
    );
  }

  // Keeps every message the app puts up from now on, one gone again before a
  // test looks included. A test that expects none waits for its change to
  // land and then reads what was kept, which an absence check made at one
  // moment cannot do.
  async recordMessages(): Promise<() => Promise<string[]>> {
    await this.page.evaluate(() => {
      const kept: string[] = [];
      // Those already on screen were put up before, by something else.
      const seen = new WeakSet<Element>(
        document.querySelectorAll('[role="alert"]'),
      );
      (window as unknown as { keptMessages: string[] }).keptMessages = kept;
      new MutationObserver(() => {
        for (const message of document.querySelectorAll('[role="alert"]')) {
          if (!seen.has(message)) {
            seen.add(message);
            kept.push(message.textContent ?? "");
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    return () =>
      this.page.evaluate(
        () => (window as unknown as { keptMessages: string[] }).keptMessages,
      );
  }

  // The folder a notebook lives in, as the saved layout names it once one of
  // its tabs is open.
  async notebookFolder(): Promise<string> {
    return this.page.evaluate(
      () =>
        localStorage
          .getItem("layoutModel")!
          .match(/"notebookPath":"([^"]+)"/)![1],
    );
  }

  notebook(name: string): Locator {
    return this.sidebar.getByRole("treeitem", { name: new RegExp(name) });
  }

  async openNotes(notebookName = "Drafts") {
    const notebook = this.notebook(notebookName);
    // Only the chevron expands a notebook; clicking its label refreshes it.
    await notebook.getByRole("button").first().click();
    await notebook
      .getByRole("group")
      .getByRole("treeitem", { name: /Notes/ })
      .click();
    await expect(this.notesPanel).toBeVisible();
  }

  // FlexLayout gives each tab the ARIA tab role, named after the tab.
  tab(name: string): Locator {
    return this.page.getByRole("tab", { name, exact: true });
  }

  async selectTab(name: string) {
    await this.tab(name).click();
  }

  async openSettings() {
    await this.sidebar.getByRole("button", { name: "Settings" }).click();
    await expect(this.plainTextSourceCodeSwitch).toBeVisible();
  }

  // The title box in the note header; a new note is named after its file.
  get noteTitle(): Locator {
    return this.page.getByRole("textbox", { name: "Title" });
  }

  // MUI gives Switch the ARIA switch role; a plain checkbox role would be the
  // wrong thing to look for now, and a wrong name would still fail here.
  get plainTextSourceCodeSwitch(): Locator {
    return this.page.getByRole("switch", {
      name: "Plain text in source code mode",
    });
  }

  get searchBox(): Locator {
    return this.notesPanel.getByRole("textbox", { name: "search" });
  }

  get noteCards(): Locator {
    return this.notesPanel.locator(".note-card");
  }

  async createNote() {
    await this.notesPanel.getByRole("button", { name: "New note" }).click();
    await expect(this.editor).toBeVisible();
  }

  async typeInEditor(text: string) {
    await this.editor.click();
    await this.page.keyboard.type(text);
  }

  // The editor in the dialog a kanban card is edited in.
  get cardEditor(): Locator {
    return this.page.getByRole("dialog").getByTestId("card-editor");
  }

  // What an editor holds and where its caret is, read and changed through
  // its handle. Each of these is one step on its own; a spec that has to do
  // several things in the same task, so that nothing the app does can come
  // in between, calls the handle in the page:
  //
  //   await app.editor.evaluate((element) => {
  //     const editor = (element as EditorHost).editorHandle;
  //     ...
  //   });
  //
  // Each takes the editor to use, the note's by default.

  // The whole text, lines joined with \n: what the editor holds, which a
  // check on what it draws cannot read (it leaves lines out of view undrawn,
  // and an editor that folds markup draws something else).
  editorText(editor = this.editor): Promise<string> {
    return editor.evaluate((element) =>
      (element as EditorHost).editorHandle.text(),
    );
  }

  // Puts text in place of all of it as one change: for text that typing
  // would change on the way in, as the editor closes brackets and opens
  // hints. The app saves it as it saves typing. The caret is wherever the
  // editor leaves it.
  async setEditorText(text: string, editor = this.editor) {
    await editor.evaluate(
      (element, text) => (element as EditorHost).editorHandle.setText(text),
      text,
    );
  }

  caret(editor = this.editor): Promise<TextPosition> {
    return editor.evaluate((element) =>
      (element as EditorHost).editorHandle.caret(),
    );
  }

  async selectInEditor(
    anchor: TextPosition,
    head?: TextPosition,
    editor = this.editor,
  ) {
    await editor.evaluate(
      (element, { anchor, head }) =>
        (element as EditorHost).editorHandle.select(anchor, head),
      { anchor, head },
    );
  }

  editorSelection(editor = this.editor): Promise<string> {
    return editor.evaluate((element) =>
      (element as EditorHost).editorHandle.selection(),
    );
  }

  async focusEditor(editor = this.editor) {
    await editor.evaluate((element) =>
      (element as EditorHost).editorHandle.focus(),
    );
  }

  // Whether the keys go to the editor's text: focus is on the place in it
  // that takes typing, not on another field the editor holds, such as a
  // search box or a widget's.
  editorHasFocus(editor = this.editor): Promise<boolean> {
    return editor.evaluate((element) => {
      const focused = document.activeElement;
      return (
        focused instanceof HTMLElement &&
        element.contains(focused) &&
        (focused.isContentEditable || focused instanceof HTMLTextAreaElement)
      );
    });
  }

  // The kinds of token the editor draws a piece of text with, as it names
  // them: what a language mode that has taken effect shows.
  tokenTypes(text: string, editor = this.editor): Promise<string[]> {
    return editor.evaluate(
      (element, text) => (element as EditorHost).editorHandle.tokenTypes(text),
      text,
    );
  }

  // How many times a piece of text, markup such as "**" included, is drawn
  // where a user sees it: with some width, in a colour that is not
  // transparent, in nothing hidden. An editor that folds markup draws it at
  // no width or not at all; either way it does not count. None at all, too,
  // while the editor is hidden or has not drawn its lines, so a check that
  // markup is not shown wants one that the text around it is.
  timesShown(markup: string, editor = this.editor): Promise<number> {
    return editor.evaluate((element, markup) => {
      let shown = 0;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        const parent = node.parentElement!;
        const style = getComputedStyle(parent);
        const visible =
          parent.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
          }) && !/^rgba\(.*,\s*0\)$|^transparent$/.test(style.color);
        let at = text.indexOf(markup);
        while (visible && at >= 0) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + markup.length);
          if (range.getBoundingClientRect().width >= 1) {
            shown++;
          }
          at = text.indexOf(markup, at + markup.length);
        }
      }
      return shown;
    }, markup);
  }

  // The font size a piece of text is drawn at, over the editor's own: 1 for
  // text drawn as plain text, more for a heading drawn larger, whether the
  // editor sizes the heading's line or the heading itself. Read in one go: an
  // editor redraws its lines freely, so separate reads could straddle a
  // redraw. NaN while the text is not drawn.
  textScale(text: string, editor = this.editor): Promise<number> {
    return editor.evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement!;
        if (
          node.textContent?.includes(text) &&
          parent.checkVisibility({ visibilityProperty: true })
        ) {
          return (
            parseFloat(getComputedStyle(parent).fontSize) /
            parseFloat(getComputedStyle(element).fontSize)
          );
        }
      }
      return NaN;
    }, text);
  }

  // An entry of the note's table of contents.
  tocItem(text: string): Locator {
    return this.page.locator(".toc-item").filter({ hasText: text });
  }

  // The element of the visible preview marked as the one a reference leads
  // to.
  get highlightedReference(): Locator {
    return this.preview
      .filter({ visible: true })
      .locator(".reference-highlight");
  }

  // The divider between the note and its table of contents. It reports the
  // panel's width as aria-valuenow, which is the value that gets persisted.
  get tocDivider(): Locator {
    return this.page.getByRole("separator", { name: "Table of contents" });
  }

  // The pane the divider sizes is the element right after it.
  get tocPane(): Locator {
    return this.page.locator(
      '[role="separator"][aria-label="Table of contents"] + div',
    );
  }

  // Drags the divider by dx pixels; a negative dx widens the table of
  // contents, which sits on the right.
  async dragTocDivider(dx: number) {
    const box = await this.tocDivider.boundingBox();
    if (!box) {
      throw new Error("the table of contents divider is not on screen");
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    // Several moves rather than one: a drag a user makes is a stream of
    // them, and the divider has to answer each one.
    await this.page.mouse.move(x + dx, y, { steps: 8 });
    await this.page.mouse.up();
  }

  modeButton(name: "Preview" | "Edit" | "Source code"): Locator {
    return this.page
      .getByRole("group", { name: "editor mode" })
      .getByRole("button", { name });
  }

  // The mode button that is on, the one pressed.
  get modeOn(): Locator {
    return this.page
      .getByRole("group", { name: "editor mode" })
      .getByRole("button", { pressed: true });
  }
}
