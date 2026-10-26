import { md } from "@0xgg/echomd/preview";
import { Mutex } from "async-mutex";
import * as git from "isomorphic-git";
import type Token from "markdown-it/lib/token";
import path from "path-browserify";
// import { isFileAnImage } from "../utilities/image";
import { NOTE_SETTINGS, readNoteText, writeNoteText } from "./frontMatter";
import { fs, pfs } from "./fs";
import { Mentions, Note, NoteConfig, Notes } from "./note";
import { Reference, ReferenceMap } from "./reference";
import Search from "./search";

// A note's settings as its front matter keeps them, in the order a new one
// is written.
function noteSettings(noteConfig: NoteConfig): [string, unknown][] {
  const settings: [string, unknown][] = [];
  if (noteConfig.aliases && noteConfig.aliases.length) {
    settings.push(["aliases", noteConfig.aliases]);
  }
  for (const key of ["pinned", "favorited", "icon"] as const) {
    if (noteConfig[key] !== undefined && noteConfig[key] !== null) {
      settings.push([key, noteConfig[key]]);
    }
  }
  settings.push(["created", noteConfig.createdAt]);
  settings.push(["modified", noteConfig.modifiedAt]);
  return settings;
}

function dateOf(value: unknown): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whether two texts of a note say the same to the notebook: the same, but
 * for the settings it keeps in the front matter, wherever they are, and the
 * older form of them that saving turns into these. A note read back from its
 * file has them taken out, while the text an editor gave may have them
 * typed in; this tells that apart from a change.
 */
export function sameNoteText(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const keys = [...NOTE_SETTINGS, "note"];
  return readNoteText(a, keys).text === readNoteText(b, keys).text;
}

interface RefreshNotesArgs {
  dir: string;
  includeSubdirectories?: boolean;
  refreshRelations?: boolean;
}

export class Notebook {
  // basic info
  public _id: string;
  public dir: string;
  public name: string;

  // git
  public gitURL: string;
  public gitBranch: string;
  public gitCorsProxy?: string;
  public gitUsername?: string;
  public gitPassword?: string;
  public autoFetchPeriod: number; // in milliseconds
  public fetchedAt: Date;
  public remoteSha: string;
  public localSha: string;

  /**
   * @param key: file path
   */
  public notes: Notes;

  public isLocal: boolean;

  private refreshNotesIfNotLoadedMutex: Mutex;
  public hasLoadedNotes: boolean;

  public referenceMap: ReferenceMap;

  public search: Search;

  constructor() {
    this.notes = {};
    this.isLocal = false;
    this.hasLoadedNotes = false;
    this.referenceMap = new ReferenceMap();
    this.refreshNotesIfNotLoadedMutex = new Mutex();
  }

  public initSearch() {
    this.search = new Search();
  }

  public noteHasReferences(filePath: string): boolean {
    return this.referenceMap.noteHasReferences(filePath);
  }

  public async getReferredByNotes(filePath: string): Promise<Notes> {
    if (filePath in this.referenceMap.map) {
      const map = this.referenceMap.map[filePath];
      const notes: Notes = {};
      for (let rFilePath in map) {
        if (rFilePath === filePath) {
          // Don't include self
          continue;
        }
        const note = await this.getNote(rFilePath);
        if (note) {
          notes[rFilePath] = note;
        }
      }
      return notes;
    } else {
      return {};
    }
  }

  public getReferences(
    noteFilePath: string,
    referredByNoteFilePath: string,
  ): Reference[] {
    return this.referenceMap.getReferences(
      noteFilePath,
      referredByNoteFilePath,
    );
  }

  async processNoteMentionsAndMentionedBy(filePath: string) {
    const note = await this.getNote(filePath);
    if (!note) {
      return;
    }
    // Get mentions
    const tokens = md.parse(note.markdown, {});
    const resolveLink = (link: string) => {
      if (!link.endsWith(".md")) {
        link = link + ".md";
      }
      if (link.startsWith("/")) {
        return path.relative(this.dir, path.join(this.dir, "." + link));
      } else {
        return path.relative(
          this.dir,
          path.join(path.dirname(path.join(this.dir, note.filePath)), link),
        );
      }
    };
    const traverse = function (
      tokens: Token[],
      parentToken: Token,
      results: Reference[],
      level: number,
    ): Reference[] {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === "wikilink") {
          // TODO: Support normal links
          const arr = token.content.split("|");
          const text = (arr.length > 1 ? arr[1] : arr[0]).trim();
          let link = arr[0].trim();
          if (link.match(/https?:\/\//)) {
            // TODO: Ignore more protocols
            continue;
          }
          // console.log("find link token: ", token, parentToken);
          results.push({
            elementId: token.attrGet("id") || "",
            text,
            link: resolveLink(link),
            parentToken,
            token,
          });
        } else if (token.type === "tag") {
          const text = token.content.trim();
          const link = token.content.trim();
          // console.log("find link token: ", token, parentToken);
          results.push({
            elementId: token.attrGet("id") || "",
            text,
            link: resolveLink(link),
            parentToken,
            token,
          });
        } else if (
          token.type === "link_open" &&
          tokens[i + 1] &&
          tokens[i + 1].type === "text"
        ) {
          if (token.attrs.length && token.attrs[0][0] === "href") {
            const link = decodeURI(token.attrs[0][1]);
            const text = tokens[i + 1].content.trim();
            if (
              link.match(/https?:\/\//) ||
              !text.length ||
              !link.endsWith(".md")
            ) {
              // TODO: Ignore more protocols
              continue;
            }
            results.push({
              elementId: token.attrGet("id") || "",
              text,
              link: resolveLink(link),
              parentToken,
              token,
            });
          }
        } else if (token.children && token.children.length) {
          traverse(token.children, token, results, level + 1);
        }
      }
      return results;
    };

    const references = traverse(tokens, null, [], 0);
    const mentions: Mentions = {};
    const oldMentions = note.mentions;

    // Remove old references
    for (let filePath in oldMentions) {
      this.referenceMap.deleteReferences(filePath, note.filePath);
    }

    // Handle new references
    for (let i = 0; i < references.length; i++) {
      const { link } = references[i];
      mentions[link] = true;
      this.referenceMap.addReference(link, note.filePath, references[i]);
    }

    // Add self to reference map to declare the existence of the file itself
    this.referenceMap.addReference(note.filePath, note.filePath, null);

    // Update the mentions
    note.mentions = mentions;
  }

  public async changeNoteFilePath(
    oldFilePath: string,
    newFilePath: string,
  ): Promise<Note> {
    // Written plainly, relative to the notebook, which is the only form git
    // takes: notes//a.md or ./a.md would be moved and then fail.
    newFilePath = path.relative(
      this.dir,
      path.resolve(this.dir, newFilePath.replace(/^\/+/, "")),
    );
    if (!newFilePath.endsWith(".md")) {
      newFilePath = newFilePath + ".md";
    }
    if (newFilePath.startsWith("../")) {
      throw new Error("error/target-file-outside-notebook");
    }

    // Checked before anything changes: a rename that cannot happen has to
    // leave the note listed, searchable and linked.
    const exists = await pfs.exists(path.resolve(this.dir, newFilePath));
    if (exists) {
      throw new Error("error/target-file-already-exists");
    }

    // The file moves first, for the same reason: a folder on the user's disk
    // can still refuse a name it does not allow.
    const newDirPath = path.dirname(path.resolve(this.dir, newFilePath));
    await pfs.mkdirp(newDirPath);
    await pfs.rename(
      path.resolve(this.dir, oldFilePath),
      path.resolve(this.dir, newFilePath),
    );

    await this.removeNoteRelations(oldFilePath);
    this.search.remove(oldFilePath);

    if (!this.isLocal) {
      await git.remove({
        fs: fs,
        dir: this.dir,
        filepath: oldFilePath,
      });
      await git.add({
        fs: fs,
        dir: this.dir,
        filepath: newFilePath,
      });
    }
    await pfs.storeTree(this.dir);

    return await this.getNote(newFilePath, true);
  }

  public async checkoutNote(note: Note): Promise<Note> {
    try {
      await git.checkout({
        fs: fs,
        dir: this.dir,
        // ref: "HEAD"
        // ref: note.notebook.gitBranch,
        filepaths: [note.filePath],
        force: true,
      });
      if (await pfs.exists(path.resolve(this.dir, note.filePath))) {
        await git.add({
          // .remove is wrong
          fs: fs,
          dir: this.dir,
          filepath: note.filePath,
        });
      }
      await pfs.storeTree(this.dir);
      return await this.getNote(note.filePath, true);
    } catch (error) {
      return null;
    }
  }

  public async getNote(
    filePath: string,
    refreshNoteRelations = false,
  ): Promise<Note> {
    if (!refreshNoteRelations && filePath in this.notes) {
      return this.notes[filePath];
    }
    const absFilePath = path.resolve(this.dir, filePath);
    let stats;
    try {
      stats = await pfs.stats(absFilePath);
    } catch (error) {
      return null;
    }
    if (stats.isFile() && filePath.endsWith(".md")) {
      const file = (await pfs.readFile(absFilePath, {
        encoding: "utf8",
      })) as string;
      const { text: markdown, settings } = readNoteText(file);

      // The file's times stand in for the settings it does not have.
      const noteConfig: NoteConfig = {
        createdAt: dateOf(settings.created) || new Date(stats.ctimeMs),
        modifiedAt: dateOf(settings.modified) || new Date(stats.mtimeMs),
        aliases: [],
      };
      for (const key of ["pinned", "favorited"] as const) {
        if (settings[key] !== undefined && settings[key] !== null) {
          noteConfig[key] = settings[key] as boolean;
        }
      }
      if (settings.icon !== undefined && settings.icon !== null) {
        noteConfig.icon = settings.icon as string;
      }
      if (typeof settings.aliases === "string") {
        noteConfig.aliases = settings.aliases.split(",").map((x) => x.trim());
      } else if (Array.isArray(settings.aliases)) {
        noteConfig.aliases = settings.aliases;
      }

      let oldMentions = {};
      const oldNote = this.notes[filePath];
      if (oldNote) {
        oldMentions = oldNote.mentions;
      }

      // Create note
      const note: Note = {
        notebookPath: this.dir,
        filePath: path.relative(this.dir, absFilePath),
        title: path.basename(absFilePath).replace(/\.md$/, ""),
        markdown,
        config: noteConfig,
        mentions: oldMentions,
      };

      if (refreshNoteRelations) {
        this.notes[note.filePath] = note;
        this.search.add(note.filePath, note.title, note.config.aliases);
        await this.processNoteMentionsAndMentionedBy(note.filePath);
      }

      return note;
    } else {
      return null;
    }
  }

  public async refreshNotesIfNotLoaded({
    dir = "./",
    includeSubdirectories = false,
  }: RefreshNotesArgs): Promise<Notes> {
    await this.refreshNotesIfNotLoadedMutex.runExclusive(async () => {
      if (!this.hasLoadedNotes) {
        await this.refreshNotes({
          dir,
          includeSubdirectories,
          refreshRelations: true,
        });
        this.hasLoadedNotes = true;
      }
    });
    return this.notes;
  }

  public async refreshNotes({
    dir = "./",
    includeSubdirectories = false,
    refreshRelations = true,
  }: RefreshNotesArgs): Promise<Notes> {
    if (refreshRelations) {
      this.notes = {};
      this.referenceMap = new ReferenceMap();
      this.initSearch();
    }
    let files: string[] = [];
    try {
      files = await pfs.readdir(path.resolve(this.dir, dir));
    } catch (error) {
      console.error(error);
      files = [];
    }
    const refreshNotesPromises = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // ignore several directories
      if (file.match(/^(node_modules|\.git)$/)) {
        continue;
      }

      const absFilePath = path.resolve(this.dir, dir, file);
      const note = await this.getNote(path.relative(this.dir, absFilePath));
      if (note) {
        this.notes[note.filePath] = note;
        this.search.add(note.filePath, note.title, note.config.aliases);
      }

      let stats;
      try {
        stats = await pfs.stats(absFilePath);
      } catch (error) {
        console.error(error);
      }
      if (stats && stats.isDirectory() && includeSubdirectories) {
        refreshNotesPromises.push(
          this.refreshNotes({
            dir: path.relative(this.dir, absFilePath),
            includeSubdirectories,
            refreshRelations: false,
          }),
        );
      }
    }
    await Promise.all(refreshNotesPromises);

    if (refreshRelations) {
      for (let filePath in this.notes) {
        await this.processNoteMentionsAndMentionedBy(filePath);
      }
    }

    return this.notes;
  }

  public async writeNote(
    filePath: string,
    markdown: string,
    noteConfig: NoteConfig,
  ): Promise<Note> {
    noteConfig.modifiedAt = new Date();
    const absFilePath = path.resolve(this.dir, filePath);
    // Settings that have not changed are written as the file had them.
    let previous: string = null;
    try {
      previous = (await pfs.readFile(absFilePath, {
        encoding: "utf8",
      })) as string;
    } catch (error) {
      // A new note.
    }

    await pfs.writeFile(
      absFilePath,
      writeNoteText(markdown, noteSettings(noteConfig), previous),
    );
    if (!this.isLocal) {
      // Stages the note, which writes its text as a new object file.
      await git.add({
        fs: fs,
        dir: this.dir,
        filepath: filePath,
      });
    }
    await pfs.storeTree(this.dir);

    const note = await this.getNote(filePath, true);
    note.markdown = markdown;
    return note;
  }

  public async removeNoteRelations(filePath: string) {
    const note = await this.getNote(filePath);
    if (!note) {
      return;
    }
    const mentions = note.mentions;
    for (let filePath in mentions) {
      this.referenceMap.deleteReferences(filePath, note.filePath);
    }
    delete this.notes[note.filePath];
  }

  public async deleteNote(filePath: string) {
    if (await pfs.exists(path.resolve(this.dir, filePath))) {
      await pfs.unlink(path.resolve(this.dir, filePath));
      if (!this.isLocal) {
        await git.remove({
          fs: fs,
          dir: this.dir,
          filepath: filePath,
        });
      }
      await pfs.storeTree(this.dir);
      await this.removeNoteRelations(filePath);
      this.search.remove(filePath);
    }
  }

  public async duplicateNote(filePath: string) {
    const oldNote = await this.getNote(filePath);
    if (!oldNote) return;
    const noteConfig = oldNote.config;
    noteConfig.createdAt = new Date();
    noteConfig.modifiedAt = new Date();
    const newFilePath = filePath.replace(/\.md$/, ".copy.md");
    await this.writeNote(newFilePath, oldNote.markdown, noteConfig);
    return await this.getNote(newFilePath, true);
  }
}

export interface NotebookConfig {
  repository: string;
  branch: string;
  author: string;
  contributors: string[];
}
