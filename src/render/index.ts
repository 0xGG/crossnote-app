import { Note } from "../lib/note";
import * as echomd from "./echomd";
import { mountPresentation } from "./presentation";
import { finishPreview } from "./preview";
import { sanitizeHTML } from "./sanitize";

// How a note is drawn: the preview, a kanban card, printing and the slides
// all go through here.
//
// 1. The markdown stage turns the note's text into HTML (renderMarkdown). It
//    is echomd's for now (./echomd.ts) and becomes the app's own later; the
//    HTML is not safe to put in a page yet.
// 2. sanitizeHTML (./sanitize.ts) holds the rules for what a note's HTML may
//    keep. Nothing reaches the page without passing it.
// 3. mountPreview puts the result into an element and finishes it there
//    (./preview.ts): widgets, code blocks and diagrams, twemoji, links,
//    images. A deck of slides goes into a frame (./presentation.ts).
//
// The page's Content-Security-Policy (index.html) still lets scripts run
// inline, through eval and from the CDNs the slides and widgets load. The
// target, once the diagram libraries come from the app's own bundle and the
// slides' frame runs no inline script, is a policy sent as a header whose
// scripts come from the site alone ('self', without 'unsafe-inline' or
// 'unsafe-eval'), with object-src 'none' and base-uri 'self'.

export interface RenderedMarkdown {
  /** The note's HTML, not yet sanitized. */
  html: string;
  /** The note is a deck of slides (it has <!-- slide --> comments). */
  isPresentation: boolean;
  /** The note's front matter, as the markdown stage read it. */
  frontMatter: Record<string, any>;
}

export function renderMarkdown(text: string): RenderedMarkdown {
  const { html, slideConfigs, yamlConfig } = echomd.renderMarkdown(text);
  return {
    html,
    isPresentation: slideConfigs.length > 0,
    frontMatter: yamlConfig || {},
  };
}

export interface MountedPreview {
  isPresentation: boolean;
  /**
   * Settles once the note is drawn: its HTML in the element, finished, and
   * its images read from the notebook; a deck once reveal.js is ready or
   * failed to load. Diagrams that draw themselves later are not waited for.
   * Rejects only when the markdown stage fails, whose error the element
   * then shows; a block that fails shows its error in its place.
   */
  done: Promise<void>;
  /**
   * Stops what is still to come: images resolved afterwards keep their
   * address, a deck that gets ready afterwards is left as it is, and the
   * listener that waits for it goes. Drawing into the same element again
   * disposes of what was drawn there before.
   */
  dispose(): void;
}

const mounted = new WeakMap<HTMLElement, MountedPreview>();

export function mountPreview(
  element: HTMLElement,
  text: string,
  options: { note: Note | null; forPrint?: boolean },
): MountedPreview {
  mounted.get(element)?.dispose();
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const isCurrent = () => !disposed;

  let rendered: RenderedMarkdown;
  try {
    rendered = renderMarkdown(text);
  } catch (error) {
    element.innerText = String(error);
    const preview: MountedPreview = {
      isPresentation: false,
      done: Promise.reject(error),
      dispose: () => {},
    };
    preview.done.catch(() => {});
    return preview;
  }

  let done: Promise<void>;
  if (rendered.isPresentation) {
    element.style.maxWidth = "100%";
    element.style.height = "100%";
    done = mountPresentation(element, rendered.html, rendered.frontMatter, {
      note: options.note,
      forPrint: !!options.forPrint,
      isCurrent,
      cleanups,
    });
  } else {
    element.style.height = "100%";
    element.innerHTML = sanitizeHTML(rendered.html);
    done = finishPreview(element, options.note, false, isCurrent);
  }

  const preview: MountedPreview = {
    isPresentation: rendered.isPresentation,
    done,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      if (mounted.get(element) === preview) {
        mounted.delete(element);
      }
    },
  };
  mounted.set(element, preview);
  return preview;
}

export { sanitizeHTML };
