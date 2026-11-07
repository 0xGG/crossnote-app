import { Renderer, startDrawing } from "./drawing";
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
      const drawn = queue.then(async () => {
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
        const { svg } = await mermaid.render(
          `crossnote-mermaid-${++diagrams}`,
          code,
        );
        return svg;
      });
      // The next diagram's turn comes once this one is drawn, or given up on
      // or disposed of: a render that never settles holds up no other.
      queue = Promise.race([
        drawn.catch(() => {}),
        new Promise((resolve) =>
          signal.addEventListener("abort", resolve, { once: true }),
        ),
      ]);
      const svg = await drawn;
      if (!signal.aborted) {
        element.innerHTML = sanitizeSVG(svg);
      }
    },
    // The time a diagram is given counts from its turn.
    { waitsItsTurn: true },
  );
};
