import YAML from "yamljs";

export interface MatterOutput {
  data: any;
  content: string;
}

export function matter(markdown: string): MatterOutput {
  let endFrontMatterOffset = 0;
  let frontMatter = {};
  if (
    markdown.startsWith("---") &&
    /* tslint:disable-next-line:no-conditional-assignment */
    (endFrontMatterOffset = markdown.indexOf("\n---")) > 0
  ) {
    const frontMatterString = markdown.slice(3, endFrontMatterOffset);
    try {
      frontMatter = YAML.parse(frontMatterString);
    } catch (error) {}
    markdown = markdown
      .slice(endFrontMatterOffset + 4)
      .replace(/^[ \t]*\n/, "");
  }
  return {
    data: frontMatter,
    content: markdown,
  };
}

export function matterStringify(markdown: string, frontMatter: any) {
  frontMatter = frontMatter || {};
  const yamlStr = YAML.stringify(frontMatter).trim();
  if (yamlStr === "{}" || !yamlStr) {
    return markdown;
  } else {
    return `---
${yamlStr}
---
${markdown}`;
  }
}
