import { describe, expect, it } from "vitest";
import { constructGraphView } from "./graphView";
import { Notebook } from "./notebook";

describe("constructGraphView", () => {
  it("signs fixed fields before D3 mutation and distinguishes paths, titles and directions", () => {
    const map: Notebook["referenceMap"]["map"] = {
      'odd/"\\\\__proto__.md': { "other.md": [] },
    };
    const notebook = {
      referenceMap: { map },
      notes: { "other.md": { title: "Title" } },
    } as unknown as Notebook;
    const first = constructGraphView(notebook);
    expect(first.nodes.map((node) => node.id)).toEqual([
      'odd/"\\\\__proto__.md',
      "other.md",
    ]);
    const signature = first.signature;
    Object.assign(first.nodes[0], { x: 4, y: 8 });
    Object.assign(first.links[0], {
      source: first.nodes[1],
      target: first.nodes[0],
    });
    expect(constructGraphView(notebook).signature).toBe(signature);
    notebook.notes["other.md"].title = "Renamed";
    expect(constructGraphView(notebook).signature).not.toBe(signature);
    notebook.notes["other.md"].title = "Title";
    notebook.referenceMap.map = {
      "other.md": { 'odd/"\\\\__proto__.md': [] },
    } as typeof notebook.referenceMap.map;
    expect(constructGraphView(notebook).signature).not.toBe(signature);
  });
});
