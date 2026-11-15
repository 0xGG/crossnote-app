import { StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { md } from "../render/markdown";
import { quoteBackground } from "./quoteStyle";

interface Block {
  tag: string;
  from: number;
  to: number;
  hidden: boolean;
  parent?: Block;
  children: Block[];
}
interface Heading {
  level: number;
  from: number;
  to: number;
  underline: number | null;
}
function parse(state: EditorState) {
  const tokens = md.parse(state.doc.toString(), {});
  const root: Block = {
    tag: "root",
    from: 0,
    to: state.doc.lines,
    hidden: true,
    children: [],
  };
  const stack = [root];
  const leaves: Block[] = [];
  const headings: Heading[] = [];
  for (const token of tokens) {
    if (token.nesting === -1) {
      stack.pop();
      continue;
    }
    if (token.type === "inline") continue;
    const parent = stack[stack.length - 1];
    const block: Block = {
      tag: ["fence", "code_block"].includes(token.type) ? "pre" : token.tag,
      from: token.map?.[0] ?? -1,
      to: token.map?.[1] ?? -1,
      hidden: token.hidden,
      parent,
      children: [],
    };
    parent.children.push(block);
    if (token.nesting === 1) stack.push(block);
    if (
      token.map &&
      ["p", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "hr", "table"].includes(
        block.tag,
      )
    ) {
      // A table is one boundary here; its existing source presentation stays.
      if (!stack.some((b) => b !== block && b.tag === "table"))
        leaves.push(block);
      if (/^h[1-6]$/.test(token.tag))
        headings.push({
          level: Number(token.tag[1]),
          from: block.from,
          to: block.to,
          underline: /^[=-]+$/.test(token.markup) ? block.to - 1 : null,
        });
    }
  }
  leaves.sort((a, b) => a.from - b.from);
  const margins = (node: Block, top: boolean): number => {
    if (node.hidden) return 0;
    const parent = node.parent;
    const atEdge = top
      ? parent?.children[0] === node
      : parent?.children[parent.children.length - 1] === node;
    if (
      atEdge &&
      (parent?.tag === "blockquote" || (top && parent?.tag === "root"))
    )
      return 0;
    if (
      /^h[1-6]$/.test(node.tag) ||
      node.tag === "blockquote" ||
      node.tag === "hr"
    )
      return 24;
    if (top) return 0;
    if (node.tag === "p")
      return parent?.tag === "li" ? 0 : parent?.tag === "root" ? 24 : 16;
    if (node.tag === "pre" || node.tag === "table") return 16;
    if (node.tag === "ul" || node.tag === "ol") {
      for (let p = parent; p; p = p.parent)
        if (p.tag === "ul" || p.tag === "ol") return 0;
      return 16;
    }
    return 0;
  };
  const boundaries: {
    from: number;
    to: number;
    gap: number;
    quoteBorders: number[];
    heading?: Heading;
  }[] = [];
  if (leaves[0]) {
    let gap = 0;
    for (let p: Block | undefined = leaves[0]; p; p = p.parent)
      gap = Math.max(gap, margins(p, true));
    if (gap)
      boundaries.push({
        from: leaves[0].from,
        to: leaves[0].from,
        gap,
        quoteBorders: [],
      });
  }
  for (let i = 1; i < leaves.length; i++) {
    const before = leaves[i - 1],
      after = leaves[i];
    if (before.to > after.from) continue;
    const parents = new Set<Block>();
    for (let p: Block | undefined = before.parent; p; p = p.parent)
      parents.add(p);
    let common = after.parent;
    while (common && !parents.has(common)) common = common.parent;
    // Only containers shared by both blocks paint the separating space.
    const containers: Block[] = [];
    for (let p = common; p; p = p.parent) containers.unshift(p);
    const quoteBorders: number[] = [];
    let indent = 0;
    for (const container of containers) {
      if (container.tag === "ul" || container.tag === "ol") indent += 32;
      if (container.tag === "blockquote") {
        quoteBorders.push(indent);
        indent += 19;
      }
    }
    let gap = 0;
    for (let p: Block | undefined = before; p && p !== common; p = p.parent)
      gap = Math.max(gap, margins(p, false));
    for (let p: Block | undefined = after; p && p !== common; p = p.parent)
      gap = Math.max(gap, margins(p, true));
    // Only real separating source lines belong to this boundary. Definitions,
    // HTML and other intervening content must keep their own presentation.
    let blank = true;
    for (let n = before.to; n < after.from; n++)
      if (!/^[\s>]*$/.test(state.doc.line(n + 1).text)) blank = false;
    if (blank)
      boundaries.push({
        from: before.to,
        to: after.from,
        gap,
        quoteBorders,
        heading: headings.find(
          (h) => h.underline !== null && h.to === before.to,
        ),
      });
  }
  return { tokens, headings, boundaries };
}

export const noteBlocks = StateField.define({
  create: parse,
  update: (value, tr) => (tr.docChanged ? parse(tr.state) : value),
});

export function blockSpacing(state: EditorState) {
  const model = state.field(noteBlocks);
  const before = new Map<number, number>();
  const blanks = new Map<number, number>();
  const gapQuotes = new Map<number, number[]>();
  const hiddenUnderlines = new Set<number>();
  const active = (h: Heading) =>
    state.selection.ranges.some(
      (r) =>
        r.from <= state.doc.line(h.to).to &&
        r.to >= state.doc.line(h.from + 1).from,
    );
  for (const h of model.headings)
    if (h.underline !== null && !active(h)) hiddenUnderlines.add(h.underline);
  for (const boundary of model.boundaries) {
    const reserved = boundary.heading && active(boundary.heading) ? 24 : 0;
    const gap = Math.max(0, boundary.gap - reserved);
    if (boundary.from < boundary.to) blanks.set(boundary.from, gap);
    else before.set(boundary.to, gap);
    gapQuotes.set(boundary.from, boundary.quoteBorders);
  }
  return { before, blanks, gapQuotes, hiddenUnderlines };
}

class HiddenUnderline extends WidgetType {
  toDOM() {
    const el = document.createElement("div");
    el.style.height = "0";
    return el;
  }
  get estimatedHeight() {
    return 0;
  }
}
const underline = new HiddenUnderline();

export const blockLayout = [
  noteBlocks,
  EditorView.decorations.compute([noteBlocks, "selection"], (state) => {
    const { before, blanks, gapQuotes, hiddenUnderlines } = blockSpacing(state);
    const gapStyle = (line: number, height: number) => {
      const borders = gapQuotes.get(line) ?? [];
      const color = borders.length
        ? "var(--preview-inset-background)"
        : "transparent";
      return `--cn-quote-gap:${height}px;--cn-quote-gap-inset:${borders[0] ?? 0}px;--cn-quote-gap-color:${color};--cn-quote-gap-background:${quoteBackground(borders)}`;
    };
    const ranges = [];
    for (const heading of state.field(noteBlocks).headings) {
      const last = heading.underline ?? heading.to;
      for (let n = heading.from; n < last; n++)
        ranges.push(
          Decoration.line({
            class: `cn-heading-line cn-heading-${heading.level}`,
          }).range(state.doc.line(n + 1).from),
        );
    }
    for (const [n, height] of before)
      if (height)
        ranges.push(
          Decoration.line({
            attributes: {
              style: `padding-top:${height}px;${gapStyle(n, height)}`,
            },
          }).range(state.doc.line(n + 1).from),
        );
    for (const [n, height] of blanks)
      ranges.push(
        Decoration.line({
          class: "cn-block-separator",
          attributes: {
            style: `line-height:${height}px;height:${height}px;min-height:0;${gapStyle(n, height)}`,
          },
        }).range(state.doc.line(n + 1).from),
      );
    for (const n of hiddenUnderlines) {
      const line = state.doc.line(n + 1);
      ranges.push(
        Decoration.replace({ widget: underline, block: true }).range(
          line.from,
          line.to,
        ),
      );
    }
    return Decoration.set(ranges, true);
  }),
];
