import { printPreview as VickyMDPrintPreview } from "vickymd/preview";

export function handleTagClickInPreview(previewElement: HTMLElement) {
  const tagElements = previewElement.querySelectorAll("a.tag");
  for (let i = 0; i < tagElements.length; i++) {
    const tag = tagElements[i];
    if (tag.hasAttribute("data-topic")) {
      const tagName = tag.getAttribute("data-topic");
      if (tagName.trim().length) {
        tag.addEventListener("click", () => {
          window.open(
            `${window.location.origin}/tag/${tagName.trim()}`,
            "_blank",
          );
        });
      }
    }
  }
}

export function printPreview(
  previewElement: HTMLElement,
  bannerElement?: HTMLElement,
  timeout = 2000,
) {
  return VickyMDPrintPreview(
    previewElement,
    bannerElement,
    ["body"],
    `
  #notes-panel,
  .editor-bottom-panel,
  .drawer,
  .CodeMirror,
  .editor-textarea,
  .editor-toolbar,
  .Pane.vertical.Pane1,
  .control-panel-wrapper {
    display: none;
  }
`,
    timeout,
  );
}
