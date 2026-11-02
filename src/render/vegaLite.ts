import YAML from "yamljs";

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

// A vega-lite code block, JSON or YAML, drawn by the vega-embed that
// index.html loads. Draws into the element it returns, which is not in the
// page yet; what it cannot read or draw is written in it instead.
export function renderVegaLite(code: string): { element: HTMLElement } {
  const element = document.createElement("div");
  try {
    const spec =
      code.trim()[0] === "{" ? JSON.parse(code) : YAML.parse(code) || {};
    spec.usermeta = {
      ...spec.usermeta,
      embedOptions: withoutWindowActions(spec.usermeta?.embedOptions),
    };
    (window as any)
      .vegaEmbed(element, spec)
      .catch((error: unknown) => (element.textContent = String(error)));
  } catch (error) {
    element.textContent = String(error);
  }
  return { element };
}
