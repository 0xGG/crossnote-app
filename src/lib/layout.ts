import type { IJsonModel, IJsonTabNode } from "flexlayout-react";
import { isTabNodeComponent } from "./tabNode";

// flexlayout-react only re-exports the model and tab node shapes; derive the
// container shapes from them instead of reaching into its declarations dir.
type RowNode = IJsonModel["layout"];
type TabSetNode = Exclude<RowNode["children"][number], RowNode>;
type BorderNode = NonNullable<IJsonModel["borders"]>[number];

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

function pruneRow(row: RowNode): RowNode {
  return {
    ...row,
    children: row.children.map((child) =>
      isRow(child) ? pruneRow(child) : pruneTabs(child, 0),
    ),
  };
}

function isRow(node: RowNode | TabSetNode): node is RowNode {
  // toJson() stamps every node with its type; the attribute interfaces just
  // do not declare the field for rows and tabsets.
  return (node as { type?: string }).type === "row";
}

function pruneTabs<T extends TabSetNode | BorderNode>(
  node: T,
  emptySelection: number,
): T {
  const children: IJsonTabNode[] = node.children ?? [];
  const kept = children.filter((tab) => isTabNodeComponent(tab.component));
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
