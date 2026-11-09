import { previewTimeout } from "./drawing";

// Everything on the page but the note, hidden while it prints: the app, the
// banner over it, and what the app shows over it from outside the app's own
// element (the note menu still closing, a notification).
const printCSS = `
@media print {
  body > :not(.printed-note) {
    display: none !important;
  }

  /* <!-- pagebreak --> and <!-- newpage --> */
  .pagebreak {
    break-after: page;
    page-break-after: always;
  }
}
`;

/**
 * Prints a note mountPreview draws into element, a child of the body, once
 * it is drawn (drawn, the preview's done), or once previewTimeout has
 * passed, with what is drawn by then. The element covers the page from the
 * start, banner over it on screen only, and the browser's print dialog then
 * opens on the page, with nothing else of it printed. Settles once print()
 * returns and everything is put back; fails, without printing, when the
 * drawing does.
 */
export function printPreview(
  element: HTMLElement,
  banner: HTMLElement,
  drawn: Promise<unknown>,
): Promise<void> {
  element.classList.add("printed-note");
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

  let timer: number | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = window.setTimeout(resolve, previewTimeout);
  });
  return Promise.race([drawn, limit])
    .then(() => window.print())
    .finally(() => {
      window.clearTimeout(timer);
      element.classList.remove("printed-note");
      banner.remove();
      style.remove();
      Object.assign(element.style, before);
      document.body.style.position = bodyPosition;
    });
}
