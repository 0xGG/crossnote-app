import { Model, type IJsonModel } from "flexlayout-react";
import { describe, expect, it } from "vitest";
import { tabsetForNewTab } from "./tabset";

type RowJson = IJsonModel["layout"];
type ChildJson = RowJson["children"][number];
type BorderJson = NonNullable<IJsonModel["borders"]>[number];

const tabset = (id: string): ChildJson => ({
  type: "tabset",
  id,
  children: [{ type: "tab", id: `tab-${id}`, name: id, component: "Settings" }],
});

const row = (...children: ChildJson[]): RowJson => ({ type: "row", children });

const modelOf = (layout: RowJson, borders: BorderJson[] = []) =>
  Model.fromJson({ global: {}, borders, layout });

describe("tabsetForNewTab", () => {
  it("picks the root row's last tabset, where new tabs have always landed", () => {
    const model = modelOf(
      row(tabset("a"), row(tabset("b"), tabset("c")), tabset("d")),
    );
    expect(tabsetForNewTab(model)?.getId()).toBe("d");
  });

  it("falls back to the first tabset when the root row holds only rows", () => {
    const model = modelOf(
      row(row(tabset("a"), tabset("b")), row(tabset("c"), tabset("d"))),
    );
    expect(tabsetForNewTab(model)?.getId()).toBe("a");
  });

  it("takes a tabset, not a border, even when the root row holds only rows", () => {
    const border: BorderJson = {
      type: "border",
      location: "left",
      children: [{ type: "tab", id: "border-tab", component: "Settings" }],
    };
    const model = modelOf(row(row(tabset("a"), tabset("b"))), [border]);
    expect(tabsetForNewTab(model)?.getId()).toBe("a");
  });
});
