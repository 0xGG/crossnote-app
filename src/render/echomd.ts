// The one place src/render/ takes anything from echomd, until the app has a
// markdown stage of its own: what echomd turns a note's text into (with the
// emoji ./emoji.ts enables), the renderers it draws code blocks with (on the
// scripts index.html loads) and the widget registry the editor fills. The
// rest of src/render/ is the app's and stays when this file goes. Outside
// it, the preview still takes its theme's CSS from echomd
// (themes/manager.ts, which printing calls too).
export { enableEmoji, md, renderMarkdown } from "@0xgg/echomd/preview";
export { getWidgetCreator } from "@0xgg/echomd/widget";
export { EchartsRenderer } from "@0xgg/echomd/powerpack/fold-code-with-echarts";
export { MermaidRenderer } from "@0xgg/echomd/powerpack/fold-code-with-mermaid";
export { PlantUMLRenderer } from "@0xgg/echomd/powerpack/fold-code-with-plantuml";
export { VegaRenderer } from "@0xgg/echomd/powerpack/fold-code-with-vega";
export { WaveDromRenderer } from "@0xgg/echomd/powerpack/fold-code-with-wavedrom";
