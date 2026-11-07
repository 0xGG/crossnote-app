import { globalContainers } from "../containers/global";
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";
import { openURL } from "../utilities/preview";
import { diagramRenderers } from "./diagrams";
import {
  Drawing,
  DrawingContext,
  failedBlock,
  isDarkPreview,
  startDrawing,
  waitForDrawing,
} from "./drawing";
import { getWidgetCreator } from "./echomd";
import { renderTwemoji } from "./emoji";

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

// Code, shown as it is at once and highlighted once Prism has its language;
// as it is in a language Prism does not have, or cannot load.
function renderCodeBlock(code: string, language: string): Drawing {
  const pre = document.createElement("pre");
  pre.textContent = code;
  return startDrawing(
    pre,
    async (signal) => {
      // Prism, and what it knows of its languages, load with the first block;
      // code is shown as it is when they cannot be loaded.
      let prism: any;
      try {
        const { prismWith } = await import("./prism");
        prism = await prismWith(language);
      } catch {
        prism = undefined;
      }
      if (signal.aborted) {
        return;
      }
      if (!prism) {
        pre.classList.add("language-text");
        return;
      }
      let highlighted: string;
      try {
        highlighted = prism.highlight(
          code,
          prism.languages[language],
          language,
        );
      } catch {
        pre.classList.add("language-text");
        return;
      }
      // Prism escapes the code it is given; what it returns is its own markup.
      pre.innerHTML = highlighted;
      pre.classList.add(`language-${language}`);
    },
    // Code that takes too long to highlight stays as it is.
    { keepsWhatItShows: true },
  );
}

// Draws each code block, a diagram or highlighted code, in its place, and
// returns the drawings.
function renderCodeFences(
  container: HTMLElement,
  context: DrawingContext,
): Drawing[] {
  const drawings: Drawing[] = [];
  const fences = Array.from(container.getElementsByClassName("vickeymd-fence"));
  for (const fence of fences) {
    const code = fence.textContent;
    const language = fence.getAttribute("data-language") || "text";
    const diagram = diagramRenderers.find(([pattern]) =>
      pattern.test(language),
    );
    // One block that cannot be drawn shows why, in its place; the rest of
    // the note is drawn all the same.
    try {
      let drawing: Drawing;
      if (diagram) {
        drawing = diagram[1](code, context);
      } else {
        drawing = renderCodeBlock(code, language);
      }
      fence.replaceWith(drawing.element);
      drawings.push(drawing);
    } catch (error) {
      fence.replaceWith(failedBlock(error));
    }
  }
  return drawings;
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
// images read from the notebook. Settles once the images are resolved and
// the code blocks drawn, each given up to drawingTimeout. cleanups gets
// what disposing of the preview has to undo: the drawings, still under way
// or done, are disposed of.
export async function finishPreview(
  container: HTMLElement,
  note: Note | null,
  isCurrent: () => boolean,
  cleanups: (() => void)[],
) {
  renderWidgets(container);
  const drawings = renderCodeFences(container, {
    dark: isDarkPreview(container),
  });
  const waits = drawings.map((drawing) => waitForDrawing(drawing));
  cleanups.push(() => {
    waits.forEach((wait) => wait.stop());
    drawings.forEach((drawing) => drawing.dispose());
  });
  try {
    renderTwemoji(container);
  } catch {
    // The emoji stay as text.
  }
  handleLinks(container, note);
  await Promise.all([
    resolveImages(container, note, isCurrent),
    ...waits.map((wait) => wait.settled),
  ]);
}
