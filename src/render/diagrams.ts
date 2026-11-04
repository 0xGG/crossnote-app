import { Renderer, startDrawing } from "./drawing";
import { renderEcharts } from "./echarts";
import { PlantUMLRenderer, WaveDromRenderer } from "./echomd";
import { renderMermaid } from "./mermaid";
import { renderVega } from "./vega";
import { renderVegaLite } from "./vegaLite";

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
 * The code blocks drawn as diagrams, by the language their fence names, and
 * whether they are drawn in slides too. Wavedrom is left as it is in
 * slides, where the deck's frame draws it with its own scripts.
 */
export const diagramRenderers: [RegExp, Renderer, boolean][] = [
  [/^(puml|plantuml)$/, echomd(PlantUMLRenderer), true],
  [/^echarts$/, renderEcharts, true],
  [/^mermaid$/, renderMermaid, true],
  [/^vega$/, renderVega, true],
  [/^vega-lite$/, renderVegaLite, true],
  [/^wavedrom$/i, echomd(WaveDromRenderer), false],
];
