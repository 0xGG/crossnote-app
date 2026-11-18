import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPreview } from "./index";
import { NoteEditor } from "../editor/noteEditor";
import { NoteDocument } from "../editor/noteDocument";

let finish: (() => void) | undefined;
vi.mock("mermaid", () => ({
  default: {
    initialize() {},
    render: () =>
      new Promise((resolve) => {
        finish = () => resolve({ svg: "<svg><text>ready</text></svg>" });
      }),
  },
}));
const cleanups: (() => void)[] = [];
afterEach(async () => {
  finish?.();
  await vi.advanceTimersByTimeAsync(1);
  cleanups.splice(0).forEach((dispose) => dispose());
  finish = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

function mount(mode: "editor" | "preview") {
  const parent = document.createElement("div");
  document.body.append(parent);
  const text = "Before\n\n```mermaid\ngraph TD\n A --> B\n```\n\nEND";
  if (mode === "editor") {
    const editor = new NoteEditor({
      parent,
      document: new NoteDocument(text),
      display: "live",
      testId: "mermaid-editor",
    });
    cleanups.push(() => editor.destroy());
  } else {
    const preview = mountPreview(parent, text, { note: null });
    cleanups.push(preview.dispose);
  }
  return parent;
}

describe.each(["editor", "preview"] as const)(
  "Mermaid budget in %s",
  (mode) => {
    it("accepts completion after twenty seconds but before thirty", async () => {
      vi.useFakeTimers();
      const parent = mount(mode);
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      expect(finish).toBeTypeOf("function");
      await vi.advanceTimersByTimeAsync(25000);
      expect(parent.textContent).not.toContain("took more than");
      finish!();
      await vi.advanceTimersByTimeAsync(1);
      expect(parent.querySelector(".mermaid svg")?.textContent).toBe("ready");
    });
    const deadline =
      mode === "preview" ? "page deadline" : "per-drawing timeout";
    it(`discards a late result at the thirty-second ${deadline}`, async () => {
      vi.useFakeTimers();
      const parent = mount(mode);
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(29999);
      expect(parent.textContent).not.toContain("took more than");
      await vi.advanceTimersByTimeAsync(1);
      expect(parent.textContent).toContain("more than 30 seconds");
      finish!();
      await vi.advanceTimersByTimeAsync(1);
      expect(parent.querySelector(".mermaid svg")).toBeNull();
    });
  },
);
