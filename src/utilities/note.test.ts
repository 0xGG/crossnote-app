import { describe, expect, it } from "vitest";
import { generateSummaryFromMarkdown } from "./note";

describe("generateSummaryFromMarkdown", () => {
  it("leaves out the front matter the notebook reads, after a byte order mark too", async () => {
    const { summary } = await generateSummaryFromMarkdown(
      "﻿---\ntitle: T\n---\nBody\n",
    );
    expect(summary).toBe("Body");
  });

  it("keeps what the notebook does not read as front matter", async () => {
    const { summary } = await generateSummaryFromMarkdown(
      "---\nIntro paragraph\n---\nBody\n",
    );
    expect(summary).toContain("Intro paragraph");
  });
});
