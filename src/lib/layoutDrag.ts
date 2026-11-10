// flexlayout-react moves tabs with the HTML drag and drop API and puts this
// text on the drag.
export const LAYOUT_DRAG_TEXT = "--flexlayout--";

// Where FlexLayout starts its drags: a tab, a tab strip for the whole tabset,
// or a tab in its menu of the tabs a strip has no room for.
const LAYOUT_DRAG_SOURCES =
  ".flexlayout__tab_button, .flexlayout__tabset_tabbar_outer, .flexlayout__popup_menu_item";

// CodeMirror leaves an event marked this way to others.
type EditorDragEvent = DragEvent & { codemirrorIgnore?: boolean };

function elementOf(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  return target instanceof Node ? target.parentElement : null;
}

// Keeps FlexLayout's tab drags and the drag and drop of the panes under
// `root` out of each other's way. Listening in the capture phase gets to
// each event before the panes do.
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

  // CodeMirror stops the drag events that reach a note's editor, which would
  // keep a tab dragged over one from the layout: it could not dock the tab,
  // and its count of the drag's comings and goings would go wrong.
  const letThrough = (event: DragEvent) => {
    if (tabDrag) {
      (event as EditorDragEvent).codemirrorIgnore = true;
    }
  };

  const onDrop = (event: DragEvent) => {
    if (
      tabDrag ||
      event.dataTransfer?.getData("text/plain") === LAYOUT_DRAG_TEXT
    ) {
      // A tab dropped before the layout has covered the panes with its
      // overlay must not write its text into the pane it lands on.
      (event as EditorDragEvent).codemirrorIgnore = true;
      event.preventDefault();
    }
    endTabDrag();
  };

  root.addEventListener("dragstart", onDragStart, true);
  root.addEventListener("dragenter", letThrough, true);
  root.addEventListener("dragover", letThrough, true);
  root.addEventListener("drop", onDrop, true);
  root.addEventListener("dragend", endTabDrag, true);
  return () => {
    root.removeEventListener("dragstart", onDragStart, true);
    root.removeEventListener("dragenter", letThrough, true);
    root.removeEventListener("dragover", letThrough, true);
    root.removeEventListener("drop", onDrop, true);
    root.removeEventListener("dragend", endTabDrag, true);
    endTabDrag();
  };
}
