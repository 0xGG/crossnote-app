import { printPreview as EchoMDPrintPreview } from "@0xgg/echomd/preview";
import * as path from "path";
import { globalContainers } from "../containers/global";
import { Note } from "../lib/note";
import { browserHistory } from "./history";
import { resolveNoteImageSrc } from "./image";

export function printPreview(
  previewElement: HTMLElement,
  bannerElement?: HTMLElement,
  timeout = 2000,
) {
  return EchoMDPrintPreview(
    previewElement,
    bannerElement,
    ["body"],
    `
  .App,
  .editor-bottom-panel,
  .drawer,
  .CodeMirror,
  .editor-textarea,
  .editor-toolbar,
  .Pane.vertical.Pane1,
  .notes-panel,
  .control-panel-wrapper {
    display: none;
  }
`,
    timeout,
  );
}

export function openURL(url: string = "", note: Note) {
  if (!note || !url) {
    return;
  }
  if (url.match(/https?:\/\//)) {
    if (url.startsWith(window.location.origin)) {
      browserHistory.push(url.replace(window.location.origin, ""));
    } else {
      window.open(url, "_blank"); // TODO: opener bug, check zhihu
    }
  } else if (url.startsWith("/")) {
    let filePath = path.relative(
      note.notebookPath,
      path.resolve(note.notebookPath, url.replace(/^\//, "")),
    );
    globalContainers.crossnoteContainer.openNoteAtPath(
      globalContainers.crossnoteContainer.getNotebookAtPath(note.notebookPath),
      decodeURIComponent(filePath),
    );
  } else {
    let filePath = path.relative(
      note.notebookPath,
      path.resolve(
        path.dirname(path.resolve(note.notebookPath, note.filePath)),
        url,
      ),
    );
    globalContainers.crossnoteContainer.openNoteAtPath(
      globalContainers.crossnoteContainer.getNotebookAtPath(note.notebookPath),
      decodeURIComponent(filePath),
    );
  }
}

export function postprocessPreview(
  previewElement: HTMLElement,
  note: Note,
  isPresentationCallback?: (isPresentation: boolean) => void,
) {
  if (!previewElement) {
    return;
  }
  const handleLinksClickEvent = (preview: HTMLElement) => {
    // Handle link click event
    const links = preview.getElementsByTagName("A");
    for (let i = 0; i < links.length; i++) {
      const link = links[i] as HTMLAnchorElement;
      link.onclick = (event) => {
        event.preventDefault();
        if (link.hasAttribute("data-topic")) {
          const tag = link.getAttribute("data-topic");
          if (tag.length) {
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
  };
  const resolveImages = async (preview: HTMLElement) => {
    const images = preview.getElementsByTagName("IMG");
    for (let i = 0; i < images.length; i++) {
      const image = images[i] as HTMLImageElement;
      const imageSrc = image.getAttribute("src");
      image.setAttribute(
        "src",
        await resolveNoteImageSrc(note, decodeURIComponent(imageSrc)),
      );
    }
  };

  if (
    previewElement.childElementCount &&
    previewElement.children[0].tagName.toUpperCase() === "IFRAME"
  ) {
    // presentation
    previewElement.style.maxWidth = "100%";
    previewElement.style.height = "100%";
    previewElement.style.overflow = "hidden !important";
    handleLinksClickEvent(
      (previewElement.children[0] as HTMLIFrameElement).contentDocument
        .body as HTMLElement,
    );
    resolveImages(
      (previewElement.children[0] as HTMLIFrameElement).contentDocument
        .body as HTMLElement,
    );
    if (isPresentationCallback) {
      isPresentationCallback(true);
    }
  } else {
    // normal
    // previewElement.style.maxWidth = `${EditorPreviewMaxWidth}px`;
    previewElement.style.height = "100%";
    previewElement.style.overflow = "hidden !important";
    handleLinksClickEvent(previewElement);
    resolveImages(previewElement);
    if (isPresentationCallback) {
      isPresentationCallback(false);
    }
  }
}
