import { afterEach, describe, expect, it, vi } from "vitest";
import { guardLayoutDrags, LAYOUT_DRAG_TEXT } from "./layoutDrag";

// jsdom has no DragEvent; a plain event carrying the dragged text is all the
// guard reads.
function dragEvent(type: string, text = "") {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      getData: (format: string) => (format === "text/plain" ? text : ""),
    },
  });
  return event as DragEvent;
}

// Whether a listener on the target finds the event prevented while it is on
// its way, which is what a note's editor, listening on its own elements,
// goes by.
function preventedAt(target: Element, event: DragEvent) {
  let prevented: boolean | undefined;
  target.addEventListener(
    event.type,
    () => (prevented = event.defaultPrevented),
    { once: true },
  );
  target.dispatchEvent(event);
  return prevented;
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
  const editor = element("cm-editor");
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

  it("keeps a dropped tab out of the pane it lands on, whatever text the drop gives", () => {
    release = guardLayoutDrags(root);
    dragTab();
    expect(preventedAt(editor, dragEvent("drop", LAYOUT_DRAG_TEXT))).toBe(true);
    dragTab();
    expect(preventedAt(editor, dragEvent("drop"))).toBe(true);
  });

  it("knows a dropped tab by its text", () => {
    release = guardLayoutDrags(root);
    expect(preventedAt(editor, dragEvent("drop", LAYOUT_DRAG_TEXT))).toBe(true);
  });

  it("leaves the panes' own drags alone", () => {
    release = guardLayoutDrags(root);
    editor.dispatchEvent(dragEvent("dragstart"));
    expect(preventedAt(editor, dragEvent("dragover"))).toBe(false);
    expect(preventedAt(editor, dragEvent("drop", "some text"))).toBe(false);
  });

  it("leaves a tab's drag over the panes to the layout", () => {
    release = guardLayoutDrags(root);
    dragTab();
    expect(preventedAt(editor, dragEvent("dragenter"))).toBe(false);
    expect(preventedAt(editor, dragEvent("dragover"))).toBe(false);
  });

  it.each([
    ["its end", () => tab.dispatchEvent(dragEvent("dragend"))],
    ["its drop", () => editor.dispatchEvent(dragEvent("drop"))],
    ["a pointer move", () => window.dispatchEvent(new Event("pointermove"))],
  ])("forgets a tab's drag after %s", (_, end) => {
    release = guardLayoutDrags(root);
    dragTab();
    end();
    expect(preventedAt(editor, dragEvent("drop", "some text"))).toBe(false);
  });

  // The menu closes as the drag starts, and the end of the drag may go to an
  // element no longer on the page: the next pointer move ends it, so that a
  // drop of text into a note afterwards is the note's.
  it("forgets a drag out of the hidden tabs menu at the next pointer move", () => {
    release = guardLayoutDrags(root);
    // No dragend comes.
    menuItem.dispatchEvent(dragEvent("dragstart"));
    window.dispatchEvent(new Event("pointermove"));
    expect(preventedAt(editor, dragEvent("drop", "some text"))).toBe(false);
  });

  it("guards a tab dragged out of the hidden tabs menu as well, and leaves its start to the layout", () => {
    release = guardLayoutDrags(root);
    const layoutSaw = vi.fn();
    menuItem.addEventListener("dragstart", layoutSaw, { once: true });
    const event = dragEvent("dragstart");
    menuItem.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(layoutSaw).toHaveBeenCalledTimes(1);
    expect(preventedAt(editor, dragEvent("drop"))).toBe(true);
  });

  it("stops guarding once released", () => {
    guardLayoutDrags(root)();
    dragTab();
    expect(preventedAt(editor, dragEvent("drop", LAYOUT_DRAG_TEXT))).toBe(
      false,
    );
  });
});
