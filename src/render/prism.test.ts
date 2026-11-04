import { afterEach, describe, expect, it } from "vitest";
import { mountPreview } from "./index";
import { prismWith } from "./prism";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("prismWith", () => {
  it("has a language by its name and by its other names", async () => {
    const prism = await prismWith("py");
    expect(prism.languages.py).toBe(prism.languages.python);
    expect(
      prism.highlight("def f(): pass", prism.languages.py, "py"),
    ).toContain('<span class="token keyword">def</span>');
  });

  it("loads the languages a language builds on before it", async () => {
    // PHP's file adds itself to markup-templating's, which needs markup.
    const prism = await prismWith("php");
    expect(prism.languages["markup-templating"]).toBeDefined();
    expect(
      prism.highlight("<?php echo 1; ?>", prism.languages.php, "php"),
    ).toContain("token keyword");
  });

  it("has nothing for a language Prism does not have", async () => {
    expect(await prismWith("no-such-language")).toBeUndefined();
    expect(await prismWith("meta")).toBeUndefined();
  });
});

describe("mountPreview's code blocks", () => {
  it("highlights a block in its language once the language is loaded", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    await mountPreview(element, "```rust\nfn main() {}\n```\n", { note: null })
      .done;
    const block = element.querySelector("pre");
    expect(block.classList.contains("language-rust")).toBe(true);
    expect(block.querySelector(".token.keyword")?.textContent).toBe("fn");
  });

  it("shows a block in a language Prism does not have as it is", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    await mountPreview(element, "```nonesuch\n<b>x</b>\n```\n", { note: null })
      .done;
    const block = element.querySelector("pre");
    expect(block.classList.contains("language-text")).toBe(true);
    expect(block.textContent).toBe("<b>x</b>\n");
    expect(block.querySelector("b")).toBeNull();
  });
});
