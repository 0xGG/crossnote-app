import { type Drawing, startDrawing } from "./drawing";

// Code, shown as it is at once and highlighted once Prism has its language;
// as it is in a language Prism does not have, or cannot load.
export function renderCodeBlock(
  code: string,
  language: string,
  indented = false,
): Drawing {
  const pre = document.createElement("pre");
  if (indented) {
    const inner = document.createElement("code");
    inner.textContent = code;
    pre.append(inner);
    return startDrawing(pre, async () => undefined);
  }
  pre.textContent = code;
  return startDrawing(
    pre,
    async (signal) => {
      // Prism, and what it knows of its languages, load with the first block;
      // code is shown as it is when they cannot be loaded.
      let prism: any;
      try {
        const { prismWith } = await import("./prism");
        prism = await prismWith(language);
      } catch {
        prism = undefined;
      }
      if (signal.aborted) {
        return;
      }
      if (!prism) {
        pre.classList.add("language-text");
        return;
      }
      let highlighted: string;
      try {
        highlighted = prism.highlight(
          code,
          prism.languages[language],
          language,
        );
      } catch {
        pre.classList.add("language-text");
        return;
      }
      // Prism escapes the code it is given; what it returns is its own markup.
      pre.innerHTML = highlighted;
      pre.classList.add(`language-${language}`);
    },
    // Code that takes too long to highlight stays as it is.
    { keepsWhatItShows: true },
  );
}
