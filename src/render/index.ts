import { Note } from "../lib/note";
// Enables the markdown stage's emoji.
import "./emoji";
import * as markdown from "./markdown";
import { finishPreview } from "./preview";
import { sanitizeHTML } from "./sanitize";

// How a note is drawn: the preview and printing both go
// through here.
//
// 1. The markdown stage turns the note's text into HTML (renderMarkdown,
//    ./markdown/); the HTML is not safe to put in a page yet.
// 2. sanitizeHTML (./sanitize.ts) holds the rules for what a note's HTML may
//    keep. Nothing the markdown stage gives reaches the page without passing
//    it. The editor's own folding of HTML in a note (CodeMirror 5) is not
//    drawn through here and is not sanitized by it.
// 3. mountPreview puts the result into an element and finishes it there
//    (./preview.ts): code blocks and diagrams, twemoji, links,
//    images.
//
// The notebook reads a note's links from the same markdown stage
// (./links.ts) and keeps them as references; each names the element the
// preview draws it as by its id. How previews look in each theme is
// ./theme.ts's.
//
// Where the HTML stands in the note's text: the markdown stage marks blocks
// (but code blocks), task checkboxes and page breaks with a data-line
// attribute, the 0-based line they start on (./markdown/lines.ts), and a
// reference keeps the lines of its block (lib/reference.ts).
//
// The page's Content-Security-Policy (sent as a header, site-headers.ts)
// still lets scripts run inline, through eval and from the CDNs the widgets
// loaded. The target is a policy whose scripts come from the site alone
// ('self', without 'unsafe-inline' or 'unsafe-eval'), with object-src 'none'
// and base-uri 'self'.

export interface RenderedMarkdown {
  /** The note's HTML, not yet sanitized. */
  html: string;
}

export function renderMarkdown(text: string): RenderedMarkdown {
  return { html: markdown.renderMarkdown(text).html };
}

export interface MountedPreview {
  /**
   * Settles once the note is drawn: its HTML in the element, finished, its
   * images read from the notebook, and its code blocks drawn, each given up
   * to 10 seconds before it shows that it took too long. Rejects when the
   * note cannot be drawn into the element at all (the markdown stage, or
   * putting its HTML in, fails), and the element then shows why; a block
   * that fails shows its error in its place instead.
   */
  done: Promise<void>;
  /**
   * Stops the finishing still to come: images still being read keep their
   * address. The code blocks are disposed of: those still being drawn stop,
   * and the diagrams let go of what they hold. Drawing into the same
   * element again disposes of what was drawn there before.
   */
  dispose(): void;
}

const mounted = new WeakMap<HTMLElement, MountedPreview>();

export function mountPreview(
  element: HTMLElement,
  text: string,
  options: { note: Note | null },
): MountedPreview {
  mounted.get(element)?.dispose();
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const isCurrent = () => !disposed;

  let done: Promise<void>;
  try {
    const rendered = renderMarkdown(text);
    element.style.height = "100%";
    element.innerHTML = sanitizeHTML(rendered.html);
    done = finishPreview(element, options.note, isCurrent, cleanups);
  } catch (error) {
    element.textContent = String(error);
    done = Promise.reject(error);
  }
  // Callers that do not wait for it need not handle its failure.
  done.catch(() => {});

  const preview: MountedPreview = {
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
