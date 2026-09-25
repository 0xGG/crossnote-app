import type {
  IJsonBorderNode,
  IJsonModel,
  IJsonRowNode,
  IJsonTabGroupNode,
  IJsonTabNode,
  IJsonTabSetNode,
  Model,
  TabNode,
} from "flexlayout-react";
import { isTabNodeComponent } from "./tabNode";

// Whether any tab of the layout shows a notebook the test picks out, however
// deep the tab sits in rows or whether it sits in a border.
export function layoutShowsNotebook(
  model: Model,
  test: (notebookPath: string) => boolean,
): boolean {
  let found = false;
  model.visitNodes((node) => {
    if (!found && node.getType() === "tab") {
      const notebookPath: string | undefined = (node as TabNode).getConfig()
        ?.notebookPath;
      found = Boolean(notebookPath) && test(notebookPath);
    }
  });
  return found;
}

// The layout persisted in localStorage outlives the components it names: a
// tab saved by an earlier build keeps being restored after the component
// behind it is removed, and the main panel can only render it as an empty
// pane. Drop such tabs at the restore boundary and keep every container's
// selection on a tab that still exists. Nodes without stale tabs are
// returned as they are.
export function pruneUnknownTabs(model: IJsonModel): IJsonModel {
  const pruned: IJsonModel = { ...model, layout: pruneRow(model.layout) };
  if (model.borders) {
    // -1 is FlexLayout's "collapsed" selection for borders.
    pruned.borders = model.borders.map((border) => pruneTabs(border, -1));
  }
  return pruned;
}

function pruneRow(row: IJsonRowNode): IJsonRowNode {
  return {
    ...row,
    children: row.children.map((child) =>
      isRow(child) ? pruneRow(child) : pruneTabs(child, 0),
    ),
  };
}

function isRow(node: IJsonRowNode | IJsonTabSetNode): node is IJsonRowNode {
  // toJson() stamps every node with its type.
  return node.type === "row";
}

// Tab groups are off (tabSetEnableTabGroups defaults to false) and the app
// never creates one, so a saved layout holds none; one would be kept as is.
function isGroup(
  node: IJsonTabNode | IJsonTabGroupNode,
): node is IJsonTabGroupNode {
  return node.type === "tabgroup";
}

function pruneTabs<T extends IJsonTabSetNode | IJsonBorderNode>(
  node: T,
  emptySelection: number,
): T {
  const children = node.children ?? [];
  const kept = children.filter(
    (child) => isGroup(child) || isTabNodeComponent(child.component),
  );
  if (kept.length === children.length) {
    return node;
  }
  let selected = node.selected;
  if (typeof selected === "number" && selected >= 0) {
    const survivor = kept.indexOf(children[selected]);
    if (survivor >= 0) {
      selected = survivor;
    } else if (kept.length === 0) {
      selected = emptySelection;
    } else {
      // The tab that moved into the removed tab's slot, or the last one.
      selected = Math.min(selected, kept.length - 1);
    }
  }
  return { ...node, children: kept, selected };
}
