import {
  Model,
  TabSetNode,
  type IJsonBorderNode,
  type IJsonModel,
  type IJsonRowNode,
  type IJsonTabNode,
  type IJsonTabSetNode,
} from "flexlayout-react";
import { describe, expect, it } from "vitest";
import {
  layoutShowsNotebook,
  pruneUnknownTabs,
  tabsShowingNote,
} from "./layout";
import savedByOldEngine from "./layout-0.5.21.json";

const tab = (component: string, id = component): IJsonTabNode => ({
  type: "tab",
  name: id,
  component,
  id,
  config: { component, singleton: true },
});

const tabset = (children: IJsonTabNode[], selected = 0): IJsonTabSetNode => ({
  type: "tabset",
  weight: 50,
  selected,
  children,
});

const model = (children: IJsonTabNode[], selected = 0): IJsonModel => ({
  global: { tabEnableRename: false },
  borders: [],
  layout: { type: "row", weight: 100, children: [tabset(children, selected)] },
});

// The row's children are rows or tabsets; the tests only build tabsets.
const tabsetAt = (result: IJsonModel, index = 0): IJsonTabSetNode =>
  result.layout.children[index] as IJsonTabSetNode;
// Only used on containers that hold tabs, not tab groups.
const componentsOf = (node: IJsonTabSetNode | IJsonBorderNode) =>
  (node.children as IJsonTabNode[]).map((t) => t.component);

describe("pruneUnknownTabs", () => {
  it("drops a tab whose component no longer exists and keeps the rest", () => {
    const result = pruneUnknownTabs(model([tab("Privacy"), tab("Settings")]));
    expect(componentsOf(tabsetAt(result))).toEqual(["Settings"]);
    expect(tabsetAt(result).selected).toBe(0);
  });

  it("keeps the selected tab selected when an earlier tab is dropped", () => {
    const result = pruneUnknownTabs(
      model([tab("Privacy"), tab("Note"), tab("Settings")], 2),
    );
    expect(componentsOf(tabsetAt(result))).toEqual(["Note", "Settings"]);
    expect(tabsetAt(result).selected).toBe(1);
  });

  it("moves the selection to the tab that takes the dropped tab's place", () => {
    const middle = pruneUnknownTabs(
      model([tab("Note"), tab("Privacy"), tab("Settings")], 1),
    );
    expect(componentsOf(tabsetAt(middle))).toEqual(["Note", "Settings"]);
    expect(tabsetAt(middle).selected).toBe(1);

    const last = pruneUnknownTabs(model([tab("Note"), tab("Privacy")], 1));
    expect(componentsOf(tabsetAt(last))).toEqual(["Note"]);
    expect(tabsetAt(last).selected).toBe(0);
  });

  it("leaves an emptied tabset selecting index 0, like the default layout", () => {
    const result = pruneUnknownTabs(model([tab("Privacy")]));
    expect(componentsOf(tabsetAt(result))).toEqual([]);
    expect(tabsetAt(result).selected).toBe(0);
  });

  it("returns live tabsets untouched", () => {
    const input = model([tab("Notes"), tab("Note", "note-1")], 1);
    const result = pruneUnknownTabs(input);
    expect(result).toEqual(input);
    expect(tabsetAt(result)).toBe(tabsetAt(input));
  });

  it("prunes nested rows and borders", () => {
    const input: IJsonModel = {
      global: {},
      borders: [
        {
          type: "border",
          location: "left",
          selected: 0,
          children: [tab("Privacy")],
        },
        {
          type: "border",
          location: "right",
          selected: -1,
          children: [tab("Privacy"), tab("Graph")],
        },
      ],
      layout: {
        type: "row",
        weight: 100,
        children: [
          {
            type: "row",
            weight: 50,
            children: [tabset([tab("Privacy"), tab("Settings")], 1)],
          },
          tabset([tab("Notes")]),
        ],
      },
    };
    const result = pruneUnknownTabs(input);
    const borders = result.borders ?? [];
    // A border whose only tab is gone collapses (-1 is FlexLayout's
    // "nothing selected" for borders); a collapsed border stays collapsed.
    expect(componentsOf(borders[0])).toEqual([]);
    expect(borders[0].selected).toBe(-1);
    expect(componentsOf(borders[1])).toEqual(["Graph"]);
    expect(borders[1].selected).toBe(-1);
    const nested = result.layout.children[0] as IJsonRowNode;
    expect(componentsOf(nested.children[0] as IJsonTabSetNode)).toEqual([
      "Settings",
    ]);
    expect((nested.children[0] as IJsonTabSetNode).selected).toBe(0);
    expect(componentsOf(tabsetAt(result, 1))).toEqual(["Notes"]);
  });

  it("keeps a tab group as it is", () => {
    const group = { type: "tabgroup", children: [tab("Privacy", "grouped")] };
    const input = model([tab("Privacy"), tab("Settings")]);
    tabsetAt(input).children.push(group);
    const result = pruneUnknownTabs(input);
    expect(tabsetAt(result).children).toEqual([tab("Settings"), group]);
    expect(tabsetAt(result).children[1]).toBe(group);
  });
});

// layout-0.5.21.json is what the app saved under flexlayout-react 0.5.21:
// that version's Model, driven through the app's own actions (a notebook's
// notes, a note split to the right, the settings, the graph dropped below),
// serialised with toJson() as saveCurrentLayoutModel does.
describe("a layout saved by flexlayout-react 0.5.21", () => {
  const saved = savedByOldEngine as IJsonModel;
  const restored = Model.fromJson(pruneUnknownTabs(saved));

  it("comes back with every split, size and tab as it was saved", () => {
    // In order, with the ids, names and configs of the tabs and which
    // tabset is active.
    expect(restored.toJson().layout).toMatchObject(saved.layout);
  });

  it("keeps what each tabset shows and which one is active", () => {
    const shown: string[] = [];
    restored.visitNodes((node) => {
      if (node instanceof TabSetNode) {
        shown.push(node.getSelectedNode()!.getName());
      }
    });
    // Nothing was saved as selected, so each tabset shows its first tab.
    expect(shown).toEqual(["README", "Settings", "Graph view"]);
    expect(restored.getActiveTabset()!.getChildren()[0].getId()).toBe(
      "Graph: /notebooks/fixture-drafts",
    );
  });

  it("forgets the sizes that moved to CSS and keeps its other settings", () => {
    expect(restored.toJson().global).toEqual({
      tabEnableRename: false,
      tabSetEnableMaximize: false,
    });
  });
});

describe("layoutShowsNotebook", () => {
  const noteIn = (notebookPath: string, id: string): IJsonTabNode => ({
    type: "tab",
    id,
    component: "Note",
    config: { component: "Note", notebookPath, noteFilePath: "a.md" },
  });
  const inFolder = (path: string) => path.startsWith("/lfs/");
  const modelOf = (layout: IJsonRowNode, borders: IJsonBorderNode[] = []) =>
    Model.fromJson({ global: {}, borders, layout });

  it("finds a tab in the lower half of a split, a row inside the root row", () => {
    const layout: IJsonRowNode = {
      type: "row",
      children: [
        {
          type: "row",
          children: [
            tabset([noteIn("/notebooks/a", "upper")]),
            tabset([noteIn("/lfs/b", "lower")]),
          ],
        },
      ],
    };
    expect(layoutShowsNotebook(modelOf(layout), inFolder)).toBe(true);
  });

  it("finds a tab in a border", () => {
    const layout: IJsonRowNode = {
      type: "row",
      children: [tabset([noteIn("/notebooks/a", "main")])],
    };
    const border: IJsonBorderNode = {
      type: "border",
      location: "left",
      children: [noteIn("/lfs/b", "side")],
    };
    expect(layoutShowsNotebook(modelOf(layout, [border]), inFolder)).toBe(true);
  });

  it("answers no when no tab shows such a notebook, tabs without one included", () => {
    const layout: IJsonRowNode = {
      type: "row",
      children: [tabset([noteIn("/notebooks/a", "note"), tab("Settings")])],
    };
    expect(layoutShowsNotebook(modelOf(layout), inFolder)).toBe(false);
  });
});

describe("tabsShowingNote", () => {
  const noteTab = (
    notebookPath: string,
    noteFilePath: string,
    id: string,
  ): IJsonTabNode => ({
    type: "tab",
    id,
    component: "Note",
    config: { component: "Note", notebookPath, noteFilePath },
  });

  it("finds every tab of a note, borders included, and no other", () => {
    const layout: IJsonRowNode = {
      type: "row",
      children: [
        tabset([
          noteTab("/notebooks/a", "a.md", "first"),
          noteTab("/notebooks/a", "b.md", "other note"),
        ]),
        tabset([
          noteTab("/notebooks/b", "a.md", "other notebook"),
          tab("Notes", "list"),
        ]),
      ],
    };
    const border: IJsonBorderNode = {
      type: "border",
      location: "left",
      children: [noteTab("/notebooks/a", "a.md", "side")],
    };
    const model = Model.fromJson({ global: {}, borders: [border], layout });
    const found = tabsShowingNote(model, "/notebooks/a", "a.md");
    expect(found.map((node) => node.getId()).sort()).toEqual(["first", "side"]);
  });
});
