import path from "path-browserify";
import { globalContainers } from "../containers/global";
import { Note } from "../lib/note";

export function openURL(url: string = "", note: Note) {
  if (!note || !url) {
    return;
  }
  if (url.match(/https?:\/\//)) {
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
  } else if (url.startsWith("/")) {
    let filePath = path.relative(
      note.notebookPath,
      path.resolve(note.notebookPath, url.replace(/^\//, "")),
    );
    globalContainers.crossnoteContainer.openNoteAtPath(
      globalContainers.crossnoteContainer.getNotebookAtPath(note.notebookPath),
      decodeURIComponent(filePath),
    );
  } else {
    let filePath = path.relative(
      note.notebookPath,
      path.resolve(
        path.dirname(path.resolve(note.notebookPath, note.filePath)),
        url,
      ),
    );
    globalContainers.crossnoteContainer.openNoteAtPath(
      globalContainers.crossnoteContainer.getNotebookAtPath(note.notebookPath),
      decodeURIComponent(filePath),
    );
  }
}
