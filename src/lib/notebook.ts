import { Mutex } from "async-mutex";
import * as git from "isomorphic-git";
import path from "path-browserify";
// import { isFileAnImage } from "../utilities/image";
import { findLinks } from "../render/links";
import { decodeLinkPath, leadsToNote } from "../render/markdown/linkTargets";
import { NOTE_SETTINGS, readNoteText, writeNoteText } from "./frontMatter";
import { fs, missingFileOrThrow, pfs } from "./fs";
import { checkedGitPath, stageLocalFile } from "./gitFiles";
import { inspectWorkingPath } from "./gitLinks";
import { mergeableText } from "./mergeFiles";
import { restoreTree } from "./gitRestore";
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
  for (const key of ["pinned", "favorited"] as const) {
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
  requireDirectory?: boolean;
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
  public gitNeedsLogin?: boolean;
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
      for (const rFilePath in map) {
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
    // A link counts where the preview opens a note for it (leadsToNote),
    // and a markdown link only when it names a .md file and has words. Its
    // path is read as the preview reads it, percent-encoded or not.
    const references: Reference[] = [];
    for (const found of findLinks(note.markdown)) {
      if (found.kind !== "tag" && !leadsToNote(found.kind, found.target)) {
        continue;
      }
      const link =
        found.kind === "tag" ? found.target : decodeLinkPath(found.target);
      if (
        found.kind === "link" &&
        (!found.text.length || !link.endsWith(".md"))
      ) {
        continue;
      }
      references.push({
        elementId: found.elementId,
        text: found.text,
        // A tag is a topic of the notebook's, its note at the notebook's
        // top, as the preview opens it.
        link: resolveLink(found.kind === "tag" ? "/" + link : link),
        lines: found.lines,
        context: found.context,
      });
    }
    const mentions: Mentions = {};
    const oldMentions = note.mentions;

    // Remove old references
    for (const filePath in oldMentions) {
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
    onMoved?: () => void,
    isPathInUse?: (filePath: string) => boolean,
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
    if (exists || isPathInUse?.(newFilePath)) {
      throw new Error("error/target-file-already-exists");
    }

    // The file moves first, for the same reason: a folder on the user's disk
    // can still refuse a name it does not allow.
    await pfs.rename(
      path.resolve(this.dir, oldFilePath),
      path.resolve(this.dir, newFilePath),
    );
    onMoved?.();

    await this.removeNoteRelations(oldFilePath);
    this.search.remove(oldFilePath);

    if (!this.isLocal) {
      await git.remove({
        fs: fs,
        dir: this.dir,
        filepath: oldFilePath,
      });
      await stageLocalFile(this.dir, newFilePath);
    }
    await pfs.storeTree(this.dir);

    return await this.getNote(newFilePath, true);
  }

  public async checkoutNote(note: Note): Promise<void> {
    let sha: string;
    try {
      sha = await git.resolveRef({ fs, dir: this.dir, ref: "HEAD" });
    } catch (error) {
      if (error instanceof git.Errors.NotFoundError)
        throw new Error("error/no-committed-note", { cause: error });
      throw error;
    }
    await restoreTree(this.dir, sha, { onlyFile: note.filePath });
  }

  public async getNote(
    filePath: string,
    refreshNoteRelations = false,
    readFromDisk = false,
  ): Promise<Note> {
    if (!refreshNoteRelations && !readFromDisk && filePath in this.notes) {
      return this.notes[filePath];
    }
    const absFilePath = path.resolve(this.dir, filePath);
    const stats = await pfs.stats(absFilePath).catch(missingFileOrThrow);
    if (stats?.isFile() && filePath.endsWith(".md")) {
      let file;
      try {
        file = await pfs.readFile(absFilePath, { encoding: "utf8" });
      } catch (error) {
        return missingFileOrThrow(error);
      }
      // A file the browser file system lists without its content, as an
      // earlier refused write could leave, reads as empty rather than stop
      // every note of the notebook from loading.
      const { text: markdown, settings } = readNoteText(
        typeof file === "string" ? file : "",
      );

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
        lineBreak:
          typeof file === "string"
            ? (/\r\n?|\n/.exec(file)?.[0] ?? "\n")
            : "\n",
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
    requireDirectory = false,
  }: RefreshNotesArgs): Promise<Notes> {
    let files: string[];
    try {
      files = await pfs.readdir(path.resolve(this.dir, dir));
    } catch (error) {
      if (requireDirectory) throw error;
      console.error(error);
      files = [];
    }
    if (refreshRelations) {
      this.notes = {};
      this.referenceMap = new ReferenceMap();
      this.initSearch();
    }
    const refreshNotesPromises = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // ignore several directories
      if (file.match(/^(node_modules|\.git)$/)) {
        continue;
      }

      const absFilePath = path.resolve(this.dir, dir, file);
      // A save can repopulate the cache while this directory scan awaits I/O.
      // Refresh must still read external changes, without rebuilding relations
      // until the complete set of notes has been collected below.
      let stats;
      try {
        if (file.endsWith(".md")) {
          const note = await this.getNote(
            path.relative(this.dir, absFilePath),
            false,
            true,
          );
          if (note) {
            this.notes[note.filePath] = note;
            this.search.add(note.filePath, note.title, note.config.aliases);
            continue;
          }
        }
        if (includeSubdirectories) stats = await pfs.stats(absFilePath);
      } catch (error) {
        console.error(error);
      }
      if (stats?.isDirectory()) {
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
      for (const filePath in this.notes) {
        // A note whose references cannot be read leaves the rest of the
        // notebook's in place, and the notes listed.
        try {
          await this.processNoteMentionsAndMentionedBy(filePath);
        } catch (error) {
          console.error(error);
        }
      }
    }

    return this.notes;
  }

  public async readConflictSource(filePath: string): Promise<string> {
    const target = checkedGitPath(this.dir, filePath);
    if (!pfs.isPathOfLocalFileSystem(target)) {
      const entry = await inspectWorkingPath(this.dir, filePath);
      if (entry.name !== target || !entry.stats?.isFile())
        throw new Error("error/note-comparison-unavailable");
    }
    const bytes = (await pfs.readFile(target)) as Uint8Array | undefined;
    const text = mergeableText(filePath, bytes ?? null);
    if (text === null) throw new Error("error/note-comparison-unavailable");
    return text;
  }

  public async writeNote(
    filePath: string,
    markdown: string,
    noteConfig: NoteConfig,
    comparedSource?: string,
  ): Promise<Note> {
    const absFilePath = path.resolve(this.dir, filePath);
    // Settings that have not changed are written as the file had them.
    const previous =
      comparedSource !== undefined
        ? await this.readConflictSource(filePath)
        : ((await pfs
            .readFile(absFilePath, {
              encoding: "utf8",
            })
            .catch(missingFileOrThrow)) as string | null);
    if (comparedSource !== undefined && comparedSource !== previous)
      throw new Error("error/note-comparison-changed");

    await pfs.writeFile(
      absFilePath,
      writeNoteText(
        markdown,
        noteSettings({ ...noteConfig, modifiedAt: new Date() }),
        previous,
      ),
    );
    await this.storeNote(filePath);

    const note = await this.getNote(filePath, true);
    note.markdown = markdown;
    return note;
  }

  // An explicit save can retry after the content write succeeded but staging
  // or tree persistence failed. Equal on-disk text does not prove durability.
  public async storeNote(filePath: string): Promise<void> {
    if (!this.isLocal) {
      // Stages the note, which writes its text as a new object file.
      await stageLocalFile(this.dir, filePath);
    }
    await pfs.storeTree(this.dir);
  }

  public async removeNoteRelations(filePath: string) {
    const note = await this.getNote(filePath);
    if (!note) {
      return;
    }
    const mentions = note.mentions;
    for (const filePath in mentions) {
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
}

export interface NotebookConfig {
  repository: string;
  branch: string;
  author: string;
  contributors: string[];
}
