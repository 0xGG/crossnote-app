// The code blocks' theme comes after the preview's, as echomd put them on the
// page: where both style the same element as specifically, it wins.
import "./preview-theme.css";
import "./code-block-theme.css";

/**
 * Colours previews, code blocks included, as the theme of that name: every
 * preview on the page, or, given an element, the previews in it, whatever
 * the page has (one being printed is light).
 */
export function setPreviewTheme(
  themeName: string,
  element: HTMLElement = document.documentElement,
) {
  element.dataset.previewTheme = themeName;
}
