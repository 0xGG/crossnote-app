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
//   reveal.js read them; the data-* ones reveal.js loads as media must hold
//   a safe address, and the two it writes into HTML as they are go;
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
const addressAttributes = /^data-(background-(image|video|iframe)|src)$/;

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
// read as JSON.
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

// A wiki link names a note, and a note's name can start like an address
// with a scheme ("Todo: groceries"), which no page address check lets
// through; it is kept as a path to the note instead.
const schemeLike = /^[a-z][a-z\d+.-]*:/i;

purify.addHook("uponSanitizeAttribute", (node, data) => {
  if (
    data.attrName === "href" &&
    (node as Element).hasAttribute("data-wikilink-url") &&
    schemeLike.test(data.attrValue) &&
    !/^https?:/i.test(data.attrValue)
  ) {
    data.attrValue = `./${data.attrValue}`;
  }
  if (
    writtenAsHTML.includes(data.attrName) ||
    // wavedrom's own loader evaluates any element with this type as script.
    (data.attrName === "type" && /^wavedrom$/i.test(data.attrValue)) ||
    (addressAttributes.test(data.attrName) && !isSafeAddress(data.attrValue)) ||
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
    // KaTeX pairs the MathML a screen reader reads with the TeX it came
    // from; both elements hold text only. Without them the TeX would be read
    // out as part of the formula.
    ADD_TAGS: ["semantics", "annotation"],
    ADD_ATTR: ["encoding"],
  });
}
