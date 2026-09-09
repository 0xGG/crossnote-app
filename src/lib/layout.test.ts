import type { IJsonModel, IJsonTabNode } from "flexlayout-react";
import { describe, expect, it } from "vitest";
import { pruneUnknownTabs } from "./layout";

type TabSetJson = Exclude<
  IJsonModel["layout"]["children"][number],
  IJsonModel["layout"]
>;

const tab = (component: string, id = component): IJsonTabNode => ({
  type: "tab",
  name: id,
  component,
  id,
  config: { component, singleton: true },
});

const tabset = (children: IJsonTabNode[], selected = 0): TabSetJson => ({
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
const tabsetAt = (result: IJsonModel, index = 0): TabSetJson =>
  result.layout.children[index] as TabSetJson;
const componentsOf = (node: { children: IJsonTabNode[] }) =>
  node.children.map((t) => t.component);

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
    const nested = result.layout.children[0] as IJsonModel["layout"];
    expect(componentsOf(nested.children[0] as TabSetJson)).toEqual([
      "Settings",
    ]);
    expect((nested.children[0] as TabSetJson).selected).toBe(0);
    expect(componentsOf(tabsetAt(result, 1))).toEqual(["Notes"]);
  });
});
