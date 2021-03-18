// Import EchoMD related modules
// EchoMD
// Essential
import "@0xgg/echomd"; // ESSENTIAL
import { setTwemojiOptions } from "@0xgg/echomd/addon/emoji";
import "@0xgg/echomd/powerpack/fold-code-with-echarts";
import "@0xgg/echomd/powerpack/fold-code-with-mermaid";
import "@0xgg/echomd/powerpack/fold-code-with-plantuml";
import "@0xgg/echomd/powerpack/fold-code-with-wavedrom";
import "@0xgg/echomd/powerpack/fold-emoji-with-twemoji";
// Widgets
// Load PowerPacks if you want to utilize 3rd-party libs
import "@0xgg/echomd/powerpack/fold-math-with-katex";
import "@0xgg/echomd/powerpack/hover-with-marked";
import { enableEmoji } from "@0xgg/echomd/preview";
import { registerWidgetCreator } from "@0xgg/echomd/widget";
import "codemirror";
import "codemirror/addon/dialog/dialog.css";
import "codemirror/addon/display/placeholder";
import "codemirror/addon/hint/show-hint";
import "codemirror/keymap/emacs";
import "codemirror/keymap/sublime";
import "codemirror/keymap/vim";
// Load these modes if you want highlighting ...
import "codemirror/lib/codemirror.css";
import "codemirror/mode/htmlmixed/htmlmixed"; // for embedded HTML
import "codemirror/mode/javascript/javascript"; // eg. javascript
import "codemirror/mode/markdown/markdown";
import "codemirror/mode/python/python";
import "codemirror/mode/stex/stex"; // for Math TeX Formular
import "codemirror/mode/yaml/yaml"; // for Front Matters
import { Emoji } from "emoji-mart";
import EmojiData from "emoji-mart/data/all.json";
import twemoji from "twemoji";
import { EmojiBackgroundImageFn } from "../components/EmojiWrapper";
import { AudioWidgetCreator } from "./widgets/audio";
import { BilibiliWidgetCreator } from "./widgets/bilibili";
// import { ABCWidgetCreator } from "./widgets/abc";
import { CommentWidgetCreator } from "./widgets/comment";
import { GitHubGistWidgetCreator } from "./widgets/github_gist";
import { ImageWidgetCreator } from "./widgets/image";
import { KanbanWidgetCreator } from "./widgets/kanban";
import { OCRWidgetCreator } from "./widgets/ocr";
import { TimerWidgetCreator } from "./widgets/timer";
// import { NeteaseMusicWidgetCreator } from "./widgets/netease_music";
import { VideoWidgetCreator } from "./widgets/video";
import { YoutubeWidgetCreator } from "./widgets/youtube";

// Set necessary window scope variables
window["CodeMirror"] = require("codemirror");

// Register widget creators
registerWidgetCreator("timer", TimerWidgetCreator);
registerWidgetCreator("crossnote.image", ImageWidgetCreator);
registerWidgetCreator("crossnote.audio", AudioWidgetCreator);
// registerWidgetCreator("crossnote.netease_music", NeteaseMusicWidgetCreator);
registerWidgetCreator("crossnote.video", VideoWidgetCreator);
registerWidgetCreator("crossnote.bilibili", BilibiliWidgetCreator);
registerWidgetCreator("crossnote.youtube", YoutubeWidgetCreator);
registerWidgetCreator("crossnote.ocr", OCRWidgetCreator);
registerWidgetCreator("crossnote.kanban", KanbanWidgetCreator);
// registerWidgetCreator("crossnote.abc", ABCWidgetCreator);
registerWidgetCreator("crossnote.comment", CommentWidgetCreator);
registerWidgetCreator("crossnote.github_gist", GitHubGistWidgetCreator);

const packageJSON = require("../../package.json");
export const EchoMDVersion: string = packageJSON.dependencies["@0xgg/echomd"];

// Hack twemoji
const oldTwemojiParse = twemoji.parse;
twemoji.parse = function (what: string | HTMLElement, options: any) {
  const result = oldTwemojiParse(what, options);
  if (typeof what === "string") {
    return (
      result
        .replace(/^<img\s/, "<span ")
        .replace(/\/>$/, "")
        .replace(/&quot;/g, "")
        .replace(/src="(.+?)"/, "") + "</span>"
    );
  } else {
    const emojiElements = what.querySelectorAll(".emoji");
    for (let i = 0; i < emojiElements.length; i++) {
      const emojiElement = emojiElements[i];
      if (emojiElement.tagName.match(/IMG/i)) {
        const newElement = document.createElement("span");
        newElement.setAttribute("style", emojiElement.getAttribute("style"));
        newElement.setAttribute("class", emojiElement.getAttribute("class"));
        newElement.setAttribute("alt", emojiElement.getAttribute("alt"));
        newElement.setAttribute(
          "aria-label",
          emojiElement.getAttribute("aria-label"),
        );
        emojiElement.replaceWith(newElement);
      }
    }
    return;
  }
};
const emojiCodePointToShortNameMap: { [key: string]: string } = ((data) => {
  const m: { [key: string]: string } = {};
  const emojiDefinitions: { [key: string]: string } = {};
  for (const shortName in data.emojis) {
    const emojiData: any = (data.emojis as any)[shortName];
    if (!emojiData.has_img_twitter) {
      continue;
    }
    const nonQualified: string = emojiData.non_qualified;
    const unified: string = emojiData.unified;
    if (nonQualified) {
      m[nonQualified.toLocaleLowerCase()] = shortName;
      const emoji = twemoji.convert.fromCodePoint(nonQualified);
      if (emoji.trim()) {
        emojiDefinitions[shortName] = emoji;
      }
    }
    if (unified) {
      m[unified.toLocaleLowerCase()] = shortName;
      const emoji = twemoji.convert.fromCodePoint(unified);
      if (emoji.trim()) {
        emojiDefinitions[shortName] = emoji;
      }
    }
  }

  enableEmoji(emojiDefinitions);
  return m;
})(EmojiData);

setTwemojiOptions({
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
});
