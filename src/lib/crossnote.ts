import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import * as path from "path";
import PouchDB from "pouchdb";
import PouchdbFind from "pouchdb-find";
// @ts-ignore
import diff3Merge from "diff3";
import { randomID } from "../utilities/utils";
import AES from "crypto-js/aes";
import { Stats } from "fs";
import { getHeaderFromMarkdown } from "../utilities/note";

export interface Notebook {
  _id: string;
  dir: string;
  name: string;

  // git
  gitURL: string;
  gitBranch: string;
  gitCorsProxy?: string;
  gitUsername?: string;
  gitPassword?: string;

  autoFetchPeriod: number; // in milliseconds
  fetchedAt: Date;
  remoteSha: string;
  localSha: string;
}

export interface Note {
  notebook: Notebook;
  filePath: string;
  markdown: string;
  config: NoteConfig;
  // createdAt: Date; // <- Can't get modifiedAt time
}

export interface Directory {
  name: string;
  path: string;
  children?: Directory[];
}

export interface TagNode {
  name: string;
  path: string;
  children?: TagNode[];
  // numNotes: number;
}

export interface NoteConfigEncryption {
  title: string;
  // method: string;? // Default AES256
}

export interface NoteConfig {
  id?: string;
  createdAt: Date;
  modifiedAt: Date;
  tags?: string[];
  pinned?: boolean;
  encryption?: NoteConfigEncryption;
}

export interface NotebookConfig {
  repository: string;
  branch: string;
  author: string;
  contributors: string[];
}

interface CrossnoteConstructorProps {
  fs: any;
}
interface CloneNotebookArgs {
  name?: string;
  corsProxy?: string;
  gitURL: string;
  branch?: string;
  depth?: number;
  username?: string;
  password?: string;
  rememberCredentials?: boolean;
}

interface ListNotesArgs {
  notebook: Notebook;
  dir: string;
  includeSubdirectories?: Boolean;
}
interface MatterOutput {
  data: any;
  content: string;
}

export interface PushNotebookArgs {
  notebook: Notebook;
  authorName?: string;
  authorEmail?: string;
  username?: string;
  password?: string;
  message?: string;
  onProgress?: (progress: git.GitProgressEvent) => void;
  onMessage?: (message: string) => void;
  onAuthFailure?: (url: string) => void;
  onAuthSuccess?: (url: string) => void;
}

export interface PullNotebookArgs {
  notebook: Notebook;
  onProgress?: (progress: git.GitProgressEvent) => void;
  onMessage?: (message: string) => void;
  onAuthFailure?: (url: string) => void;
  onAuthSuccess?: (url: string) => void;
}

export type FetchNotebookArgs = PullNotebookArgs;

interface PullNotebookResult {
  numConflicts: number;
  cache: Cache;
}

type Cache = {
  [key: string]: {
    status: string;
    markdown: string;
  };
};

export default class Crossnote {
  private fs: any;

  private readFile: (path: string) => Promise<string>;
  private writeFile: (path: string, data: string) => Promise<void>;
  private readdir: (path: string) => Promise<string[]>;
  private unlink: (path: string) => Promise<void>;
  private stats: (path: string) => Promise<Stats>;
  private mkdir: (path: string) => Promise<void>;
  private exists: (path: string) => Promise<boolean>;
  private rename: (oldPath: string, newPath: string) => Promise<void>;
  private rmdir: (path: string) => Promise<void>;
  private mkdirp: (path: string) => Promise<void>;

  private notebookDB: PouchDB.Database<Notebook>;

  constructor(props: CrossnoteConstructorProps) {
    this.fs = props.fs;
    this.setUpFSMethods();

    PouchDB.plugin(PouchdbFind);
    this.notebookDB = new PouchDB("notebooks");
    this.notebookDB.createIndex({
      index: {
        fields: ["gitURL"]
      }
    });
  }

  private setUpFSMethods() {
    this.readFile = (path: string) => {
      return new Promise((resolve, reject) => {
        this.fs.readFile(
          path,
          { encoding: "utf8" },
          (error: Error, data: string) => {
            if (error) {
              return reject(error);
            } else {
              return resolve(data.toString());
            }
          }
        );
      });
    };
    this.writeFile = (path: string, data: string) => {
      return new Promise((resolve, reject) => {
        this.fs.writeFile(path, data, { encoding: "utf8" }, (error: Error) => {
          if (error) {
            return reject(error);
          } else {
            return resolve();
          }
        });
      });
    };
    this.readdir = (path: string) => {
      return new Promise((resolve, reject) => {
        this.fs.readdir(path, (error: Error, files: string[]) => {
          if (error) {
            return reject(error);
          } else {
            return resolve(files);
          }
        });
      });
    };
    this.unlink = (path: string) => {
      return new Promise((resolve, reject) => {
        this.fs.unlink(path, (error: Error) => {
          if (error) {
            return reject(error);
          } else {
            return resolve();
          }
        });
      });
    };
    this.stats = (path: string) => {
      return new Promise((resolve, reject) => {
        this.fs.stat(path, (error: Error, stats: Stats) => {
          if (error) {
            return reject(error);
          } else {
            return resolve(stats);
          }
        });
      });
    };
    this.mkdir = (path: string) => {
      return new Promise((resolve, reject) => {
        this.fs.mkdir(path, "0777", (error: Error) => {
          if (error) {
            return reject(error);
          } else {
            return resolve();
          }
        });
      });
    };
    this.exists = (path: string) => {
      return new Promise((resolve, reject) => {
        this.fs.stat(path, (error: Error, stats: Stats) => {
          if (error) {
            return resolve(false);
          } else {
            return resolve(true);
          }
        });
      });
    };
    this.rename = (oldPath: string, newPath: string) => {
      return new Promise((resolve, reject) => {
        this.fs.rename(oldPath, newPath, (error: Error) => {
          if (error) {
            return reject(error);
          } else {
            return resolve();
          }
        });
      });
    };

    const rmdir = (path: string) => {
      return new Promise((resolve, reject) => {
        this.fs.rmdir(path, (error: Error) => {
          if (error) {
            return reject(error);
          } else {
            return resolve();
          }
        });
      });
    };
    // Remove the directory recursively
    this.rmdir = async (dirPath: string) => {
      const files = await this.readdir(dirPath);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.resolve(dirPath, file);
        const stats = await this.stats(filePath);
        if (stats.isDirectory()) {
          await this.rmdir(filePath);
        } else {
          await this.unlink(filePath);
        }
      }

      await rmdir(dirPath);
    };

    this.mkdirp = async (dirPath: string) => {
      if (await this.exists(dirPath)) {
        return;
      } else {
        await this.mkdirp(path.dirname(dirPath));
        await this.mkdir(dirPath);
      }
    };
  }

  public async addNotebook({
    name = "",
    corsProxy,
    gitURL,
    branch = "master",
    username = "",
    password = "",
    depth = 3,
    rememberCredentials = false
  }: CloneNotebookArgs) {
    if (gitURL) {
      return await this.cloneNotebook({
        name,
        corsProxy,
        gitURL,
        branch,
        username,
        password,
        depth,
        rememberCredentials
      });
    } else {
      const _id = randomID();
      const dir = `/notebooks/${_id}`;
      const notebook: Notebook = {
        _id,
        dir,
        name: name.trim() || "Unnamed",
        gitURL: gitURL.trim(),
        gitBranch: branch.trim() || "master",
        gitCorsProxy: corsProxy.trim(),
        gitUsername: rememberCredentials ? username.trim() : "",
        gitPassword: rememberCredentials ? password : "",
        autoFetchPeriod: 0,
        fetchedAt: new Date(),
        remoteSha: "",
        localSha: ""
      };
      if (!(await this.exists("/notebooks"))) {
        await this.mkdir("/notebooks");
      }
      if (!(await this.exists(dir))) {
        await this.mkdir(dir);
      }
      await git.init({
        fs: this.fs,
        dir
      });

      // Save to DB
      try {
        await this.notebookDB.put(notebook);
      } catch (error) {
        // Failed to save to DB
        await this.rmdir(dir);
      }

      return notebook;
    }
  }

  public async cloneNotebook({
    name = "",
    corsProxy,
    gitURL,
    branch = "master",
    username = "",
    password = "",
    depth = 10,
    rememberCredentials = false
  }: CloneNotebookArgs): Promise<Notebook> {
    if (!gitURL.match(/^https?:\/\//)) {
      throw new Error("error/invalid-git-url-prefix");
    }

    // Check if gitURL exists
    /*
    let exists = false;
    try {
      const notebooks = await this.notebookDB.find({
        selector: {
          gitURL: { $eq: gitURL }
        }
      });
      if (notebooks.docs && notebooks.docs.length) {
        exists = true;
      }
    } catch (error) {
      exists = false;
    }

    if (exists) {
      throw new Error("error/repository-already-cloned");
    }*/

    const _id = randomID();
    const dir = `/notebooks/${_id}`;

    await git.clone({
      fs: this.fs,
      http,
      dir,
      corsProxy,
      url: gitURL,
      ref: branch.trim() || "master",
      depth: depth,
      singleBranch: true,
      onAuth: (url, auth) => {
        return {
          username,
          password
        };
      }
    });

    const sha = await this.getGitSHA(
      dir,
      `origin/${branch.trim() || "master"}`
    );

    const notebook: Notebook = {
      _id,
      dir,
      name: name || this.getDefaultNotebookNameFromGitURL(gitURL),
      gitURL: gitURL,
      gitBranch: branch.trim() || "master",
      gitCorsProxy: corsProxy,
      gitUsername: rememberCredentials ? username : "",
      gitPassword: rememberCredentials ? password : "",
      autoFetchPeriod: 3600000, // 60 minutes
      fetchedAt: new Date(),
      localSha: sha,
      remoteSha: sha
    };

    // Save to DB
    try {
      await this.notebookDB.put(notebook);
    } catch (error) {
      // Failed to save to DB
      await this.rmdir(dir);
    }

    return notebook;
  }

  public async exportNotebookToJSON(notebook: Notebook): Promise<string> {
    return "";
  }

  public async importNotebookFromJSON(notebook: Notebook): Promise<string> {
    return "";
  }

  public async deleteNotebook(notebookID: string) {
    const notebook = await this.notebookDB.get(notebookID);
    await this.rmdir(notebook.dir);
    await this.notebookDB.remove(notebook);
  }
  public async updateNotebook(notebook: Notebook) {
    const nb = await this.notebookDB.get(notebook._id);
    nb.dir = notebook.dir;
    nb.name = notebook.name;
    nb.gitURL = notebook.gitURL;
    nb.gitBranch = notebook.gitBranch;
    nb.gitCorsProxy = notebook.gitCorsProxy;
    nb.gitUsername = notebook.gitUsername;
    nb.gitPassword = notebook.gitPassword;
    nb.autoFetchPeriod = notebook.autoFetchPeriod;
    nb.fetchedAt = notebook.fetchedAt;
    nb.remoteSha = notebook.remoteSha;
    nb.localSha = notebook.localSha;
    await this.notebookDB.put(nb, { force: true });
  }
  /*
  public async makeDirectoryForNotebook(notebook: Notebook, dir: string) {
    await this.mkdir(path.resolve(notebook.dir, dir));
  }
  public async removeDirectoryForNotebook(notebook: Notebook, dir: string) {
    const notes = await this.listNotes({
      notebook,
      dir,
      includeSubdirectories: true
    });
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      await this.deleteNote(notebook, note.filePath);
    }
    await this.unlink(path.resolve(notebook.dir, dir));
  }
  */

  public async changeNoteFilePath(
    notebook: Notebook,
    note: Note,
    newFilePath: string
  ) {
    newFilePath = newFilePath.replace(/^\/+/, "");
    if (!newFilePath.endsWith(".md")) {
      newFilePath = newFilePath + ".md";
    }

    const oldFilePath = note.filePath;
    const newDirPath = path.dirname(path.resolve(notebook.dir, newFilePath));
    await this.mkdirp(newDirPath);

    // TODO: Check if newFilePath already exists. If so don't overwrite
    const exists = await this.exists(path.resolve(notebook.dir, newFilePath));
    if (exists) {
      throw new Error("error/target-file-already-exists");
    }

    await this.rename(
      path.resolve(notebook.dir, oldFilePath),
      path.resolve(notebook.dir, newFilePath)
    );
    await git.remove({
      fs: this.fs,
      dir: notebook.dir,
      filepath: oldFilePath
    });
    await git.add({
      fs: this.fs,
      dir: notebook.dir,
      filepath: newFilePath
    });
  }

  private async generateChangesCache(notebook: Notebook): Promise<Cache> {
    const cache: Cache = {};
    const createCache = async (stagedFiles: string[]) => {
      for (let i = 0; i < stagedFiles.length; i++) {
        if (stagedFiles[i] in cache) {
          continue;
        }
        const status = await git.status({
          fs: this.fs,
          dir: notebook.dir,
          filepath: stagedFiles[i]
        });
        if (status.match(/^\*?(modified|added)/)) {
          cache[stagedFiles[i]] = {
            status,
            markdown: await this.readFile(
              path.resolve(notebook.dir, stagedFiles[i])
            )
          };
        } else if (status.match(/^\*?(deleted)/)) {
          cache[stagedFiles[i]] = {
            status,
            markdown: ""
          };
        }
      }
    };

    await createCache(
      // Check previous staged file for `delete` status
      await git.listFiles({
        fs: this.fs,
        dir: notebook.dir,
        ref: "HEAD"
      })
    );

    await createCache(
      // Check current staged file for `add` status
      await git.listFiles({
        fs: this.fs,
        dir: notebook.dir
      })
    );

    return cache;
  }

  public async pushNotebook({
    notebook,
    authorName = "crossnote",
    authorEmail = "anonymous@crossnote.com",
    username,
    password,
    message = "doc: Updated docs",
    onProgress,
    onMessage,
    onAuthFailure,
    onAuthSuccess
  }: PushNotebookArgs): Promise<null | git.PushResult> {
    // Pull notebook first
    const pullNotebookResult = await this.pullNotebook({
      notebook,
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage
    });

    if (pullNotebookResult.numConflicts > 0) {
      throw new Error("error/please-resolve-conflicts");
    }

    const localSha = notebook.localSha;

    const sha = await git.commit({
      fs: this.fs,
      dir: notebook.dir,
      author: {
        name: authorName,
        email: authorEmail
      },
      message
    });

    const restoreSHA = async () => {
      const gitBranch = notebook.gitBranch || "master";
      // Perform a soft reset
      await this.writeFile(
        path.resolve(notebook.dir, `.git/refs/heads/${gitBranch}`),
        localSha
      );
    };

    // console.log(sha);
    const pushResult = await git.push({
      fs: this.fs,
      http,
      onAuth: (url, auth) => {
        return {
          username: username, // || notebook.gitUsername,
          password: password // || notebook.gitPassword
        };
      },
      onProgress: progress => {
        if (onProgress) {
          onProgress(progress);
        }
      },
      onMessage: message => {
        if (onMessage) {
          onMessage(message);
        }
      },
      onAuthFailure: (url, auth) => {
        if (onAuthFailure) {
          onAuthFailure(url);
        }
        restoreSHA();
      },
      onAuthSuccess: (url, auth) => {
        if (onAuthSuccess) {
          onAuthSuccess(url);
        }
      },
      url: notebook.gitURL,
      dir: notebook.dir,
      ref: notebook.gitBranch,
      corsProxy: notebook.gitCorsProxy
    });

    // console.log("pushResult: ", pushResult);

    if (pushResult.error) {
      restoreSHA();
    }

    if (pushResult.ok) {
      // Update notebook
      notebook.fetchedAt = new Date();
      notebook.localSha = sha;
      notebook.remoteSha = sha;
      await this.updateNotebook(notebook);
    }
    return pushResult;
  }

  public async getGitSHA(dir: string, ref: string = "master"): Promise<string> {
    try {
      let logs = await git.log({
        fs: this.fs,
        dir: dir,
        ref: ref,
        depth: 5
      });
      if (logs.length > 0) {
        return (logs && logs[0]).oid;
      } else {
        return "";
      }
    } catch (error) {
      return "";
    }
  }

  public async hardResetNotebook(notebook: Notebook, sha: string) {
    await this.writeFile(
      path.resolve(notebook.dir, `.git/refs/heads/${notebook.gitBranch}`),
      sha
    );
    await this.unlink(path.resolve(notebook.dir, `.git/index`));
    await git.checkout({
      dir: notebook.dir,
      fs: this.fs,
      ref: notebook.gitBranch || "master"
    });
  }

  private async restoreFilesFromCache(
    cache: Cache,
    notebook: Notebook
  ): Promise<number> {
    let numConflicts = 0;
    // console.log("same");
    for (const filePath in cache) {
      if (cache[filePath].status === "deleted") {
        await this.deleteNote(notebook, filePath);
        continue;
      }
      const markdown = cache[filePath].markdown;
      const dirname = path.dirname(path.resolve(notebook.dir, filePath));
      await this.mkdirp(dirname);
      await this.writeFile(path.resolve(notebook.dir, filePath), markdown);
      await git.add({
        fs: this.fs,
        dir: notebook.dir,
        filepath: filePath
      });
      if (this.markdownHasConflicts(markdown)) {
        numConflicts += 1;
      }
    }
    return numConflicts;
  }

  public async pullNotebook({
    notebook,
    onProgress,
    onAuthFailure,
    onAuthSuccess,
    onMessage
  }: PullNotebookArgs): Promise<PullNotebookResult> {
    // Stop using git.pull as merge will cause error
    const result = await git.fetch({
      fs: this.fs,
      http,
      dir: notebook.dir,
      singleBranch: true,
      corsProxy: notebook.gitCorsProxy,
      ref: notebook.gitBranch || "master",
      onAuth: (url, auth) => {
        return {
          username: notebook.gitUsername,
          password: notebook.gitPassword
        };
      },
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage
    });

    // NOTE: Seems like diff3 not working as I expected. Therefore I might create my own type of diff
    const cache: {
      [key: string]: {
        status: string;
        markdown: string;
      };
    } = await this.generateChangesCache(notebook);
    const localSha = notebook.localSha;

    // Save cache in case of system crash
    localStorage.setItem(
      `pending/pull/${notebook._id}`,
      JSON.stringify({
        cache,
        localSha
      })
    );

    // Perform a hard reset
    const remoteSha = result.fetchHead;
    await this.hardResetNotebook(notebook, remoteSha);

    let numConflicts = 0;
    if (localSha === remoteSha) {
      // Restore from cache
      numConflicts = await this.restoreFilesFromCache(cache, notebook);
    } else {
      // Check conflicted notes
      // console.log("check conflicted");
      const LINEBREAKS = /^.*(\r?\n|$)/gm;
      const markerSize = 7;
      const ourName = "ours";
      const theirName = "theirs";
      // const baseName = "base";
      for (const filePath in cache) {
        const ourContent = cache[filePath].markdown;
        if (await this.exists(path.resolve(notebook.dir, filePath))) {
          let baseContent: string = "";
          let theirContent: string = "";
          try {
            const baseContentBlobResult = await git.readBlob({
              fs: this.fs,
              dir: notebook.dir,
              oid: localSha,
              filepath: filePath
            });
            baseContent = Buffer.from(baseContentBlobResult.blob).toString(
              "utf8"
            );
          } catch (error) {}
          try {
            const theirContentBlobTresult = await git.readBlob({
              fs: this.fs,
              dir: notebook.dir,
              oid: remoteSha,
              filepath: filePath
            });
            theirContent = Buffer.from(theirContentBlobTresult.blob).toString(
              "utf8"
            );
          } catch (error) {}
          // console.log("ourContent: ", ourContent);
          // console.log("theirContent: ", theirContent);
          // console.log("baseContent: ", baseContent);

          // TODO: clean front-matter

          // Refered from https://github.com/isomorphic-git/isomorphic-git/blob/4e66704d05042624bbc78b85ee5110d5ee7ec3e2/src/utils/mergeFile.js
          const ours = ourContent.match(LINEBREAKS);
          const base = baseContent.match(LINEBREAKS);
          const theirs = theirContent.match(LINEBREAKS);

          // Here we let the diff3 library do the heavy lifting.
          const result = diff3Merge(ours, base, theirs);

          // Here we note whether there are conflicts and format the results
          let mergedText = "";
          let hasConflict = false;
          for (const item of result) {
            if (item.ok) {
              mergedText += item.ok.join("");
            }
            if (item.conflict) {
              hasConflict = true;
              mergedText += `\\<${"<".repeat(markerSize - 1)} ${ourName}\n`;
              mergedText += item.conflict.a.join("") + "\n";
              // if (format === "diff3") {
              //mergedText += `\\|${"|".repeat(markerSize - 1)} ${baseName}\n`;
              //mergedText += item.conflict.o.join("");
              // }
              mergedText += `\\=${"=".repeat(markerSize - 1)}\n`;
              mergedText += item.conflict.b.join("") + "\n";
              mergedText += `\\>${">".repeat(markerSize - 1)} ${theirName}\n`;
            }
          }
          if (hasConflict) {
            numConflicts += 1;
          }

          // console.log("mergedText: ", mergedText);
          const dirname = path.dirname(path.resolve(notebook.dir, filePath));
          await this.mkdirp(dirname);
          await this.writeFile(
            path.resolve(notebook.dir, filePath),
            mergedText
          );
          await git.add({
            fs: this.fs,
            dir: notebook.dir,
            filepath: filePath
          });
        } else {
          const markdown = cache[filePath].markdown;
          const dirname = path.dirname(path.resolve(notebook.dir, filePath));
          await this.mkdirp(dirname);
          await this.writeFile(path.resolve(notebook.dir, filePath), markdown);
          await git.add({
            fs: this.fs,
            dir: notebook.dir,
            filepath: filePath
          });
        }
      }
    }

    // Update notebook
    notebook.fetchedAt = new Date();
    notebook.localSha = remoteSha;
    notebook.remoteSha = remoteSha;
    await this.updateNotebook(notebook);

    localStorage.removeItem(`pending/pull/${notebook._id}`);

    return {
      numConflicts,
      cache
    };
  }

  public async fetchNotebook({
    notebook,
    onProgress,
    onAuthFailure,
    onAuthSuccess,
    onMessage
  }: FetchNotebookArgs): Promise<boolean> {
    const localSha = notebook.localSha;
    const result = await git.fetch({
      fs: this.fs,
      http,
      dir: notebook.dir,
      singleBranch: true,
      tags: false,
      depth: 1,
      corsProxy: notebook.gitCorsProxy,
      url: notebook.gitURL,
      ref: notebook.gitBranch || "master",
      onAuth: (url, auth) => {
        return {
          username: notebook.gitUsername,
          password: notebook.gitPassword
        };
      },
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage
    });

    // Update notebook
    notebook.fetchedAt = new Date();
    notebook.localSha = localSha;
    notebook.remoteSha = result.fetchHead;
    await this.updateNotebook(notebook);

    return localSha !== result.fetchHead;
  }

  public markdownHasConflicts(markdown: string): boolean {
    const m1 = markdown.match(/^\\<+\s/gm);
    const m2 = markdown.match(/^\\=+\s/gm);
    const m3 = markdown.match(/^\\>+\s/gm);
    return m1 && m1.length > 0 && m2 && m2.length > 0 && m3 && m3.length > 0;
  }

  public async checkoutNote(note: Note): Promise<Note> {
    try {
      await git.checkout({
        fs: this.fs,
        dir: note.notebook.dir,
        // ref: "HEAD"
        // ref: note.notebook.gitBranch,
        filepaths: [note.filePath],
        force: true
      });
      if (await this.exists(path.resolve(note.notebook.dir, note.filePath))) {
        await git.add({
          // .remove is wrong
          fs: this.fs,
          dir: note.notebook.dir,
          filepath: note.filePath
        });
      }
      const newNote = await this.getNote(note.notebook, note.filePath);
      return newNote;
    } catch (error) {
      return null;
    }
  }

  public async listNotebooks(): Promise<Notebook[]> {
    const notebooks = (
      await this.notebookDB.find({
        selector: {
          gitURL: { $gt: null }
        }
      })
    ).docs;
    // console.log(notebooks);

    // Restore to remote ref
    for (let i = 0; i < notebooks.length; i++) {
      const notebook = notebooks[i];
      notebook.fetchedAt = new Date(notebook.fetchedAt || 0);
      if (notebook.gitURL.trim().length <= 0) {
        // no remote set
        continue;
      }
      if (typeof notebook.autoFetchPeriod === "undefined") {
        notebook.autoFetchPeriod = 3600000; // 60 minutes
      }
      if (typeof notebook.localSha === "undefined") {
        notebook.localSha = await this.getGitSHA(
          notebook.dir,
          `origin/${notebook.gitBranch}`
        );
      }
      if (typeof notebook.remoteSha === "undefined") {
        notebook.remoteSha = notebook.localSha;
      }
      const gitBranch = notebook.gitBranch || "master";
      const sha = notebook.localSha || "";
      try {
        // Perform a soft reset
        await this.writeFile(
          path.resolve(notebook.dir, `.git/refs/heads/${gitBranch}`),
          sha
        );

        // Restore cached files from failed `git` pull event
        const pendingPull = localStorage.getItem(
          `pending/pull/${notebook._id}`
        );
        if (pendingPull) {
          try {
            await this.restoreFilesFromCache(
              JSON.parse(pendingPull).cache,
              notebook
            );
          } catch (error) {}
          localStorage.removeItem(`pending/pull/${notebook._id}`);
        }

        // NOTE: Seems like there is a bug somewhere that caused all files to become *undeleted
        // So we run git.add again.
        await git.add({
          fs: this.fs,
          dir: notebook.dir,
          filepath: "."
        });
      } catch (error) {
        notebooks[i] = null;
      }
    }
    return notebooks.filter(nb => nb);
  }

  private matter(markdown: string): MatterOutput {
    let endFrontMatterOffset = 0;
    let frontMatter = {};
    if (
      markdown.startsWith("---") &&
      /* tslint:disable-next-line:no-conditional-assignment */
      (endFrontMatterOffset = markdown.indexOf("\n---")) > 0
    ) {
      const frontMatterString = markdown.slice(3, endFrontMatterOffset);
      try {
        frontMatter = (window as any)["YAML"].parse(frontMatterString);
      } catch (error) {}
      markdown = markdown
        .slice(endFrontMatterOffset + 4)
        .replace(/^[ \t]*\n/, "");
    }
    return {
      data: frontMatter,
      content: markdown
    };
  }

  private matterStringify(markdown: string, frontMatter: any) {
    frontMatter = frontMatter || {};
    const yamlStr = (window as any)["YAML"].stringify(frontMatter).trim();
    if (yamlStr === "{}" || !yamlStr) {
      return markdown;
    } else {
      return `---
${yamlStr}
---
${markdown}`;
    }
  }

  public async getNote(
    notebook: Notebook,
    filePath: string,
    stats?: Stats
  ): Promise<Note> {
    const absFilePath = path.resolve(notebook.dir, filePath);
    if (!stats) {
      try {
        stats = await this.stats(absFilePath);
      } catch (error) {
        return null;
      }
    }
    if (stats.isFile() && filePath.endsWith(".md")) {
      let markdown = await this.readFile(absFilePath);
      // console.log("read: ", filePath, markdown);

      // Read the noteConfig, which is like <!-- note {...} --> at the end of the markdown file
      let noteConfig: NoteConfig = {
        // id: "",
        createdAt: new Date(stats.ctimeMs),
        modifiedAt: new Date(stats.mtimeMs),
        tags: []
      };

      try {
        const data = this.matter(markdown);
        noteConfig = Object.assign(noteConfig, data.data["note"] || {});
        const frontMatter: any = Object.assign({}, data.data);
        delete frontMatter["note"];
        // markdown = matter.stringify(data.content, frontMatter); // <= NOTE: I think gray-matter has bug. Although I delete "note" section from front-matter, it still includes it.
        markdown = this.matterStringify(data.content, frontMatter);
      } catch (error) {
        // Do nothing
        markdown =
          "Please fix front-matter. (👈 Don't forget to delete this line)\n\n" +
          markdown;
      }

      // Create note
      const note: Note = {
        notebook: notebook,
        filePath: path.relative(notebook.dir, absFilePath),
        markdown,
        config: noteConfig
      };
      return note;
    } else {
      return null;
    }
  }

  public async listNotes({
    notebook,
    dir = "./",
    includeSubdirectories = false
  }: ListNotesArgs): Promise<Note[]> {
    let notes: Note[] = [];
    let files: string[] = [];
    try {
      files = await this.readdir(path.resolve(notebook.dir, dir));
    } catch (error) {
      files = [];
    }
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const absFilePath = path.resolve(notebook.dir, dir, file);
      const stats = await this.stats(absFilePath);
      const note = await this.getNote(
        notebook,
        path.relative(notebook.dir, absFilePath),
        stats
      );
      if (note) {
        notes.push(note);
      }

      if (stats.isDirectory() && file !== ".git" && includeSubdirectories) {
        notes = notes.concat(
          await this.listNotes({
            notebook,
            dir: path.relative(notebook.dir, absFilePath),
            includeSubdirectories
          })
        );
      }
    }

    // console.log("listNotes: ", notes);
    return notes;
  }
  public async writeNote(
    notebook: Notebook,
    filePath: string,
    markdown: string,
    noteConfig: NoteConfig,
    password?: string
  ): Promise<NoteConfig> {
    noteConfig.modifiedAt = new Date();

    try {
      const data = this.matter(markdown);
      if (data.data["note"] && data.data["note"] instanceof Object) {
        noteConfig = Object.assign({}, noteConfig, data.data["note"] || {});
      }
      const frontMatter = Object.assign(data.data || {}, { note: noteConfig });
      markdown = data.content;
      if (noteConfig.encryption) {
        // TODO: Refactor
        noteConfig.encryption.title = getHeaderFromMarkdown(markdown);
        markdown = AES.encrypt(
          JSON.stringify({ markdown }),
          password || ""
        ).toString();
      }
      markdown = this.matterStringify(markdown, frontMatter);
    } catch (error) {
      if (noteConfig.encryption) {
        // TODO: Refactor
        noteConfig.encryption.title = getHeaderFromMarkdown(markdown);
        markdown = AES.encrypt(
          JSON.stringify({ markdown }),
          password || ""
        ).toString();
      }
      markdown = this.matterStringify(markdown, { note: noteConfig });
    }

    await this.writeFile(path.resolve(notebook.dir, filePath), markdown);
    await git.add({
      fs: this.fs,
      dir: notebook.dir,
      filepath: filePath
    });
    return noteConfig;
  }
  public async deleteNote(notebook: Notebook, filePath: string) {
    if (await this.exists(path.resolve(notebook.dir, filePath))) {
      await this.unlink(path.resolve(notebook.dir, filePath));
      await git.remove({
        fs: this.fs,
        dir: notebook.dir,
        filepath: filePath
      });
    }
  }

  // public async moveNote(fromFilePath: string, toFilePath: string) {}
  public async getNotebookDirectoriesFromNotes(
    notes: Note[]
  ): Promise<Directory> {
    const rootDirectory: Directory = {
      name: ".",
      path: ".",
      children: []
    };

    const filePaths = new Set<string>([]);
    for (let i = 0; i < notes.length; i++) {
      filePaths.add(path.dirname(notes[i].filePath));
    }

    filePaths.forEach(value => {
      const dirNames = value.split("/");
      let directory = rootDirectory;
      for (let i = 0; i < dirNames.length; i++) {
        if (dirNames[i] === ".") {
          break;
        } else {
          let subDirectory = directory.children.filter(
            directory => directory.name === dirNames[i]
          )[0];
          if (subDirectory) {
            directory = subDirectory;
          } else {
            let paths: string[] = [];
            for (let j = 0; j <= i; j++) {
              paths.push(dirNames[j]);
            }
            subDirectory = {
              name: dirNames[i],
              path: paths.join("/"),
              children: []
            };
            directory.children.push(subDirectory);
            directory = subDirectory;
          }
        }
      }
    });

    return rootDirectory;
  }

  public getNotebookTagNodeFromNotes(notes: Note[]): TagNode {
    const rootTagNode: TagNode = {
      name: ".",
      path: ".",
      children: []
    };

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const tags = note.config.tags || [];
      tags.forEach(tag => {
        let node = rootTagNode;
        tag.split("/").forEach((t, index) => {
          t = t.toLocaleLowerCase().replace(/\s+/g, " ");
          const offset = node.children.findIndex(c => c.name === t);
          if (offset >= 0) {
            node = node.children[offset];
          } else {
            const newNode: TagNode = {
              name: t,
              path: node.name === "." ? t : node.path + "/" + t,
              children: []
            };
            node.children.push(newNode);
            node.children.sort((x, y) => x.name.localeCompare(y.name));
            node = newNode;
          }
        });
      });
    }

    return rootTagNode;
  }

  public async hasSummaryMD(notebook: Notebook): Promise<boolean> {
    if (!notebook || !notebook.dir) {
      return false;
    }
    return await this.exists(path.resolve(notebook.dir, "SUMMARY.md"));
  }

  private getDefaultNotebookNameFromGitURL(gitURL: string) {
    const i = gitURL.lastIndexOf("/");
    return gitURL.slice(i + 1).replace(/\.git/, "");
  }

  public async getStatus(note: Note) {
    return await git.status({
      fs: this.fs,
      dir: note.notebook.dir,
      filepath: note.filePath
    });
  }
}
