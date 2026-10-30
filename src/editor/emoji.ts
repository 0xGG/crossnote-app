import { enableEmoji } from "@0xgg/echomd/preview";
import EmojiData from "emoji-mart/data/all.json";
import twemoji from "twemoji";

// The emoji the preview's markdown turns :short names: into, those
// twemoji has an image for, enabled once this module has run; and the
// short name of each code point, for the images. A module of its own so
// that the tests of what the preview renders can set the markdown up as
// the app does, without the editor.
export const emojiCodePointToShortNameMap: { [key: string]: string } = ((
  data,
) => {
  const m: { [key: string]: string } = {};
  const emojiDefinitions: { [key: string]: string } = {};
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
