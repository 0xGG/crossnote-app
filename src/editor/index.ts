// Import VickyMD related modules
// VickyMD
import "codemirror";
// Load these modes if you want highlighting ...
import "codemirror/lib/codemirror.css";
import "codemirror/addon/dialog/dialog.css";
import "codemirror/mode/htmlmixed/htmlmixed"; // for embedded HTML
import "codemirror/mode/markdown/markdown";
import "codemirror/mode/stex/stex"; // for Math TeX Formular
import "codemirror/mode/yaml/yaml"; // for Front Matters
import "codemirror/mode/javascript/javascript"; // eg. javascript
import "codemirror/mode/python/python";
import "codemirror/addon/display/placeholder";
import "codemirror/addon/hint/show-hint";
import "codemirror/keymap/vim";
import "codemirror/keymap/emacs";

// Essential
import "vickymd"; // ESSENTIAL
// Widgets
// Load PowerPacks if you want to utilize 3rd-party libs
import "vickymd/powerpack/fold-math-with-katex";
import "vickymd/powerpack/fold-code-with-mermaid";
import "vickymd/powerpack/fold-code-with-plantuml";
import "vickymd/powerpack/fold-code-with-echarts";
import "vickymd/powerpack/fold-code-with-wavedrom";
import "vickymd/powerpack/hover-with-marked";
import { registerWidgetCreator } from "vickymd/widget";
import { TimerWidgetCreator } from "./widgets/timer";
import { ImageWidgetCreator } from "./widgets/image";
import { AudioWidgetCreator } from "./widgets/audio";
// import { NeteaseMusicWidgetCreator } from "./widgets/netease_music";
import { VideoWidgetCreator } from "./widgets/video";
import { BilibiliWidgetCreator } from "./widgets/bilibili";
import { YoutubeWidgetCreator } from "./widgets/youtube";
import { OCRWidgetCreator } from "./widgets/ocr";
import { KanbanWidgetCreator } from "./widgets/kanban";
// import { ABCWidgetCreator } from "./widgets/abc";
import { CommentWidgetCreator } from "./widgets/comment";
import { GitHubGistWidgetCreator } from "./widgets/github_gist";

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
