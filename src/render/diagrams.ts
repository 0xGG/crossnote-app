import { Renderer } from "./drawing";
import { renderEcharts } from "./echarts";
import { renderMermaid } from "./mermaid";
import { renderPlantUML } from "./plantuml";
import { renderVega } from "./vega";
import { renderVegaLite } from "./vegaLite";
import { renderWaveDrom } from "./wavedrom";

/**
 * The code blocks drawn as diagrams, by the language their fence names, in
 * the preview and, by the page, into the slides' frame.
 */
export const diagramRenderers: [RegExp, Renderer][] = [
  [/^(puml|plantuml)$/, renderPlantUML],
  [/^echarts$/, renderEcharts],
  [/^mermaid$/, renderMermaid],
  [/^vega$/, renderVega],
  [/^vega-lite$/, renderVegaLite],
  [/^wavedrom$/i, renderWaveDrom],
];
