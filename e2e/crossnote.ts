import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Drives the app the way a user does: through roles, visible text and the few
 * global class names the app itself relies on (its print stylesheet targets
 * them), never through generated MUI class names, so the specs survive the
 * UI-stack migration.
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
    this.editor = page.locator(".CodeMirror");
    // The preview pane is rendered next to the editor's textarea; other
    // components (cards, widgets) reuse the class name elsewhere.
    this.preview = page.locator(".editor-textarea ~ .preview");
  }

  async open() {
    await this.page.goto("/");
    await this.waitUntilReady();
  }

  // The notebook tree renders only once the browser file system is up and
  // the default notebook exists; on a fresh origin that includes creating it.
  async waitUntilReady() {
    await expect(this.notebook("Drafts")).toBeVisible();
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

  // FlexLayout renders its tab strip without ARIA roles; the class names
  // are the library's public styling contract.
  tab(name: string): Locator {
    return this.page
      .locator(".flexlayout__tab_button")
      .filter({ hasText: name });
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

  // The element that holds the caret while typing.
  get editorInput(): Locator {
    return this.editor.locator("[contenteditable=true]");
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
}
