import { useState, useEffect, useCallback } from "react";
import { createContainer } from "unstated-next";
import * as path from "path";
import Noty from "noty";
import useInterval from "@use-it/interval";
import { randomID, OneDay } from "../utilities/utils";
import { useTranslation } from "react-i18next";
import Crossnote, {
  Notebook,
  Note,
  Directory,
  NoteConfig,
  PushNotebookArgs,
  PullNotebookArgs,
  TagNode,
  Attachment,
} from "../lib/crossnote";
import { getHeaderFromMarkdown } from "../utilities/note";
import { browserHistory } from "../utilities/history";
import * as qs from "qs";
import { pfs } from "../lib/fs";
import { sanitizeTag } from "../utilities/markdown";

export enum EditorMode {
  VickyMD = "VickyMD",
  SourceCode = "SourceCode",
  Preview = "Preview",
  SplitView = "SplitView",
}

export enum SelectedSectionType {
  Notes = "Notes",
  Today = "Today",
  Todo = "Todo",
  Tagged = "Tagged",
  Untagged = "Untagged",
  Directory = "Directory",
  Tag = "Tag",
  Conflicted = "Conflicted",
  Encrypted = "Encrypted",
  Wiki = "Wiki",
  Attachments = "Attachments",
}

export interface SelectedSection {
  type: SelectedSectionType;
  path?: string;
}

export enum OrderBy {
  CreatedAt = "CreatedAt",
  ModifiedAt = "ModifiedAt",
  Title = "Title",
}

export enum OrderDirection {
  ASC = "ASC",
  DESC = "DESC",
}

export enum HomeSection {
  Notebooks = "Notebooks",
  Explore = "Explore",
  Settings = "Settings",
  Notifications = "Notifications",
  Privacy = "Privacy",
  Unknown = "Unknown",
}

/**
 * The note to open
 */
export interface PendingNote {
  notebookID?: string;
  repo?: string;
  branch?: string;
  filePath: string;
}

interface InitialState {
  crossnote: Crossnote;
}

function useCrossnoteContainer(initialState: InitialState) {
  const { t } = useTranslation();
  const crossnote = initialState.crossnote;
  const [initialized, setInitialized] = useState<boolean>(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook>(null);
  const [notebookNotes, setNotebookNotes] = useState<Note[]>([]);
  const [notebookDirectories, setNotebookDirectories] = useState<Directory>({
    name: ".",
    path: ".",
    children: [],
  });
  const [notebookTagNode, setNotebookTagNode] = useState<TagNode>({
    name: ".",
    path: ".",
    children: [],
  });
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment>(
    null,
  );
  const [includeSubdirectories, setIncludeSubdirectories] = useState<boolean>(
    true,
  );
  const [selectedSection, setSelectedSection] = useState<SelectedSection>({
    type: SelectedSectionType.Notes,
  }); // $notes | $todau | $todo | real directory
  const [isAddingNotebook, setIsAddingNotebook] = useState<boolean>(false);
  const [isPushingNotebook, setIsPushingNotebook] = useState<boolean>(false);
  const [isPullingNotebook, setIsPullingNotebook] = useState<boolean>(false);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState<boolean>(
    false,
  );
  const [displayMobileEditor, setDisplayMobileEditor] = useState<boolean>(
    false,
  ); // For mobile device without any initial data, set to `true` will create empty white page.
  const [displayAttachmentEditor, setDisplayAttachmentEditor] = useState<
    boolean
  >(false);
  const [needsToRefreshNotes, setNeedsToRefreshNotes] = useState<boolean>(
    false,
  );
  const [wikiTOCElement, setWikiTOCElement] = useState<HTMLElement>(null);
  const [isLoadingNotebook, setIsLoadingNotebook] = useState<boolean>(false);
  const [hasSummaryMD, setHasSummaryMD] = useState<boolean>(false);
  const [orderBy, setOrderBy] = useState<OrderBy>(OrderBy.ModifiedAt);
  const [orderDirection, setOrderDirection] = useState<OrderDirection>(
    OrderDirection.DESC,
  );
  const [editorMode, setEditorMode] = useState<EditorMode>(EditorMode.Preview);
  const [pendingNote, setPendingNote] = useState<PendingNote>(null);
  const [isPerformingAutoFetch, setIsPerformingAutoFetch] = useState<boolean>(
    false,
  );
  const [homeSection, setHomeSection] = useState<HomeSection>(
    HomeSection.Unknown,
  );

  const _setSelectedNote = useCallback(
    (note: Note) => {
      setSelectedNote(note);
      const notebook = note.notebook;
      if (notebook.gitURL) {
        browserHistory.push(
          `/?repo=${encodeURIComponent(
            notebook.gitURL,
          )}&branch=${encodeURIComponent(
            notebook.gitBranch || "master",
          )}&filePath=${encodeURIComponent(note.filePath)}`,
        );
      } else {
        browserHistory.push(
          `/?notebookID=${notebook._id}&filePath=${encodeURIComponent(
            note.filePath,
          )}`,
        );
      }
    },
    [setSelectedNote],
  );

  const updateNoteMarkdown = useCallback(
    (
      note: Note,
      markdown: string,
      password?: string,
      callback?: (status: string) => void,
    ) => {
      crossnote
        .writeNote(
          note.notebook,
          note.filePath,
          markdown,
          note.config,
          password,
        )
        .then((noteConfig) => {
          note.config = noteConfig;
          note.markdown = markdown;
          if (callback) {
            crossnote.getStatus(note.notebook, note.filePath).then((status) => {
              callback(status);
            });
          }
          // QUESTION: Seems like every time cloudContainer refetches the viewer, the note card that got modified will be refreshed. I don't know why
          // QUESTION: Don't disable it actually if cloudContainer has no token set and no viewer were fetched.
          setNeedsToRefreshNotes(true);
        });
    },
    [crossnote],
  );

  const deleteNote = useCallback(
    async (note: Note) => {
      await crossnote.deleteNote(selectedNotebook, note.filePath);
      setNotebookNotes((notes) => {
        const newNotes = notes.filter((n) => n.filePath !== note.filePath);
        if (newNotes.length !== notes.length) {
          setSelectedNote(null);
        }

        crossnote
          .getNotebookDirectoriesFromNotes(newNotes)
          .then((directories) => {
            setNotebookDirectories(directories);
          });

        crossnote
          .hasSummaryMD(selectedNotebook)
          .then((exists) => setHasSummaryMD(exists));

        setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(newNotes));
        return newNotes;
      });
      setSelectedNote(null);
      setDisplayMobileEditor(false);
    },
    [crossnote, selectedNotebook],
  );

  const changeNoteFilePath = useCallback(
    (note: Note, newFilePath: string) => {
      (async () => {
        try {
          await crossnote.changeNoteFilePath(
            selectedNotebook,
            note,
            newFilePath,
          );
          const newNotes = notebookNotes.map((n) => {
            if (n.filePath === note.filePath) {
              n.filePath = newFilePath;
              n.config.modifiedAt = new Date();
              return n;
            } else {
              return n;
            }
          });
          setNotebookNotes(newNotes);
          setNotebookDirectories(
            await crossnote.getNotebookDirectoriesFromNotes(newNotes),
          );
          setHasSummaryMD(await crossnote.hasSummaryMD(selectedNotebook));
          setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(newNotes));
        } catch (error) {
          new Noty({
            type: "error",
            text: t("error/failed-to-change-file-path"),
            layout: "topRight",
            theme: "relax",
            timeout: 5000,
          }).show();
        }
      })();
    },
    [selectedNotebook, notebookNotes, crossnote],
  );

  const renameDirectory = useCallback(
    async (oldDirName: string, newDirName: string) => {
      newDirName = newDirName
        .replace(/^\/+/, "")
        .replace(/^\.+\/+/, "")
        .replace(/\/+$/, "");
      if (oldDirName === newDirName) {
        return;
      }
      await crossnote.renameDirectory(selectedNotebook, oldDirName, newDirName);
      const newNotes = notebookNotes.map((n) => {
        if (n.filePath.startsWith(oldDirName + "/")) {
          if (newDirName.length > 0) {
            n.filePath = n.filePath.replace(oldDirName, newDirName);
          } else {
            n.filePath = path.basename(n.filePath);
          }
        }
        return n;
      });
      setNotebookNotes(newNotes);
      setNotebookDirectories(
        await crossnote.getNotebookDirectoriesFromNotes(newNotes),
      );
      if (newDirName.length) {
        setSelectedSection({
          type: SelectedSectionType.Directory,
          path: newDirName,
        });
      } else {
        setSelectedSection({
          type: SelectedSectionType.Notes,
        });
      }
    },
    [selectedNotebook, notebookNotes, crossnote],
  );

  const deleteDirectory = useCallback(
    async (dirName: string) => {
      await crossnote.deleteDirectory(selectedNotebook, dirName);
      const newNotes = notebookNotes.filter((n) => {
        return !n.filePath.startsWith(dirName + "/");
      });
      setNotebookNotes(newNotes);
      setNotebookDirectories(
        await crossnote.getNotebookDirectoriesFromNotes(newNotes),
      );
      setSelectedSection({
        type: SelectedSectionType.Notes,
      });
      _setSelectedNote(newNotes[0]);
    },
    [selectedNotebook, notebookNotes, _setSelectedNote, crossnote],
  );

  const renameTag = useCallback(
    async (oldTagName: string, newTagName: string) => {
      newTagName = sanitizeTag(newTagName);
      const newNotes: Note[] = [];
      const promises = [];
      for (let i = 0; i < notebookNotes.length; i++) {
        const note = notebookNotes[i];
        let modified = false;
        const tags = (note.config.tags || [])
          .map((tag) => {
            if ((tag + "/").startsWith(oldTagName + "/")) {
              tag =
                newTagName +
                "/" +
                tag.slice(oldTagName.length).replace(/^\/+/, "");
              modified = true;
            }
            return tag.replace(/^\/+/, "").replace(/\/+$/, "");
          })
          .filter((tag) => tag.length)
          .filter(
            (tag, index, self) => self.findIndex((x) => x === tag) === index,
          );
        if (modified) {
          note.config.tags = tags;
          promises.push(
            crossnote.updateNoteConfig(
              selectedNotebook,
              note.filePath,
              note.config,
            ),
          );
        }
        newNotes.push(note);
      }
      await Promise.all(promises);
      setNotebookNotes(newNotes);
      setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(newNotes));
      if (newTagName.length) {
        setSelectedSection({
          type: SelectedSectionType.Tag,
          path: newTagName,
        });
      } else {
        setSelectedSection({
          type: SelectedSectionType.Notes,
        });
      }
    },
    [selectedNotebook, notebookNotes, crossnote],
  );

  const deleteTag = useCallback(
    async (tagName: string) => {
      const newNotes: Note[] = [];
      const promises = [];
      for (let i = 0; i < notebookNotes.length; i++) {
        const note = notebookNotes[i];
        let modified = false;
        const tags = (note.config.tags || []).filter((tag) => {
          const hasPrefix = (tag + "/").startsWith(tagName + "/");
          modified = modified || hasPrefix;
          return !hasPrefix;
        });
        if (modified) {
          note.config.tags = tags;
          promises.push(
            crossnote.updateNoteConfig(
              selectedNotebook,
              note.filePath,
              note.config,
            ),
          );
        }
        newNotes.push(note);
      }
      await Promise.all(promises);
      setNotebookNotes(newNotes);
      setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(newNotes));
      setSelectedSection({
        type: SelectedSectionType.Notes,
      });
    },
    [selectedNotebook, notebookNotes, crossnote],
  );

  const createNewNote = useCallback(
    async (
      notebook: Notebook,
      fileName: string = "",
      markdown: string = "",
    ) => {
      if (!notebook) {
        return null;
      }
      if (!fileName) {
        fileName = "unnamed_" + randomID();
      }
      if (!fileName.endsWith(".md")) {
        fileName = fileName + ".md";
      }
      let filePath;
      let tags: string[] = [];
      if (
        selectedSection.type === SelectedSectionType.Notes ||
        selectedSection.type === SelectedSectionType.Today ||
        selectedSection.type === SelectedSectionType.Todo ||
        selectedSection.type === SelectedSectionType.Tagged ||
        selectedSection.type === SelectedSectionType.Untagged
      ) {
        filePath = fileName;
      } else if (selectedSection.type === SelectedSectionType.Tag) {
        filePath = fileName;
        tags = [selectedSection.path];
      } else {
        filePath = path.relative(
          notebook.dir,
          path.resolve(notebook.dir, selectedSection.path, fileName),
        );
      }

      const noteConfig: NoteConfig = {
        tags: tags,
        modifiedAt: new Date(),
        createdAt: new Date(),
      };
      await crossnote.writeNote(notebook, filePath, markdown, noteConfig);
      const note: Note = {
        notebook: notebook,
        filePath: filePath,
        markdown,
        config: noteConfig,
      };
      setNotebookNotes((notes) => [note, ...notes]);
      setSelectedNote(note);
      setDisplayMobileEditor(true);
      setEditorMode(EditorMode.VickyMD);
      return note;
    },
    [crossnote, selectedSection],
  );

  const duplicateNote = useCallback(
    async (note: Note) => {
      if (!crossnote) return;
      const duplicatedNote = await crossnote.duplicateNote(
        note.notebook,
        note.filePath,
      );
      setNotebookNotes((notes) => [duplicatedNote, ...notes]);
      setSelectedNote(duplicatedNote);
    },
    [crossnote],
  );

  const _setSelectedNotebook = useCallback(
    (notebook: Notebook) => {
      localStorage.setItem("selectedNotebookID", notebook._id);
      setSelectedNotebook(notebook);
      if (notebook.gitURL) {
        browserHistory.push(
          `/?repo=${encodeURIComponent(
            notebook.gitURL,
          )}&branch=${encodeURIComponent(notebook.gitBranch || "master")}`,
        );
      } else {
        browserHistory.push(`/?notebookID=${notebook._id}`);
      }
    },
    [setSelectedNotebook],
  );

  const addNotebook = useCallback(
    async (
      name: string,
      gitURL: string,
      gitBranch: string,
      gitUsername: string,
      gitPassword: string,
      gitRememberCredentials: boolean,
      gitCorsProxy: string,
    ) => {
      setIsAddingNotebook(true);
      try {
        if (
          gitURL.length &&
          notebooks.find(
            (nb) => nb.gitBranch === gitBranch && nb.gitURL === gitURL,
          )
        ) {
          setIsAddingNotebook(false);
          throw new Error("error/notebook-already-exists");
        }
        const notebook = await crossnote.addNotebook({
          name,
          gitURL,
          branch: gitBranch,
          username: gitUsername,
          password: gitPassword,
          corsProxy: gitCorsProxy,
          rememberCredentials: gitRememberCredentials,
        });
        setNotebooks((notebooks) => [notebook, ...notebooks]);
        _setSelectedNotebook(notebook);
        setIsAddingNotebook(false);
      } catch (error) {
        setIsAddingNotebook(false);
        throw error;
      }
    },
    [crossnote, notebooks, _setSelectedNotebook],
  );

  const updateNotebook = useCallback(
    async (notebook: Notebook) => {
      if (!crossnote) {
        return;
      }
      try {
        await crossnote.updateNotebook(notebook);
        setNotebooks((notebooks) => [...notebooks]);
      } catch (error) {}
    },
    [crossnote],
  );

  const deleteNotebook = useCallback(
    async (notebook: Notebook) => {
      if (!crossnote) {
        return;
      }
      try {
        await crossnote.deleteNotebook(notebook._id);
      } catch (error) {}
      let selectedNotebook: Notebook = null;
      setNotebooks((notebooks) =>
        notebooks.filter((n) => {
          if (!selectedNotebook && n._id !== notebook._id) {
            selectedNotebook = n;
          }
          return n._id !== notebook._id;
        }),
      );
      _setSelectedNotebook(selectedNotebook);
    },
    [crossnote, _setSelectedNotebook],
  );

  const hardResetNotebook = useCallback(
    async (notebook: Notebook) => {
      if (!crossnote) {
        return;
      }
      try {
        await crossnote.hardResetNotebook(notebook, notebook.localSha);

        // TODO: Refactor
        setIsLoadingNotebook(true);
        const notes = await crossnote.listNotes({
          notebook: notebook,
          dir: "./",
          includeSubdirectories: true,
        });
        setSelectedNote(null);
        setNotebookNotes(notes);
        setNotebookDirectories(
          await crossnote.getNotebookDirectoriesFromNotes(notes),
        );
        setHasSummaryMD(await crossnote.hasSummaryMD(notebook));
        setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(notes));
        setIsLoadingNotebook(false);
      } catch (error) {}
    },
    [crossnote],
  );

  const pushNotebook = useCallback(
    async (args: PushNotebookArgs) => {
      if (!crossnote) {
        return;
      }
      setIsPushingNotebook(true);
      try {
        await crossnote.pushNotebook(args);
        setIsPushingNotebook(false);
        // TODO: Refactor. The code below is the same as pullNotebook
        const notes = await crossnote.listNotes({
          notebook: args.notebook,
          dir: "./",
          includeSubdirectories: true,
        });
        setNotebookNotes(notes);
        setNotebookDirectories(
          await crossnote.getNotebookDirectoriesFromNotes(notes),
        );
        setHasSummaryMD(await crossnote.hasSummaryMD(args.notebook));
        setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(notes));

        if (selectedNote) {
          const newNote = notes.find(
            (n) => n.filePath === selectedNote.filePath,
          );
          if (!newNote) {
            setSelectedNote(notes[0]); // TODO: pull might remove currently selectedNote
          } else {
            setSelectedNote(newNote);
          }
        } else {
          setSelectedNote(notes[0]);
        }
        setNeedsToRefreshNotes(true);
      } catch (error) {
        setIsPushingNotebook(false);
        throw error;
      }
    },
    [crossnote, selectedNote],
  );

  const pullNotebook = useCallback(
    async (args: PullNotebookArgs) => {
      if (!crossnote) {
        return;
      }
      setIsPullingNotebook(true);
      try {
        // NOTE: Code here might have bug
        await crossnote.pullNotebook(args);
        setIsPullingNotebook(false);
        const notes = await crossnote.listNotes({
          notebook: args.notebook,
          dir: "./",
          includeSubdirectories: true,
        });
        setNotebookNotes(notes);
        setNotebookDirectories(
          await crossnote.getNotebookDirectoriesFromNotes(notes),
        );
        setHasSummaryMD(await crossnote.hasSummaryMD(args.notebook));
        setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(notes));

        if (selectedNote) {
          const newNote = notes.find(
            (n) => n.filePath === selectedNote.filePath,
          );
          if (!newNote) {
            setSelectedNote(notes[0]); // TODO: pull might remove currently selectedNote
          } else {
            setSelectedNote(newNote);
          }
        } else {
          setSelectedNote(notes[0]);
        }
        setNeedsToRefreshNotes(true);
      } catch (error) {
        setIsPullingNotebook(false);
        throw error;
      }
    },
    [crossnote, selectedNote],
  );

  const checkoutNote = useCallback(
    async (note: Note) => {
      if (!crossnote) {
        return;
      }
      const newNote = await crossnote.checkoutNote(note);
      if (newNote) {
        setNotebookNotes((notes) =>
          notes.map((n) => {
            if (n.filePath === newNote.filePath) {
              return newNote;
            } else {
              return n;
            }
          }),
        );
        setNotes((notes) =>
          notes.map((n) => {
            if (n.filePath === newNote.filePath) {
              return newNote;
            } else {
              return n;
            }
          }),
        );
        setSelectedNote(newNote);
      } else {
        // The note is deleted after checkout
        setNotebookNotes((notes) => {
          const newNotes = notes.filter((n) => n.filePath !== note.filePath);
          crossnote
            .getNotebookDirectoriesFromNotes(newNotes)
            .then((directories) => {
              setNotebookDirectories(directories);
            });
          crossnote
            .hasSummaryMD(selectedNotebook)
            .then((exists) => setHasSummaryMD(exists));
          setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(newNotes));
          return newNotes;
        });
        setNotes((notes) => {
          const newNotes = notes.filter((n) => n.filePath !== note.filePath);
          setSelectedNote(newNotes[0]);
          return newNotes;
        });
      }
    },
    [crossnote, selectedNotebook],
  );

  const updateNotebookTagNode = useCallback(() => {
    if (!crossnote) return;
    setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(notebookNotes));
  }, [notebookNotes, crossnote]);

  const getNote = useCallback(
    async (notebook: Notebook, filePath: string) => {
      if (!crossnote) {
        return;
      }
      return await crossnote.getNote(notebook, filePath);
    },
    [crossnote],
  );

  const openNoteAtPath = useCallback(
    (filePath: string) => {
      if (!crossnote) return;

      if (!filePath.endsWith(".md")) {
        filePath += ".md";
      }

      const note = notebookNotes.find((n) => n.filePath === filePath);
      if (note) {
        _setSelectedNote(note);
      } else {
        createNewNote(
          selectedNotebook,
          filePath,
          "# " + path.basename(filePath).replace(/\.md$/, ""),
        );
      }
    },
    [
      crossnote,
      notebookNotes,
      selectedNotebook,
      _setSelectedNote,
      createNewNote,
    ],
  );

  const loadAttachments = useCallback(async () => {
    setIsLoadingAttachments(true);
    const attachments = crossnote.listAttachments({
      notebook: selectedNotebook,
      dir: "./",
      includeSubdirectories: true,
    });
    setIsLoadingAttachments(false);
    return attachments;
  }, [crossnote, selectedNotebook]);

  useEffect(() => {
    if (!crossnote || initialized) {
      return;
    }

    (async () => {
      const notebooks = await crossnote.listNotebooks();
      let notebook: Notebook = null;
      if (notebooks.length) {
        setNotebooks(notebooks);
        const selectedNotebookID = localStorage.getItem("selectedNotebookID");
        notebook = notebooks.find((n) => n._id === selectedNotebookID);
        if (!notebook) {
          notebook = notebooks[0];
        }
        setSelectedNotebook(notebook); // TODO: <= default selected
        setInitialized(true);
      } else {
        /*
        notebook = await crossnote.cloneNotebook({
          corsProxy: "https://crossnote.app/cors/",
          gitURL: "https://github.com/0xGG/crossnote-doc.git"
        });
        */
        notebook = await crossnote.addNotebook({
          name: "Drafts",
          corsProxy: "https://crossnote.app/cors/",
          gitURL: "",
        });
        await pfs.writeFile(
          path.resolve(notebook.dir, "README.md"),
          `# Welcome to Crossnote 😊

If you want to know more about this project,  
please download and read the [Welcome notebook](https://crossnote.app/?repo=https%3A%2F%2Fgithub.com%2F0xGG%2Fwelcome-notebook.git&branch=master&filePath=README.md).

Please also check the [Explore](https://crossnote.app/explore) section to discover the public notebooks shared by other users ;)
`,
        );
        setNotebooks([notebook]);
        setSelectedNotebook(notebook);
        setInitialized(true);
        // TODO: create empty note and add `We suggest you to add [Welcome to crossnote]() notebook ;)`
      }
    })();
  }, [crossnote, initialized]);

  useEffect(() => {
    if (!crossnote) {
      return;
    }
    (async () => {
      setIsLoadingNotebook(true);
      setNotebookNotes([]);
      setNotebookDirectories({
        name: ".",
        path: ".",
        children: [],
      });
      setHasSummaryMD(false);
      setNotebookTagNode({
        name: ".",
        path: ".",
        children: [],
      });

      const notes = await crossnote.listNotes({
        notebook: selectedNotebook,
        dir: "./",
        includeSubdirectories: true,
      });
      setSelectedNote(null);
      setNotebookNotes(notes);
      setNotebookDirectories(
        await crossnote.getNotebookDirectoriesFromNotes(notes),
      );
      setHasSummaryMD(await crossnote.hasSummaryMD(selectedNotebook));
      setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(notes));
      setIsLoadingNotebook(false);
    })();
  }, [crossnote, selectedNotebook]);

  useEffect(() => {
    if (crossnote && selectedNotebook) {
      setSelectedSection({ type: SelectedSectionType.Notes });
    }
  }, [crossnote, selectedNotebook]);

  useEffect(() => {
    if (crossnote && selectedNotebook && notebookNotes) {
      if (
        notebookNotes.length &&
        notebookNotes[0].notebook._id !== selectedNotebook._id
      ) {
        return;
      }

      let notes: Note[] = [];
      if (selectedSection.type === SelectedSectionType.Notes) {
        notes = [...notebookNotes];
      } else if (selectedSection.type === SelectedSectionType.Todo) {
        notes = notebookNotes.filter((note) =>
          note.markdown.match(/(\*|-|\d+\.)\s\[(\s+|x|X)\]\s/gm),
        );
      } else if (selectedSection.type === SelectedSectionType.Today) {
        notes = notebookNotes.filter(
          (note) => Date.now() - note.config.modifiedAt.getTime() <= OneDay,
        );
      } else if (selectedSection.type === SelectedSectionType.Tagged) {
        notes = notebookNotes.filter((note) => note.config.tags.length > 0);
      } else if (selectedSection.type === SelectedSectionType.Untagged) {
        notes = notebookNotes.filter((note) => note.config.tags.length === 0);
      } else if (selectedSection.type === SelectedSectionType.Tag) {
        notes = notebookNotes.filter((note) => {
          const tags = note.config.tags;
          return tags.find(
            (tag) =>
              (tag.toLocaleLowerCase() + "/").indexOf(
                selectedSection.path + "/",
              ) === 0,
          );
        });
      } else if (selectedSection.type === SelectedSectionType.Conflicted) {
        notes = notebookNotes.filter((note) => {
          return crossnote.markdownHasConflicts(note.markdown);
        });
      } else if (selectedSection.type === SelectedSectionType.Encrypted) {
        notes = notebookNotes.filter((note) => {
          return note.config.encryption;
        });
      } else if (selectedSection.type === SelectedSectionType.Wiki) {
        // Do nothing here
      } else {
        // SelectedSectionType.Directory
        if (includeSubdirectories) {
          notes = notebookNotes.filter(
            (note) => note.filePath.indexOf(selectedSection.path + "/") === 0,
          );
        } else {
          notes = notebookNotes.filter(
            (note) => path.dirname(note.filePath) === selectedSection.path,
          );
        }
      }

      if (orderBy === OrderBy.ModifiedAt) {
        if (orderDirection === OrderDirection.DESC) {
          notes.sort(
            (a, b) =>
              b.config.modifiedAt.getTime() - a.config.modifiedAt.getTime(),
          );
        } else {
          notes.sort(
            (a, b) =>
              a.config.modifiedAt.getTime() - b.config.modifiedAt.getTime(),
          );
        }
      } else if (orderBy === OrderBy.CreatedAt) {
        if (orderDirection === OrderDirection.DESC) {
          notes.sort(
            (a, b) =>
              b.config.createdAt.getTime() - a.config.createdAt.getTime(),
          );
        } else {
          notes.sort(
            (a, b) =>
              a.config.createdAt.getTime() - b.config.createdAt.getTime(),
          );
        }
      } else if (orderBy === OrderBy.Title) {
        if (orderDirection === OrderDirection.DESC) {
          notes.sort((a, b) =>
            (
              (b.config.encryption && b.config.encryption.title) ||
              getHeaderFromMarkdown(b.markdown)
            ).localeCompare(
              (a.config.encryption && a.config.encryption.title) ||
                getHeaderFromMarkdown(a.markdown),
            ),
          );
        } else {
          notes.sort((a, b) =>
            (
              (a.config.encryption && a.config.encryption.title) ||
              getHeaderFromMarkdown(a.markdown)
            ).localeCompare(
              (b.config.encryption && b.config.encryption.title) ||
                getHeaderFromMarkdown(b.markdown),
            ),
          );
        }
      }

      setNotes(notes);
    }
  }, [
    selectedSection,
    crossnote,
    selectedNotebook,
    includeSubdirectories,
    notebookNotes,
    orderBy,
    orderDirection,
  ]);

  useEffect(() => {
    if (
      notes.length &&
      !selectedNote &&
      !pendingNote &&
      homeSection === HomeSection.Notebooks
    ) {
      _setSelectedNote(notes[0]);
    }
  }, [notes, selectedNote, pendingNote, _setSelectedNote, homeSection]);

  useEffect(() => {
    if (selectedNote) {
      if (selectedNote.markdown.length) {
        setEditorMode(EditorMode.Preview);
      } else {
        setEditorMode(EditorMode.VickyMD);
      }
    } else {
      setEditorMode(EditorMode.Preview);
    }
  }, [selectedNote]);

  // Find and select the pending note
  useEffect(() => {
    if (!pendingNote || !initialized || isLoadingNotebook) {
      return;
    }
    if (selectedNote && selectedNote.filePath === pendingNote.filePath) {
      setPendingNote(null);
      return;
    }

    // TODO: Also check if the notebook matches
    const note = notebookNotes.find((n) => n.filePath === pendingNote.filePath);
    if (note) {
      setSelectedNote(note);
    }
    setPendingNote(null); // note doesn't exist
  }, [
    initialized,
    isLoadingNotebook,
    pendingNote,
    selectedNote,
    notebookNotes,
  ]);

  // TODO: This script should be moved to background (serviceWorker?)
  useInterval(async () => {
    if (isPerformingAutoFetch) {
      return;
    }
    setIsPerformingAutoFetch(true);
    for (let i = 0; i < notebooks.length; i++) {
      const notebook = notebooks[i];
      if (
        notebook.autoFetchPeriod >= 1000 &&
        Date.now() - notebook.fetchedAt.getTime() >= notebook.autoFetchPeriod &&
        notebook.gitURL.length > 0 &&
        notebook.localSha === notebook.remoteSha
      ) {
        // TODO:  Run tasks in parallel instead of running one by one
        try {
          const changed = await crossnote.fetchNotebook({ notebook });
          if (changed) {
            setNeedsToRefreshNotes(true);
          }
        } catch (error) {
          console.log(error);
        }
      }
    }
    setIsPerformingAutoFetch(false);
  }, 60000); // Check every 1 minute

  return {
    crossnote,
    initialized,
    notebooks,
    selectedNotebook,
    setSelectedNotebook: _setSelectedNotebook,
    notes,
    selectedNote,
    setSelectedNote: _setSelectedNote,
    selectedAttachment,
    setSelectedAttachment,
    updateNoteMarkdown,
    createNewNote,
    selectedSection,
    setSelectedSection,
    includeSubdirectories,
    setIncludeSubdirectories,
    deleteNote,
    changeNoteFilePath,
    renameDirectory,
    deleteDirectory,
    renameTag,
    deleteTag,
    duplicateNote,
    notebookDirectories,
    notebookTagNode,
    addNotebook,
    isAddingNotebook,
    isPushingNotebook,
    isPullingNotebook,
    isLoadingAttachments,
    updateNotebook,
    deleteNotebook,
    hardResetNotebook,
    pushNotebook,
    pullNotebook,
    checkoutNote,
    displayMobileEditor,
    setDisplayMobileEditor,
    displayAttachmentEditor,
    setDisplayAttachmentEditor,
    updateNotebookTagNode,
    getNote,
    isLoadingNotebook,
    openNoteAtPath,
    loadAttachments,
    orderBy,
    setOrderBy,
    orderDirection,
    setOrderDirection,
    hasSummaryMD,
    wikiTOCElement,
    setWikiTOCElement,
    editorMode,
    setEditorMode,
    setPendingNote,
    needsToRefreshNotes,
    setNeedsToRefreshNotes,
    homeSection,
    setHomeSection,
  };
}

export const CrossnoteContainer = createContainer(useCrossnoteContainer);
