/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { noteLanguage } from "./language";
import { headingText, outline } from "./outline";
import { stateOf } from "./testText";

const of = (text: string) => outline(stateOf(`${text}¦`, noteLanguage));

describe("outline", () => {
  it("uses heading nodes inside indentation and quotes, retaining physical lines", () => {
    expect(of("  ## Section\n\n> ### Quoted\n")).toEqual([
      { line: 0, level: 2, text: "Section" },
      { line: 2, level: 3, text: "Quoted" },
    ]);
  });
  it("lists the headings written with number signs, by line and level", () => {
    expect(of("# One\n\ntext\n\n## Two\n\n###### Six\n")).toEqual([
      { line: 0, level: 1, text: "One" },
      { line: 4, level: 2, text: "Two" },
      { line: 6, level: 6, text: "Six" },
    ]);
  });

  it("leaves out what looks like a heading in a code block", () => {
    expect(
      of(
        "# Real\n\n```md\n# Example inside fenced code\n```\n\n    # indented\n",
      ),
    ).toEqual([{ line: 0, level: 1, text: "Real" }]);
  });

  it("leaves out an underlined heading, a tag and number signs without text", () => {
    expect(of("Title\n===\n\n#tag\n\n#\n\n## Kept\n")).toEqual([
      { line: 7, level: 2, text: "Kept" },
    ]);
  });

  it("counts lines under front matter as the note's lines", () => {
    expect(of("---\ntitle: T\n---\n\n# Heading\n")).toEqual([
      { line: 4, level: 1, text: "Heading" },
    ]);
  });

  it("drops the number signs that close a heading", () => {
    expect(of("## Closed ##\n")).toEqual([
      { line: 0, level: 2, text: "Closed" },
    ]);
  });

  it("lists nothing for a note without headings", () => {
    expect(of("Just text.\n")).toEqual([]);
  });
});

describe("headingText", () => {
  it.each(["![", "["])("finishes an unclosed %s label", async (prefix) => {
    const text = prefix + "a".repeat(40);
    // Execute the actual function in a worker: a blocking expression must
    // fail this assertion without freezing the whole test process.
    const worker = new Worker(
      `
      const { parentPort, workerData } = require("node:worker_threads");
      const format = (${headingText.toString()});
      parentPort.postMessage(format(workerData));
    `,
      { eval: true, workerData: text },
    );
    let timer: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        new Promise<string>((resolve, reject) => {
          worker.once("message", resolve);
          worker.once("error", reject);
        }),
        new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve("did not finish"), 2000);
        }),
      ]);
      expect(result).toBe(text);
    } finally {
      clearTimeout(timer!);
      await worker.terminate();
    }
  });
  it("keeps what emphasis, code and links say, without their marks", () => {
    expect(headingText("**Bold** *em* ~~gone~~ `code`")).toBe(
      "Bold em gone code",
    );
    expect(headingText("[text](https://example.org) and [[README]]")).toBe(
      "text and README",
    );
  });

  it("leaves out images, footnote references and the backslash of an escape", () => {
    expect(headingText("A ![alt](a.png) picture[^1] \# sign")).toBe(
      "A  picture # sign",
    );
  });

  it("writes an emoji for its short name, and leaves other colons", () => {
    expect(headingText("Happy :smile: at 10:30: fine")).toBe(
      "Happy 😄 at 10:30: fine",
    );
  });
});
