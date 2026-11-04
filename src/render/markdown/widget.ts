import type { MarkdownIt } from "markdown-it";

// echomd's check of the HTML a note writes: false for markup it would not
// draw (scripts, styles, frames, event handlers, javascript: addresses),
// which is then left out.
function defaultChecker(html: string) {
  if (/^<(?:br)/i.test(html)) {
    return false;
  }
  if (/<(?:script|style|link|meta|object|embed|iframe)/i.test(html)) {
    return false;
  }
  if (/\son\w+\s*=/i.test(html)) {
    return false;
  }
  if (/(src|background|href)\s*=\s*["']?javascript:/i.test(html)) {
    return false;
  }
  return true;
}

// <!-- @name "key": value --> becomes the element the preview mounts the
// widget of that name on, with its attributes as JSON.
function renderWidget(content: string) {
  content = content
    .replace(/^<!--\s*/, "")
    .replace(/-->$/, "")
    .trim();
  let widgetName: string;
  let widgetAttributes: object = {};
  const firstSpaceMatch = content.match(/\s/);
  const firstSpace = firstSpaceMatch ? (firstSpaceMatch.index as number) : -1;
  if (firstSpace > 0) {
    widgetName = content.slice(0, firstSpace).trim().replace(/^@/, "");
    try {
      widgetAttributes = JSON.parse(
        "{" +
          content
            .slice(firstSpace + 1)
            .trim()
            .replace(/-\\->/g, "-->")
            .replace(/<!\\--/g, "<!--")
            .replace(/\\\|/g, "|") +
          "}",
      );
    } catch (error) {
      widgetName = "error";
      widgetAttributes = { message: String(error) };
    }
  } else {
    widgetName = content.trim().replace(/^@/, "");
  }
  if (widgetName) {
    return `<span class="echomd-widget" data-widget-name='${widgetName}' data-widget-attributes='${JSON.stringify(widgetAttributes)}'></span>`;
  }
  return undefined;
}

export default function widget(md: MarkdownIt) {
  for (const rule of ["html_inline", "html_block"] as const) {
    const original = md.renderer.rules[rule]!;
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
      const content = tokens[idx].content.trim();
      if (content.match(/^<!--\s*@/) && content.match(/-->$/)) {
        return renderWidget(content) as string;
      }
      const html = original(tokens, idx, options, env, self);
      return defaultChecker(html) ? html : "";
    };
  }
}
