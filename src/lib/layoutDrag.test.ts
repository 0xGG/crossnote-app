import { afterEach, describe, expect, it, vi } from "vitest";
import { guardLayoutDrags, LAYOUT_DRAG_TEXT } from "./layoutDrag";

type EditorDragEvent = DragEvent & { codemirrorIgnore?: boolean };

// jsdom has no DragEvent; a plain event carrying the dragged text is all the
// guard reads.
function dragEvent(type: string, text = "") {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      getData: (format: string) => (format === "text/plain" ? text : ""),
    },
  });
  return event as EditorDragEvent;
}

// What a listener on the target sees while the event is on its way, which is
// what CodeMirror, listening on its own elements, gets to see.
function seenAt(target: Element, event: EditorDragEvent) {
  let seen = {};
  target.addEventListener(
    event.type,
    () =>
      (seen = {
        defaultPrevented: event.defaultPrevented,
        codemirrorIgnore: event.codemirrorIgnore,
      }),
    { once: true },
  );
  target.dispatchEvent(event);
  return seen;
}

const element = (className: string, ...children: Element[]) => {
  const div = document.createElement("div");
  div.className = className;
  div.append(...children);
  return div;
};

describe("guardLayoutDrags", () => {
  const tab = element("flexlayout__tab_button");
  const strip = element("flexlayout__tabset_tabbar_outer", tab);
  const editor = element("CodeMirror");
  const menuItem = element("flexlayout__popup_menu_item");
  const root = element(
    "",
    strip,
    element("flexlayout__tab", editor),
    element("flexlayout__popup_menu_container", menuItem),
  );
  document.body.append(root);
  let release = () => {};

  afterEach(() => {
    release();
    vi.useRealTimers();
  });

  const dragTab = () => tab.dispatchEvent(dragEvent("dragstart"));

  it("lets a dragged tab through a note's editor to the layout", () => {
    release = guardLayoutDrags(root);
    dragTab();
    expect(seenAt(editor, dragEvent("dragenter"))).toMatchObject({
      codemirrorIgnore: true,
    });
    expect(seenAt(editor, dragEvent("dragover"))).toMatchObject({
      codemirrorIgnore: true,
    });
  });

  it("keeps a dropped tab's text out of the pane it lands on", () => {
    release = guardLayoutDrags(root);
    dragTab();
    expect(seenAt(editor, dragEvent("drop", LAYOUT_DRAG_TEXT))).toEqual({
      defaultPrevented: true,
      codemirrorIgnore: true,
    });
  });

  it("knows a dropped tab by its text", () => {
    release = guardLayoutDrags(root);
    expect(seenAt(editor, dragEvent("drop", LAYOUT_DRAG_TEXT))).toMatchObject({
      defaultPrevented: true,
    });
  });

  it("leaves the panes' own drags alone", () => {
    release = guardLayoutDrags(root);
    editor.dispatchEvent(dragEvent("dragstart"));
    expect(seenAt(editor, dragEvent("dragenter"))).toEqual({
      defaultPrevented: false,
      codemirrorIgnore: undefined,
    });
    expect(seenAt(editor, dragEvent("drop", "some text"))).toEqual({
      defaultPrevented: false,
      codemirrorIgnore: undefined,
    });
  });

  it.each([
    ["its end", () => tab.dispatchEvent(dragEvent("dragend"))],
    ["its drop", () => editor.dispatchEvent(dragEvent("drop"))],
    ["a pointer move", () => window.dispatchEvent(new Event("pointermove"))],
  ])("forgets a tab's drag after %s", (_, end) => {
    release = guardLayoutDrags(root);
    dragTab();
    end();
    expect(seenAt(editor, dragEvent("dragenter"))).toMatchObject({
      codemirrorIgnore: undefined,
    });
  });

  it("keeps tabs from being dragged out of the hidden tabs menu", () => {
    release = guardLayoutDrags(root);
    const layoutSaw = vi.fn();
    menuItem.addEventListener("dragstart", layoutSaw, { once: true });
    const event = dragEvent("dragstart");
    menuItem.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(layoutSaw).not.toHaveBeenCalled();
  });

  it("tells a tab strip its drag is over after other drops", () => {
    vi.useFakeTimers();
    release = guardLayoutDrags(root);
    const ended = vi.fn();
    strip.addEventListener("dragend", ended);
    editor.dispatchEvent(dragEvent("drop", "some text"));
    vi.runAllTimers();
    expect(ended).toHaveBeenCalledTimes(1);

    // A tab's own drop ends its drag by itself.
    dragTab();
    editor.dispatchEvent(dragEvent("drop", LAYOUT_DRAG_TEXT));
    vi.runAllTimers();
    expect(ended).toHaveBeenCalledTimes(1);
    strip.removeEventListener("dragend", ended);
  });

  it("stops guarding once released", () => {
    guardLayoutDrags(root)();
    dragTab();
    expect(seenAt(editor, dragEvent("drop", LAYOUT_DRAG_TEXT))).toEqual({
      defaultPrevented: false,
      codemirrorIgnore: undefined,
    });
  });
});
