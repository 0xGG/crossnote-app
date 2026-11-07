import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./index";

describe("front matter", () => {
  it("draws nothing, line endings of any kind", () => {
    for (const text of [
      "---\ntitle: x\n---\nbody\n",
      "﻿---\ntitle: x\n---\nbody\n",
      "---\r\ntitle: x\r\n---\r\nbody\r\n",
      "---\rtitle: x\r---\rbody\r",
    ]) {
      const { html } = renderMarkdown(text);
      expect(html).not.toContain("title");
      expect(html).toContain("body");
    }
  });

  it("is drawn as text when YAML cannot read it as a mapping", () => {
    expect(renderMarkdown("---\nIntro\n---\nbody\n").html).toContain("Intro");
  });
});
