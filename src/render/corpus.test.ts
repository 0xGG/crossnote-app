import { describe, expect, it } from "vitest";
import {
  frontMatterSamples,
  unreadableFrontMatterSamples,
} from "../test/corpus/frontMatter";
import { syntaxSamples } from "../test/corpus/syntax";
import { renderMarkdown } from "./index";
import { sanitizeHTML } from "./sanitize";

const samples = [
  ...syntaxSamples,
  ...Object.entries(frontMatterSamples).map(([name, text]) => ({
    name: `front matter, ${name}`,
    text,
  })),
  ...unreadableFrontMatterSamples.map(([name, text]) => ({
    name: `front matter YAML cannot read, ${name}`,
    text,
  })),
];

// Each element and attribute an element holds, by kind, with how many.
function inventory(root: Element): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const element of Array.from(root.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    add(tag);
    for (const { name } of Array.from(element.attributes)) {
      add(`${tag}[${name}]`);
    }
  }
  return counts;
}

// Sanitizing the shared corpus changes nothing a reader sees: every sample
// keeps its text, and what it drops is listed here, by sample, to be looked
// over when it changes (vitest -u).
describe("the shared corpus, sanitized", () => {
  samples.forEach(({ name, text }) => {
    it(`keeps ${name} as it reads`, () => {
      const html = renderMarkdown(text).html;
      const before = document.createElement("div");
      before.innerHTML = html;
      const after = document.createElement("div");
      after.innerHTML = sanitizeHTML(html);
      expect(after.textContent).toBe(before.textContent);
      const kept = inventory(after);
      const dropped = [...inventory(before)]
        .filter(([kind, count]) => (kept.get(kind) ?? 0) < count)
        .map(([kind]) => kind);
      expect(dropped).toMatchSnapshot();
    });
  });
});
