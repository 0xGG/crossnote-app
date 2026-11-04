import YAML from "yamljs";
import { Renderer, startDrawing } from "./drawing";

// A size from the block's attributes: a number is in pixels.
function size(value: unknown, otherwise: string): string {
  if (typeof value === "number") {
    return `${value}px`;
  }
  return typeof value === "string" && value ? value : otherwise;
}

const list = (value: unknown): any[] =>
  Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? [value]
      : [];

const escapeHTML = (text: unknown) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * A chart's option less what would let the note reach the page, wherever in
 * the option it is (echarts also reads baseOption, a timeline's options and
 * media queries' options): echarts writes a tooltip's text, formatter
 * templates included, as HTML, and the data view's title and button labels
 * too, so tooltips are drawn as text (echarts' rich text) and those labels
 * are escaped; and it opens a title's or a treemap's or sunburst's link in
 * a window of this site, where a javascript: address would run, so only
 * http and https links stay.
 */
export function withoutPageAccess(option: Record<string, any>) {
  const walk = (value: unknown) => {
    for (const item of list(value)) {
      // Data holds numbers, strings and nulls as well.
      if (!item || typeof item !== "object") {
        continue;
      }
      for (const key of Object.keys(item)) {
        const child = item[key];
        if (key === "link" || key === "sublink") {
          // An axis pointer's link is a list of the axes it links.
          const linksAxes =
            Array.isArray(child) &&
            child.every(
              (axes) =>
                axes && typeof axes === "object" && !Array.isArray(axes),
            );
          const webAddress =
            typeof child === "string" && /^https?:/i.test(child.trim());
          if (!webAddress && !linksAxes) {
            delete item[key];
            continue;
          }
        }
        if (key === "tooltip") {
          for (const tooltip of list(child)) {
            tooltip["renderMode"] = "richText";
          }
        }
        if (key === "dataView" && child && typeof child === "object") {
          if (child["title"] != null) {
            child["title"] = escapeHTML(child["title"]);
          }
          if (Array.isArray(child["lang"])) {
            child["lang"] = child["lang"].map((label: unknown) =>
              label == null ? label : escapeHTML(label),
            );
          } else if (child["lang"] !== undefined) {
            delete child["lang"];
          }
        }
        walk(child);
      }
    }
  };
  walk(option);
  return option;
}

// Charts drawn by echarts-gl (3D and WebGL series and components), which is
// loaded only for them.
export const usesGL = (option: unknown) =>
  /"(?:[a-zA-Z]+3D|[a-zA-Z]+GL|globe|mapbox3D)"/.test(JSON.stringify(option));

/**
 * An echarts chart, JSON or YAML, drawn by echarts 6 (loaded with the first
 * one, echarts-gl as well for a chart that needs it) in the theme that goes
 * with the preview's, the size the block's attributes give it (400 by 400
 * pixels otherwise). Done once echarts has drawn its first frame, which it
 * does as the option is set; disposing of it disposes of the chart.
 */
export const renderEcharts: Renderer = (code, info, { dark }) => {
  const element = document.createElement("div");
  const attributes = (info.attributes ?? {}) as Record<string, unknown>;
  element.style.width = size(attributes["width"], "400px");
  element.style.height = size(attributes["height"], "400px");
  element.style.maxWidth = size(attributes["maxWidth"], "100%");
  return startDrawing(element, async (signal) => {
    const option =
      code.trim()[0] === "{" ? JSON.parse(code) : YAML.parse(code) || {};
    const [echarts] = await Promise.all([
      import("echarts"),
      usesGL(option) ? import("echarts-gl") : undefined,
    ]);
    if (signal.aborted) {
      return;
    }
    const chart = echarts.init(element, dark ? "dark" : undefined);
    signal.addEventListener("abort", () => chart.dispose());
    // Done once the chart's first frame is drawn (echarts says rendered as
    // the option is set); its finished would never come for a chart whose
    // animation loops.
    await new Promise<void>((resolve) => {
      chart.on("finished", () => resolve());
      chart.on("rendered", () => resolve());
      chart.setOption(withoutPageAccess(option));
    });
  });
};
