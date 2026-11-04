import { stringifyAttributes } from "./attributes";
import { SlideConfig } from "./transform";

// A deck's HTML: markdown-it's, cut where each <!-- slide --> comment left
// its marker, each slide a <section> with the comment's attributes, and a
// slide marked vertical put under the one before it. What comes before the
// first slide is kept, hidden.
export function parseSlides(html: string, slideConfigs: SlideConfig[]): string {
  let slides = html.split("<p>[MUMESLIDE]</p>");
  const before = slides[0];
  slides = slides.slice(1);
  let output = "";
  let i = 0;
  let h = -1; // horizontal
  let v = 0; // vertical
  while (i < slides.length) {
    const slide = slides[i];
    // A slide with no comment of its own (the marker written in the note as
    // text) has none, and reading its class throws: the note does not
    // render, as in echomd.
    const slideConfig = slideConfigs[i];
    const attrString = stringifyAttributes(slideConfig);
    const classString = slideConfig["class"] || "";
    const idString = slideConfig["id"] ? `id="${slideConfig["id"]}"` : "";
    if (!slideConfig["vertical"]) {
      h += 1;
      if (i > 0 && slideConfigs[i - 1]["vertical"]) {
        // The end of vertical slides.
        output += "</section>";
        v = 0;
      }
      if (i < slides.length - 1 && slideConfigs[i + 1]["vertical"]) {
        // The start of vertical slides.
        output += "<section>";
      }
    } else {
      v += 1;
    }
    output += `<section ${attrString} ${idString}  class="slide ${classString}" data-line="${slideConfig["lineNo"]}" data-h="${h}" data-v="${v}">${slide}</section>`;
    i += 1;
  }
  if (i > 0 && slideConfigs[i - 1]["vertical"]) {
    output += "</section>";
  }
  return `
  <div style="display:none;">${before}</div>
  <div class="reveal">
    <div class="slides">
      ${output}
    </div>
  </div>
  `;
}
