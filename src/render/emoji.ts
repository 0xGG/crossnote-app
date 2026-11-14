// emoji-mart's data comes compressed, and emoji-mart unpacks it in place as
// it loads, its emoji index does; read before that, no emoji has an image
// and the preview gets none. Loaded here, rather than left to whoever
// imports emoji-mart first.
import { Emoji } from "emoji-mart";
import EmojiData from "emoji-mart/data/all.json";
import twemoji from "twemoji";
import { EmojiBackgroundImageFn } from "../components/EmojiWrapper";
import { enableEmoji } from "./markdown";

// The emoji the markdown stage turns :short names: into, those twemoji has
// an image for, enabled once this module has run; and the short name of
// each code point, for the images.
const emojiDefinitions: { [shortName: string]: string } = {};
const emojiCodePointToShortNameMap: { [key: string]: string } = ((data) => {
  const m: { [key: string]: string } = {};
  for (const shortName in data.emojis) {
    const emojiData: any = (data.emojis as any)[shortName];
    if (!emojiData.has_img_twitter) {
      continue;
    }
    const nonQualified: string = emojiData.non_qualified;
    const unified: string = emojiData.unified;
    if (unified) {
      m[unified.toLocaleLowerCase()] = shortName;
      const emoji = unified
        .split("-")
        .map((x) => twemoji.convert.fromCodePoint(x))
        .join("");
      if (emoji.trim()) {
        emojiDefinitions[shortName] = emoji;
      }
    }
    if (nonQualified) {
      m[nonQualified.toLocaleLowerCase()] = shortName;
      const emoji = nonQualified
        .split("-")
        .map((x) => twemoji.convert.fromCodePoint(x))
        .join("");
      if (emoji.trim() && !unified) {
        emojiDefinitions[shortName] = emoji;
      }
    }
  }
  enableEmoji(emojiDefinitions);
  return m;
})(EmojiData);

/** The short names of the emoji with an image. */
export function emojiShortNames(): string[] {
  return Object.keys(emojiDefinitions);
}

/** The emoji a :short name: stands for, if it is one with an image. */
export function emojiOfShortName(shortName: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(emojiDefinitions, shortName)
    ? emojiDefinitions[shortName]
    : undefined;
}

/**
 * How twemoji draws an emoji: an <img> whose background is the emoji's
 * place in emoji-mart's sheet. echomd draws the editor's emoji with them
 * too, with the copy of twemoji it requires (the CommonJS build, another
 * copy in the bundle than the module imported here); on the way it escapes
 * the background's address twice, so they show as an empty space.
 */
export const twemojiOptions = {
  folder: "svg",
  ext: ".svg",
  className: "emoji",
  attributes: (emoji: string, codePoint: string) => {
    try {
      const shortName = emojiCodePointToShortNameMap[codePoint];
      const html = Emoji({
        html: true,
        set: "twitter",
        emoji: shortName,
        size: 16,
        backgroundImageFn: EmojiBackgroundImageFn,
      }) as any;
      const attr: { [key: string]: string } = {};
      const attrRegExp = /\s([a-z-]+)='(.+?)'/g;
      let result;
      while ((result = attrRegExp.exec(html)) !== null) {
        const attrName = result[1];
        const attrValue = result[2];
        if (attrName !== "class") {
          attr[attrName] = attrValue.replace(/&quot;/, "");
        }
      }
      return attr;
    } catch (error) {
      return {};
    }
  },
  callback: () => {
    return "data:image/svg+xml;charset=utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
  },
};

/** Draws the emoji in an element's text as images from the sheet. */
export function renderTwemoji(element: HTMLElement) {
  // twemoji's types have attributes take nothing; it is given the emoji
  // and its code point.
  twemoji.parse(element, twemojiOptions as any);
}
