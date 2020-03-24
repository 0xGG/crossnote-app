import { UUIDNil } from "./utils";

export interface Summary {
  title: string;
  summary: string;
  images: string[]; // If has `title`, then images[0] is cover.
  tags: string[]; // TODO: support tags
  html: string; // original html
}

/*
export async function getTopicsAndMentionsFromHTML(
  html: string,
  ribbit: Ribbit
): Promise<{
  topics: string[];
  mentions: { name: string; address: string }[];
}> {
  const div = document.createElement("div");
  const topics = [];
  const mentions = [];
  div.innerHTML = html;

  const tagElems = div.getElementsByClassName("tag");
  for (let i = 0; i < tagElems.length; i++) {
    const tagElem = tagElems[i] as HTMLAnchorElement;
    if (tagElem.classList.contains("tag-mention")) {
      const mention = tagElem.getAttribute("data-mention");
      const userInfo = await ribbit.getUserInfoFromUsername(mention);
      mentions.push({
        name: userInfo.username,
        address: userInfo.address
      });
    } else if (tagElem.classList.contains("tag-topic")) {
      const topic = tagElem.getAttribute("data-topic");
      topics.push(topic);
    }
  }
  div.remove();

  return {
    topics: Array.from(new Set(topics)),
    mentions
  };
}
*/

export function getHeaderFromMarkdown(markdown: string): string {
  const titleMatch = markdown.match(/^#\s.+$/gim);
  if (titleMatch && titleMatch.length) {
    return titleMatch[0].replace(/^#/, "").trim();
  }
  return "";
}

export function getMentionsFromMarkdown(markdown: string): string[] {
  return (markdown.match(/@(?:[a-zA-Z\d]+-)*[a-zA-Z\d]+/g) || [])
    .map(username => username.replace(/^@/, "").toLocaleLowerCase())
    .filter(
      (username, index, self) =>
        index === self.findIndex(username2 => username === username2)
    );
}

export async function generateSummaryFromMarkdown(
  markdown: string
): Promise<Summary> {
  let title = "",
    summary = "",
    images: string[] = [];
  markdown = markdown.replace(/^---([\w\W]+?\n---)/, "").trim(); // Remove front matter
  let contentString = markdown;

  const titleMatch = markdown.match(/^#\s.+$/gim);
  if (titleMatch && titleMatch.length) {
    title = titleMatch[0].replace(/^#/, "").trim();
    const aheadString = markdown
      .slice(0, markdown.indexOf(titleMatch[0]))
      .trim();
    contentString = markdown.slice(
      markdown.indexOf(titleMatch[0]) + titleMatch[0].length,
      markdown.length
    );
    const coverMatch = aheadString.match(/^!\[.*?\]\(.+?\)/gim);
    if (coverMatch && coverMatch.length) {
      images.push(coverMatch[0].match(/\(([^)"]+?)\)/)[1].trim());
    }
  }

  const coverImagesMatch = markdown.match(/^!\[.*?\]\(.+?\)/gim);
  if (coverImagesMatch && coverImagesMatch.length) {
    coverImagesMatch.forEach(mdImage => {
      images.push(mdImage.match(/\(([^)"]+?)\)/)[1].trim());
    });
    images = images.filter(
      (image, index, self) => index === self.findIndex(m => m === image)
    );
  }

  summary = contentString
    .split("\n")
    .filter(
      x =>
        x.trim().length > 0 &&
        !x.match(/!\[.*?\]\(.+?\)/) && // Remove image
        !x.match(/`@.+?`/) // Remove widget
    )
    .map(x => x.replace(/#+\s(.+)\s*$/, "**$1**").trim()) // Replace headers to bold
    .slice(0, 10)
    .join("  \n");

  return {
    title,
    summary,
    images,
    tags: [],
    html: ""
  };
}

export const EmptyPageInfo = {
  hasPreviousPage: false,
  hasNextPage: false,
  startCursor: UUIDNil,
  endCursor: UUIDNil
};
