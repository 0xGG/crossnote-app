import {
  acceptCompletion,
  CompletionContext,
  completionStatus,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
  type Completion,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completionSources,
  dateTime,
  SLASH_COMMANDS,
  type CompletionHost,
} from "./completion";
import { NoteDocument } from "./noteDocument";
import { NoteEditor } from "./noteEditor";
import { readToEnd, stateOf } from "./testText";

// What is offered at the caret ("¦"): the text that would be replaced and
// the labels, or null where nothing is offered.
function offered(marked: string, host: CompletionHost = {}) {
  const state = stateOf(marked);
  const pos = state.selection.main.head;
  for (const source of completionSources(host)) {
    const result = source(
      new CompletionContext(state, pos, false),
    ) as CompletionResult | null;
    if (result) {
      return {
        replaces: state.sliceDoc(result.from, result.to ?? pos),
        labels: result.options.map(
          ({ label, displayLabel }: Completion) => displayLabel ?? label,
        ),
      };
    }
  }
  return null;
}

const names = SLASH_COMMANDS.map(({ name }) => `/${name}`);

describe("what the editor offers as a note is typed", () => {
  describe('after "/"', () => {
    it("lists the commands at the start of a line and after white space", () => {
      expect(offered("/¦")).toEqual({ replaces: "/", labels: names });
      expect(offered("some text /¦")).toEqual({ replaces: "/", labels: names });
      expect(offered("  /¦")).toEqual({ replaces: "/", labels: names });
      expect(names).toEqual([
        "/h1",
        "/h2",
        "/h3",
        "/h4",
        "/h5",
        "/h6",
        "/blockquote",
        "/ul",
        "/ol",
        "/table",
        "/now",
        "/mermaid",
      ]);
    });

    it("does not list them for a slash in a path, an address or a tag", () => {
      expect(offered("folder/¦")).toBeNull();
      expect(offered("https://¦")).toBeNull();
      expect(offered("#topic/¦")).toBeNull();
      expect(offered("a /b/¦")).toBeNull();
    });

    it("keeps those that have what is typed in their name or in what they are called", () => {
      const host = {
        describeCommand: (name: string) =>
          name === "table" ? "Insert table" : `Insert ${name}`,
      };
      expect(offered("/h¦", host)?.labels).toEqual([
        "/h1",
        "/h2",
        "/h3",
        "/h4",
        "/h5",
        "/h6",
      ]);
      expect(offered("/tab¦", host)).toEqual({
        replaces: "/tab",
        labels: ["/table"],
      });
      expect(offered("/INSERT TA¦", host)).toBeNull();
      expect(offered("/insert¦", host)?.labels).toEqual(names);
    });

    it("lists them all when none fits", () => {
      expect(offered("/zzz¦")).toEqual({ replaces: "/zzz", labels: names });
    });
  });

  describe('after ":"', () => {
    it("lists emoji for the start of a short name", () => {
      const found = offered("Happy :smi¦");
      expect(found?.replaces).toBe(":smi");
      expect(found?.labels).toContain(":smile:");
      expect(found?.labels).toContain(":+1:");
    });

    it("lists them after two colons as well", () => {
      const found = offered("::smi¦");
      expect(found?.replaces).toBe("::smi");
      expect(found?.labels).toContain(":smile:");
    });

    it("does not list them for a colon alone, a time or an address", () => {
      expect(offered("Happy :¦")).toBeNull();
      expect(offered("at 10:3¦")).toBeNull();
      expect(offered("http:/¦")).toBeNull();
      expect(offered("key:value¦")).toBeNull();
    });
  });

  describe('after "#"', () => {
    const tags = vi.fn((typed: string) =>
      ["#topic", "#two words#"].filter((tag) => tag.includes(typed)),
    );

    it("lists the notebook's tags for what is typed", () => {
      expect(offered("about #to¦", { tags })).toEqual({
        replaces: "#to",
        labels: ["#topic"],
      });
      expect(tags).toHaveBeenLastCalledWith("to");
      expect(offered("#¦", { tags })?.labels).toEqual([
        "#topic",
        "#two words#",
      ]);
    });

    it("offers nothing where the notebook has none, or it is not a tag", () => {
      expect(offered("#zzz¦", { tags })).toBeNull();
      expect(offered("a#to¦", { tags })).toBeNull();
      expect(offered("# to¦", { tags })).toBeNull();
      expect(offered("##¦", { tags })).toBeNull();
      expect(offered("#to¦")).toBeNull();
    });
  });

  describe('inside "[["', () => {
    const wikiLinks = vi.fn((typed: string) =>
      ["[[README]]", "[[folder/Other.md|Other]]"].filter((link) =>
        link.toLowerCase().includes(typed.toLowerCase()),
      ),
    );

    it("lists the notebook's notes for what is typed, each as the whole link", () => {
      expect(offered("See [[rea¦", { wikiLinks })).toEqual({
        replaces: "[[rea",
        labels: ["[[README]]"],
      });
      expect(wikiLinks).toHaveBeenLastCalledWith("rea");
    });

    it("replaces the brackets that close the link as well", () => {
      expect(offered("See [[oth¦]] too", { wikiLinks })).toEqual({
        replaces: "[[oth]]",
        labels: ["[[folder/Other.md|Other]]"],
      });
    });

    it("replaces the remaining target when completing inside an existing link", () => {
      expect(offered("See [[Re¦adme]] too", { wikiLinks })).toEqual({
        replaces: "[[Readme]]",
        labels: ["[[README]]"],
      });
    });

    it("offers nothing after the link has closed, or with nothing to list", () => {
      expect(offered("[[README]] and¦", { wikiLinks })).toBeNull();
      expect(offered("[[zzz¦", { wikiLinks })).toBeNull();
      expect(offered("[[rea¦")).toBeNull();
    });

    it.each([String.raw`[[Read\]]m¦e]]`, String.raw`[[Read\]]me¦`])(
      "offers notes after escaped closing brackets: %s",
      (text) => {
        expect(offered(text, { wikiLinks: () => ["[[Report]]"] })).toEqual({
          replaces: text.replace("¦", ""),
          labels: ["[[Report]]"],
        });
      },
    );

    it.each([String.raw`[[Read\]]me]]¦`, String.raw`[[Read\\]]¦`])(
      "offers nothing after unescaped closing brackets: %s",
      (text) => {
        expect(offered(text, { wikiLinks: () => ["[[Report]]"] })).toBeNull();
      },
    );
  });

  it("writes the time to the minute, in local time", () => {
    expect(dateTime(new Date(2026, 10, 11, 9, 5, 59))).toBe("2026-11-11 09:05");
    expect(dateTime(new Date(2026, 0, 1, 23, 30))).toBe("2026-01-01 23:30");
  });
});

describe("completion in an editor", () => {
  const editors: NoteEditor[] = [];

  function editorOf(text: string, completion: CompletionHost = {}) {
    const editor = new NoteEditor({
      parent: document.body,
      document: new NoteDocument(text),
      display: "live",
      testId: "note-editor",
      completion,
    });
    editors.push(editor);
    readToEnd(editor.view);
    editor.handle.select(editor.handle.end());
    return editor;
  }

  // Asks for completions at the caret, picks the one with a label, and
  // gives the note's text and the caret afterwards.
  async function pick(editor: NoteEditor, label: string) {
    startCompletion(editor.view);
    await vi.waitFor(() =>
      expect(completionStatus(editor.view.state)).toBe("active"),
    );
    const options = currentCompletions(editor.view.state);
    const index = options.findIndex(
      (option) => (option.displayLabel ?? option.label) === label,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    editor.view.dispatch({ effects: setSelectedCompletion(index) });
    // The list takes no key for a moment after it opens.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(acceptCompletion(editor.view)).toBe(true);
    return { text: editor.handle.text(), caret: editor.handle.caret() };
  }

  afterEach(() => {
    for (const editor of editors.splice(0)) {
      editor.destroy();
    }
  });

  it("puts a command's text in place of what was typed", async () => {
    expect(await pick(editorOf("Before\n/h2"), "/h2")).toEqual({
      text: "Before\n## ",
      caret: { line: 1, ch: 3 },
    });
  });

  it("puts the caret in a table's first cell", async () => {
    expect(await pick(editorOf("/table"), "/table")).toEqual({
      text: "|   |   |\n|---|---|\n|   |   |\n",
      caret: { line: 0, ch: 2 },
    });
  });

  it("writes the time the app gives for /now", async () => {
    const editor = editorOf("At /now", {
      now: () => new Date(2026, 10, 11, 9, 5),
    });
    expect((await pick(editor, "/now")).text).toBe("At 2026-11-11 09:05");
  });

  it("puts the caret after the diagram's last line in a mermaid block", async () => {
    expect(await pick(editorOf("/mermaid"), "/mermaid")).toEqual({
      text: "```mermaid\ngraph TD\n    A --> B\n```\n",
      caret: { line: 2, ch: 11 },
    });
  });

  it("puts the emoji itself in the text after one colon, its short name after two", async () => {
    expect((await pick(editorOf("Happy :smile"), ":smile:")).text).toBe(
      "Happy 😄 ",
    );
    expect((await pick(editorOf("Happy ::smile"), ":smile:")).text).toBe(
      "Happy :smile: ",
    );
  });

  it("puts a tag and a wiki link in the text as the notebook gives them", async () => {
    const host = {
      tags: () => ["#two words#"],
      wikiLinks: () => ["[[folder/Other.md|Other]]"],
    };
    expect((await pick(editorOf("about #tw", host), "#two words#")).text).toBe(
      "about #two words#",
    );
    const editor = editorOf("See [[oth]] too", host);
    editor.handle.select({ line: 0, ch: 9 });
    expect((await pick(editor, "[[folder/Other.md|Other]]")).text).toBe(
      "See [[folder/Other.md|Other]] too",
    );
  });

  it.each(["Readme", "Read[me", "Read]me", "Read\\]]me"])(
    "replaces an existing wiki target through acceptance in the middle: %s",
    async (target) => {
      const editor = editorOf("See [[" + target + "]] too", {
        wikiLinks: () => ["[[Report]]"],
      });
      editor.handle.select({ line: 0, ch: 8 });
      expect((await pick(editor, "[[Report]]")).text).toBe(
        "See [[Report]] too",
      );
    },
  );

  it("accepts a wiki completion after escaped closing brackets", async () => {
    const editor = editorOf(String.raw`See [[Read\]]me]] too`, {
      wikiLinks: () => ["[[Report]]"],
    });
    editor.handle.select({ line: 0, ch: String.raw`See [[Read\]]m`.length });
    expect(await pick(editor, "[[Report]]")).toEqual({
      text: "See [[Report]] too",
      caret: { line: 0, ch: 14 },
    });
  });

  it("draws a command's picture and what it is called in the list", async () => {
    const drawCommandIcon = vi.fn((name: string, into: HTMLElement) => {
      into.dataset.icon = name;
    });
    const editor = editorOf("/h", {
      describeCommand: (name) => `Insert ${name}`,
      drawCommandIcon,
    });
    startCompletion(editor.view);
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll(".cm-tooltip-autocomplete li"),
      ).toHaveLength(6),
    );
    const first = document.querySelector(".cm-tooltip-autocomplete li")!;
    expect(
      first.querySelector<HTMLElement>(".cn-completion-icon")?.dataset.icon,
    ).toBe("h1");
    expect(first.textContent).toContain("/h1");
    expect(first.textContent).toContain("Insert h1");
  });

  it("closes a bracket as it is typed, and types over the one it closed", () => {
    const editor = editorOf("");
    const type = (text: string) => {
      const { from, to } = editor.view.state.selection.main;
      const handled = editor.view.state
        .facet(EditorView.inputHandler)
        .some((handler) =>
          handler(editor.view, from, to, text, () =>
            editor.view.state.update({
              changes: { from, to, insert: text },
              selection: { anchor: from + text.length },
            }),
          ),
        );
      if (!handled) {
        editor.handle.insert(text);
      }
    };
    type("(");
    expect(editor.handle.text()).toBe("()");
    type("a");
    type(")");
    expect(editor.handle.text()).toBe("(a)");
    expect(editor.handle.caret()).toEqual({ line: 0, ch: 3 });
    // Each of these after a space, as in a line of text. A backtick is left
    // alone: closed, the three that start a code block would be in the way
    // of the three typed to end it.
    for (const [opened, held] of [
      ["[", "[]"],
      ["{", "{}"],
      ['"', '""'],
      ["'", "''"],
      ["`", "`"],
    ]) {
      editor.handle.setText("a ");
      editor.handle.select(editor.handle.end());
      type(opened);
      expect(editor.handle.text()).toBe(`a ${held}`);
    }
  });
});
