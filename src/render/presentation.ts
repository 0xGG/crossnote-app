import { Note } from "../lib/note";
import { finishPreview } from "./preview";
import { sanitizeHTML } from "./sanitize";
// The styles of the math the markdown stage drew, from the same KaTeX, for
// the deck's frame.
import katexStyles from "katex/dist/katex.min.css?inline";

const revealThemes = [
  "beige.css",
  "black.css",
  "blood.css",
  "league.css",
  "moon.css",
  "night.css",
  "serif.css",
  "simple.css",
  "sky.css",
  "solarized.css",
  "white.css",
];

// The code theme that goes with each reveal.js theme.
const prismThemes: Record<string, string> = {
  "beige.css": "pen-paper-coffee.css",
  "black.css": "one-dark.css",
  "blood.css": "monokai.css",
  "league.css": "okaidia.css",
  "moon.css": "funky.css",
  "night.css": "atom-dark.css",
  "serif.css": "github.css",
  "simple.css": "github.css",
  "sky.css": "default.css",
  "solarized.css": "solarized-light.css",
  "white.css": "default.css",
};

const mermaidInit = `<script>
  if (window["MERMAID_CONFIG"]) {
    window["MERMAID_CONFIG"].startOnLoad = false;
    window["MERMAID_CONFIG"].cloneCssStyles = false;
  }
  mermaid.initialize(window["MERMAID_CONFIG"] || {});
  if (typeof window["Reveal"] !== "undefined") {
    function mermaidRevealHelper(event) {
      var diagrams = event.currentSlide.querySelectorAll(".mermaid");
      for (var i = 0; i < diagrams.length; i++) {
        if (!diagrams[i].hasAttribute("data-processed")) {
          mermaid.init(null, diagrams[i], function () {
            Reveal.slide(event.indexh, event.indexv);
          });
        }
      }
    }
    Reveal.addEventListener("slidechanged", mermaidRevealHelper);
    Reveal.addEventListener("ready", mermaidRevealHelper);
  } else {
    mermaid.init(null, document.getElementsByClassName("mermaid"));
  }
</script>`;

// A value written into an inline script, which "</script>" in it must not end.
const scriptValue = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");

// The frame draws each wavedrom block from its source read as JSON, as the
// preview does. WaveDrom.ProcessAll is not used: it evaluates the text of
// every element whose type is WaveDrom as script, and a note's HTML can
// make such an element. What RenderWaveForm draws is not sanitized, here as
// in the preview (see sanitize.ts).
const wavedromInit = `<script>
  (function () {
    var blocks = document.querySelectorAll(".vickeymd-fence.wavedrom");
    for (var i = 0; i < blocks.length; i++) {
      var text = blocks[i].textContent;
      try {
        var source = JSON.parse(text);
        var target = document.createElement("div");
        target.id = "WaveDrom_Display_" + i;
        blocks[i].textContent = "";
        blocks[i].appendChild(target);
        WaveDrom.RenderWaveForm(i, source, "WaveDrom_Display_");
      } catch (error) {
        blocks[i].textContent = text;
      }
    }
  })();
</script>`;

// The front matter's reveal.js settings, less the two that would run what
// the note names: dependencies, scripts reveal.js loads, and previewLinks,
// which writes a link's address into HTML of reveal.js's own.
function revealSettings(frontMatter: Record<string, any>) {
  const presentation = frontMatter?.["presentation"];
  const settings =
    presentation &&
    typeof presentation === "object" &&
    !Array.isArray(presentation)
      ? { ...presentation }
      : {};
  delete settings["dependencies"];
  return { margin: 0.1, ...settings, previewLinks: false };
}

let frames = 0;

// How long a deck waits for reveal.js to say it is ready or could not load.
export const revealTimeout = 30000;

// Draws a deck of slides into a frame inside element, with reveal.js and the
// slides' own mermaid and wavedrom. Settles once reveal.js says the deck is
// ready, or that it could not load, and the frame's content has been
// finished like a preview's, or once it is disposed of; fails when reveal.js
// has said neither within revealTimeout. cleanups gets what dispose has to
// undo.
export function mountPresentation(
  element: HTMLElement,
  html: string,
  frontMatter: Record<string, any>,
  options: {
    note: Note | null;
    forPrint: boolean;
    isCurrent: () => boolean;
    cleanups: (() => void)[];
  },
): Promise<void> {
  const id = `reveal.js.${Date.now()}.${frames++}`;
  const settings = revealSettings(frontMatter);
  const theme = revealThemes.includes(settings["theme"])
    ? settings["theme"]
    : "white.css";
  const body = sanitizeHTML(html);

  let diagramScripts = "";
  let diagramInits = "";
  if (body.indexOf("wavedrom") >= 0) {
    diagramScripts +=
      '<script src="https://cdn.jsdelivr.net/npm/wavedrom@2.3.2/skins/default.js"></script>' +
      '<script src="https://cdn.jsdelivr.net/npm/wavedrom@2.3.2/wavedrom.min.js"></script>';
    diagramInits += wavedromInit;
  }
  if (body.indexOf("mermaid") >= 0) {
    // The same mermaid the page loads from the site (index.html).
    diagramScripts += '<script src="/deps/mermaid/mermaid.min.js"></script>';
    diagramInits += mermaidInit;
  }

  const iframe = document.createElement("iframe");
  iframe.style.border = "none";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.boxSizing = "border-box";
  element.innerHTML = "";
  element.appendChild(iframe);

  let stopWaiting = () => {};
  const settled = new Promise<void>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === iframe.contentWindow &&
        event.data?.id === id &&
        (event.data.event === "reveal-ready" ||
          event.data.event === "reveal-failed")
      ) {
        stopListening();
        resolve();
      }
    };
    // reveal.js comes from a CDN: a request that neither answers nor fails
    // would leave the deck, and printing it, waiting for good.
    const timer = window.setTimeout(() => {
      stopListening();
      reject(new Error("reveal.js did not load in time"));
    }, revealTimeout);
    const stopListening = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
    window.addEventListener("message", onMessage);
    stopWaiting = stopListening;
    options.cleanups.push(() => {
      stopListening();
      resolve();
    });
  });

  // A frame that cannot be written into, as one outside a page has no
  // window, leaves nothing waiting for it.
  try {
    writeDeck(iframe.contentWindow.document);
  } catch (error) {
    stopWaiting();
    throw error;
  }

  function writeDeck(doc: Document) {
    doc.open();
    doc.write(`<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/css/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/css/theme/${theme}">
  ${options.forPrint ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/css/print/pdf.css">' : ""}
  <style>${katexStyles}</style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shd101wyy/mume@0.4.7/styles/prism_theme/${prismThemes[theme]}">
  ${diagramScripts}
</head>
<body>
${body}
</body>
${options.forPrint ? '<script>window.history.replaceState("", "", "?print-pdf");</script>' : ""}
<script src="https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/js/reveal.min.js"></script>
${diagramInits}
<script>
  if (typeof Reveal === "undefined") {
    parent.postMessage({ event: "reveal-failed", id: ${scriptValue(id)} }, "/");
  } else {
    Reveal.initialize(${scriptValue(settings)});
    Reveal.addEventListener("ready", function () {
      parent.postMessage({ event: "reveal-ready", id: ${scriptValue(id)} }, "/");
    });
  }
</script>
</html>`);
    doc.close();
  }

  return settled.then(() => {
    // The frame's body exists only now: its head waits for scripts to load
    // before the parser reaches it.
    if (options.isCurrent() && iframe.contentDocument?.body) {
      return finishPreview(
        iframe.contentDocument.body,
        options.note,
        true,
        options.isCurrent,
        options.cleanups,
      );
    }
  });
}
