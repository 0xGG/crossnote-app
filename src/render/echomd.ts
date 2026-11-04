// The one place src/render/ takes anything from echomd: the renderers it
// draws code blocks with (on the scripts index.html loads); the widget
// registry the editor fills; and where the editor (CodeMirror 5) looks up
// the emoji it shows, which ./emoji.ts fills as it enables them for the
// markdown stage (./markdown/). The rest of src/render/ is the app's and
// stays when this file goes, and the preview and the notebook take nothing
// else from echomd.
export {
  setEmojiDefinitions,
  setReverseEmojiDefinitions,
} from "@0xgg/echomd/addon/emoji";
export { getWidgetCreator } from "@0xgg/echomd/widget";
export { PlantUMLRenderer } from "@0xgg/echomd/powerpack/fold-code-with-plantuml";
export { VegaRenderer } from "@0xgg/echomd/powerpack/fold-code-with-vega";
export { WaveDromRenderer } from "@0xgg/echomd/powerpack/fold-code-with-wavedrom";
