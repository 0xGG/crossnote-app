import useInterval from "@use-it/interval";
import FlexLayout, {
  Actions,
  DockLocation,
  Model,
  TabNode,
  TabSetNode,
} from "flexlayout-react";
import moment from "moment";
import * as path from "path";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createContainer } from "unstated-next";
import Crossnote, {
  PullNotebookArgs,
  PushNotebookArgs,
} from "../lib/crossnote";
import { EventType, globalEmitter } from "../lib/event";
import { pfs } from "../lib/fs";
import { Note, Notebook, NoteConfig } from "../lib/notebook";
import { CrossnoteTabNode, TabHeight } from "../lib/tabNode";
import { getTodayName } from "../utilities/utils";

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
  const [isAddingNotebook, setIsAddingNotebook] = useState<boolean>(false);
  const [isPushingNotebook, setIsPushingNotebook] = useState<boolean>(false);
  const [isPullingNotebook, setIsPullingNotebook] = useState<boolean>(false);
  const [needsToRefreshNotes, setNeedsToRefreshNotes] = useState<boolean>(
    false,
  );
  const [isLoadingNotebook, setIsLoadingNotebook] = useState<boolean>(false);
  const [isPerformingAutoFetch, setIsPerformingAutoFetch] = useState<boolean>(
    false,
  );
  const [homeSection, setHomeSection] = useState<HomeSection>(
    HomeSection.Unknown,
  );
  const [layoutModel, setLayoutModel] = useState<Model>(
    FlexLayout.Model.fromJson({
      global: {
        splitterSize: 4,
        tabSetEnableMaximize: false,
        tabSetHeaderHeight: TabHeight,
        tabSetTabStripHeight: TabHeight,
      },
      borders: [],
      layout: {
        type: "row",
        weight: 100,
        children: [
          {
            type: "tabset",
            weight: 50,
            selected: 0,
            children: [],
          },
        ],
      },
    }),
  );

  const getNotebookAtPath = useCallback(
    (notebookPath: string) => {
      return notebooks.find((x) => x.dir === notebookPath);
    },
    [notebooks],
  );

  const addTabNode = useCallback(
    (tabNode: CrossnoteTabNode) => {
      if (!layoutModel) {
        return;
      }
      let activeTabset: TabSetNode = layoutModel.getActiveTabset();
      if (!activeTabset) {
        const modelChildren = layoutModel.getRoot().getChildren();
        let needsToCreateNewTabSet = true;
        if (modelChildren.length) {
          modelChildren.forEach((child) => {
            if (child.getType() === "tabset") {
              needsToCreateNewTabSet = false;
              layoutModel.doAction(Actions.setActiveTabset(child.getId()));
            }
          });
        }

        if (needsToCreateNewTabSet) {
          activeTabset = new FlexLayout.TabSetNode();
          (layoutModel.getRoot() as any)._addChild(activeTabset);
          layoutModel.doAction(Actions.setActiveTabset(activeTabset.getId()));
        }
      }

      if (tabNode.config.singleton) {
        const node = layoutModel.getNodeById(tabNode.id);
        if (node) {
          return layoutModel.doAction(Actions.selectTab(node.getId()));
        }
      }
      if (tabNode.component === "Note") {
        const note = tabNode.config.note;
        const tabs = activeTabset.getChildren();
        for (let i = 0; i < tabs.length; i++) {
          const eTabNode: any = tabs[i];
          const eNote: Note = eTabNode._attributes.config.note;
          if (
            eNote &&
            note &&
            eNote.notebookPath === note.notebookPath &&
            eNote.filePath === note.filePath
          ) {
            return layoutModel.doAction(Actions.selectTab(eTabNode.getId()));
          }
        }
      }
      layoutModel.doAction(
        Actions.addNode(tabNode, activeTabset.getId(), DockLocation.CENTER, 0),
      );
    },
    [layoutModel],
  );

  const closeTabNode = useCallback(
    (id: string) => {
      if (!layoutModel) {
        return;
      }
      layoutModel.doAction(Actions.deleteTab(id));
    },
    [layoutModel],
  );

  const updateNoteMarkdown = useCallback(
    async (
      tabNode: TabNode,
      notebookPath: string,
      filePath: string,
      markdown: string,
    ) => {
      const notebook = getNotebookAtPath(notebookPath);
      const note = await notebook.getNote(filePath);
      if (!notebook) {
        return;
      }
      if (note.markdown !== markdown) {
        const newNote = await notebook.writeNote(
          note.filePath,
          markdown,
          note.config,
        );
        globalEmitter.emit(EventType.ModifiedMarkdown, {
          tabId: tabNode.getId(),
          markdown: newNote.markdown,
          notebookPath: note.notebookPath,
          noteFilePath: note.filePath,
          noteConfig: newNote.config,
        });
        /*
          if (newNote !== note) {
            console.log("new note created");
          }
          */
      }
    },
    [getNotebookAtPath],
  );

  const updateNoteConfig = useCallback(
    async (
      tabNode: TabNode,
      notebookPath: string,
      filePath: string,
      noteConfig: NoteConfig,
    ) => {
      const notebook = getNotebookAtPath(notebookPath);
      if (!notebook) {
        return;
      }
      const note = await notebook.getNote(filePath);
      if (JSON.stringify(note.config) !== JSON.stringify(noteConfig)) {
        console.log("updateNoteConfig 2: ", noteConfig);
        const newNote = await notebook.writeNote(
          note.filePath,
          note.markdown,
          noteConfig,
        );
        globalEmitter.emit(EventType.ModifiedMarkdown, {
          tabId: tabNode.getId(),
          markdown: newNote.markdown,
          notebookPath: note.notebookPath,
          noteFilePath: note.filePath,
          noteConfig: newNote.config,
        });
      }
    },
    [getNotebookAtPath],
  );

  const deleteNote = useCallback(
    async (tabNode: TabNode, notebookPath: string, noteFilePath: string) => {
      const notebook = getNotebookAtPath(notebookPath);
      if (!notebook) {
        return;
      }
      await notebook.deleteNote(noteFilePath);
      globalEmitter.emit(EventType.DeletedNote, {
        tabId: tabNode.getId(),
        notebookPath: notebookPath,
        noteFilePath: noteFilePath,
      });
    },
    [getNotebookAtPath],
  );

  const changeNoteFilePath = useCallback(
    async (tabNode: TabNode, note: Note, newFilePath: string) => {
      const notebook = notebooks.find((x) => x.dir === note.notebookPath);
      if (notebook) {
        const oldNoteFilePath = note.filePath;
        const newNote = await notebook.changeNoteFilePath(
          oldNoteFilePath,
          newFilePath,
        );
        globalEmitter.emit(EventType.ChangedNoteFilePath, {
          tabId: tabNode.getId(),
          notebookPath: note.notebookPath,
          oldNoteFilePath: oldNoteFilePath,
          newNoteFilePath: newFilePath,
        });
        return newNote;
      } else {
        throw new Error("Notebook " + note.notebookPath + " not found");
      }
    },
    [notebooks],
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
        let today = moment().format("YYYY-MM-DD"); // TODO: Allow user to customize this
        let untitled = t("general/Untitled");

        let foundToday = false;
        let count = 0;
        for (let key in notebook.notes) {
          const note = notebook.notes[key];
          if (note.title === today) {
            foundToday = true;
          }
          if (note.title.startsWith(untitled)) {
            count++;
          }
        }
        if (foundToday) {
          if (count === 0) {
            fileName = `${untitled}.md`;
          } else {
            fileName = `${untitled} ${count}.md`;
          }
        } else {
          fileName = `${today}.md`;
        }
      }
      if (!fileName.endsWith(".md")) {
        fileName = fileName + ".md";
      }
      let filePath = path.relative(
        notebook.dir,
        path.resolve(notebook.dir, fileName),
      );

      const noteConfig: NoteConfig = {
        modifiedAt: new Date(),
        createdAt: new Date(),
      };
      return await notebook.writeNote(filePath, markdown, noteConfig);
    },
    [t],
  );

  const openNoteAtPath = useCallback(
    async (notebook: Notebook, filePath: string) => {
      if (!filePath.endsWith(".md")) {
        filePath += ".md";
      }
      let note: Note;
      if (filePath in notebook.notes) {
        note = notebook.notes[filePath];
      } else {
        note = await createNewNote(notebook, filePath, "");
      }
      addTabNode({
        type: "tab",
        component: "Note",
        name: `📝 ` + note.title,
        config: {
          singleton: false,
          note,
        },
      });
    },
    [createNewNote, addTabNode],
  );

  const openTodayNote = useCallback(
    (notebook: Notebook) => {
      const today = getTodayName();
      return openNoteAtPath(notebook, `${today}.md`);
    },
    [openNoteAtPath],
  );

  const duplicateNote = useCallback(
    async (note: Note) => {
      /*
      if (!crossnote) return;
      const duplicatedNote = await crossnote.duplicateNote(
        note.notebook,
        note.filePath,
      );
      setNotebookNotes((notes) => [duplicatedNote, ...notes]);
      setSelectedNote(duplicatedNote);
      */
    },
    [crossnote],
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
          throw new Error(t("error/notebook-already-exists"));
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
        setIsAddingNotebook(false);
      } catch (error) {
        setIsAddingNotebook(false);
        throw error;
      }
    },
    [crossnote, notebooks, t],
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
    },
    [crossnote],
  );

  const hardResetNotebook = useCallback(
    async (notebook: Notebook) => {
      if (!crossnote) {
        return;
      }
      try {
        await crossnote.hardResetNotebook(notebook, notebook.localSha);
        setIsLoadingNotebook(true);
        await notebook.refreshNotes({ dir: "./", includeSubdirectories: true });
        globalEmitter.emit(EventType.PerformedGitOperation, {
          notebookPath: notebook.dir,
        });
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
        await args.notebook.refreshNotes({
          dir: "./",
          includeSubdirectories: true,
        });
        globalEmitter.emit(EventType.PerformedGitOperation, {
          notebookPath: args.notebook.dir,
        });
        setIsPushingNotebook(false);
        setNeedsToRefreshNotes(true);
      } catch (error) {
        setIsPushingNotebook(false);
        throw error;
      }
    },
    [crossnote],
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
        await args.notebook.refreshNotes({
          dir: "./",
          includeSubdirectories: true,
        });
        globalEmitter.emit(EventType.PerformedGitOperation, {
          notebookPath: args.notebook.dir,
        });
        setIsPullingNotebook(false);
        setNeedsToRefreshNotes(true);
      } catch (error) {
        setIsPullingNotebook(false);
        throw error;
      }
    },
    [crossnote],
  );

  const checkoutNote = useCallback(
    async (note: Note) => {
      const notebook = getNotebookAtPath(note.notebookPath);
      if (!notebook) {
        return;
      }
      const newNote = await notebook.checkoutNote(note);
      await notebook.refreshNotes({
        dir: "./",
        includeSubdirectories: true,
      });
      globalEmitter.emit(EventType.PerformedGitOperation, {
        notebookPath: note.notebookPath,
      });
      return newNote;
    },
    [getNotebookAtPath],
  );

  const getNote = useCallback(
    async (notebookPath: string, filePath: string) => {
      const notebook = getNotebookAtPath(notebookPath);
      if (!notebook) {
        return;
      }
      return await notebook.getNote(filePath);
    },
    [getNotebookAtPath],
  );

  const togglePin = useCallback(
    async (tabNode: TabNode, notebookPath: string, noteFilePath: string) => {
      const notebook = getNotebookAtPath(notebookPath);
      if (!notebook) {
        return;
      }
      const note = await notebook.getNote(noteFilePath);
      const newConfig = Object.assign({}, note.config, {
        pinned: !note.config.pinned,
      });
      if (!newConfig.pinned) {
        delete newConfig.pinned;
      }
      await updateNoteConfig(tabNode, notebookPath, noteFilePath, newConfig);
    },
    [getNotebookAtPath, updateNoteConfig],
  );

  const toggleFavorite = useCallback(
    async (tabNode: TabNode, notebookPath: string, noteFilePath: string) => {
      const notebook = getNotebookAtPath(notebookPath);
      if (!notebook) {
        return;
      }
      const note = await notebook.getNote(noteFilePath);
      const newConfig = Object.assign({}, note.config, {
        favorited: !note.config.favorited,
      });
      if (!newConfig.favorited) {
        delete newConfig.favorited;
      }
      await updateNoteConfig(tabNode, notebookPath, noteFilePath, newConfig);
    },
    [getNotebookAtPath, updateNoteConfig],
  );

  useEffect(() => {
    if (!crossnote || initialized) {
      return;
    }

    (async () => {
      console.log("start listNotebooks");
      const notebooks = await crossnote.listNotebooks();
      console.log("end listNotebooks");
      let notebook: Notebook = null;
      if (notebooks.length) {
        setNotebooks(notebooks);
        const selectedNotebookID = localStorage.getItem("selectedNotebookID");
        notebook = notebooks.find((n) => n._id === selectedNotebookID);
        if (!notebook) {
          notebook = notebooks[0];
        }
        setInitialized(true);
        console.log("selectedNotebook: ", notebook);
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
      /*
      await selectedNotebook.refreshNotes({
        dir: "./",
        includeSubdirectories: true,
      });
      console.log("end loading notes: ", selectedNotebook);
      */
      setIsLoadingNotebook(false);
    })();
  }, [crossnote]);

  /*
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
          notes.sort((a, b) => b.title.localeCompare(a.title));
        } else {
          notes.sort((a, b) => a.title.localeCompare(b.title));
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
  */

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
    updateNoteMarkdown,
    updateNoteConfig,
    createNewNote,
    deleteNote,
    changeNoteFilePath,
    duplicateNote,
    addNotebook,
    togglePin,
    toggleFavorite,
    isAddingNotebook,
    isPushingNotebook,
    isPullingNotebook,
    updateNotebook,
    deleteNotebook,
    hardResetNotebook,
    pushNotebook,
    pullNotebook,
    checkoutNote,
    getNote,
    isLoadingNotebook,
    openNoteAtPath,
    openTodayNote,
    needsToRefreshNotes,
    setNeedsToRefreshNotes,
    homeSection,
    setHomeSection,
    layoutModel,
    setLayoutModel,
    addTabNode,
    closeTabNode,
    getNotebookAtPath,
  };
}

export const CrossnoteContainer = createContainer(useCrossnoteContainer);
