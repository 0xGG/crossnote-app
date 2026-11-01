import { Note } from "../lib/note";
import { finishPreview } from "./preview";
import { sanitizeHTML } from "./sanitize";

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

// The sanitized deck, with each wavedrom block's source put back in the
// script element WaveDrom.ProcessAll looks for. Its type is not one the
// browser runs; a source that could end the element early stays as text.
function deckHTML(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = sanitizeHTML(html);
  for (const block of Array.from(
    template.content.querySelectorAll(".vickeymd-fence.wavedrom"),
  )) {
    const source = block.textContent;
    if (/<\/script|<!--/i.test(source)) {
      continue;
    }
    const script = document.createElement("script");
    script.setAttribute("type", "WaveDrom");
    script.textContent = source;
    block.replaceChildren(script);
  }
  return template.innerHTML;
}

let frames = 0;

// Draws a deck of slides into a frame inside element, with reveal.js and the
// slides' own mermaid and wavedrom. Settles once reveal.js says the deck is
// ready, or that it could not load, and the frame's content has been
// finished like a preview's; cleanups gets what dispose has to undo.
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
  const config: Record<string, any> = frontMatter?.["presentation"] || {};
  const theme = revealThemes.includes(config["theme"])
    ? config["theme"]
    : "white.css";
  const body = deckHTML(html);

  let diagramScripts = "";
  let diagramInits = "";
  if (body.indexOf("wavedrom") >= 0) {
    diagramScripts +=
      '<script src="https://cdn.jsdelivr.net/npm/wavedrom@2.3.2/skins/default.js"></script>' +
      '<script src="https://cdn.jsdelivr.net/npm/wavedrom@2.3.2/wavedrom.min.js"></script>';
    diagramInits +=
      '<script>Reveal.addEventListener("ready", function () { WaveDrom.ProcessAll(); });</script>';
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

  const settled = new Promise<void>((resolve) => {
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
    const stopListening = () =>
      window.removeEventListener("message", onMessage);
    window.addEventListener("message", onMessage);
    options.cleanups.push(() => {
      stopListening();
      resolve();
    });
  });

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/css/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/css/theme/${theme}">
  ${options.forPrint ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/css/print/pdf.css">' : ""}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.13.0/dist/katex.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shd101wyy/mume@0.4.7/styles/prism_theme/${prismThemes[theme]}">
  ${diagramScripts}
</head>
<body>
${body}
</body>
${options.forPrint ? '<script>window.history.replaceState("", "", "?print-pdf");</script>' : ""}
<script src="https://cdn.jsdelivr.net/npm/reveal.js@3.9.2/js/reveal.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.17.1/prism.min.js"></script>
${diagramInits}
<script>
  if (typeof Reveal === "undefined") {
    parent.postMessage({ event: "reveal-failed", id: ${scriptValue(id)} }, "/");
  } else {
    Reveal.initialize(${scriptValue({ margin: 0.1, ...config })});
    Reveal.addEventListener("ready", function () {
      parent.postMessage({ event: "reveal-ready", id: ${scriptValue(id)} }, "/");
    });
  }
</script>
</html>`);
  doc.close();

  return settled.then(() => {
    // The frame's body exists only now: its head waits for scripts to load
    // before the parser reaches it.
    if (options.isCurrent() && iframe.contentDocument?.body) {
      return finishPreview(
        iframe.contentDocument.body,
        options.note,
        true,
        options.isCurrent,
      );
    }
  });
}
