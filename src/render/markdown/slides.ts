import { AttributeValue } from "./attributes";
import { SlideConfig } from "./comments";

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface Slide {
  config: SlideConfig;
  html: string;
}

const attributeName = /^[a-z_:][-a-z0-9_:.]*$/i;

const attributeValue = (value: AttributeValue) =>
  escapeHtml(typeof value === "string" ? value : JSON.stringify(value));

// A deck's HTML: each slide a <section> with its comment's attributes, its
// class added to "slide", and a slide marked vertical put under the one
// before it. What comes before the first slide is kept, hidden.
export function deckHTML(before: string, slides: Slide[]): string {
  let output = "";
  let h = -1; // horizontal
  let v = 0; // vertical
  slides.forEach(({ config, html }, i) => {
    const { class: classes, id, vertical, lineNo, ...attributes } = config;
    if (!vertical) {
      h += 1;
      if (i > 0 && slides[i - 1].config.vertical) {
        // The end of vertical slides.
        output += "</section>";
        v = 0;
      }
      if (i < slides.length - 1 && slides[i + 1].config.vertical) {
        // The start of vertical slides.
        output += "<section>";
      }
    } else {
      v += 1;
    }
    // Only names an attribute can have; anything else is left out.
    const attributeString = Object.entries(attributes)
      .filter(([key]) => attributeName.test(key))
      .map(([key, value]) => ` ${key}="${attributeValue(value)}"`)
      .join("");
    const className = classes ? ` ${attributeValue(classes)}` : "";
    const idString = id ? ` id="${attributeValue(id)}"` : "";
    output += `<section${attributeString}${idString} class="slide${className}" data-line="${lineNo}" data-h="${h}" data-v="${v}">${html}</section>`;
  });
  if (slides.length && slides[slides.length - 1].config.vertical) {
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
