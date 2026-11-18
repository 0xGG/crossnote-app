import { globalContainers } from "../containers/global";
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";
import { mediaKind, resolveNoteMedia } from "../utilities/media";
import { mountMediaPlayer } from "./media";
import { openURL } from "../utilities/preview";
import { diagramRenderers } from "./diagrams";
import {
  Drawing,
  DrawingContext,
  failedBlock,
  isDarkPreview,
  previewTimeout,
  waitForDrawing,
} from "./drawing";
import { renderTwemoji } from "./emoji";
import { renderCodeBlock } from "./codeBlock";

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
      if (fence.hasAttribute("data-source-line")) {
        drawing.element.setAttribute(
          "data-source-line",
          fence.getAttribute("data-source-line")!,
        );
      }
      fence.replaceWith(drawing.element);
      drawings.push(drawing);
    } catch (error) {
      const failure = failedBlock(error);
      if (fence.hasAttribute("data-source-line"))
        failure.setAttribute(
          "data-source-line",
          fence.getAttribute("data-source-line")!,
        );
      fence.replaceWith(failure);
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
  cleanups: (() => void)[],
) {
  const images = Array.from(container.getElementsByTagName("img"));
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute("src");
      if (src === null) {
        return;
      }
      const kind = mediaKind(src);
      if (kind === "audio" || kind === "video") {
        const mounted = mountMediaPlayer(kind, image.alt, () =>
          resolveNoteMedia(note, src),
        );
        if (image.title) mounted.element.title = image.title;
        image.replaceWith(mounted.element);
        cleanups.push(mounted.dispose);
        await mounted.done;
        return;
      }
      try {
        const resolved = await resolveNoteImageSrc(note, src);
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
// code blocks and diagrams, twemoji, links that open notes, and
// images read from the notebook. Settles once the images are resolved and
// the code blocks drawn, each given up to drawingTimeout from its turn and
// all of them up to previewTimeout. cleanups gets what disposing of the
// preview has to undo: the drawings, still under way or done, are disposed
// of.
export async function finishPreview(
  container: HTMLElement,
  note: Note | null,
  isCurrent: () => boolean,
  cleanups: (() => void)[],
  forPrint = false,
) {
  const drawings = renderCodeFences(container, {
    dark: isDarkPreview(container),
  });
  let timer: number | undefined;
  const deadline = new Promise<void>((resolve) => {
    if (drawings.length) {
      timer = window.setTimeout(resolve, previewTimeout);
    }
  });
  const waits = drawings.map((drawing) =>
    waitForDrawing(drawing, undefined, deadline),
  );
  cleanups.push(() => {
    window.clearTimeout(timer);
    waits.forEach((wait) => wait.stop());
    drawings.forEach((drawing) => drawing.dispose());
  });
  let printedEmoji: Promise<void> | undefined;
  try {
    printedEmoji = renderTwemoji(container, forPrint);
  } catch {
    // The emoji stay as text.
  }
  handleLinks(container, note);
  try {
    await Promise.all([
      printedEmoji,
      resolveImages(container, note, isCurrent, cleanups),
      ...waits.map((wait) => wait.settled),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}
