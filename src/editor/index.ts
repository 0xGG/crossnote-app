// Import EchoMD related modules
// EchoMD
// Essential
import "@0xgg/echomd"; // ESSENTIAL
import { setTwemojiOptions } from "@0xgg/echomd/addon/emoji";
import { suggestedEditorConfig } from "@0xgg/echomd/core";
import { wrapTexts } from "@0xgg/echomd/keymap/hypermd";
import "@0xgg/echomd/powerpack/fold-code-with-mermaid";
import "@0xgg/echomd/powerpack/fold-emoji-with-twemoji";
// Load PowerPacks if you want to utilize 3rd-party libs
import "@0xgg/echomd/powerpack/fold-math-with-katex";
import "@0xgg/echomd/powerpack/hover-with-marked";
import CodeMirror from "codemirror";
import "codemirror/addon/dialog/dialog.css";
import "codemirror/addon/display/placeholder";
import "codemirror/addon/hint/show-hint";
// Several of the language modes loaded at runtime (rst, django, rust, gfm and
// others) are built with these; a mode script finds them on the CodeMirror
// set on window below.
import "codemirror/addon/mode/multiplex";
import "codemirror/addon/mode/overlay";
import "codemirror/addon/mode/simple";
import "codemirror/keymap/sublime";
// Load these modes if you want highlighting ...
import "codemirror/lib/codemirror.css";
import "codemirror/mode/htmlmixed/htmlmixed"; // for embedded HTML
import "codemirror/mode/javascript/javascript"; // eg. javascript
import "codemirror/mode/markdown/markdown";
import "codemirror/mode/python/python";
import "codemirror/mode/stex/stex"; // for Math TeX Formular
import "codemirror/mode/yaml/yaml"; // for Front Matters
import "codemirror/mode/yaml-frontmatter/yaml-frontmatter"; // plain text source code
import { withPlainTextFallback } from "../lib/editorMode";
import { twemojiOptions } from "../render/emoji";

// Set necessary window scope variables
window["CodeMirror"] = CodeMirror;

// A code block in a language the bundle leaves out gets its mode loaded by
// script tag, and the script registers itself on the CodeMirror above. echomd
// suggests a CDN address without a version for these; take them from the
// copy of the installed package that the build puts on the site instead.
suggestedEditorConfig.hmdModeLoader = { source: __CODEMIRROR_MODES__ };

import packageJSON from "../../package.json";
export const EchoMDVersion: string = packageJSON.dependencies["@0xgg/echomd"];

// Hack the keymap for sublime: HyperMD's editing commands, each with the
// plain CodeMirror behavior for the plain text source code mode.
const hypermdKeyMap = window["CodeMirror"].keyMap["hypermd"] || {};
const hyperMDKey = (
  key: string,
  plain: (editor: CodeMirror.Editor) => unknown,
) => hypermdKeyMap[key] && withPlainTextFallback(hypermdKeyMap[key], plain);
const wrapSelection = (bracket: string) => (editor: CodeMirror.Editor) =>
  wrapTexts(editor, bracket);
window["CodeMirror"].keyMap["sublime"] = Object.assign(
  window["CodeMirror"].keyMap["sublime"],
  {
    "Ctrl-B": hyperMDKey("Ctrl-B", wrapSelection("**")),
    "Ctrl-D": hyperMDKey("Ctrl-D", wrapSelection("~~")),
    "Ctrl-I": hyperMDKey("Ctrl-I", wrapSelection("*")),
    "Enter": hyperMDKey("Enter", (editor) =>
      editor.execCommand("newlineAndIndent"),
    ),
    "Shift-Enter": hyperMDKey("Shift-Enter", (editor) =>
      editor.execCommand("newlineAndIndent"),
    ),
    "Shift-Tab": hyperMDKey("Shift-Tab", (editor) =>
      editor.execCommand("indentLess"),
    ),
    "Tab": hyperMDKey("Tab", (editor) =>
      editor.execCommand(
        editor.somethingSelected() ? "indentMore" : "insertSoftTab",
      ),
    ),
  },
);

// The editor draws its emoji as the preview does.
setTwemojiOptions(twemojiOptions);
