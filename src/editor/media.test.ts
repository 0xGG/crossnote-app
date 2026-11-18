import { afterEach, expect, it, vi } from "vitest";
import { NoteDocument } from "./noteDocument";
import { NoteEditor } from "./noteEditor";

afterEach(() => vi.restoreAllMocks());

it("releases media while hidden, skips hidden updates, and reloads on return without changing editing state", async () => {
  const pause = vi
    .spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => {});
  const load = vi
    .spyOn(HTMLMediaElement.prototype, "load")
    .mockImplementation(() => {});
  const play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockImplementation(async () => {});
  const disposals: ReturnType<typeof vi.fn>[] = [];
  const loadMedia = vi.fn(async (src: string) => {
    const dispose = vi.fn();
    disposals.push(dispose);
    return { url: `blob:${src}-${disposals.length}`, dispose };
  });
  const initial = "![](first.mp3)\n\ntext";
  const doc = new NoteDocument(initial);
  const editor = new NoteEditor({
    parent: document.body,
    document: doc,
    display: "live",
    testId: "media-lifecycle",
    images: { loadMedia },
  });
  try {
    editor.view.dispatch({ selection: { anchor: initial.length } });
    await vi.waitFor(() =>
      expect(editor.view.dom.querySelector("audio")?.getAttribute("src")).toBe(
        "blob:first.mp3-1",
      ),
    );
    const first = editor.view.dom.querySelector("audio")!;
    expect(loadMedia).toHaveBeenCalledTimes(1);
    editor.setHidden(true);
    expect(disposals[0]).toHaveBeenCalledOnce();
    expect(first.hasAttribute("src")).toBe(false);
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
    const addition = "![](second.mp3)\n\n";
    editor.view.dispatch({
      changes: { from: 0, insert: addition },
      userEvent: "input",
    });
    const selected = editor.view.state.selection.main.head;
    await Promise.resolve();
    expect(loadMedia).toHaveBeenCalledTimes(1);
    expect(doc.text()).toBe(addition + initial);
    editor.setHidden(false);
    await vi.waitFor(() => expect(loadMedia).toHaveBeenCalledTimes(3));
    expect(editor.view.state.selection.main.head).toBe(selected);
    expect(doc.text()).toBe(addition + initial);
    expect(play).not.toHaveBeenCalled();
    expect(doc.undo(editor.view)).toBe(true);
    expect(doc.text()).toBe(initial);
  } finally {
    editor.destroy();
  }
});
