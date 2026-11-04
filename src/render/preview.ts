import { globalContainers } from "../containers/global";
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";
import { openURL } from "../utilities/preview";
import {
  EchartsRenderer,
  getWidgetCreator,
  MermaidRenderer,
  PlantUMLRenderer,
  VegaRenderer,
  WaveDromRenderer,
} from "./echomd";
import { renderTwemoji } from "./emoji";
import { renderVegaLite } from "./vegaLite";

type CodeRenderer = (
  code: string,
  info: any,
) => { element: HTMLElement; asyncRenderer?: () => void };

// Code blocks drawn as diagrams, by the language their fence names. Mermaid
// and wavedrom are left as they are in slides, where the frame's own scripts
// draw them.
const diagramRenderers: [RegExp, CodeRenderer, boolean][] = [
  [/^(puml|plantuml)$/, PlantUMLRenderer, true],
  [/^echarts$/, EchartsRenderer, true],
  [/^mermaid$/, MermaidRenderer, false],
  [/^vega$/, VegaRenderer, true],
  [/^vega-lite$/, renderVegaLite, true],
  [/^wavedrom$/i, WaveDromRenderer, false],
];

function failedBlock(error: unknown): HTMLElement {
  const pre = document.createElement("pre");
  pre.classList.add("language-error");
  pre.textContent = String(error);
  return pre;
}

function renderWidgets(container: HTMLElement) {
  const spans = Array.from(container.getElementsByClassName("echomd-widget"));
  for (const span of spans) {
    const name = span.getAttribute("data-widget-name");
    const attributesString = span.getAttribute("data-widget-attributes");
    const creator = getWidgetCreator(name);
    if (!creator) {
      continue;
    }
    let attributes: Record<string, unknown>;
    try {
      attributes = JSON.parse(attributesString);
    } catch {
      attributes = {};
    }
    try {
      const widget = creator({ attributes, isPreview: true });
      if (widget) {
        widget.classList.add("echomd-widget");
        widget.setAttribute("data-widget-name", name);
        widget.setAttribute("data-widget-attributes", attributesString);
        span.replaceWith(widget);
      }
    } catch (error) {
      span.replaceWith(failedBlock(error));
    }
  }
}

function renderCodeBlock(code: string, language: string): HTMLElement {
  const pre = document.createElement("pre");
  const prism = (window as any).Prism;
  if (!prism) {
    pre.textContent = code;
  } else if (!(language in prism.languages)) {
    pre.classList.add("language-text");
    pre.textContent = code;
  } else {
    // Prism escapes the code it is given; what it returns is its own markup.
    pre.innerHTML = prism.highlight(code, prism.languages[language], language);
    pre.classList.add(`language-${language}`);
  }
  return pre;
}

function renderCodeFences(container: HTMLElement, inSlides: boolean) {
  const fences = Array.from(container.getElementsByClassName("vickeymd-fence"));
  for (const fence of fences) {
    let info: any;
    try {
      info = JSON.parse(fence.getAttribute("data-parsed-info") || "{}");
    } catch {
      info = {};
    }
    const code = fence.textContent;
    const language: string = info["language"] || "text";
    const diagram = diagramRenderers.find(([pattern]) =>
      pattern.test(language),
    );
    // One block that cannot be drawn shows why, in its place; the rest of
    // the note is drawn all the same.
    try {
      if (diagram) {
        const [, renderer, drawnInSlides] = diagram;
        if (inSlides && !drawnInSlides) {
          continue;
        }
        const { element, asyncRenderer } = renderer(code, info);
        fence.replaceWith(element);
        asyncRenderer?.();
      } else {
        fence.replaceWith(renderCodeBlock(code, language));
      }
    } catch (error) {
      fence.replaceWith(failedBlock(error));
    }
  }
}

function handleLinks(container: HTMLElement, note: Note | null) {
  const links = Array.from(container.getElementsByTagName("a"));
  for (const link of links) {
    link.onclick = (event) => {
      event.preventDefault();
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        // A place in the note, such as a footnote or a heading; "#" alone
        // is the note's top, as on a web page.
        let id = href.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch {
          // As it is written.
        }
        if (id) {
          container
            .querySelector(`#${CSS.escape(id)}`)
            ?.scrollIntoView({ block: "center" });
        } else {
          // What scrolls is a box around the preview, not the preview.
          let scroller: HTMLElement | null = container;
          while (scroller && scroller.scrollTop === 0) {
            scroller = scroller.parentElement;
          }
          if (scroller) {
            scroller.scrollTop = 0;
          }
        }
      } else if (link.hasAttribute("data-topic")) {
        const tag = link.getAttribute("data-topic");
        if (tag.length && note) {
          globalContainers.crossnoteContainer.openNoteAtPath(
            globalContainers.crossnoteContainer.getNotebookAtPath(
              note.notebookPath,
            ),
            tag,
          );
        }
      } else {
        openURL(link.getAttribute("href"), note);
      }
    };
  }
}

async function resolveImages(
  container: HTMLElement,
  note: Note | null,
  isCurrent: () => boolean,
) {
  const images = Array.from(container.getElementsByTagName("img"));
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute("src");
      if (src === null) {
        return;
      }
      try {
        const resolved = await resolveNoteImageSrc(
          note,
          decodeURIComponent(src),
        );
        // A note drawn again, or closed, meanwhile keeps what it has now.
        if (isCurrent()) {
          image.setAttribute("src", resolved);
        }
      } catch {
        // The image stays as written.
      }
    }),
  );
}

// What the preview does to the sanitized HTML once it is in the page:
// widgets, code blocks and diagrams, twemoji, links that open notes, and
// images read from the notebook. Settles once the images are resolved; a
// diagram that draws itself later (mermaid, vega) is not waited for.
export async function finishPreview(
  container: HTMLElement,
  note: Note | null,
  inSlides: boolean,
  isCurrent: () => boolean,
) {
  renderWidgets(container);
  renderCodeFences(container, inSlides);
  try {
    renderTwemoji(container);
  } catch {
    // The emoji stay as text.
  }
  handleLinks(container, note);
  await resolveImages(container, note, isCurrent);
}
