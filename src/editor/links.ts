import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";
import { md } from "../render/markdown";
import { noteLinkTarget } from "../render/markdown/linkTargets";

/** What a link in a note's text leads to. */
export interface NoteLink {
  // A markdown link or a bare address; a wiki link; a hashtag.
  kind: "link" | "wiki" | "hashtag";
  // The decoded Markdown address, the note a wiki link names, or the tag's text.
  target: string;
}

const label = (text: string) =>
  text
    .replace(/^\[|\]$/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

interface LinkDestination {
  target: string;
  title: string;
}

function destination(
  state: EditorState,
  node: SyntaxNode,
): LinkDestination | null {
  const url = node.getChild("URL");
  const title = node.getChild("LinkTitle");
  return url
    ? {
        target: md.utils.unescapeAll(
          state.sliceDoc(url.from, url.to).replace(/^<(.*)>$/, "$1"),
        ),
        title: title
          ? md.utils.unescapeAll(state.sliceDoc(title.from + 1, title.to - 1))
          : "",
      }
    : null;
}

// Images can use the same definition many times in one viewport. Read the
// definitions once per parsed state, not once for every image decoration.
const references = new WeakMap<
  EditorState,
  { tree: Tree; values: Map<string, LinkDestination> }
>();

function referenced(state: EditorState, name: string): LinkDestination | null {
  // The line may be anywhere in the note, past what has been read so far.
  const tree =
    ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state);
  let cached = references.get(state);
  if (!cached || cached.tree !== tree) {
    const values = new Map<string, LinkDestination>();
    tree.iterate({
      enter: (node) => {
        if (node.name === "LinkReference") {
          const its = node.node.getChild("LinkLabel");
          const target = destination(state, node.node);
          if (its && target) {
            const named = label(state.sliceDoc(its.from, its.to));
            if (!values.has(named)) {
              values.set(named, target);
            }
          }
          return false;
        }
      },
    });
    cached = { tree, values };
    references.set(state, cached);
  }
  return cached.values.get(name) ?? null;
}

/** The destination of a markdown link or image, inline or by reference. */
export function linkDestination(
  state: EditorState,
  node: SyntaxNode,
): LinkDestination | null {
  const inline = destination(state, node);
  if (inline) {
    return inline;
  }
  const marks = node.getChildren("LinkMark");
  if (marks.length < 2) {
    return null;
  }
  // Full, collapsed and shortcut references use the same definition rules.
  const its = node.getChild("LinkLabel");
  const named = its ? label(state.sliceDoc(its.from, its.to)) : "";
  return referenced(
    state,
    named || label(state.sliceDoc(marks[0].to, marks[1].from)),
  );
}

const hasScheme = (text: string) => /^[a-z][a-z\d+.-]*:/i.test(text);

// An address written out in the text, as the preview takes it: one that
// starts with "www." is a web page (asked first, as a port after its host
// reads like a scheme), and an e-mail address is no link there. Left as
// written, either would be taken for the path of a note, and the note made.
function bareAddress(text: string): NoteLink | null {
  if (/^www\./i.test(text)) {
    return { kind: "link", target: `http://${text}` };
  }
  return hasScheme(text) ? { kind: "link", target: text } : null;
}

// An address in angle brackets: one without a scheme is an e-mail address,
// which the preview makes a link to write to.
function addressInAngles(text: string): NoteLink {
  const address = text.replace(/^<|>$/g, "");
  return {
    kind: "link",
    target: hasScheme(address) ? address : `mailto:${address}`,
  };
}

function linkOf(state: EditorState, node: SyntaxNode): NoteLink | null {
  const text = state.sliceDoc(node.from, node.to);
  switch (node.name) {
    case "WikiLink": {
      const parts = text.slice(2, -2).split("|");
      return { kind: "wiki", target: parts[0].trim() };
    }
    case "Hashtag":
      return {
        kind: "hashtag",
        target: text.replace(/^#/, "").replace(/#$/, "").trim(),
      };
    case "URL":
      // One inside a link is that link's address; the link answers for it.
      return ["Link", "Image", "Autolink"].includes(node.parent?.name ?? "")
        ? null
        : bareAddress(text);
    case "Autolink":
      return addressInAngles(text);
    case "Link": {
      const target = linkDestination(state, node);
      return target === null
        ? null
        : { kind: "link", target: noteLinkTarget(target.target) };
    }
  }
  return null;
}

/** The link a place in a note's text is in, if it is in one. */
export function linkAt(state: EditorState, pos: number): NoteLink | null {
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) {
    for (
      let node: SyntaxNode | null = tree.resolveInner(pos, side);
      node;
      node = node.parent
    ) {
      const link = linkOf(state, node);
      if (link) {
        return link;
      }
    }
  }
  return null;
}

/**
 * Tells the app of a click on a link with Ctrl, Cmd or Alt held, and keeps
 * the click from moving the caret. A plain click is the editor's.
 */
export function linkClicks(
  onLinkClick: (link: NoteLink, event: MouseEvent) => void,
): Extension {
  return EditorView.domEventHandlers({
    mousedown: (event, view) => {
      if (
        event.button !== 0 ||
        !(event.ctrlKey || event.metaKey || event.altKey)
      ) {
        return false;
      }
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const link = pos === null ? null : linkAt(view.state, pos);
      if (!link) {
        return false;
      }
      event.preventDefault();
      onLinkClick(link, event);
      return true;
    },
  });
}
