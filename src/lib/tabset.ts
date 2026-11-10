import { Model, TabNode, TabSetNode } from "flexlayout-react";

// The notebook of the tab in front in the layout's active pane, if that tab
// is one of a notebook's: a note, its notes or its graph.
export function notebookInFront(model: Model): string | undefined {
  const tab = model.getActiveTabset()?.getSelectedNode();
  return tab instanceof TabNode ? tab.getConfig()?.notebookPath : undefined;
}

// The tabset a new tab opens in when none is active, as happens once the
// active tabset has been closed. Tabs have always landed in the root row's
// last tabset; a root row that holds only rows (a split inside each half of
// a split) has none of its own, and there the layout's first tabset takes
// the tab. FlexLayout keeps at least one tabset in a layout, so the answer
// is only empty for a model that has none.
export function tabsetForNewTab(model: Model): TabSetNode | undefined {
  let first: TabSetNode | undefined;
  let lastInRootRow: TabSetNode | undefined;
  // The root row is visited at level 0, so level 1 holds its own children;
  // borders hold tabs, never tabsets. (Popout and floating layouts would be
  // visited as further level-0 rows, but the app opens neither.)
  model.visitNodes((node, level) => {
    if (node instanceof TabSetNode) {
      if (!first) {
        first = node;
      }
      if (level === 1) {
        lastInRootRow = node;
      }
    }
  });
  return lastInRootRow ?? first;
}
