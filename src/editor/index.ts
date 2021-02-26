// Import EchoMD related modules
// EchoMD
// Essential
import "@0xgg/echomd"; // ESSENTIAL
import "@0xgg/echomd/powerpack/fold-code-with-echarts";
import "@0xgg/echomd/powerpack/fold-code-with-mermaid";
import "@0xgg/echomd/powerpack/fold-code-with-plantuml";
import "@0xgg/echomd/powerpack/fold-code-with-wavedrom";
// Widgets
// Load PowerPacks if you want to utilize 3rd-party libs
import "@0xgg/echomd/powerpack/fold-math-with-katex";
import "@0xgg/echomd/powerpack/hover-with-marked";
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
