import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, expect, it, vi } from "vitest";
import { renderMermaid } from "../render/mermaid";
import type { Drawing } from "../render/drawing";
import { codePreview } from "./codePreview";

vi.mock("../render/mermaid", () => ({ renderMermaid: vi.fn() }));
let view: EditorView;
afterEach(() => {
  view?.destroy();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it("disposes pending diagrams on activation and redraws only live widgets on theme changes", async () => {
  const drawings: (Drawing & { finish: () => void })[] = [];
  vi.mocked(renderMermaid).mockImplementation(() => {
    let finish = () => {};
    const drawing = {
      element: document.createElement("div"),
      done: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      started: Promise.resolve(),
      dispose: vi.fn(() => finish()),
      giveUp: vi.fn(),
      finish: () => finish(),
    };
    drawings.push(drawing);
    return drawing;
  });
  const parent = document.createElement("div");
  parent.dataset.previewTheme = "light";
  document.body.append(parent);
  const doc = "```mermaid\ngraph TD; A-->B\n```\n\nEND";
  view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [codePreview],
    }),
  });
  expect(renderMermaid).toHaveBeenLastCalledWith("graph TD; A-->B\n", {
    dark: false,
  });
  view.dispatch({ selection: { anchor: 12 } });
  expect(drawings[0].dispose).toHaveBeenCalledOnce();
  drawings[0].finish();
  parent.dataset.previewTheme = "dark";
  await Promise.resolve();
  expect(renderMermaid).toHaveBeenCalledTimes(1);
  view.dispatch({ selection: { anchor: doc.length } });
  expect(renderMermaid).toHaveBeenLastCalledWith("graph TD; A-->B\n", {
    dark: true,
  });
  parent.dataset.previewTheme = "light";
  await Promise.resolve();
  expect(drawings[1].dispose).toHaveBeenCalledOnce();
  expect(renderMermaid).toHaveBeenCalledTimes(3);
  drawings[2].finish();
  view.destroy();
  expect(drawings[2].dispose).toHaveBeenCalledOnce();
});
