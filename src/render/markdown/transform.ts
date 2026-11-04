import { Attributes, parseAttributes } from "./attributes";
import { HeadingIdGenerator } from "./slug";

// What the note's text is rewritten into, line by line, before markdown-it
// reads it, as echomd's preview did: the front matter taken out; empty
// paragraphs of class sync-line, carrying the line they stand for, put
// before headings, code blocks, images, comments and [TOC]; a heading's
// {#id .class} turned into an empty paragraph after it; a slide or page
// break comment turned into a marker; a task box turned into a checkbox;
// and HTML that opens a line kept as it is up to the tag that closes it.

/** A slide's attributes, from its <!-- slide --> comment, and its line. */
export type SlideConfig = Attributes & { lineNo: number };

export interface Transformed {
  outputString: string;
  slideConfigs: SlideConfig[];
  /** The front matter, with the lines of dashes around it. */
  frontMatterString: string;
}

function createAnchor(lineNo: number) {
  return `\n\n<p data-line="${lineNo}" class="sync-line" style="margin:0;"></p>\n\n`;
}

// The comments the rewriting knows. Their numbers count as well: echomd
// looked them up in a TypeScript enum, whose object maps each number back to
// its name.
const customSubjects = new Set([
  "pagebreak",
  "newpage",
  "toc",
  "tocstop",
  "slide",
  ".slide",
  ".slide:",
  "ebook",
  "toc-bracket",
  ...Array.from({ length: 9 }, (_, i) => String(i)),
]);

// Tags that do not close, looked up with `in`, as echomd did.
const selfClosingTag: { [tag: string]: 1 } = {
  area: 1,
  base: 1,
  br: 1,
  col: 1,
  command: 1,
  embed: 1,
  hr: 1,
  img: 1,
  input: 1,
  keygen: 1,
  link: 1,
  meta: 1,
  param: 1,
  source: 1,
  track: 1,
  wbr: 1,
};

export function transformMarkdown(inputString: string): Transformed {
  const headingIdGenerator = new HeadingIdGenerator();
  let lastOpeningCodeBlockFence: string | null = null;
  let codeChunkOffset = 0;
  const slideConfigs: SlideConfig[] = [];
  let frontMatterString = "";

  function helper(i: number, lineNo: number): Transformed {
    let outputString = "";
    while (i < inputString.length) {
      if (inputString[i] === "\n") {
        i = i + 1;
        lineNo = lineNo + 1;
        outputString = outputString + "\n";
        continue;
      }
      let end = inputString.indexOf("\n", i);
      if (end < 0) {
        end = inputString.length;
      }
      let line = inputString.substring(i, end);
      const inCodeBlock = !!lastOpeningCodeBlockFence;
      const currentCodeBlockFence = (line.match(/^[`]{3,}/) || [])[0];
      if (currentCodeBlockFence) {
        if (!inCodeBlock) {
          outputString += createAnchor(lineNo);
        }
        const containsCmd = !!line.match(/"?cmd"?\s*[:=\s}]/);
        if (!inCodeBlock && containsCmd) {
          // A code chunk: numbered among the note's code chunks.
          line = line.replace(
            "{",
            "{code_chunk_offset=" + codeChunkOffset + ", ",
          );
          codeChunkOffset++;
        }
        if (!inCodeBlock) {
          lastOpeningCodeBlockFence = currentCodeBlockFence;
        } else if (
          currentCodeBlockFence.length >=
          (lastOpeningCodeBlockFence as string).length
        ) {
          lastOpeningCodeBlockFence = null;
        }
        i = end + 1;
        lineNo = lineNo + 1;
        outputString = outputString + line + "\n";
        continue;
      }
      if (inCodeBlock) {
        i = end + 1;
        lineNo = lineNo + 1;
        outputString = outputString + line + "\n";
        continue;
      }
      let headingMatch: RegExpMatchArray | null;
      let taskListItemMatch: RegExpMatchArray | null;
      let htmlTagMatch: RegExpMatchArray | null;
      if (
        line.match(/^(!\[|@import)/) &&
        inputString[i - 1] === "\n" &&
        inputString[i - 2] === "\n"
      ) {
        // An image or an import after an empty line.
        outputString += createAnchor(lineNo);
      } else if ((headingMatch = line.match(/^(#{1,7})\s+.*/))) {
        outputString += createAnchor(lineNo);
        const tag = headingMatch[1];
        let heading = line.replace(tag, "");
        const optMatch = heading.match(/(\s+\{|^\{)(.+?)\}(\s*)$/);
        let classes: any = "";
        let id: any = "";
        if (optMatch) {
          heading = heading.replace(optMatch[0], "");
          try {
            const opt = parseAttributes(optMatch[0]);
            classes = opt["class"];
            id = opt["id"];
          } catch {
            heading = "OptionsError: " + optMatch[1];
          }
        }
        if (!id) {
          id = headingIdGenerator.generateId(heading);
        }
        line =
          tag +
          " " +
          heading +
          '\n<p class="mume-header ' +
          classes +
          '" id="' +
          id +
          '"></p>';
        i = end + 1;
        lineNo = lineNo + 1;
        outputString = outputString + line + "\n\n";
        continue;
      } else if (line.match(/^<!--/)) {
        outputString += createAnchor(lineNo);
        let commentEnd = inputString.indexOf("-->", i + 4);
        if (commentEnd < 0) {
          // Not closed: the rest of the note is left out.
          i = inputString.length;
          lineNo = lineNo + 1;
          outputString = outputString + "\n";
          continue;
        } else {
          commentEnd += 3;
        }
        const subjectMatch = line.match(/^<!--\s+([^\s]+)/);
        if (!subjectMatch) {
          const content = inputString.slice(i + 4, commentEnd - 3).trim();
          const newlines = (content.match(/\n/g) || []).length;
          i = commentEnd;
          lineNo = lineNo + newlines;
          outputString = outputString + "\n";
          continue;
        }
        const subject = subjectMatch[1];
        if (subject === "@import") {
          const commentEnd2 = line.lastIndexOf("-->");
          if (commentEnd2 > 0) {
            line = line.slice(4, commentEnd2).trim();
          }
        } else if (customSubjects.has(subject)) {
          const content = inputString.slice(i + 4, commentEnd - 3).trim();
          const newlines = (content.match(/\n/g) || []).length;
          const optionsMatch = content.match(/^([^\s]+?)\s([\s\S]+)$/);
          let options: Attributes = {};
          if (optionsMatch && optionsMatch[2]) {
            options = parseAttributes(optionsMatch[2]);
          }
          options["lineNo"] = lineNo;
          if (subject === "pagebreak" || subject === "newpage") {
            i = commentEnd;
            lineNo = lineNo + newlines;
            outputString =
              outputString +
              '<div class="pagebreak html2pdf__page-break"> </div>\n';
            continue;
          } else if (subject.match(/^\.?slide:?$/)) {
            slideConfigs.push(options as SlideConfig);
            i = commentEnd;
            lineNo = lineNo + newlines;
            outputString = outputString + "\n[MUMESLIDE]\n\n";
            continue;
          }
        } else {
          const content = inputString.slice(i + 4, commentEnd - 3).trim();
          const newlines = (content.match(/\n/g) || []).length;
          i = commentEnd;
          lineNo = lineNo + newlines;
          outputString = outputString + ("<!-- " + content + " -->\n");
          continue;
        }
      } else if (line.match(/^\s*\[toc\]\s*$/i)) {
        outputString += createAnchor(lineNo);
        i = end + 1;
        lineNo = lineNo + 1;
        outputString = outputString + "\n[MUMETOC]\n\n";
        continue;
      } else if (
        (taskListItemMatch = line.match(
          /^\s*(?:[*\-+]|\d+\.)\s+(\[[xX\s]\])\s/,
        ))
      ) {
        const checked = taskListItemMatch[1] !== "[ ]";
        line = line.replace(
          taskListItemMatch[1],
          `<input type="checkbox" class="task-list-item-checkbox sync-line" data-line="${lineNo}"` +
            (checked ? " checked" : "") +
            ">",
        );
        i = end + 1;
        lineNo = lineNo + 1;
        outputString = outputString + line + "\n";
        continue;
      } else if (
        (htmlTagMatch = line.match(
          /^\s*<(?:([a-zA-Z]+)|([a-zA-Z]+)\s+(?:.+?))>/,
        ))
      ) {
        // HTML that opens the line is kept as it is up to the tag that
        // closes it, empty lines and all.
        const tagName = htmlTagMatch[1] || htmlTagMatch[2];
        if (!(tagName in selfClosingTag)) {
          const closeTagName = "</" + tagName + ">";
          const end2 = inputString.indexOf(
            closeTagName,
            i + htmlTagMatch[0].length,
          );
          if (end2 >= 0) {
            const htmlString = inputString.slice(i, end2 + closeTagName.length);
            const newlines = (htmlString.match(/\n/g) || []).length;
            i = end2 + closeTagName.length;
            lineNo = lineNo + newlines;
            outputString = outputString + htmlString;
            continue;
          }
        }
      }
      i = end + 1;
      lineNo = lineNo + 1;
      outputString = outputString + line + "\n";
    }
    return { outputString, slideConfigs, frontMatterString };
  }

  const endFrontMatterOffset = inputString.startsWith("---")
    ? inputString.indexOf("\n---")
    : -1;
  if (endFrontMatterOffset > 0) {
    frontMatterString = inputString.slice(0, endFrontMatterOffset + 4);
    return helper(
      frontMatterString.length,
      (frontMatterString.match(/\n/g) as RegExpMatchArray).length,
    );
  }
  return helper(0, 0);
}
