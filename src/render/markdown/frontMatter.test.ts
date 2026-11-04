import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./index";

describe("front matter", () => {
  it("gives the mapping it holds, as markdown-it found it, line endings of any kind", () => {
    for (const text of [
      "---\ntitle: x\n---\nbody\n",
      "﻿---\ntitle: x\n---\nbody\n",
      "---\r\ntitle: x\r\n---\r\nbody\r\n",
      "---\rtitle: x\r---\rbody\r",
    ]) {
      const { html, yamlConfig } = renderMarkdown(text);
      expect(yamlConfig).toEqual({ title: "x" });
      expect(html).not.toContain("title");
    }
  });

  it("gives none when there is none", () => {
    expect(renderMarkdown("---\nIntro\n---\nbody\n").yamlConfig).toEqual({});
  });
});
