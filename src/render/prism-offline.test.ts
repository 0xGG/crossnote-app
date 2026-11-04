import { expect, it, vi } from "vitest";
import { prismWith } from "./prism";

// A file of its own: what Prism has loaded stays for the rest of the file.
// markup-templating, which PHP builds on, cannot be loaded, as when the
// network goes while the page is open.
vi.mock(
  "/node_modules/prismjs/components/prism-markup-templating.min.js",
  () => {
    throw new Error("offline");
  },
);

it("loads no language after one it builds on could not be loaded, and the others still highlight", async () => {
  expect(await prismWith("php")).toBeUndefined();
  // PHP's file, run without markup-templating, would add to Prism what
  // fails for every language.
  const prism = await prismWith("python");
  expect(
    prism.highlight("def f(): pass", prism.languages.python, "python"),
  ).toContain('<span class="token keyword">def</span>');
});
