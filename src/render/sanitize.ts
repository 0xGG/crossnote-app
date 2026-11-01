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
//   reveal.js read them; the data-* ones that hold an address must hold a
//   safe one, as reveal.js loads them;
// - ids stay as written, even one that names a property of document (the
//   heading "Title" gets the id "title"), or the headings' anchors would
//   break; a name that does is dropped instead. Without forms, objects and
//   named images, nothing in a note can then stand in for a property of
//   document, which is what DOMPurify's own check (off here) guards against.
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

export function isSafeAddress(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  const address = value.replace(/[\u0000- ]/g, "");
  return /^(?:https?:|[^a-z]|[a-z][a-z\d+.-]*(?:[^a-z\d+.\-:]|$))/i.test(
    address,
  );
}

purify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (
    (addressAttributes.test(data.attrName) && !isSafeAddress(data.attrValue)) ||
    (data.attrName === "name" && data.attrValue in document)
  ) {
    data.keepAttr = false;
  }
});

export function sanitizeHTML(html: string): string {
  return purify.sanitize(html, {
    FORBID_TAGS: forbiddenTags,
    SANITIZE_DOM: false,
  });
}
