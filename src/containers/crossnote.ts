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
import { Note, NoteConfig } from "../lib/note";
import { Notebook } from "../lib/notebook";
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
        tabEnableRename: false,
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
        } else {
          activeTabset = layoutModel.getActiveTabset();
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
            layoutModel.doAction(Actions.selectTab(eTabNode.getId()));
            layoutModel.doAction(
              Actions.updateNodeAttributes(eTabNode.getId(), {
                config: tabNode.config,
              }),
            );
            return;
          }
        }
      }
      if (!activeTabset) {
        return;
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
      await notebook.refreshNotes({
        dir: "./",
        includeSubdirectories: true,
      });
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
      // This is necessary to guarantee that an existing note will not be overwritten before the notebook is fully loaded
      await notebook.refreshNotesIfNotLoaded({
        dir: "./",
        includeSubdirectories: true,
      });

      let autoGeneratedFileName = !fileName;
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
      let note = await notebook.writeNote(filePath, markdown, noteConfig);
      if (!autoGeneratedFileName) {
        await notebook.refreshNotes({
          dir: "./",
          includeSubdirectories: true,
        });
      }
      note = await notebook.getNote(filePath);
      globalEmitter.emit(EventType.CreatedNote, {
        notebookPath: notebook.dir,
      });
      return note;
    },
    [t],
  );

  const openNoteAtPath = useCallback(
    async (notebook: Notebook, filePath: string) => {
      if (!filePath.endsWith(".md")) {
        filePath += ".md";
      }
      // This is necessary to guarantee that an existing note will not be overwritten before the notebook is fully loaded
      await notebook.refreshNotesIfNotLoaded({
        dir: "./",
        includeSubdirectories: true,
      });
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
          notebook,
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

  const openLocalNotebook = useCallback(async () => {
    const directoryHandle = await window.showDirectoryPicker();
    (window as any)["directoryHandle"] = directoryHandle;
    const notebook = await crossnote.addNotebook({
      name: directoryHandle.name,
      gitURL: "",
      directoryHandle,
    });
    setNotebooks((notebooks) => [notebook, ...notebooks]);
  }, [crossnote]);

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
        globalEmitter.emit(EventType.DeletedNotebook, {
          notebookPath: notebook.dir,
        });
        await crossnote.deleteNotebook(notebook._id);
      } catch (error) {
        console.error(error);
      }
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

  const refreshNotebook = useCallback(
    async (notebook: Notebook) => {
      if (!crossnote) {
        return;
      }
      setIsLoadingNotebook(true);
      await notebook.refreshNotes({ dir: "./", includeSubdirectories: true });
      globalEmitter.emit(EventType.PerformedGitOperation, {
        notebookPath: notebook.dir,
      });
      setIsLoadingNotebook(false);
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
        await refreshNotebook(notebook);
      } catch (error) {}
    },
    [crossnote, refreshNotebook],
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
      if (!notebook || notebook.isLocal) {
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

  const addNoteAlias = useCallback(
    async (
      tabNode: TabNode,
      notebookPath: string,
      noteFilePath: string,
      alias: string,
    ) => {
      const notebook = getNotebookAtPath(notebookPath);
      if (!notebook) {
        return;
      }
      const note = await notebook.getNote(noteFilePath);
      const aliases: string[] = note.config.aliases || [];
      const newAliases = aliases.concat(alias);
      const newConfig = Object.assign({}, note.config, {
        aliases: newAliases,
      });
      await updateNoteConfig(tabNode, notebookPath, noteFilePath, newConfig);
      notebook.search.addAlias(noteFilePath, alias);
      return newAliases;
    },
    [getNotebookAtPath, updateNoteConfig],
  );

  const deleteNoteAlias = useCallback(
    async (
      tabNode: TabNode,
      notebookPath: string,
      noteFilePath: string,
      alias: string,
    ) => {
      const notebook = getNotebookAtPath(notebookPath);
      if (!notebook) {
        return;
      }
      const note = await notebook.getNote(noteFilePath);
      const aliases: string[] = note.config.aliases || [];
      const newAliases = aliases.filter((a) => a !== alias);
      const newConfig = Object.assign({}, note.config, {
        aliases: newAliases,
      });
      if (!newAliases.length) {
        delete newConfig.aliases;
      }
      await updateNoteConfig(tabNode, notebookPath, noteFilePath, newConfig);
      notebook.search.deleteAlias(noteFilePath, alias);
      return newAliases;
    },
    [getNotebookAtPath, updateNoteConfig],
  );

  const getStatus = useCallback(
    async (notebookPath: string, filePath: string) => {
      const notebook = getNotebookAtPath(notebookPath);
      if (!notebook || !crossnote || notebook.isLocal) {
        return "";
      } else {
        return await crossnote.getStatus(notebookPath, filePath);
      }
    },
    [crossnote, getNotebookAtPath],
  );

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
            globalEmitter.emit(EventType.PerformedGitOperation, {
              notebookPath: notebook.dir,
            });
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
    openLocalNotebook,
    togglePin,
    toggleFavorite,
    addNoteAlias,
    deleteNoteAlias,
    isAddingNotebook,
    isPushingNotebook,
    isPullingNotebook,
    updateNotebook,
    deleteNotebook,
    hardResetNotebook,
    refreshNotebook,
    pushNotebook,
    pullNotebook,
    checkoutNote,
    getNote,
    isLoadingNotebook,
    openNoteAtPath,
    openTodayNote,
    homeSection,
    setHomeSection,
    layoutModel,
    setLayoutModel,
    addTabNode,
    closeTabNode,
    getNotebookAtPath,
    getStatus,
  };
}

export const CrossnoteContainer = createContainer(useCrossnoteContainer);
