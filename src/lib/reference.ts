import Token from "markdown-it/lib/token";

export interface Reference {
  parentToken: Token;
  token: Token;
  text: string;
  link: string;
}

export class ReferenceMap {
  public map: { [key: string]: { [key: string]: Reference[] } };
  constructor() {
    this.map = {};
  }

  addReference(
    noteFilePath: string,
    referredByNoteFilePath: string,
    reference: Reference,
  ) {
    if (noteFilePath in this.map) {
      const mentionedBys = this.map[noteFilePath];
      if (referredByNoteFilePath in mentionedBys) {
        mentionedBys[referredByNoteFilePath].push(reference);
      } else {
        mentionedBys[referredByNoteFilePath] = [reference];
      }
    } else {
      this.map[noteFilePath] = {
        [referredByNoteFilePath]: [reference],
      };
    }
  }

  hasRelation(filePath1: string, filePath2: string) {
    return (
      (filePath1 in this.map && filePath2 in this.map[filePath1]) ||
      (filePath2 in this.map && filePath1 in this.map[filePath2]) ||
      filePath1 === filePath2
    );
  }
}
