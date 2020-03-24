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
            "_blank"
          );
        });
      }
    }
  }
}

export function printPreview(
  previewElement: HTMLElement,
  bannerElement?: HTMLElement,
  timeout = 2000
) {
  return VickyMDPrintPreview(
    previewElement,
    bannerElement,
    ["#main-panel", "#editor-main-panel", "#editor-card"],
    `
  #notes-panel,
  .editor-bottom-panel,
  .drawer,
  .CodeMirror,
  .editor-textarea,
  .control-panel-wrapper {
    display: none;
  }
  #editor-card {
    width: 100%;
    height: 100%;
    box-shadow: none;
  }
  .editor-panel, #main-panel {
    background-color: #fff;
    box-shadow: none;
    border: none;
  }
`,
    timeout
  );
}
