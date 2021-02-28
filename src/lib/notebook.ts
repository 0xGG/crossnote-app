import { md } from "@0xgg/echomd/preview";
import * as git from "isomorphic-git";
import Token from "markdown-it/lib/token";
import * as path from "path";
// import { isFileAnImage } from "../utilities/image";
import { matter, matterStringify } from "../utilities/markdown";
import { fs, pfs } from "./fs";
import { Mentions, Note, NoteConfig, Notes } from "./note";
import { Reference, ReferenceMap } from "./reference";
import Search from "./search";

/**
 * Change "createdAt" to "created", and "modifiedAt" to "modified"
 * @param noteConfig
 */
function formatNoteConfig(noteConfig: NoteConfig) {
  const newObject: any = Object.assign({}, noteConfig);

  newObject["created"] = noteConfig.createdAt;
  delete newObject["createdAt"];

  newObject["modified"] = noteConfig.modifiedAt;
  delete newObject["modifiedAt"];

  return newObject;
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

  private loadedNotes: boolean;

  public referenceMap: ReferenceMap;

  public search: Search;

  constructor() {
    this.notes = {};
    this.isLocal = false;
    this.loadedNotes = false;
    this.referenceMap = new ReferenceMap();
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
            elementId: token.meta,
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
            elementId: token.meta,
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
              elementId: token.attrGet("id") || "", // token.meta, // TODO: This is not working yet
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
    newFilePath = newFilePath.replace(/^\/+/, "");
    if (!newFilePath.endsWith(".md")) {
      newFilePath = newFilePath + ".md";
    }

    await this.removeNoteRelations(oldFilePath);
    this.search.remove(oldFilePath);

    // git related works
    const newDirPath = path.dirname(path.resolve(this.dir, newFilePath));
    await pfs.mkdirp(newDirPath);

    // TODO: Check if newFilePath already exists. If so don't overwrite
    const exists = await pfs.exists(path.resolve(this.dir, newFilePath));
    if (exists) {
      throw new Error("error/target-file-already-exists");
    }

    await pfs.rename(
      path.resolve(this.dir, oldFilePath),
      path.resolve(this.dir, newFilePath),
    );
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
      let markdown = (await pfs.readFile(absFilePath, {
        encoding: "utf8",
      })) as string;

      // Read the noteConfig, which is like <!-- note {...} --> at the end of the markdown file
      let noteConfig: NoteConfig = {
        createdAt: new Date(stats.ctimeMs),
        modifiedAt: new Date(stats.mtimeMs),
        aliases: [],
      };

      try {
        const data = matter(markdown);
        const frontMatter: any = Object.assign({}, data.data);

        // New note config design in beta 3
        if (data.data["created"]) {
          noteConfig.createdAt = new Date(data.data["created"]);
          delete frontMatter["created"];
        }
        if (data.data["modified"]) {
          noteConfig.modifiedAt = new Date(data.data["modified"]);
          delete frontMatter["modified"];
        }
        if (data.data["pinned"]) {
          noteConfig.pinned = data.data["pinned"];
          delete frontMatter["pinned"];
        }
        if (data.data["favorited"]) {
          noteConfig.favorited = data.data["favorited"];
          delete frontMatter["favorited"];
        }
        if (data.data["aliases"]) {
          noteConfig.aliases = data.data["aliases"];
          delete frontMatter["aliases"];
        }

        // markdown = matter.stringify(data.content, frontMatter); // <= NOTE: I think gray-matter has bug. Although I delete "note" section from front-matter, it still includes it.
        markdown = matterStringify(data.content, frontMatter);
      } catch (error) {
        // Do nothing
        markdown =
          "Please fix front-matter. (👈 Don't forget to delete this line)\n\n" +
          markdown;
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
    if (!this.loadedNotes) {
      await this.refreshNotes({
        dir,
        includeSubdirectories,
        refreshRelations: true,
      });
      this.loadedNotes = true;
    }
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
      } catch (error) {}
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
    const oMarkdown = markdown;
    try {
      const data = matter(markdown);
      if (data.data["note"] && data.data["note"] instanceof Object) {
        noteConfig = Object.assign({}, noteConfig, data.data["note"] || {});
      }
      const frontMatter = Object.assign(
        data.data || {},
        formatNoteConfig(noteConfig),
      );
      delete frontMatter["note"];
      markdown = data.content;
      markdown = matterStringify(markdown, frontMatter);
    } catch (error) {
      markdown = matterStringify(markdown, formatNoteConfig(noteConfig));
    }

    await pfs.writeFile(path.resolve(this.dir, filePath), markdown);
    if (!this.isLocal) {
      await git.add({
        fs: fs,
        dir: this.dir,
        filepath: filePath,
      });
    }

    const note = await this.getNote(filePath, true);
    note.markdown = oMarkdown;
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
