// flexlayout-react moves tabs with the HTML drag and drop API and puts this
// text on the drag.
export const LAYOUT_DRAG_TEXT = "--flexlayout--";

// Where FlexLayout starts its drags: a tab, a tab strip for the whole tabset,
// or a tab in its menu of the tabs a strip has no room for.
const LAYOUT_DRAG_SOURCES =
  ".flexlayout__tab_button, .flexlayout__tabset_tabbar_outer, .flexlayout__popup_menu_item";

function elementOf(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  return target instanceof Node ? target.parentElement : null;
}

// Keeps a tab FlexLayout drags from being dropped into the panes under
// `root` as text. Listening in the capture phase gets to each event before
// the panes do; a note's editor leaves alone a drop that has been prevented.
export function guardLayoutDrags(root: HTMLElement): () => void {
  let tabDrag = false;

  const endTabDrag = () => {
    tabDrag = false;
    window.removeEventListener("pointermove", endTabDrag, true);
  };

  const onDragStart = (event: DragEvent) => {
    endTabDrag();
    const source = elementOf(event.target);
    if (source?.closest(LAYOUT_DRAG_SOURCES)) {
      tabDrag = true;
      // The page gets no pointer moves while a drag is on, so the first one
      // after it means the drag is over, even if its end went to a tab that
      // has left the page since.
      window.addEventListener("pointermove", endTabDrag, true);
    }
  };

  const onDrop = (event: DragEvent) => {
    if (
      tabDrag ||
      event.dataTransfer?.getData("text/plain") === LAYOUT_DRAG_TEXT
    ) {
      // A tab dropped before the layout has covered the panes with its
      // overlay must not write its text into the pane it lands on.
      event.preventDefault();
    }
    endTabDrag();
  };

  root.addEventListener("dragstart", onDragStart, true);
  root.addEventListener("drop", onDrop, true);
  root.addEventListener("dragend", endTabDrag, true);
  return () => {
    root.removeEventListener("dragstart", onDragStart, true);
    root.removeEventListener("drop", onDrop, true);
    root.removeEventListener("dragend", endTabDrag, true);
    endTabDrag();
  };
}
