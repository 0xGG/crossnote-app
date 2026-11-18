import { findFrontMatter } from "../lib/frontMatter";

export interface Summary {
  summary: string;
  images: string[];
}

export function generateSummaryFromMarkdown(markdown: string): Summary {
  let images: string[] = [];
  markdown = (findFrontMatter(markdown)?.rest ?? markdown).trim();
  let contentString = markdown;

  const titleMatch = markdown.match(/^#\s.+$/gim);
  if (titleMatch && titleMatch.length) {
    const aheadString = markdown
      .slice(0, markdown.indexOf(titleMatch[0]))
      .trim();
    contentString = markdown.slice(
      markdown.indexOf(titleMatch[0]) + titleMatch[0].length,
      markdown.length,
    );
    const coverMatch = aheadString.match(/^!\[.*?\]\(.+?\)/gim);
    if (coverMatch && coverMatch.length) {
      const cover = coverMatch[0].match(/\(([^)"]+?)\)/)?.[1];
      if (cover) images.push(cover.trim());
    }
  }

  const coverImagesMatch = markdown.match(/^!\[.*?\]\(.+?\)/gim);
  if (coverImagesMatch && coverImagesMatch.length) {
    coverImagesMatch.forEach((mdImage) => {
      const image = mdImage.match(/\(([^)"]+?)\)/)?.[1];
      if (image) images.push(image.trim());
    });
    images = images.filter(
      (image, index, self) => index === self.findIndex((m) => m === image),
    );
  }

  const summary = contentString
    .split("\n")
    .filter(
      (x) =>
        x.trim().length > 0 &&
        !x.match(/!\[.*?\]\(.+?\)/) && // Remove image
        !x.match(/<!--\s*@.+?-->/), // Remove a widget's comment
    )
    .map((x) => x.replace(/#+\s(.+)\s*$/, "**$1**").trim()) // Replace headers to bold
    .slice(0, 10)
    .join("  \n");

  return {
    summary,
    images,
  };
}
