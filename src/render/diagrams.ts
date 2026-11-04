import { Renderer, startDrawing } from "./drawing";
import {
  EchartsRenderer,
  PlantUMLRenderer,
  VegaRenderer,
  WaveDromRenderer,
} from "./echomd";
import { renderMermaid } from "./mermaid";
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
  [/^echarts$/, echomd(EchartsRenderer), true],
  [/^mermaid$/, renderMermaid, true],
  [/^vega$/, echomd(VegaRenderer), true],
  [
    /^vega-lite$/,
    (code) => startDrawing(renderVegaLite(code).element, () => {}),
    true,
  ],
  [/^wavedrom$/i, echomd(WaveDromRenderer), false],
];
