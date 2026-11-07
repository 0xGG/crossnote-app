import { Renderer } from "./drawing";
import { renderEcharts } from "./echarts";
import { renderMermaid } from "./mermaid";

/**
 * The code blocks drawn as diagrams in the preview, by the language their
 * fence names.
 */
export const diagramRenderers: [RegExp, Renderer][] = [
  [/^echarts$/, renderEcharts],
  [/^mermaid$/, renderMermaid],
];
