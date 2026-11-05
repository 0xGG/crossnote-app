import YAML from "yamljs";
import { Renderer, startDrawing } from "./drawing";

// A spec written in JSON, or in YAML.
export function readSpec(code: string): Record<string, any> {
  return code.trim()[0] === "{" ? JSON.parse(code) : YAML.parse(code) || {};
}

export const isObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * A vega spec whose signals' inputs all go in the chart's own element. A
 * signal's binding can otherwise name any element of the page with a CSS
 * selector: vega empties that element and puts the input in it, or, for a
 * binding that names no kind of input, binds the signal both ways to that
 * element's value.
 */
export function withBindingsInChart(spec: Record<string, any>) {
  if (!isObject(spec)) {
    return spec;
  }
  const config = isObject(spec.config) ? spec.config : {};
  const events = isObject(config.events) ? config.events : {};
  return {
    ...spec,
    config: { ...config, events: { ...events, bind: "container" as const } },
  };
}

// Loaded once for all the charts that ask for it at the same time.
let loading:
  | Promise<
      [
        typeof import("vega"),
        typeof import("vega-interpreter"),
        typeof import("vega-themes"),
      ]
    >
  | undefined;
const load = () =>
  (loading ??= Promise.all([
    import("vega"),
    import("vega-interpreter"),
    import("vega-themes"),
  ]));

/**
 * A vega chart, JSON or YAML, drawn by vega 6 (loaded with the first one) on
 * a canvas, in the theme that goes with the preview's, with its inputs in
 * its own element. Its expressions are run by vega's interpreter rather than
 * compiled into functions, so drawing it needs no eval. Done once vega has
 * run the chart; disposing of it finalizes the view: its timers and
 * listeners go.
 */
export const renderVega: Renderer = (code, _info, { dark }) => {
  const element = document.createElement("div");
  return startDrawing(element, async (signal) => {
    const spec = withBindingsInChart(readSpec(code));
    const [vega, { expressionInterpreter }, themes] = await load();
    if (signal.aborted) {
      return;
    }
    const view = new vega.View(
      // vega-embed gives vega specs the same theme configs.
      vega.parse(spec, dark ? (themes.dark as any) : undefined, { ast: true }),
      {
        expr: expressionInterpreter,
        renderer: "canvas",
        container: element,
        hover: true,
      },
    );
    signal.addEventListener("abort", () => view.finalize());
    await view.runAsync();
  });
};
