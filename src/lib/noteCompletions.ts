import path from "path-browserify";
import type { Note } from "./note";
import type { Notebook } from "./notebook";

// What a notebook offers the editor of one of its notes as "#" or "[[" is
// typed, from the notebook's search.

// A note's path as a link in another note writes it: from that note's folder.
function pathFrom(note: Note, filePath: string) {
  return path.relative(
    path.dirname(path.join(note.notebookPath, note.filePath)),
    path.join(note.notebookPath, filePath),
  );
}

/**
 * The tags for what is typed after "#": root notes whose titles the search
 * finds, each as the tag that names it, with
 * a closing "#" where the title has a space.
 */
export function tagCompletions(
  notebook: Notebook,
  _note: Note,
  typed: string,
): string[] {
  return notebook.search
    .search(typed, {
      fuzzy: true,
      // The start of a word is enough: the list is for what is being typed.
      prefix: true,
      filter: (result) => `${result["title"]}.md` === result["filePath"],
      fields: ["title"],
    })
    .map(({ title }) => `#${title}${/\s/.test(title as string) ? "#" : ""}`);
}

/**
 * The wiki links for what is typed after "[[": for each note the search
 * finds, by its title and by each alias that has every word searched for,
 * "[[name]]" where the note is beside the one being edited under that name,
 * and "[[path|name]]" otherwise.
 */
export function wikiLinkCompletions(
  notebook: Notebook,
  note: Note,
  typed: string,
): string[] {
  const links: string[] = [];
  for (const result of notebook.search.search(typed, {
    fuzzy: true,
    prefix: true,
    fields: ["title", "aliases", "filePath"],
  })) {
    const filePath = pathFrom(note, result.filePath as string);
    const names = (result.aliases as string)
      .split("|")
      .concat(result.title as string);
    for (const name of names) {
      const lower = name.toLocaleLowerCase();
      // The words of the note that what was typed matched: a word typed in
      // part matches the whole word, which the name has to hold.
      if (result.terms.every((term) => lower.includes(term))) {
        const target = `${name}.md` === filePath ? name : filePath;
        // The consumer decodes percent escapes; encode literal percent
        // signs so a filename such as Plan%20A keeps that spelling.
        const encoded = target.replace(/%/g, "%25");
        links.push(encoded === name ? `[[${name}]]` : `[[${encoded}|${name}]]`);
      }
    }
  }
  return links;
}
