import { Renderer, startDrawing } from "./drawing";
import { isObject, readSpec, withBindingsInChart } from "./vega";

// Three of vega-embed's actions open another window with a handle on this
// one: "Open in Vega Editor" opens the editor's site to send it the chart,
// and a chart's usermeta.embedOptions.editorUrl can name another site to
// open instead; "View Source" and "View Compiled Vega" write the chart's
// source, unescaped, with its own sourceHeader and sourceFooter around it,
// as HTML into a window of this site. vega-embed reads usermeta.embedOptions over the
// options it is given, so these actions are turned off there, and the
// options that would feed them go; the chart's other options stay.
export function withoutWindowActions(
  embedOptions: Record<string, any> = {},
): Record<string, any> {
  const {
    editorUrl: _editorUrl,
    sourceHeader: _sourceHeader,
    sourceFooter: _sourceFooter,
    ...options
  } = embedOptions;
  const actions = options.actions;
  return {
    ...options,
    actions:
      actions === false
        ? false
        : {
            ...(typeof actions === "object" ? actions : {}),
            source: false,
            compiled: false,
            editor: false,
          },
  };
}

/**
 * The options a chart may give vega-embed (in usermeta.embedOptions, which
 * vega-embed reads over the app's own): not the actions that open windows;
 * not ast, expr or viewClass, which would turn vega's interpreter off or
 * replace its view; not bind, which names the element of the page that
 * vega empties to put the chart's inputs in, or patch, which would take the
 * place of the app's own; and not a tooltip id, which would have vega's
 * tooltip write into whatever element of the page has that id.
 */
export function chartEmbedOptions(
  embedOptions: Record<string, any> = {},
): Record<string, any> {
  const {
    ast: _ast,
    expr: _expr,
    viewClass: _viewClass,
    bind: _bind,
    patch: _patch,
    ...options
  } = withoutWindowActions(embedOptions);
  if (options.tooltip && typeof options.tooltip === "object") {
    const { id: _id, ...tooltip } = options.tooltip;
    options.tooltip = tooltip;
  }
  return options;
}

// Loaded once for all the charts that ask for it at the same time.
let loading:
  | Promise<[typeof import("vega-embed"), typeof import("vega-interpreter")]>
  | undefined;
const load = () =>
  (loading ??= Promise.all([import("vega-embed"), import("vega-interpreter")]));

/**
 * A vega-lite chart, JSON or YAML, drawn by vega-embed 7 (loaded with the
 * first one) on a canvas, in the theme that goes with the preview's, without
 * the actions that open other windows, with its inputs in its own element
 * (set in the vega spec vega-lite compiles it to); its expressions are run
 * by vega's interpreter, whatever the chart's own options say, so drawing it
 * needs no eval. Done once the chart is drawn; disposing of it finalizes the
 * view.
 */
export const renderVegaLite: Renderer = (code, _info, { dark }) => {
  const element = document.createElement("div");
  return startDrawing(element, async (signal) => {
    const spec = readSpec(code);
    spec.usermeta = {
      ...spec.usermeta,
      embedOptions: chartEmbedOptions(
        isObject(spec.usermeta?.embedOptions)
          ? spec.usermeta.embedOptions
          : undefined,
      ),
    };
    const [{ default: embed }, { expressionInterpreter }] = await load();
    if (signal.aborted) {
      return;
    }
    const result = await embed(element, spec, {
      ast: true,
      expr: expressionInterpreter,
      renderer: "canvas",
      theme: dark ? "dark" : undefined,
      patch: withBindingsInChart,
    });
    if (signal.aborted) {
      result.finalize();
    } else {
      signal.addEventListener("abort", () => result.finalize());
    }
  });
};
