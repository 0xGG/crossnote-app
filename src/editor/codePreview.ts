import {
  StateField,
  Prec,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { noteBlocks, blockSpacing } from "./blockLayout";
import { renderCodeBlock } from "../render/codeBlock";
import { waitForDrawing, isDarkPreview, type Drawing } from "../render/drawing";
import { renderMermaid } from "../render/mermaid";

interface Container {
  tag: string;
  line: number;
  start: number;
}
interface CodeBlock {
  from: number;
  to: number;
  firstLine: number;
  code: string;
  language: string;
  fenced: boolean;
  containers: Container[];
  spaceBefore: number;
}

// Use the preview parser's code content, including de-indentation inside
// lists/quotes. It also distinguishes literal fences in HTML/front matter.
function blocks(state: EditorState): CodeBlock[] {
  const found: CodeBlock[] = [];
  const parents: Container[] = [];
  const spacing = blockSpacing(state);
  for (const token of state.field(noteBlocks).tokens) {
    if (token.nesting === -1) parents.pop();
    if (token.nesting === 1) {
      if (token.tag === "li") {
        const list = parents[parents.length - 1];
        if (list?.tag === "ol") list.start++;
      }
      parents.push({
        tag: token.tag,
        line: token.map?.[0] ?? -1,
        start:
          Number(token.attrGet("start") ?? 1) - (token.tag === "ol" ? 1 : 0),
      });
    }
    if (!token.map || !["fence", "code_block"].includes(token.type)) continue;
    const language = token.info.trim().match(/^[^\s{]*/)![0] || "text";
    found.push({
      from: state.doc.line(token.map[0] + 1).from,
      to: state.doc.line(Math.min(token.map[1], state.doc.lines)).to,
      firstLine: token.map[0],
      code: token.content,
      language,
      fenced: token.type === "fence",
      spaceBefore: spacing.before.get(token.map[0]) ?? 0,
      containers: parents
        .filter((p) => ["blockquote", "ul", "ol", "li"].includes(p.tag))
        .map((p) => ({ ...p })),
    });
  }
  // Footnote tokens are emitted at the end of the preview, independently
  // of where their definitions occur in the source document.
  return found.sort((a, b) => a.from - b.from);
}

const cleanups = new WeakMap<HTMLElement, () => void>();

export class CodePreviewWidget extends WidgetType {
  constructor(readonly block: CodeBlock) {
    super();
  }
  eq(other: CodePreviewWidget) {
    return JSON.stringify(this.block) === JSON.stringify(other.block);
  }
  toDOM(view: EditorView) {
    const root = document.createElement("div");
    root.className = "preview cn-code-preview";
    root.style.paddingTop = `${this.block.spaceBefore}px`;
    let parent: HTMLElement = root;
    for (const container of this.block.containers) {
      const element = document.createElement(container.tag);
      if (container.tag === "ol")
        element.setAttribute("start", String(container.start));
      if (container.tag === "li" && container.line !== this.block.firstLine)
        element.style.listStyle = "none";
      parent.append(element);
      parent = element;
    }
    const diagram = this.block.language === "mermaid";
    let dark = isDarkPreview(view.dom);
    let drawing: Drawing;
    let waiting: ReturnType<typeof waitForDrawing>;
    const draw = () => {
      waiting?.stop();
      drawing?.dispose();
      drawing = diagram
        ? renderMermaid(this.block.code, { dark })
        : renderCodeBlock(
            this.block.code,
            this.block.language,
            !this.block.fenced,
          );
      parent.replaceChildren(drawing.element);
      waiting = waitForDrawing(drawing);
      void waiting.settled.then(() => {
        if (root.isConnected) view.requestMeasure();
      });
    };
    draw();
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => view.requestMeasure());
    resize?.observe(root);
    const theme = diagram
      ? new MutationObserver(() => {
          const next = isDarkPreview(view.dom);
          if (next !== dark) {
            dark = next;
            draw();
          }
        })
      : null;
    theme?.observe(
      view.dom.closest("[data-preview-theme]") ?? document.documentElement,
      { attributes: true, attributeFilter: ["data-preview-theme"] },
    );
    cleanups.set(root, () => {
      waiting.stop();
      drawing.dispose();
      resize?.disconnect();
      theme?.disconnect();
    });
    root.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey)
        return;
      const selection = root.ownerDocument.getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        root.contains(selection.anchorNode)
      )
        return;
      const top = root.getBoundingClientRect().top;
      const codeTop = drawing.element.getBoundingClientRect().top;
      const lineHeight = parseFloat(
        getComputedStyle(drawing.element).lineHeight,
      );
      const row = diagram
        ? 0
        : Math.max(
            0,
            Math.floor(
              (event.clientY -
                codeTop -
                parseFloat(getComputedStyle(drawing.element).paddingTop)) /
                lineHeight,
            ),
          );
      const first = view.state.doc.lineAt(this.block.from);
      const line = view.state.doc.line(
        Math.min(
          view.state.doc.lineAt(this.block.to).number,
          first.number + row + (this.block.fenced ? 1 : 0),
        ),
      );
      event.preventDefault();
      view.dispatch({ selection: { anchor: line.from } });
      view.focus();
      view.requestMeasure({
        read: () =>
          view.lineBlockAt(this.block.from).top + view.documentTop - top,
        write: (delta) => {
          view.scrollDOM.scrollTop += delta;
        },
      });
    });
    return root;
  }
  ignoreEvent() {
    return true;
  }
  destroy(dom: HTMLElement) {
    cleanups.get(dom)?.();
    cleanups.delete(dom);
  }
}

const codeBlocks = StateField.define<CodeBlock[]>({
  create: blocks,
  update: (value, tr) =>
    tr.docChanged || tr.selection ? blocks(tr.state) : value,
});
export const codePreview: Extension = [
  noteBlocks,
  codeBlocks,
  Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (
          view.composing ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          !view.state.selection.main.empty
        )
          return false;
        const at = view.state.selection.main.head;
        const line = view.state.doc.lineAt(at);
        const block = view.state.field(codeBlocks).find((block) => {
          if (at >= block.from && at <= block.to) return false;
          if (event.key === "ArrowUp")
            return line.number === view.state.doc.lineAt(block.to).number + 1;
          if (event.key === "ArrowDown")
            return line.number === view.state.doc.lineAt(block.from).number - 1;
          if (event.key === "ArrowLeft") return at === block.to + 1;
          if (event.key === "ArrowRight") return at === block.from - 1;
          return false;
        });
        if (!block) return false;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const down = event.key === "ArrowDown";
          const cursor = view.coordsAtPos(
            at,
            view.state.selection.main.assoc || 1,
          );
          const boundary = view.coordsAtPos(
            down ? line.to : line.from,
            down ? -1 : 1,
          );
          // Leave movement inside wrapped prose to the normal cursor command.
          if (!cursor || !boundary || Math.abs(cursor.top - boundary.top) > 1)
            return false;
        }
        const anchor =
          event.key === "ArrowUp" || event.key === "ArrowLeft"
            ? block.to
            : block.from;
        view.dispatch({ selection: { anchor }, scrollIntoView: true });
        event.preventDefault();
        return true;
      },
      copy(event, view) {
        const selection = view.dom.ownerDocument.getSelection();
        const node = selection?.anchorNode;
        const element = node instanceof Element ? node : node?.parentElement;
        const widget = element?.closest(".cn-code-preview");
        if (
          !selection ||
          selection.isCollapsed ||
          !widget?.contains(selection.focusNode) ||
          !event.clipboardData
        )
          return false;
        event.clipboardData.setData("text/plain", selection.toString());
        event.preventDefault();
        return true;
      },
    }),
  ),
  EditorView.decorations.compute([codeBlocks, "selection"], (state) =>
    Decoration.set(
      state
        .field(codeBlocks)
        .filter(
          (block) =>
            !state.selection.ranges.some(
              (range) => range.from <= block.to && range.to >= block.from,
            ),
        )
        .map((block) =>
          Decoration.replace({
            widget: new CodePreviewWidget(block),
            block: true,
          }).range(block.from, block.to),
        ),
    ),
  ),
];
