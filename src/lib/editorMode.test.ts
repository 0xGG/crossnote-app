import type { Editor, Mode } from "codemirror";
import { describe, expect, it, vi } from "vitest";
import {
  applyCodeMirrorMode,
  codeMirrorModeFor,
  EditorMode,
  HYPERMD_MODE,
  MARKDOWN_MODE,
  markdownState,
  runsHyperMD,
  withPlainTextFallback,
} from "./editorMode";

describe("codeMirrorModeFor", () => {
  it("keeps the folding editor on HyperMD whatever the setting says", () => {
    expect(codeMirrorModeFor(EditorMode.EchoMD, false)).toBe(HYPERMD_MODE);
    expect(codeMirrorModeFor(EditorMode.EchoMD, true)).toBe(HYPERMD_MODE);
  });

  it("shows styled source by default", () => {
    expect(codeMirrorModeFor(EditorMode.SourceCode, false)).toBe(HYPERMD_MODE);
  });

  it("drops source code to plain markdown when the setting is on", () => {
    expect(codeMirrorModeFor(EditorMode.SourceCode, true)).toBe(MARKDOWN_MODE);
  });
});

describe("applyCodeMirrorMode", () => {
  function fakeEditor(initialMode: unknown) {
    let mode = initialMode;
    const modeChanges: unknown[] = [];
    const editor = {
      getOption: () => mode,
      setOption: (_option: string, value: unknown) => {
        mode = value;
        modeChanges.push(value);
      },
    } as unknown as Editor;
    return { editor, modeChanges };
  }

  it("switches a HyperMD editor to plain markdown for plain source code", () => {
    const { editor, modeChanges } = fakeEditor(HYPERMD_MODE);
    applyCodeMirrorMode(editor, EditorMode.SourceCode, true);
    expect(modeChanges).toEqual([MARKDOWN_MODE]);
  });

  it("brings a plain markdown editor back to HyperMD for the folding editor", () => {
    const { editor, modeChanges } = fakeEditor(MARKDOWN_MODE);
    applyCodeMirrorMode(editor, EditorMode.EchoMD, true);
    expect(modeChanges).toEqual([HYPERMD_MODE]);
  });

  it("leaves an editor alone that already runs the wanted mode", () => {
    const { editor, modeChanges } = fakeEditor(HYPERMD_MODE);
    applyCodeMirrorMode(editor, EditorMode.SourceCode, false);
    applyCodeMirrorMode(editor, EditorMode.EchoMD, true);
    expect(modeChanges).toEqual([]);
  });
});

describe("withPlainTextFallback", () => {
  function fakeEditor(modeName: string) {
    const commands: string[] = [];
    const editor = {
      getMode: () => ({ name: modeName }),
      execCommand: (name: string) => {
        commands.push(name);
      },
    } as unknown as Editor;
    return { editor, commands };
  }

  it("tells the HyperMD editor apart from the plain text mode", () => {
    expect(runsHyperMD(fakeEditor(HYPERMD_MODE.name).editor)).toBe(true);
    expect(runsHyperMD(fakeEditor(MARKDOWN_MODE.name).editor)).toBe(false);
  });

  it("runs a HyperMD command while the editor is on HyperMD", () => {
    const { editor, commands } = fakeEditor(HYPERMD_MODE.name);
    const plain = vi.fn();
    withPlainTextFallback("hmdTab", plain)(editor);
    expect(commands).toEqual(["hmdTab"]);
    expect(plain).not.toHaveBeenCalled();
  });

  it("calls a HyperMD binding function and hands back its result", () => {
    const { editor, commands } = fakeEditor(HYPERMD_MODE.name);
    const binding = vi.fn(() => "pass");
    expect(withPlainTextFallback(binding, vi.fn())(editor)).toBe("pass");
    expect(binding).toHaveBeenCalledWith(editor);
    expect(commands).toEqual([]);
  });

  it("runs the plain command instead on the plain text mode", () => {
    const { editor, commands } = fakeEditor(MARKDOWN_MODE.name);
    const plain = vi.fn((target: Editor) =>
      target.execCommand("insertSoftTab"),
    );
    withPlainTextFallback("hmdTab", plain)(editor);
    expect(plain).toHaveBeenCalledWith(editor);
    expect(commands).toEqual(["insertSoftTab"]);
  });
});

describe("markdownState", () => {
  it("keeps the HyperMD state as it is, fenced code included", () => {
    // HyperMD reports a fenced markdown block's own headings one level down;
    // the note's headings are the ones at the top.
    const mode = {
      name: HYPERMD_MODE.name,
      innerMode: () => ({ state: { header: 1 }, mode: {} }),
    } as unknown as Mode<unknown>;
    const state = { header: 0 };
    expect(markdownState(mode, state)).toBe(state);
  });

  it("unwraps the front matter mode to the markdown state of the body", () => {
    const body = { header: 2 };
    const mode = {
      name: MARKDOWN_MODE.name,
      innerMode: (state: { inner: unknown }) => ({
        state: state.inner,
        mode: {},
      }),
    } as unknown as Mode<unknown>;
    expect(markdownState(mode, { inner: body })).toBe(body);
  });

  it("reports no heading inside the front matter itself", () => {
    const yaml = { keyCol: 0 };
    const mode = {
      name: MARKDOWN_MODE.name,
      innerMode: () => ({ state: yaml, mode: {} }),
    } as unknown as Mode<unknown>;
    expect(markdownState(mode, { yaml }).header).toBeUndefined();
  });
});
