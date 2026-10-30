import { renderMarkdown } from "@0xgg/echomd/preview";
import * as git from "isomorphic-git";
import { beforeAll, describe, expect, it } from "vitest";
// The preview's markdown turns :short names: into emoji once this has run,
// as the app has it.
import "../../editor/emoji";
import { fs, pfs } from "../../lib/fs";
import { Notebook } from "../../lib/notebook";
import {
  frontMatterSamples,
  unreadableFrontMatterSamples,
} from "./frontMatter";
import { syntaxSamples } from "./syntax";

// What each note of the corpus renders to, and the references the notebook
// finds in it, kept in files beside this one (rendering/). A change to
// either fails here until the files are written again (vitest -u) and the
// difference has been looked over; the renderer and the parser that replace
// echomd's are held up against them the same way. Only the HTML the
// markdown stage gives is kept: what scripts on the page draw into it
// afterwards (diagrams, block math, twemoji's images) is not.
const samples = [
  ...syntaxSamples,
  ...Object.entries(frontMatterSamples).map(([name, text]) => ({
    name: `front matter, ${name}`,
    text,
  })),
  ...unreadableFrontMatterSamples.map(([name, text]) => ({
    name: `front matter YAML cannot read, ${name}`,
    text,
  })),
];

const fileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

describe("the shared corpus", () => {
  let notebook: Notebook;

  beforeAll(async () => {
    await pfs.mkdirp("/notebooks/corpus");
    await git.init({ fs, dir: "/notebooks/corpus" });
    notebook = new Notebook();
    notebook._id = "corpus";
    notebook.dir = "/notebooks/corpus";
    notebook.name = "Corpus";
    notebook.initSearch();
  });

  it("names each sample once", () => {
    const names = samples.map(({ name }) => fileName(name));
    expect(new Set(names).size).toBe(names.length);
  });

  samples.forEach(({ name, text }) => {
    it(`renders ${name} as before`, async () => {
      await expect(renderMarkdown(text).html).toMatchFileSnapshot(
        `./rendering/${fileName(name)}.html`,
      );
    });

    it(`finds the same references in ${name}`, async () => {
      const filePath = `${fileName(name)}.md`;
      await pfs.writeFile(`/notebooks/corpus/${filePath}`, text);
      // Read as the notebook reads a note it lists: with what it mentions.
      const note = await notebook.getNote(filePath, true);
      const references = Object.keys(note.mentions).flatMap((mentioned) =>
        notebook
          .getReferences(mentioned, filePath)
          .map(({ elementId, text, link }) => ({ elementId, text, link })),
      );
      await expect(
        `${JSON.stringify(references, null, 2)}\n`,
      ).toMatchFileSnapshot(`./rendering/${fileName(name)}.references.json`);
    });
  });
});
