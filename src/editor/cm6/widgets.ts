// R3-0 prototype, not for main: the app's widgets, written as HTML comments
// (`<!-- @crossnote.kanban "board":{...} -->`), drawn in a CodeMirror 6
// editor. The comment's text and the attributes written back are the ones
// echomd's fold-widget reads and writes (node_modules/@0xgg/echomd/addon/
// fold-widget.js), so a note means the same in both editors. A comment on
// lines of its own becomes a block widget, one inside a paragraph an inline
// one; either is atomic, so the caret steps over it and a deletion next to it
// takes all of it. Written for the check, no code borrowed.
import { getWidgetCreator, type WidgetArgs } from "@0xgg/echomd/widget";
import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Range, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { unmountWidget, widgetRoots } from "../../utilities/widgetRender";

type Attributes = WidgetArgs["attributes"];

const pattern = /^<!--\s*@[^\s]+[\s\S]*-->$/;

function parse(source: string): { name: string; attributes: Attributes } {
  const text = source
    .replace(/^<!--\s*/, "")
    .replace(/-->$/, "")
    .trim();
  const space = text.search(/\s/);
  if (space < 0) {
    return { name: text.replace(/^@/, ""), attributes: {} };
  }
  const name = text.slice(0, space).replace(/^@/, "");
  const json = text
    .slice(space + 1)
    .trim()
    .replace(/-\\->/g, "-->")
    .replace(/<!\\--/g, "<!--")
    .replace(/\\\|/g, "|");
  try {
    return {
      name,
      attributes: JSON.parse(json[0] === "{" ? json : `{${json}}`),
    };
  } catch (error) {
    return { name: "error", attributes: { message: String(error) } };
  }
}

function stringify(name: string, attributes: Attributes): string {
  const json = JSON.stringify(attributes)
    .replace(/^{/, "")
    .replace(/}$/, "")
    .replace(/-->/g, "-\\->")
    .replace(/<!--/g, "<!\\--");
  return `<!-- @${name} ${json} -->`.replace(/\|/g, "\\|");
}

class CommentWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly block: boolean,
  ) {
    super();
  }

  eq(other: CommentWidget) {
    return other.source === this.source && other.block === this.block;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement(this.block ? "div" : "span");
    wrap.className = "cm6-widget";
    const { name, attributes } = parse(this.source);
    // Where the comment is now: the widget's place moves with the text
    // before it. Nothing is changed when the text there is no longer this
    // widget's comment.
    const replace = (text: string) => {
      const from = view.posAtDOM(wrap);
      const to = from + this.source.length;
      if (view.state.sliceDoc(from, to) !== this.source) {
        return;
      }
      view.dispatch({
        changes: { from, to, insert: text },
        userEvent: "input.widget",
      });
    };
    const known = getWidgetCreator(name);
    const creator = known ?? getWidgetCreator("error");
    const element = creator({
      attributes: known ? attributes : { message: `Unknown widget: ${name}` },
      isPreview: false,
      setAttributes: (next) => replace(stringify(name, next)),
      removeSelf: () => replace(""),
      replaceSelf: (text) => {
        replace(text);
        view.focus();
      },
    });
    widgetRoots.ownedByEditor(element);
    wrap.appendChild(element);
    return wrap;
  }

  destroy(dom: HTMLElement) {
    const element = dom.firstElementChild;
    if (element) {
      unmountWidget(element);
    }
  }

  // The widget takes its own clicks and keys: a kanban board is dragged and
  // typed in.
  ignoreEvent() {
    return true;
  }
}

function build(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        return false;
      }
      if (node.name !== "CommentBlock" && node.name !== "Comment") {
        return;
      }
      const source = state.sliceDoc(node.from, node.to);
      if (!pattern.test(source)) {
        return;
      }
      const block = node.name === "CommentBlock";
      if (block) {
        const first = state.doc.lineAt(node.from);
        const last = state.doc.lineAt(node.to);
        // A block widget stands for whole lines.
        if (first.from !== node.from || last.to !== node.to) {
          return;
        }
      }
      ranges.push(
        Decoration.replace({
          widget: new CommentWidget(source, block),
          block,
        }).range(node.from, node.to),
      );
    },
  });
  return Decoration.set(ranges);
}

export const commentWidgets = StateField.define<DecorationSet>({
  create: build,
  update(widgets, transaction) {
    if (
      transaction.docChanged ||
      syntaxTree(transaction.state) !== syntaxTree(transaction.startState)
    ) {
      return build(transaction.state);
    }
    return widgets;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});
