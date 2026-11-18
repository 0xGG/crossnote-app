import path from "path-browserify";
import { Note } from "../lib/note";
import { decodeLinkPath } from "../render/markdown/linkTargets";

export function openURL(
  url: string,
  note: Note,
  openNote?: (filePath: string) => void,
) {
  if (!note || !url) {
    return;
  }
  if (/^(mailto|tel):/i.test(url)) {
    // Mail and phone numbers go to what the system opens them with, as a
    // click on the link would.
    const link = document.createElement("a");
    link.href = url;
    link.click();
    return;
  }
  if (url.startsWith("#")) {
    // A place in the note itself, which the preview goes to.
    return;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) {
    // Another scheme (javascript:, data:, ...) is neither a page to open
    // nor a note to open or create.
    return;
  }
  if (/^https?:\/\//i.test(url)) {
    // Strict same-origin comparison: a prefix test would also match
    // lookalike hosts such as https://<origin>.evil.example or
    // https://<origin>@attacker.example.
    let isSameOrigin = false;
    try {
      isSameOrigin = new URL(url).origin === window.location.origin;
    } catch {
      // Not a parseable absolute URL; treat it as external.
    }
    if (isSameOrigin) {
      // Same-origin deep links (/?repo=...) are handled by the query-string
      // parsing at boot, so navigate for real; a bare pushState would only
      // change the address bar (nothing subscribes to history changes).
      window.location.assign(url);
    } else {
      // Without noopener the page opened would get window.opener, a handle
      // on this tab that it could send elsewhere.
      window.open(url, "_blank", "noopener");
    }
  } else {
    const file = url.startsWith("/")
      ? path.resolve(note.notebookPath, url.slice(1))
      : path.resolve(note.notebookPath, path.dirname(note.filePath), url);
    openNote?.(decodeLinkPath(path.relative(note.notebookPath, file)));
  }
}
