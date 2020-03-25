// const loadLanguages = require("prismjs/components/");
// loadLanguages(["python"]);

export function getTags(markdown: string): string[] {
  const tags = new Set(
    markdown.match(
      /(#([^#]+?)#[\s@#,.!$%^&*()[\]-_+=~`<>?\\/，。])|(#[^\s@#,.!$%^&*()[\]-_+=~`<>?\\/，。]+)/g
    ) || []
  );
  return Array.from(tags).map(
    tag => tag.replace(/[@#,.!$%^&*()[\]-_+=~`<>?\\/，。]/g, "").trim() // Don't remove \s here
  );
}
