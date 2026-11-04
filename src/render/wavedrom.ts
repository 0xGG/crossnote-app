import { Renderer, startDrawing } from "./drawing";
import { sanitizeSVG } from "./sanitize";

// wavedrom's skins, each loaded the first time a diagram is drawn in it.
const skins: Record<string, () => Promise<Record<string, unknown>>> = {
  default: () => import("wavedrom/skins/default.js"),
  dark: () => import("wavedrom/skins/dark.js"),
  lowkey: () => import("wavedrom/skins/lowkey.js"),
  narrow: () => import("wavedrom/skins/narrow.js"),
  narrower: () => import("wavedrom/skins/narrower.js"),
  narrowerer: () => import("wavedrom/skins/narrowerer.js"),
};

async function loadSkin(name: string): Promise<unknown> {
  const skin = await skins[name]();
  return ((skin as any).default ?? skin)[name];
}

let diagrams = 0;

// wavedrom has already escaped the names and labels it writes as text (with
// tspan), and writes the JsonML a source brings as it is: escaping what is
// decoded of the first leaves each to show as written, escaped once.
const escapeText = (text: unknown) =>
  String(text)
    .replace(/&(lt|gt|quot|apos|#39);/g, (_entity, name: string) =>
      name === "lt" ? "<" : name === "gt" ? ">" : name === "quot" ? '"' : "'",
    )
    .replace(/&amp;/g, "&")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const isAttributes = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const name = /^[a-zA-Z_][\w:.-]*$/;

/**
 * A drawing in JsonML as SVG markup, its text and attribute values escaped:
 * wavedrom's own stringify writes them as they are, so a name or a label in
 * the source would be markup. The skin's style sheet, the root's own style
 * element, is the one style kept, as it is; a style the source brings goes.
 */
export function toMarkup(node: unknown, skinStyle?: unknown): string {
  if (!Array.isArray(node)) {
    return node == null ? "" : escapeText(node);
  }
  const [tag, ...rest] = node;
  if (typeof tag !== "string" || !name.test(tag)) {
    return "";
  }
  if (tag === "style") {
    return node === skinStyle
      ? `<style>${rest.filter((part) => typeof part === "string").join("")}</style>`
      : "";
  }
  const attributes = isAttributes(rest[0]) ? rest.shift() : {};
  const written = Object.entries(attributes as Record<string, unknown>)
    .filter(([key]) => name.test(key))
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(" ") : value;
      return ` ${key}="${escapeText(text).replace(/"/g, "&quot;")}"`;
    })
    .join("");
  const children = rest.map((child) => toMarkup(child, skinStyle)).join("");
  return `<${tag}${written}>${children}</${tag}>`;
}

// The root's own style element, which comes from the skin.
export const ownStyle = (drawing: unknown) =>
  Array.isArray(drawing)
    ? drawing.find((child) => Array.isArray(child) && child[0] === "style")
    : undefined;

// wavedrom puts a white rectangle behind every diagram, whatever the skin;
// in a dark preview the diagram stands on the page's own colour instead.
function clearBackground(node: unknown) {
  if (!Array.isArray(node)) {
    return;
  }
  const [tag, attributes] = node;
  if (
    tag === "rect" &&
    attributes &&
    typeof attributes === "object" &&
    /fill:\s*white/.test(String(attributes.style))
  ) {
    attributes.style = String(attributes.style).replace(
      /fill:\s*white/,
      "fill:none",
    );
  }
  node.forEach(clearBackground);
}

/**
 * A wavedrom diagram (signals, registers or logic), its source read as
 * JSON, drawn by wavedrom 3 (loaded with the first one) in the skin its
 * config names, or the one that goes with the preview's theme. wavedrom
 * draws it as JsonML, which becomes SVG markup, its text escaped, that goes
 * through the sanitizer before it is put in the page: the drawing holds the
 * JsonML the source brings (in a head's text, say) as it is.
 */
export const renderWaveDrom: Renderer = (code, _info, { dark }) => {
  const element = document.createElement("div");
  element.classList.add("wavedrom");
  return startDrawing(element, async (signal) => {
    const source = JSON.parse(code);
    const named: string | undefined = source?.config?.skin;
    const [wavedrom, skin, own] = await Promise.all([
      import("wavedrom"),
      loadSkin(dark ? "dark" : "default"),
      named && Object.prototype.hasOwnProperty.call(skins, named)
        ? loadSkin(named)
        : undefined,
    ]);
    if (signal.aborted) {
      return;
    }
    // wavedrom looks the config's skin up in these by name: without a
    // prototype, "constructor" and the like are no skin.
    const waveSkins = Object.assign(Object.create(null), { default: skin });
    if (own) {
      waveSkins[named as string] = own;
    }
    const drawing = wavedrom.renderAny(
      diagrams++,
      source,
      waveSkins,
      false,
      false,
    );
    if (dark) {
      clearBackground(drawing);
    }
    element.innerHTML = sanitizeSVG(toMarkup(drawing, ownStyle(drawing)));
  });
};
