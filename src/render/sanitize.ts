import createDOMPurify from "dompurify";

// What a note's HTML may keep once rendered. Every place a note is drawn (the
// preview, a kanban card, printing, the slides' frame) passes the markdown
// stage's output through sanitizeHTML before it reaches the page, so the
// rules live here only:
// - no scripts, event handler attributes or javascript: style addresses
//   (DOMPurify's defaults);
// - no style elements, frames, plugins or forms: a note's HTML is content,
//   not page furniture, and embedded video goes through the youtube and
//   bilibili widgets;
// - data-* and style attributes stay, as the preview, the widgets and
//   reveal.js read them. The data-* ones reveal.js loads as media (slide
//   backgrounds, background videos and frames, lazily loaded src) must hold
//   a safe address with no quotes or angle brackets in it, as reveal.js
//   writes a background video's into HTML of its own; the two it writes
//   into HTML as they are, data-notes and data-preview-link, go;
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

// reveal.js's slide backgrounds and lazy-loaded media.
const addressAttributes =
  /^data-(background|background-(image|video|iframe)|src)$/;

// Attributes reveal.js writes into HTML of its own as they are: a slide's
// speaker notes (its notes in an aside stay, as sanitized HTML) and a link
// to show in a preview frame.
const writtenAsHTML = ["data-notes", "data-preview-link"];

export function isSafeAddress(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  const address = value.replace(/[\u0000-\u0020]/g, "");
  return /^(?:https?:|[^a-z]|[a-z][a-z\d+.-]*(?:[^a-z\d+.\-:]|$))/i.test(
    address,
  );
}

// A wavedrom code block comes out of the markdown stage as a script element
// of type WaveDrom holding the diagram's source. The source stays as text
// where the element was; the preview and the slides draw it from that text,
// read as JSON. What wavedrom then draws is not sanitized: its renderer
// writes markup the source holds into the page as it is, in the preview as
// in the slides, until wavedrom is drawn by a renderer whose output can be
// sanitized before it reaches the page.
purify.addHook("uponSanitizeElement", (node, data) => {
  if (
    data.tagName === "script" &&
    /^wavedrom$/i.test((node as Element).getAttribute("type") || "")
  ) {
    node.parentNode?.insertBefore(
      node.ownerDocument.createTextNode(node.textContent || ""),
      node,
    );
  }
});

// A wiki link names a note, and a note's name can hold a colon ("Todo:
// groceries", "Book review: Dune"), which DOMPurify's address check, as it
// ignores spaces, can take for the end of a scheme and then not let
// through; such a link is kept as a path to the note instead.

purify.addHook("uponSanitizeAttribute", (node, data) => {
  if (
    data.attrName === "href" &&
    (node as Element).hasAttribute("data-wikilink-url") &&
    data.attrValue.includes(":") &&
    !/^([./#]|https?:)/i.test(data.attrValue)
  ) {
    data.attrValue = `./${data.attrValue}`;
  }
  if (
    writtenAsHTML.includes(data.attrName) ||
    // wavedrom's own loader evaluates any element with this type as script.
    (data.attrName === "type" && /^wavedrom$/i.test(data.attrValue)) ||
    (addressAttributes.test(data.attrName) &&
      (!isSafeAddress(data.attrValue) || /["'<>`]/.test(data.attrValue))) ||
    (data.attrName === "name" &&
      (node.nodeName === "IMG" || data.attrValue in document))
  ) {
    data.keepAttr = false;
  }
});

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
