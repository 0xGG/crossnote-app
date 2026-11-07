import { BlockInfo } from "./markdown/blockInfo";

/**
 * A code block of the preview drawn: a diagram, or code highlighted. Its
 * element takes the block's place at once and is drawn into, then or later.
 */
export interface Drawing {
  element: HTMLElement;
  /**
   * Settles once the drawing is finished, or has failed and its element
   * says why, or once it is disposed of; never rejects.
   */
  done: Promise<void>;
  /**
   * Settles once the drawing is under way: at once, or, for one that waits
   * its turn behind others of its kind, when its turn comes. The time a
   * preview gives it counts from then.
   */
  started: Promise<void>;
  /** Stops a drawing still under way and lets go of what it holds. */
  dispose(): void;
  /**
   * Gives up on a drawing that took too long: disposes of it and says so in
   * its place, or leaves in place what it shows already.
   */
  giveUp(seconds: number): void;
}

export interface DrawingContext {
  /** The preview is coloured in a dark theme. */
  dark: boolean;
}

/** Draws a code block of the language it is registered for. */
export type Renderer = (
  code: string,
  info: BlockInfo,
  context: DrawingContext,
) => Drawing;

/** How long a preview waits for one drawing before it gives up on it. */
export const drawingTimeout = 10000;

/** What a block that cannot be drawn shows in its place. */
export function failedBlock(error: unknown): HTMLElement {
  const pre = document.createElement("pre");
  pre.classList.add("language-error");
  pre.textContent = String(error);
  return pre;
}

/**
 * A drawing that draw finishes in element. draw starts once the code that
 * asked for the drawing has run, so that the element can be put in the page
 * first, and not at all when the drawing is disposed of before then. It is
 * told through its signal when the drawing is disposed of, and is then to
 * leave the element alone and let go of what it holds; what it throws or
 * rejects with is shown in the element instead. A drawing that waits its
 * turn behind others of its kind (waitsItsTurn) calls begin when its turn
 * comes; one that keeps what it shows (keepsWhatItShows) is left as it is
 * when a preview gives up on it, as code shown before it is highlighted.
 */
export function startDrawing(
  element: HTMLElement,
  draw: (signal: AbortSignal, begin: () => void) => void | Promise<void>,
  options: { waitsItsTurn?: boolean; keepsWhatItShows?: boolean } = {},
): Drawing {
  const controller = new AbortController();
  const { signal } = controller;
  const disposed = new Promise<void>((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
  let begin = () => {};
  const started = new Promise<void>((resolve) => (begin = resolve));
  const drawn = Promise.resolve()
    .then(() => {
      if (signal.aborted) {
        return;
      }
      if (!options.waitsItsTurn) {
        begin();
      }
      return draw(signal, begin);
    })
    .catch((error) => {
      if (!signal.aborted) {
        element.replaceChildren(failedBlock(error));
      }
    });
  return {
    element,
    done: Promise.race([drawn, disposed]),
    started,
    dispose: () => controller.abort(),
    giveUp(seconds) {
      controller.abort();
      if (!options.keepsWhatItShows) {
        element.replaceChildren(
          failedBlock(
            `Error: this block took more than ${seconds} seconds to draw`,
          ),
        );
      }
    },
  };
}

/**
 * Waits for a drawing, up to timeout from when it is under way: one that
 * takes longer is given up on. Settles either way; stop() stops the wait.
 */
export function waitForDrawing(
  drawing: Drawing,
  timeout = drawingTimeout,
): { settled: Promise<void>; stop(): void } {
  let timer: number | undefined;
  let over = false;
  let stop = () => {};
  const timedOut = new Promise<void>((resolve) => {
    stop = () => {
      over = true;
      window.clearTimeout(timer);
      resolve();
    };
    drawing.started.then(() => {
      if (!over) {
        timer = window.setTimeout(() => {
          drawing.giveUp(timeout / 1000);
          resolve();
        }, timeout);
      }
    });
  });
  const settled = Promise.race([drawing.done, timedOut]).finally(() => {
    over = true;
    window.clearTimeout(timer);
  });
  return { settled, stop };
}

/** Whether the previews in container are coloured in a dark theme. */
export function isDarkPreview(container: Element): boolean {
  const theme = container
    .closest<HTMLElement>("[data-preview-theme]")
    ?.getAttribute("data-preview-theme");
  return theme === "dark" || theme === "one-dark";
}
