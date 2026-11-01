/**
 * Where one note mentions another: a wiki link, a tag or a link to a .md
 * file. The app's own record, kept apart from the parser's tokens, as it is
 * also kept in the saved layout of a tab opened at it.
 */
export interface Reference {
  /**
   * The id of the referenced element
   */
  elementId: string;
  text: string;
  link: string;
  /** The lines of the block the reference is in, 0-based, end excluded. */
  lines: [number, number];
  /** The text of that block. */
  context: string;
}

/**
 * A reference read back from somewhere it was kept, such as a saved layout:
 * one in the shape above, one kept before it (with markdown-it's tokens), or
 * nothing if it is neither.
 */
export function toReference(value: unknown): Reference | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const { elementId, text, link, lines, context, parentToken } = value as any;
  if (
    typeof elementId !== "string" ||
    typeof text !== "string" ||
    typeof link !== "string"
  ) {
    return undefined;
  }
  const isLines = (lines: unknown): lines is [number, number] =>
    Array.isArray(lines) &&
    lines.length === 2 &&
    lines.every((line) => Number.isInteger(line) && line >= 0);
  if (isLines(lines) && typeof context === "string") {
    return { elementId, text, link, lines: [lines[0], lines[1]], context };
  }
  if (parentToken && isLines(parentToken.map)) {
    return {
      elementId,
      text,
      link,
      lines: [parentToken.map[0], parentToken.map[1]],
      context:
        typeof parentToken.content === "string" ? parentToken.content : "",
    };
  }
  return undefined;
}

export class ReferenceMap {
  public map: { [key: string]: { [key: string]: Reference[] } };
  constructor() {
    this.map = {};
  }

  public addReference(
    noteFilePath: string,
    referredByNoteFilePath: string,
    reference?: Reference,
  ) {
    if (noteFilePath === referredByNoteFilePath && !reference) {
      if (!(noteFilePath in this.map)) {
        this.map[noteFilePath] = {
          [referredByNoteFilePath]: [],
        };
      }
      return;
    }
    if (!reference) {
      return;
    }
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

  public deleteReferences(
    noteFilePath: string,
    referredByNoteFilePath: string,
  ) {
    if (noteFilePath === referredByNoteFilePath) {
      delete this.map[noteFilePath];
      return;
    }
    if (noteFilePath in this.map) {
      if (referredByNoteFilePath in this.map[noteFilePath]) {
        delete this.map[noteFilePath][referredByNoteFilePath];
        if (Object.keys(this.map[noteFilePath]).length === 0) {
          delete this.map[noteFilePath];
        }
      }
    }
  }

  public hasRelation(filePath1: string, filePath2: string) {
    return (
      (filePath1 in this.map && filePath2 in this.map[filePath1]) ||
      (filePath2 in this.map && filePath1 in this.map[filePath2]) ||
      filePath1 === filePath2
    );
  }

  public getReferences(
    noteFilePath: string,
    referredByNoteFilePath: string,
  ): Reference[] {
    if (noteFilePath in this.map) {
      if (referredByNoteFilePath in this.map[noteFilePath]) {
        return this.map[noteFilePath][referredByNoteFilePath];
      }
    }
    return [];
  }

  public noteHasReferences(filePath: string): boolean {
    return filePath in this.map;
  }

  public getReferredByNotesCount(noteFilePath: string): number {
    if (noteFilePath in this.map) {
      let length = Object.keys(this.map[noteFilePath]).length;
      if (noteFilePath in this.map[noteFilePath]) {
        length -= 1;
      }
      return length;
    } else {
      return 0;
    }
  }
}
