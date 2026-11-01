// The app's own furniture, hidden while a note prints.
const hiddenWhilePrinting = [
  ".App",
  ".editor-bottom-panel",
  ".drawer",
  ".CodeMirror",
  ".editor-textarea",
  ".editor-toolbar",
  ".notes-panel",
  ".control-panel-wrapper",
];

const printCSS = `
@media print {
  .print-hidden {
    display: none;
  }

  ${hiddenWhilePrinting.join(",\n  ")} {
    display: none;
  }

  /* <!-- pagebreak --> and <!-- newpage --> */
  .pagebreak {
    break-after: page;
    page-break-after: always;
  }
}
`;

/**
 * Prints a note mountPreview has drawn into element (with forPrint for a
 * deck). The element covers the page meanwhile, banner over it on screen
 * only; after timeout, which gives diagrams that draw themselves time to
 * finish, the browser's print dialog opens on the page, or on the deck's
 * frame. Settles once print() returns and everything is put back.
 */
export function printPreview(
  element: HTMLElement,
  banner: HTMLElement,
  timeout = 2000,
): Promise<void> {
  banner.classList.add("print-hidden");
  document.body.appendChild(banner);
  const style = document.createElement("style");
  style.textContent = printCSS;
  document.body.appendChild(style);

  const covering = {
    display: "block",
    position: "absolute",
    width: "100%",
    height: "auto",
    overflow: "auto",
    zIndex: "9999",
    top: "0",
    left: "0",
    padding: "0",
    margin: "0",
  };
  const before: Partial<typeof covering> = {};
  for (const key of Object.keys(covering) as (keyof typeof covering)[]) {
    before[key] = element.style[key];
    element.style[key] = covering[key];
  }

  // The covering element is placed against the page rather than the body.
  const bodyPosition = document.body.style.position;
  document.body.style.position = "initial";

  const frame =
    element.firstElementChild?.tagName === "IFRAME"
      ? (element.firstElementChild as HTMLIFrameElement)
      : null;

  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        (frame ? frame.contentWindow : window).print();
      } finally {
        banner.remove();
        style.remove();
        Object.assign(element.style, before);
        document.body.style.position = bodyPosition;
        resolve();
      }
    }, timeout);
  });
}
