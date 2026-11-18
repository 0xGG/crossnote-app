import twemoji from "@twemoji/api";
import sheetUrl from "emoji-datasource-twitter/img/twitter/sheets-256/64.png";
import labelAliases from "./emoji-label-aliases.json";
import shortNames from "./emoji-short-names.json";

const names: Readonly<Record<string, string>> = shortNames;
const cells: Readonly<Record<string, number>> = __TWEMOJI_CELLS__;

// Each 64px picture has one transparent pixel on either side in the 62 by 62 sheet.
const grid = 62;
const stride = 66;
const picture = 64;
const pixels = grid * stride;
export const transparentPixel =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

export function emojiShortNames(): string[] {
  return Object.keys(names);
}

export function emojiOfShortName(shortName: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(names, shortName)
    ? names[shortName]
    : undefined;
}

function pictureStyle(cell: number) {
  // CSS positions percentages over the space between the scaled sheet and the image.
  const position = (index: number) =>
    (100 * (index * stride + 1)) / (pixels - picture);
  return {
    backgroundImage: `url("${sheetUrl}")`,
    backgroundSize: `${(100 * pixels) / picture}%`,
    backgroundPosition: `${position(Math.floor(cell / grid))}% ${position(cell % grid)}%`,
    backgroundRepeat: "no-repeat",
  };
}

function cellOf(text: string) {
  const key = twemoji.convert.toCodePoint(
    text.includes("\u200d") ? text : text.replace(/\ufe0f/g, ""),
  );
  return cells[key];
}

// The old icons were named by their character, primary short name and aliases.
// Aliases belong to accessible names; Markdown completion offers the primary names.
const aliases: Readonly<Record<string, string>> = labelAliases;
const labels = new Map<number, string>();
for (const [name, text] of Object.entries(names)) {
  labels.set(
    cellOf(text),
    [text, name, aliases[name]].filter(Boolean).join(", "),
  );
}

function pictureOf(text: string) {
  const cell = cellOf(text);
  if (cell === undefined) return;
  return {
    cell,
    text,
    label: labels.get(cell) ?? text,
    style: pictureStyle(cell),
  };
}

export function shortNamePicture(shortName: string) {
  const text = emojiOfShortName(shortName);
  return text && pictureOf(text);
}

const graphemes =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

interface PrintedEmoji {
  fallback: Text;
  cell: number;
  label: string;
}

async function paintPrintedEmoji(targets: PrintedEmoji[]) {
  const sheet = new Image();
  sheet.src = sheetUrl;
  try {
    await sheet.decode();
  } catch {
    // The original characters remain printable when the sheet cannot load.
    return;
  }
  for (const { fallback, cell, label } of targets) {
    if (!fallback.parentNode?.isConnected) continue;
    const canvas = document.createElement("canvas");
    canvas.width = picture;
    canvas.height = picture;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.drawImage(
      sheet,
      Math.floor(cell / grid) * stride + 1,
      (cell % grid) * stride + 1,
      picture,
      picture,
      0,
      0,
      picture,
      picture,
    );
    canvas.className = "emoji";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
    fallback.replaceWith(canvas);
  }
}

// Twemoji can recognize only the variation selector in sequences such as ☝️.
// Look up the whole grapheme so the image covers the base and its modifiers.
export function renderTwemoji(element: HTMLElement, forPrint = false) {
  if (!graphemes) return;
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
        return node instanceof SVGElement ||
          (node as Element).matches(
            "iframe,noframes,noscript,script,select,style,textarea",
          )
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP;
      },
    },
  );
  const printed: PrintedEmoji[] = [];
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (twemoji.test(node.textContent)) textNodes.push(node as Text);
  }
  for (const node of textNodes) {
    const text = node.data;
    const fragment = document.createDocumentFragment();
    let end = 0;
    for (const { segment, index } of graphemes.segment(text)) {
      if (!twemoji.test(segment)) continue;
      const picture = pictureOf(segment);
      if (!picture) continue;
      fragment.append(text.slice(end, index));
      end = index + segment.length;
      if (forPrint) {
        const fallback = document.createTextNode(segment);
        fragment.append(fallback);
        printed.push({ fallback, cell: picture.cell, label: picture.label });
        continue;
      }
      const image = document.createElement("img");
      image.className = "emoji";
      image.alt = segment;
      image.setAttribute("aria-label", picture.label);
      image.src = transparentPixel;
      image.draggable = false;
      Object.assign(image.style, picture.style, {
        width: "1.2em",
        height: "1.2em",
      });
      fragment.append(image);
    }
    if (end) {
      fragment.append(text.slice(end));
      node.replaceWith(fragment);
    }
  }
  if (printed.length) return paintPrintedEmoji(printed);
}
