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

// Opens the print dialog, and settles once the page is printed: when
// print() returns, as it does once the dialog is closed where the dialog
// holds the page up (Chromium), or, where it returns with the dialog still
// open, at afterprint. Should afterprint not come, the first click or key on
// the page says the dialog is gone.
function printPage(): Promise<void> {
  let opened = false;
  let closed = false;
  let done = () => {};
  const printed = new Promise<void>((resolve) => (done = resolve));
  const onBefore = () => (opened = true);
  const onAfter = () => {
    closed = true;
    done();
  };
  window.addEventListener("beforeprint", onBefore);
  window.addEventListener("afterprint", onAfter);
  const stopListening = () => {
    window.removeEventListener("beforeprint", onBefore);
    window.removeEventListener("afterprint", onAfter);
    window.removeEventListener("pointerdown", done, true);
    window.removeEventListener("keydown", done, true);
  };
  try {
    window.print();
  } catch (error) {
    stopListening();
    return Promise.reject(error);
  }
  if (!opened || closed) {
    // Back from a dialog that held the page up, or from none at all.
    done();
  } else {
    window.addEventListener("pointerdown", done, true);
    window.addEventListener("keydown", done, true);
  }
  return printed.finally(stopListening);
}

/**
 * Prints a note mountPreview draws into element, a child of the body, once
 * it is drawn (drawn, the preview's done), or once previewTimeout has
 * passed, with what is drawn by then. The element covers the page from the
 * start, banner over it on screen only, and the browser's print dialog then
 * opens on the page, with nothing else of it printed. Settles once the page
 * is printed (printPage) and everything is put back; fails, without
 * printing, when the drawing does.
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
    .then(printPage)
    .finally(() => {
      window.clearTimeout(timer);
      element.classList.remove("printed-note");
      banner.remove();
      style.remove();
      Object.assign(element.style, before);
      document.body.style.position = bodyPosition;
    });
}
