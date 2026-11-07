import createDOMPurify from "dompurify";

// What a note's HTML may keep once rendered. Every place a note is drawn (the
// preview, a kanban card, printing) passes the markdown
// stage's output through sanitizeHTML before it reaches the page, so the
// rules live here only:
// - no scripts, event handler attributes or javascript: style addresses
//   (DOMPurify's defaults);
// - no style elements, frames, plugins or forms: a note's HTML is content,
//   not page furniture, and embedded video goes through the youtube and
//   bilibili widgets;
// - data-* and style attributes stay, as the preview and the widgets read
//   them;
// - ids stay as written, even one that names a property of document (the
//   heading "Title" gets the id "title"), or the headings' anchors would
//   break. DOMPurify's own check, which drops such ids, is off. What it
//   guards against is an element standing in for a property of document,
//   which only forms, frames, plugins and images that have a name can do
//   (an image then by its id as well): the first three are not allowed, and
//   every name on an image is dropped, as is any name that is itself a
//   property of document.
const purify = createDOMPurify(window);

const forbiddenTags = [
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "form",
  "button",
  "select",
  "textarea",
];

// A wiki link names a note, and a note's name can hold a colon ("Todo:
// groceries", "Book review: Dune"), which DOMPurify's address check, as it
// ignores spaces, can take for the end of a scheme and then not let
// through; such a link is kept as a path to the note instead.

purify.addHook("uponSanitizeAttribute", (node, data) => {
  // A diagram's use element repeats a shape the drawing defines; one that
  // names anything outside the page, which it would fetch, goes without it.
  if (
    node.nodeName.toLowerCase() === "use" &&
    /^(xlink:)?href$/i.test(data.attrName) &&
    !data.attrValue.trim().startsWith("#")
  ) {
    data.keepAttr = false;
  }
  if (
    data.attrName === "href" &&
    (node as Element).hasAttribute("data-wikilink-url") &&
    data.attrValue.includes(":") &&
    !/^([./#]|https?:)/i.test(data.attrValue)
  ) {
    data.attrValue = `./${data.attrValue}`;
  }
  if (
    data.attrName === "name" &&
    (node.nodeName === "IMG" || data.attrValue in document)
  ) {
    data.keepAttr = false;
  }
});

/**
 * What a diagram library drew, as SVG markup, through the same sanitizer and
 * hooks as a note's HTML, with what a drawing holds kept: SVG's elements and
 * filters, use elements that repeat a shape defined in the page, the
 * drawing's own style sheet, and HTML labels inside foreignObject (sanitized
 * as HTML), formulas in them included.
 */
export function sanitizeSVG(svg: string): string {
  const drawing = purify.sanitize(svg, {
    // A note's HTML may not have these, nor a drawing; a style element may
    // be a drawing's own.
    FORBID_TAGS: [...forbiddenTags.filter((tag) => tag !== "style"), "input"],
    USE_PROFILES: { svg: true, svgFilters: true, html: true, mathMl: true },
    // KaTeX's MathML, as in sanitizeHTML, for formulas in labels.
    ADD_TAGS: ["foreignObject", "semantics", "annotation", "use"],
    ADD_ATTR: ["encoding"],
    // HTML may sit in foreignObject, sanitized as HTML; DOMPurify takes it
    // out otherwise.
    HTML_INTEGRATION_POINTS: { "annotation-xml": true, "foreignobject": true },
    SANITIZE_DOM: false,
    RETURN_DOM_FRAGMENT: true,
  });
  // A drawing's own style sheet sits at its root; one further in came with
  // what the drawing shows (a label, say) and would style the whole page.
  for (const style of Array.from(drawing.querySelectorAll("style"))) {
    const parent = style.parentNode;
    if (
      !parent ||
      parent.nodeName.toLowerCase() !== "svg" ||
      parent.parentNode !== drawing
    ) {
      style.remove();
    }
  }
  const holder = document.createElement("div");
  holder.appendChild(drawing);
  return holder.innerHTML;
}

export function sanitizeHTML(html: string): string {
  return purify.sanitize(html, {
    FORBID_TAGS: forbiddenTags,
    SANITIZE_DOM: false,
    // KaTeX writes, beside what is seen, MathML for screen readers: a
    // semantics element holds the formula's MathML (which is sanitized as
    // any other) and an annotation with the TeX it came from, as text.
    // Without the two, the TeX would sit inside the formula as text of its
    // own.
    ADD_TAGS: ["semantics", "annotation"],
    ADD_ATTR: ["encoding"],
  });
}
