import YAML from "yamljs";

// vega-embed's "Open in Vega Editor" opens the editor's site with a handle
// on this window, to send it the chart, and a chart's
// usermeta.embedOptions.editorUrl can name another site to open instead.
// vega-embed reads usermeta.embedOptions over the options it is given, so
// the action is turned off there; the chart's other options stay.
export function withoutEditorAction(
  embedOptions: Record<string, any> = {},
): Record<string, any> {
  const { editorUrl: _editorUrl, ...options } = embedOptions;
  const actions = options.actions;
  return {
    ...options,
    actions:
      actions === false
        ? false
        : { ...(typeof actions === "object" ? actions : {}), editor: false },
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
      embedOptions: withoutEditorAction(spec.usermeta?.embedOptions),
    };
    (window as any)
      .vegaEmbed(element, spec)
      .catch((error: unknown) => (element.innerText = String(error)));
  } catch (error) {
    element.innerText = String(error);
  }
  return { element };
}
