import moment from "moment";

/**
 * A function that calls `fn` once calls to it have stopped for `delay` ms.
 */
export function debounce(fn: () => void, delay: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

// https://stackoverflow.com/questions/400212/how-do-i-copy-to-the-clipboard-in-javascript
export function copyToClipboard(text: string) {
  if ("clipboardData" in window && (window as any).clipboardData.setData) {
    // Internet Explorer-specific code path to prevent textarea being shown while dialog is visible.
    return (window as any).setData("Text", text);
  } else if (
    document.queryCommandSupported &&
    document.queryCommandSupported("copy")
  ) {
    const textarea = document.createElement("textarea");
    textarea.textContent = text;
    textarea.style.position = "fixed"; // Prevent scrolling to bottom of page in Microsoft Edge.
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy"); // Security exception may be thrown by some browsers.
    } catch (ex) {
      console.warn("Copy to clipboard failed.", ex);
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// A notebook cloned from git is named after its repository: the last part of
// the URL, a slash at its end aside, without its .git ending. Only the ending
// goes, so a repository named like a host, such as alice.github.io, keeps its
// name.
export function notebookNameFromGitURL(gitURL: string): string {
  const url = gitURL.trim().replace(/\/+$/, "");
  return url.slice(url.lastIndexOf("/") + 1).replace(/\.git$/, "");
}

export function randomID() {
  return Math.random().toString(36).substr(2, 9);
}

export function getTodayName() {
  let today = moment().format("YYYY-MM-DD");
  const momentFormat = localStorage.getItem("settings/moment-format");
  if (momentFormat) {
    try {
      today = moment().format(momentFormat);
    } catch (error) {
      today = moment().format("YYYY-MM-DD");
    }
  }
  return today;
}
