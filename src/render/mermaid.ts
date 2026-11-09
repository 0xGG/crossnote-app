import { previewTimeout, Renderer, startDrawing } from "./drawing";
import { sanitizeSVG } from "./sanitize";

let diagrams = 0;
// mermaid's settings are its own, for every diagram: one diagram is set up
// and drawn at a time, so each is drawn in its own theme.
let queue: Promise<unknown> = Promise.resolve();

/**
 * A mermaid diagram, drawn by mermaid (loaded with the first one) in the
 * theme that goes with the preview's, as SVG that goes through the
 * sanitizer before it is put in the page. mermaid's strict security level
 * keeps the diagram's own HTML and scripts out as well.
 */
export const renderMermaid: Renderer = (code, { dark }) => {
  const element = document.createElement("div");
  element.classList.add("mermaid");
  return startDrawing(
    element,
    async (signal, begin) => {
      const before = queue;
      // mermaid drawing this diagram, once it does.
      let rendering: Promise<unknown> | undefined;
      const drawn = before.then(async () => {
        if (signal.aborted) {
          return "";
        }
        begin();
        const { default: mermaid } = await import("mermaid");
        if (signal.aborted) {
          return "";
        }
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
          // What cannot be drawn is said in the block, not drawn into the page.
          suppressErrorRendering: true,
        });
        const render = mermaid.render(`crossnote-mermaid-${++diagrams}`, code);
        rendering = render;
        const { svg } = await render;
        return svg;
      });
      // The next diagram's turn comes once this one is drawn. One disposed
      // of before mermaid draws it ends its turn as it comes, so the next
      // goes once the one before is done. One given up on or disposed of
      // while mermaid draws it lets the next go once mermaid is not drawing
      // it any more, as mermaid draws one diagram at a time: no later than
      // 30 seconds (as long as a preview waits for all its drawings) after
      // it was given up on or disposed of, so that a render that never
      // settles holds up the others for no longer than that.
      queue = new Promise<void>((release) => {
        drawn.then(
          () => release(),
          () => release(),
        );
        signal.addEventListener(
          "abort",
          () => {
            if (!rendering) {
              return;
            }
            let timer: number | undefined;
            Promise.race([
              rendering.catch(() => {}),
              new Promise((resolve) => {
                timer = window.setTimeout(resolve, previewTimeout);
              }),
            ]).then(() => {
              window.clearTimeout(timer);
              release();
            });
          },
          { once: true },
        );
      });
      const svg = await drawn;
      if (!signal.aborted) {
        element.innerHTML = sanitizeSVG(svg);
      }
    },
    // The time a diagram is given counts from its turn.
    { waitsItsTurn: true },
  );
};
