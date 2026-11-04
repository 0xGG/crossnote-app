import { Note } from "../lib/note";
// Enables the markdown stage's emoji.
import "./emoji";
import * as markdown from "./markdown";
import { mountPresentation } from "./presentation";
import { finishPreview } from "./preview";
import { sanitizeHTML } from "./sanitize";

// How a note is drawn: the preview, a kanban card, printing and the slides
// all go through here.
//
// 1. The markdown stage turns the note's text into HTML (renderMarkdown,
//    ./markdown/); the HTML is not safe to put in a page yet.
// 2. sanitizeHTML (./sanitize.ts) holds the rules for what a note's HTML may
//    keep. Nothing the markdown stage gives reaches the page without passing
//    it. The editor's own folding of HTML in a note (CodeMirror 5) is not
//    drawn through here and is not sanitized by it.
// 3. mountPreview puts the result into an element and finishes it there
//    (./preview.ts): widgets, code blocks and diagrams, twemoji, links,
//    images. A deck of slides goes into a frame (./presentation.ts).
//
// The notebook reads a note's links from the same markdown stage
// (./links.ts) and keeps them as references; each names the element the
// preview draws it as by its id. How previews look in each theme is
// ./theme.ts's.
//
// Where the HTML stands in the note's text: the markdown stage leaves marks
// with a data-line attribute, the 0-based line they stand for (empty
// paragraphs of class sync-line between blocks, task checkboxes, a deck's
// sections), and a reference keeps the lines of its block
// (lib/reference.ts). A markdown stage of the app's own must keep both.
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
  const { html, slideConfigs, yamlConfig } = markdown.renderMarkdown(text);
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
   * failed to load, or once it is disposed of. Diagrams that draw themselves
   * later are not waited for. Rejects when the note cannot be drawn into
   * the element at all (the markdown stage, or putting its HTML or the
   * deck's frame in, fails), and the element then shows why; a block that
   * fails shows its error in its place instead. A deck's also rejects when
   * reveal.js has said neither that it is ready nor that it could not load
   * within 30 seconds; the frame stays as it is.
   */
  done: Promise<void>;
  /**
   * Stops the finishing still to come: images still being read keep their
   * address, a deck that gets ready afterwards is left unfinished, and the
   * listener it waits with goes. Diagrams that draw themselves later
   * (mermaid, vega and the like) are not stopped. Drawing into the same
   * element again disposes of what was drawn there before.
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

  let isPresentation = false;
  let done: Promise<void>;
  try {
    const rendered = renderMarkdown(text);
    isPresentation = rendered.isPresentation;
    if (isPresentation) {
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
  } catch (error) {
    element.textContent = String(error);
    done = Promise.reject(error);
  }
  // Callers that do not wait for it need not handle its failure.
  done.catch(() => {});

  const preview: MountedPreview = {
    isPresentation,
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
