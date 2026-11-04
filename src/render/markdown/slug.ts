// The slug a heading's id, and the ids of links and tags, are made from:
// runs of spaces and punctuation become one "-".
export function uslug(text: string, separator = "-"): string {
  return text.replace(
    /[.\s!@#$%^&*()\-=_+~`[\]{}\\<>?/|（）【】:：，。]+/g,
    separator,
  );
}

// Ids for a note's headings, each once: the second heading with the same
// slug gets "-1", the third "-2".
export class HeadingIdGenerator {
  private table: { [slug: string]: number } = {};

  generateId(heading: string): string {
    heading = heading.trim().replace(/。/g, "");
    let slug = uslug(heading);
    if (this.table[slug] >= 0) {
      this.table[slug] = this.table[slug] + 1;
      slug += "-" + this.table[slug];
    } else {
      this.table[slug] = 0;
    }
    return slug;
  }

  /** Counts an id given by hand as taken, for the ones made later. */
  reserve(id: string) {
    if (!(this.table[id] >= 0)) {
      this.table[id] = 0;
    }
  }
}
