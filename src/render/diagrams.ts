import { Renderer, startDrawing } from "./drawing";
import { renderEcharts } from "./echarts";
import { PlantUMLRenderer } from "./echomd";
import { renderMermaid } from "./mermaid";
import { renderVega } from "./vega";
import { renderVegaLite } from "./vegaLite";
import { renderWaveDrom } from "./wavedrom";

type EchomdRenderer = (
  code: string,
  info: any,
) => { element: HTMLElement; asyncRenderer?: () => void };

// One of echomd's renderers, which draw with the scripts index.html loads
// and do not say when they are done: done once they have started.
function echomd(renderer: EchomdRenderer): Renderer {
  return (code, info) => {
    const { element, asyncRenderer } = renderer(code, info);
    return startDrawing(element, () => asyncRenderer?.());
  };
}

/**
 * The code blocks drawn as diagrams, by the language their fence names, in
 * the preview and, by the page, into the slides' frame.
 */
export const diagramRenderers: [RegExp, Renderer][] = [
  [/^(puml|plantuml)$/, echomd(PlantUMLRenderer)],
  [/^echarts$/, renderEcharts],
  [/^mermaid$/, renderMermaid],
  [/^vega$/, renderVega],
  [/^vega-lite$/, renderVegaLite],
  [/^wavedrom$/i, renderWaveDrom],
];
