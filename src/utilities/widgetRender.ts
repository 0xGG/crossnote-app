import { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, Root } from "react-dom/client";

// React 18 replacement for the legacy ReactDOM.render call used by the
// EchoMD widget creators. A widget creator must return a DOM element that is
// already populated (the editor measures it immediately), so the initial
// render is flushed synchronously. The (node, container) parameter order
// matches the old ReactDOM.render signature on purpose to keep diffs small.
export function renderWidget(node: ReactElement, container: Element): Root {
  const root = createRoot(container);
  flushSync(() => {
    root.render(node);
  });
  roots.set(container, root);
  widgetRoots.mounted++;
  return root;
}

// R3-0 prototype: the roots renderWidget made, so that the CodeMirror 6
// editor can unmount a widget's root when it takes the widget away, and
// counts the risk check reads in the page (window.widgetRoots). The
// CodeMirror 5 editor never unmounts one.
const roots = new Map<Element, Root>();
const editorOwned = new WeakSet<Element>();

export const widgetRoots = {
  mounted: 0,
  unmounted: 0,
  // Roots mounted for a widget in the CodeMirror 6 editor and not unmounted.
  get liveInEditor() {
    let live = 0;
    roots.forEach((_, container) => {
      if (editorOwned.has(container)) {
        live++;
      }
    });
    return live;
  },
  ownedByEditor(container: Element) {
    editorOwned.add(container);
  },
};
(window as unknown as { widgetRoots: typeof widgetRoots }).widgetRoots =
  widgetRoots;

// Unmounted after the change that took the widget away is done: the change
// may come from the widget's own event handler, which React is still in.
export function unmountWidget(container: Element) {
  const root = roots.get(container);
  if (!root) {
    return;
  }
  roots.delete(container);
  queueMicrotask(() => {
    root.unmount();
    widgetRoots.unmounted++;
  });
}
