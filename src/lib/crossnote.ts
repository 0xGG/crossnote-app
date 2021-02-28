// @ts-ignore
import diff3Merge from "diff3";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import * as path from "path";
import PouchDB from "pouchdb";
import PouchdbFind from "pouchdb-find";
import { randomID } from "../utilities/utils";
import { fs, pfs } from "./fs";
import { Notebook } from "./notebook";

/*
export interface Attachment {
  notebook: Notebook;
  filePath: string;
  content: string;
  createdAt: Date;
  modifiedAt: Date;
}
*/

interface CloneNotebookArgs {
  name?: string;
  corsProxy?: string;
  gitURL: string;
  branch?: string;
  depth?: number;
  username?: string;
  password?: string;
  rememberCredentials?: boolean;
  directoryHandle?: FileSystemDirectoryHandle;
}

// type ListAttachmentsArgs = ListNotesArgs;

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

interface NotebookDBEntry {
  // basic info
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
  directoryHandle?: FileSystemDirectoryHandle;
}

export default class Crossnote {
  private notebookDB: PouchDB.Database<NotebookDBEntry>;

  constructor() {
    PouchDB.plugin(PouchdbFind);
    this.notebookDB = new PouchDB("notebooks");
    this.notebookDB.createIndex({
      index: {
        fields: ["gitURL"],
      },
    });
  }

  public async addNotebook({
    name = "",
    corsProxy = "",
    gitURL = "",
    branch = "master",
    username = "",
    password = "",
    depth = 3,
    rememberCredentials = false,
    directoryHandle,
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
        rememberCredentials,
      });
    } else {
      const _id = randomID();
      let dir = `/notebooks/${_id}`;
      if (directoryHandle) {
        dir = (
          await pfs.attachLocalDirectory({ id: _id, directoryHandle })
        ).replace(/\/+$/, "");
      }

      const notebook = new Notebook();
      notebook._id = _id;
      notebook.dir = dir;
      notebook.name = directoryHandle
        ? directoryHandle.name.trim()
        : name.trim() || "Unnamed";
      notebook.gitURL = gitURL.trim();
      notebook.gitBranch = branch.trim() || "master";
      notebook.gitCorsProxy = corsProxy.trim();
      notebook.gitUsername = rememberCredentials ? username.trim() : "";
      notebook.gitPassword = rememberCredentials ? password : "";
      notebook.autoFetchPeriod = 0;
      notebook.fetchedAt = new Date();
      notebook.remoteSha = "";
      notebook.localSha = "";

      if (directoryHandle) {
        notebook.isLocal = true;
      }

      if (!(await pfs.exists("/notebooks"))) {
        await pfs.mkdir("/notebooks");
      }
      if (!directoryHandle && !(await pfs.exists(dir))) {
        await pfs.mkdir(dir);
      }

      if (!directoryHandle) {
        await git.init({
          fs: fs,
          dir,
        });
      }

      // Save to DB
      try {
        await this.notebookDB.put(Object.assign({ directoryHandle }, notebook));
      } catch (error) {
        console.log("failed to save to error");
        // Failed to save to DB
        if (!directoryHandle) {
          await pfs.rmdir(dir);
        }
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
    rememberCredentials = false,
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
      fs: fs,
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
          password,
        };
      },
    });

    const sha = await this.getGitSHA(
      dir,
      `origin/${branch.trim() || "master"}`,
    );

    const notebook: Notebook = new Notebook();
    notebook._id = _id;
    notebook.dir = dir;
    notebook.name = name || this.getDefaultNotebookNameFromGitURL(gitURL);
    notebook.gitURL = gitURL;
    notebook.gitBranch = branch.trim() || "master";
    notebook.gitCorsProxy = corsProxy;
    notebook.gitUsername = rememberCredentials ? username : "";
    notebook.gitPassword = rememberCredentials ? password : "";
    notebook.autoFetchPeriod = 3600000; // 60 minutes
    notebook.fetchedAt = new Date();
    notebook.localSha = sha;
    notebook.remoteSha = sha;

    // Save to DB
    try {
      await this.notebookDB.put(notebook);
    } catch (error) {
      // Failed to save to DB
      await pfs.rmdir(dir);
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
    if (!notebook.directoryHandle) {
      await pfs.rmdir(notebook.dir);
    }
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

  public async renameDirectory(
    notebook: Notebook,
    oldDirName: string,
    newDirName: string,
  ) {
    await pfs.rename(
      path.resolve(notebook.dir, oldDirName),
      path.resolve(notebook.dir, newDirName),
    );
    await git.remove({
      fs: fs,
      dir: notebook.dir,
      filepath: oldDirName,
    });
    await git.add({
      fs: fs,
      dir: notebook.dir,
      filepath: newDirName || ".",
    });
  }

  public async deleteDirectory(notebook: Notebook, dirName: string) {
    await pfs.rmdir(path.resolve(notebook.dir, dirName));
    await git.remove({
      fs: fs,
      dir: notebook.dir,
      filepath: dirName,
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
          fs: fs,
          dir: notebook.dir,
          filepath: stagedFiles[i],
        });
        if (status.match(/^\*?(modified|added)/)) {
          cache[stagedFiles[i]] = {
            status,
            markdown: (await pfs.readFile(
              path.resolve(notebook.dir, stagedFiles[i]),
              { encoding: "utf8" },
            )) as string,
          };
        } else if (status.match(/^\*?(deleted)/)) {
          cache[stagedFiles[i]] = {
            status,
            markdown: "",
          };
        }
      }
    };

    await createCache(
      // Check previous staged file for `delete` status
      await git.listFiles({
        fs: fs,
        dir: notebook.dir,
        ref: "HEAD",
      }),
    );

    await createCache(
      // Check current staged file for `add` status
      await git.listFiles({
        fs: fs,
        dir: notebook.dir,
      }),
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
    onAuthSuccess,
  }: PushNotebookArgs): Promise<null | git.PushResult> {
    // Pull notebook first
    const pullNotebookResult = await this.pullNotebook({
      notebook,
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage,
    });

    if (pullNotebookResult.numConflicts > 0) {
      throw new Error("error/please-resolve-conflicts");
    }

    const localSha = notebook.localSha;

    const sha = await git.commit({
      fs: fs,
      dir: notebook.dir,
      author: {
        name: authorName,
        email: authorEmail,
      },
      message,
    });

    const restoreSHA = async () => {
      const gitBranch = notebook.gitBranch || "master";
      // Perform a soft reset
      await pfs.writeFile(
        path.resolve(notebook.dir, `.git/refs/heads/${gitBranch}`),
        localSha,
      );
    };

    // console.log(sha);
    const pushResult = await git.push({
      fs: fs,
      http,
      onAuth: (url, auth) => {
        return {
          username: username, // || notebook.gitUsername,
          password: password, // || notebook.gitPassword
        };
      },
      onProgress: (progress) => {
        if (onProgress) {
          onProgress(progress);
        }
      },
      onMessage: (message) => {
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
      corsProxy: notebook.gitCorsProxy,
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
        fs: fs,
        dir: dir,
        ref: ref,
        depth: 5,
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
    await pfs.writeFile(
      path.resolve(notebook.dir, `.git/refs/heads/${notebook.gitBranch}`),
      sha,
    );
    await pfs.unlink(path.resolve(notebook.dir, `.git/index`));
    await git.checkout({
      dir: notebook.dir,
      fs: fs,
      ref: notebook.gitBranch || "master",
    });
  }

  private async restoreFilesFromCache(
    cache: Cache,
    notebook: Notebook,
  ): Promise<number> {
    let numConflicts = 0;
    // console.log("same");
    for (const filePath in cache) {
      if (cache[filePath].status === "deleted") {
        await notebook.deleteNote(filePath);
        continue;
      }
      const markdown = cache[filePath].markdown;
      const dirname = path.dirname(path.resolve(notebook.dir, filePath));
      await pfs.mkdirp(dirname);
      await pfs.writeFile(path.resolve(notebook.dir, filePath), markdown);
      await git.add({
        fs: fs,
        dir: notebook.dir,
        filepath: filePath,
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
    onMessage,
  }: PullNotebookArgs): Promise<PullNotebookResult> {
    // Stop using git.pull as merge will cause error
    const result = await git.fetch({
      fs: fs,
      http,
      dir: notebook.dir,
      singleBranch: true,
      corsProxy: notebook.gitCorsProxy,
      ref: notebook.gitBranch || "master",
      onAuth: (url, auth) => {
        return {
          username: notebook.gitUsername,
          password: notebook.gitPassword,
        };
      },
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage,
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
        localSha,
      }),
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
        if (await pfs.exists(path.resolve(notebook.dir, filePath))) {
          let baseContent: string = "";
          let theirContent: string = "";
          try {
            const baseContentBlobResult = await git.readBlob({
              fs: fs,
              dir: notebook.dir,
              oid: localSha,
              filepath: filePath,
            });
            baseContent = Buffer.from(baseContentBlobResult.blob).toString(
              "utf8",
            );
          } catch (error) {}
          try {
            const theirContentBlobTresult = await git.readBlob({
              fs: fs,
              dir: notebook.dir,
              oid: remoteSha,
              filepath: filePath,
            });
            theirContent = Buffer.from(theirContentBlobTresult.blob).toString(
              "utf8",
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
          await pfs.mkdirp(dirname);
          await pfs.writeFile(path.resolve(notebook.dir, filePath), mergedText);
          await git.add({
            fs: fs,
            dir: notebook.dir,
            filepath: filePath,
          });
        } else {
          const markdown = cache[filePath].markdown;
          const dirname = path.dirname(path.resolve(notebook.dir, filePath));
          await pfs.mkdirp(dirname);
          await pfs.writeFile(path.resolve(notebook.dir, filePath), markdown);
          await git.add({
            fs: fs,
            dir: notebook.dir,
            filepath: filePath,
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
      cache,
    };
  }

  public async fetchNotebook({
    notebook,
    onProgress,
    onAuthFailure,
    onAuthSuccess,
    onMessage,
  }: FetchNotebookArgs): Promise<boolean> {
    const localSha = notebook.localSha;
    const result = await git.fetch({
      fs: fs,
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
          password: notebook.gitPassword,
        };
      },
      onProgress,
      onAuthFailure,
      onAuthSuccess,
      onMessage,
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

  public async listNotebooks(): Promise<Notebook[]> {
    const notebookEntries = (
      await this.notebookDB.find({
        selector: {
          gitURL: { $gt: null },
        },
      })
    ).docs;
    const notebooks: Notebook[] = [];
    for (let i = 0; i < notebookEntries.length; i++) {
      const n = notebookEntries[i];
      const notebook = new Notebook();
      notebook._id = n._id;
      notebook.dir = n.dir;
      notebook.name = n.name;
      notebook.gitURL = n.gitURL;
      notebook.gitBranch = n.gitBranch;
      notebook.gitCorsProxy = n.gitCorsProxy;
      notebook.gitUsername = n.gitUsername;
      notebook.gitPassword = n.gitPassword;
      notebook.autoFetchPeriod = n.autoFetchPeriod;
      notebook.fetchedAt = n.fetchedAt;
      notebook.remoteSha = n.remoteSha;
      notebook.localSha = n.localSha;

      if (n.directoryHandle) {
        // local notebook
        const dir = (
          await pfs.attachLocalDirectory({
            id: n._id,
            directoryHandle: n.directoryHandle,
          })
        ).replace(/\/+$/, "");
        notebook.dir = dir;
        notebook.isLocal = true;
      }

      notebooks.push(notebook);
    }

    const promises = notebooks.map((notebook, i) => {
      return (async (i: number) => {
        const notebook = notebooks[i];
        notebook.fetchedAt = new Date(notebook.fetchedAt || 0);
        if (notebook.gitURL.trim().length <= 0) {
          // no remote set
          return;
        }
        if (typeof notebook.autoFetchPeriod === "undefined") {
          notebook.autoFetchPeriod = 3600000; // 60 minutes
        }
        if (typeof notebook.localSha === "undefined") {
          notebook.localSha = await this.getGitSHA(
            notebook.dir,
            `origin/${notebook.gitBranch}`,
          );
        }
        if (typeof notebook.remoteSha === "undefined") {
          notebook.remoteSha = notebook.localSha;
        }
        const gitBranch = notebook.gitBranch || "master";
        const sha = notebook.localSha || "";
        try {
          // Perform a soft reset
          await pfs.writeFile(
            path.resolve(notebook.dir, `.git/refs/heads/${gitBranch}`),
            sha,
          );

          // Restore cached files from failed `git` pull event
          const pendingPull = localStorage.getItem(
            `pending/pull/${notebook._id}`,
          );
          if (pendingPull) {
            try {
              await this.restoreFilesFromCache(
                JSON.parse(pendingPull).cache,
                notebook,
              );
            } catch (error) {}
            localStorage.removeItem(`pending/pull/${notebook._id}`);
          }

          const status = await git.status({
            fs: fs,
            dir: notebook.dir,
            filepath: ".",
          });

          // check: absent, deleted, undeleted
          if (status.match(/(absent|deleted)/) || pendingPull) {
            // NOTE: Seems like there is a bug somewhere that caused all files to become *undeleted
            // So we run git.add again.
            await git.add({
              fs: fs,
              dir: notebook.dir,
              filepath: ".",
            });
          }
        } catch (error) {
          notebooks[i] = null;
        }
      })(i);
    });

    await Promise.all(promises);

    return notebooks
      .filter((nb) => nb)
      .sort((x, y) => x.name.localeCompare(y.name));
  }

  /*
  public async listAttachments({
    notebook,
    dir = "./",
    includeSubdirectories = false,
  }: ListAttachmentsArgs): Promise<Attachment[]> {
    let attachments: Attachment[] = [];
    let files: string[] = [];
    try {
      files = await pfs.readdir(path.resolve(notebook.dir, dir));
    } catch (error) {
      files = [];
    }
    const listAttachmentsPromises = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const absFilePath = path.resolve(notebook.dir, dir, file);
      const stats = await pfs.stats(absFilePath);
      if (
        stats.isFile() &&
        !absFilePath.endsWith(".md") &&
        isFileAnImage(file) // TODO: We only support images for now. Supports other types of files in the future
      ) {
        const attachment: Attachment = {
          notebook,
          filePath: path.relative(notebook.dir, absFilePath),
          content: isBinarySync(file)
            ? ""
            : ((await pfs.readFile(absFilePath, {
                encoding: "utf8",
              })) as string),
          createdAt: new Date(stats.ctimeMs),
          modifiedAt: new Date(stats.mtimeMs),
        };
        attachments.push(attachment);
        if (isBinarySync(file)) {
        } else {
        }
      }

      if (stats.isDirectory() && file !== ".git" && includeSubdirectories) {
        listAttachmentsPromises.push(
          this.listAttachments({
            notebook,
            dir: path.relative(notebook.dir, absFilePath),
            includeSubdirectories,
          }),
        );
      }
    }

    const res = await Promise.all(listAttachmentsPromises);
    res.forEach((r) => {
      attachments = attachments.concat(r);
    });

    return attachments;
  }
  */

  private getDefaultNotebookNameFromGitURL(gitURL: string) {
    const i = gitURL.lastIndexOf("/");
    return gitURL.slice(i + 1).replace(/\.git/, "");
  }

  public async getStatus(notebookPath: string, filePath: string) {
    return await git.status({
      fs: fs,
      dir: notebookPath,
      filepath: filePath,
    });
  }
}
