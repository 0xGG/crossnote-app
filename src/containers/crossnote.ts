import { DEFAULT_CORS_PROXY } from "../config";
import useInterval from "../utilities/useInterval";
import {
  Actions,
  DockLocation,
  type IJsonModel,
  Model,
  TabNode,
  TabSetNode,
} from "flexlayout-react";
import { Mutex } from "async-mutex";
import moment from "moment";
import path from "path-browserify";
import { useCallback, useEffect, useState } from "react";
import { createContainer } from "unstated-next";
import Crossnote, {
  type NotebookSettings,
  PullNotebookArgs,
  PushNotebookArgs,
} from "../lib/crossnote";
import {
  type ChangedNoteFilePathEventData,
  EventType,
  globalEmitter,
} from "../lib/event";
import { missingFileOrThrow, pfs } from "../lib/fs";
import { pruneUnknownTabs, tabsInNotebook } from "../lib/layout";
import { Note, NoteConfig, NoteMovedError } from "../lib/note";
import { Notebook } from "../lib/notebook";
import {
  NotesNotSavedError,
  type NoteLocation,
  flushNotes,
  moveNoteSavers,
  saverOfWriter,
} from "../lib/noteSaver";
import { writeNoteOperation } from "../lib/noteWrites";
import { moveNote, openNoteAt, retainedNoteAt } from "../lib/openNotes";
import { failureMessage, notify } from "../lib/notifications";
import i18next from "../i18n/i18n";
import { notebookOperation } from "../lib/notebookOperation";
import { NotebookConflictError } from "../lib/mergeFiles";
import { CrossnoteTabNode } from "../lib/tabNode";
import { notebookInFront, tabsetForNewTab } from "../lib/tabset";
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

const defaultLayoutModel: IJsonModel = {
  global: {
    tabSetEnableMaximize: false,
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
};

const getlayoutModelFromLocalStrorage = () => {
  try {
    const layoutModelString = localStorage.getItem("layoutModel");
    if (layoutModelString) {
      return pruneUnknownTabs(JSON.parse(layoutModelString));
    } else {
      return defaultLayoutModel;
    }
  } catch (_) {
    return defaultLayoutModel;
  }
};

// Keeps the new notes this page asks for from being named and written at the
// same time. Another tab of the app, with its own, is not kept out.
const creatingNote = new Mutex();

// A note card need not have an editor. Track its identity from the user's
// action until the queued operation finishes, including any pre-save flush.
async function withNotePath<T>(
  note: NoteLocation,
  operation: (current: NoteLocation) => Promise<T>,
): Promise<T> {
  const current = { notebookPath: note.notebookPath, filePath: note.filePath };
  const moved = (event: ChangedNoteFilePathEventData) => {
    if (
      event.notebookPath === current.notebookPath &&
      event.oldNoteFilePath === current.filePath
    )
      current.filePath = event.newNoteFilePath;
  };
  globalEmitter.on(EventType.ChangedNoteFilePath, moved);
  try {
    return await operation(current);
  } finally {
    globalEmitter.off(EventType.ChangedNoteFilePath, moved);
  }
}

function requireOriginalPath(original: string, current: NoteLocation) {
  if (current.filePath !== original)
    throw new NoteMovedError(
      i18next.t("error/note-moved-retry", { path: current.filePath }),
    );
}

function useCrossnoteContainer(initialState: InitialState) {
  const crossnote = initialState.crossnote;
  const [initialized, setInitialized] = useState<boolean>(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [recoveryCollision, setRecoveryCollision] = useState<{
    notebook: Notebook;
    directory: string;
  } | null>(null);
  const [isAddingNotebook, setIsAddingNotebook] = useState<boolean>(false);
  const [isPushingNotebook, setIsPushingNotebook] = useState<boolean>(false);
  const [isPullingNotebook, setIsPullingNotebook] = useState<boolean>(false);
  const [isPerformingAutoFetch, setIsPerformingAutoFetch] =
    useState<boolean>(false);
  const [layoutModel] = useState<Model>(() =>
    Model.fromJson(getlayoutModelFromLocalStrorage()),
  );
  // The notebook the sidebar marks as the current one: that of the tab in
  // front in the active pane, or of the last such tab that had one, a tab of
  // no notebook's (the settings) leaving it as it was.
  const [currentNotebookPath, setCurrentNotebookPath] = useState<
    string | undefined
  >(() => notebookInFront(layoutModel));
  const followLayout = useCallback((model: Model) => {
    const notebookPath = notebookInFront(model);
    if (notebookPath) {
      setCurrentNotebookPath(notebookPath);
    }
  }, []);

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
      // Adding or selecting a tab makes its tabset the active one, so the
      // fallback need not be made active first.
      const activeTabset: TabSetNode =
        layoutModel.getActiveTabset() ?? tabsetForNewTab(layoutModel);

      if (tabNode.config.singleton) {
        const node = layoutModel.getNodeById(tabNode.id);
        if (node) {
          return layoutModel.doAction(Actions.selectTab(node.getId()));
        }
      }
      if (tabNode.component === "Note") {
        const notebookPath = tabNode.config.notebookPath;
        const noteFilePath = tabNode.config.noteFilePath;
        // Tabs only: a tabset can also hold groups of tabs.
        const tabs = activeTabset.getTabNodes();
        for (let i = 0; i < tabs.length; i++) {
          const eTabNode = tabs[i];
          const eNotebookpath: string = eTabNode.getConfig().notebookPath;
          const eNoteFilePath: string = eTabNode.getConfig().noteFilePath;
          if (
            notebookPath &&
            noteFilePath &&
            notebookPath === eNotebookpath &&
            noteFilePath === eNoteFilePath
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
        Actions.addTab(tabNode, activeTabset.getId(), DockLocation.CENTER, 0),
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
      // Who writes: a tab, or a note's saver, which writes for every tab
      // the note is open in. The event that tells of the write names it.
      writer: { getId(): string },
      notebookPath: string,
      filePath: string,
      markdown: string,
      loadedFilePath = filePath,
    ) =>
      writeNoteOperation({ notebookPath, filePath }, async () => {
        // A queued write can acquire the lock after Git has moved its note.
        filePath = saverOfWriter(writer.getId())?.location.filePath ?? filePath;
        // The save comes a moment after the last keystroke, by when the
        // notebook, or the note, may have been deleted or the note renamed.
        const notebook = getNotebookAtPath(notebookPath);
        if (!notebook) {
          return;
        }
        const cached = await notebook.getNote(filePath);
        const open = retainedNoteAt({ notebookPath, filePath });
        const saving = open?.saver.id === writer.getId();
        const awaitingDestination = saving && filePath !== loadedFilePath;
        const fresh = cached && (await notebook.getNote(filePath, true));
        // Keep the draft until the new file can be read and reconciled.
        if (!fresh && awaitingDestination)
          throw new Error(i18next.t("general/note-not-found"));
        // A file deleted by git while its open editor was being edited keeps
        // those new edits. An explicit local deletion removes the cache first.
        const note = fresh ?? (saving && open.saver.open ? cached : null);
        if (!note) return;
        if (saving) {
          const merged = open.reconcileFile(note.markdown, note.lineBreak);
          markdown = merged.text;
          if (merged.conflict || !fresh)
            notify({
              severity: "warning",
              message: i18next.t("error/notebook-sync-conflicts", {
                files: filePath,
              }),
            });
        }
        if (!fresh || note.markdown !== markdown) {
          const newNote = await notebook.writeNote(
            note.filePath,
            markdown,
            note.config,
          );
          open?.saver.wrote(newNote.markdown);
          globalEmitter.emit(EventType.ModifiedMarkdown, {
            tabId: writer.getId(),
            markdown: newNote.markdown,
            lineBreak: newNote.lineBreak,
            notebookPath: note.notebookPath,
            noteFilePath: note.filePath,
            noteConfig: newNote.config,
          });
        } else {
          await notebook.storeNote(filePath);
          open?.saver.wrote(note.markdown);
        }
      }),
    [getNotebookAtPath],
  );

  // Saves a note's settings, saying so when they cannot be saved. Whether
  // the note has them now.
  const updateNoteConfig = useCallback(
    async (
      tabNode: TabNode,
      notebookPath: string,
      filePath: string,
      change: NoteConfig | ((current: NoteConfig) => NoteConfig),
    ): Promise<boolean> => {
      try {
        return await withNotePath({ notebookPath, filePath }, (location) =>
          writeNoteOperation(location, async () => {
            filePath = location.filePath;
            const notebook = getNotebookAtPath(notebookPath);
            if (!notebook) {
              return false;
            }
            const note = await notebook.getNote(filePath, true);
            if (!note) {
              return false;
            }
            const noteConfig =
              typeof change === "function"
                ? change({ ...note.config })
                : change;
            const open = openNoteAt(location);
            const merged = open?.reconcileFile(note.markdown, note.lineBreak);
            if (merged?.conflict)
              notify({
                severity: "warning",
                message: i18next.t("error/notebook-sync-conflicts", {
                  files: filePath,
                }),
              });
            const changed =
              JSON.stringify(note.config) !== JSON.stringify(noteConfig) ||
              (merged && merged.text !== note.markdown);
            let saved = note;
            if (changed) {
              saved = await notebook.writeNote(
                note.filePath,
                merged?.text ?? note.markdown,
                noteConfig,
              );
            } else {
              await notebook.storeNote(filePath);
            }
            // A retry can finish persisting an earlier write. The search
            // index still needs the aliases even if the file already has them.
            notebook.search.remove(filePath);
            notebook.search.add(filePath, saved.title, saved.config.aliases);
            open?.saver.wrote(saved.markdown);
            if (changed) {
              globalEmitter.emit(EventType.ModifiedMarkdown, {
                tabId: openNoteAt(location)?.saver.id ?? tabNode.getId(),
                markdown: saved.markdown,
                lineBreak: saved.lineBreak,
                notebookPath: saved.notebookPath,
                noteFilePath: saved.filePath,
                noteConfig: saved.config,
              });
            }
            return true;
          }),
        );
      } catch (error) {
        notify({
          severity: "error",
          message: failureMessage(
            i18next.t("error/failed-to-save-note-settings"),
            error,
          ),
          duration: 5000,
        });
        return false;
      }
    },
    [getNotebookAtPath],
  );

  const deleteNote = useCallback(
    async (tabNode: TabNode, notebookPath: string, noteFilePath: string) =>
      withNotePath({ notebookPath, filePath: noteFilePath }, (location) =>
        writeNoteOperation(location, async () => {
          requireOriginalPath(noteFilePath, location);
          const notebook = getNotebookAtPath(notebookPath);
          if (!notebook) {
            return;
          }
          await notebook.deleteNote(noteFilePath);
          retainedNoteAt(location)?.saver.discard();
          await notebook.refreshNotes({
            dir: "./",
            includeSubdirectories: true,
          });
          globalEmitter.emit(EventType.DeletedNote, {
            tabId: tabNode.getId(),
            notebookPath: notebookPath,
            noteFilePath: noteFilePath,
          });
        }),
      ),
    [getNotebookAtPath],
  );

  useEffect(() => {
    const followMove = ({
      notebookPath,
      oldNoteFilePath,
      newNoteFilePath,
    }: ChangedNoteFilePathEventData) => {
      const from = { notebookPath, filePath: oldNoteFilePath };
      const to = { notebookPath, filePath: newNoteFilePath };
      const open = retainedNoteAt(from);
      if (open) moveNote(open, to);
      moveNoteSavers(from, to);
      if (layoutModel) {
        for (const tab of tabsInNotebook(
          layoutModel,
          notebookPath,
          oldNoteFilePath,
        )) {
          layoutModel.doAction(
            Actions.updateNodeAttributes(tab.getId(), {
              config: { ...tab.getConfig(), noteFilePath: newNoteFilePath },
            }),
          );
        }
      }
    };
    globalEmitter.on(EventType.ChangedNoteFilePath, followMove);
    return () => globalEmitter.off(EventType.ChangedNoteFilePath, followMove);
  }, [layoutModel]);

  const changeNoteFilePath = useCallback(
    async (tabNode: TabNode, note: Note, newFilePath: string) => {
      const notebook = notebooks.find((x) => x.dir === note.notebookPath);
      if (notebook) {
        const oldNoteFilePath = note.filePath;
        const old = {
          notebookPath: note.notebookPath,
          filePath: oldNoteFilePath,
        };
        // What was just typed is written first: the save that comes a moment
        // after the last key would look for the note at its old path once
        // the file has moved, find none, and write nothing.
        return withNotePath(old, async (location) => {
          await flushNotes(old);
          const open = openNoteAt(old);
          const rename = (onMoved?: () => void) =>
            writeNoteOperation(old, async () => {
              requireOriginalPath(oldNoteFilePath, location);
              const newNote = await notebook.changeNoteFilePath(
                oldNoteFilePath,
                newFilePath,
                onMoved,
                (filePath) =>
                  !!retainedNoteAt({ notebookPath: notebook.dir, filePath }),
              );
              globalEmitter.emit(EventType.ChangedNoteFilePath, {
                tabId: tabNode.getId(),
                notebookPath: note.notebookPath,
                oldNoteFilePath: oldNoteFilePath,
                // As the notebook wrote it, which is not always as it was asked.
                newNoteFilePath: newNote.filePath,
              });
              return newNote;
            });
          return open ? await open.saver.rename(rename) : await rename();
        });
      } else {
        throw new Error("Notebook " + note.notebookPath + " not found");
      }
    },
    [notebooks],
  );

  const nameAndWriteNote = useCallback(
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

      const autoGeneratedFileName = !fileName;
      // Asked of the disk rather than of the notes the notebook has read:
      // those may not have caught up with another tab or program, or may be
      // being read again at this moment, and a note written at a taken path
      // empties the note there.
      const taken = (fileName: string) =>
        pfs
          .stats(path.resolve(notebook.dir, fileName))
          .catch(missingFileOrThrow);
      if (!fileName) {
        const today = moment().format("YYYY-MM-DD"); // TODO: Allow user to customize this
        const untitled = i18next.t("general/Untitled");

        let foundToday = false;
        let count = 0;
        for (const key in notebook.notes) {
          const note = notebook.notes[key];
          if (note.title === today) {
            foundToday = true;
          }
          if (note.title.startsWith(untitled)) {
            count++;
          }
        }
        if (foundToday || (await taken(`${today}.md`))) {
          if (count === 0) {
            fileName = `${untitled}.md`;
          } else {
            fileName = `${untitled} ${count}.md`;
          }
          // count is how many notes are called Untitled-something, not a free
          // number: once one of them is renamed or deleted, it names a note
          // that exists.
          while (await taken(fileName)) {
            count++;
            fileName = `${untitled} ${count}.md`;
          }
        } else {
          fileName = `${today}.md`;
        }
      }
      if (!fileName.endsWith(".md")) {
        fileName = fileName + ".md";
      }
      const filePath = path.relative(
        notebook.dir,
        path.resolve(notebook.dir, fileName),
      );
      // A path leading out of the notebook would write into another
      // notebook's folder, or outside them all.
      if (filePath.startsWith("../")) {
        throw new Error("error/target-file-outside-notebook");
      }
      // A note asked for by a name that is taken, as following a link to it
      // does, is the one there.
      if (!autoGeneratedFileName && (await taken(filePath))) {
        return await notebook.getNote(filePath, true);
      }

      const noteConfig: NoteConfig = {
        modifiedAt: new Date(),
        createdAt: new Date(),
      };
      await notebook.writeNote(filePath, markdown, noteConfig);
      if (!autoGeneratedFileName) {
        await notebook.refreshNotes({
          dir: "./",
          includeSubdirectories: true,
        });
      }
      const note = await notebook.getNote(filePath);
      globalEmitter.emit(EventType.CreatedNote, {
        notebookPath: notebook.dir,
      });
      return note;
    },
    [],
  );

  // One new note at a time: two asked for at once would both find the same
  // name free, and the second would be written over the first.
  const createNewNote = useCallback(
    (notebook: Notebook, fileName: string = "", markdown: string = "") =>
      creatingNote.runExclusive(() =>
        writeNoteOperation(
          { notebookPath: notebook.dir, filePath: fileName },
          () => nameAndWriteNote(notebook, fileName, markdown),
        ),
      ),
    [nameAndWriteNote],
  );

  const openNoteAtPath = useCallback(
    async (notebook: Notebook, filePath: string) => {
      if (!filePath.endsWith(".md")) {
        filePath += ".md";
      }
      // A link in a note can lead out of its notebook, into another
      // notebook's folder or outside them all; that is no note of this
      // notebook to open, or to create.
      if (
        path
          .relative(notebook.dir, path.resolve(notebook.dir, filePath))
          .startsWith("../")
      ) {
        notify({
          severity: "error",
          message: i18next.t("error/link-outside-notebook"),
        });
        return;
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
        try {
          note = await createNewNote(notebook, filePath, "");
        } catch (error) {
          // A link to a path under another note: a note is a file, and
          // nothing goes under a file.
          if ((error as { code?: string }).code === "ENOTDIR") {
            notify({
              severity: "error",
              message: i18next.t("error/link-inside-note"),
            });
            return;
          }
          notify({
            severity: "error",
            message: failureMessage(
              i18next.t("error/failed-to-create-note"),
              error,
            ),
            duration: 5000,
          });
          return;
        }
      }
      addTabNode({
        type: "tab",
        component: "Note",
        name: note.title,
        config: {
          component: "Note",
          singleton: false,
          noteFilePath: note.filePath,
          notebookPath: note.notebookPath,
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
          throw new Error(i18next.t("error/notebook-already-exists"));
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
    [crossnote, notebooks],
  );

  const openLocalNotebook = useCallback(async () => {
    const directoryHandle = await window.showDirectoryPicker();
    const notebook = await crossnote.addNotebook({
      name: directoryHandle.name,
      gitURL: "",
      directoryHandle,
    });
    setNotebooks((notebooks) => [notebook, ...notebooks]);
  }, [crossnote]);

  const updateNotebook = useCallback(
    async (notebook: Notebook, settings: NotebookSettings) => {
      await crossnote.saveNotebookSettings(notebook, settings);
      setNotebooks((notebooks) => [...notebooks]);
    },
    [crossnote],
  );

  const deleteNotebook = useCallback(
    async (notebook: Notebook) => {
      await flushNotes({ notebookPath: notebook.dir });
      const removed = await notebookOperation(notebook.dir, () =>
        crossnote.deleteNotebook(notebook._id),
      );
      for (const tab of tabsInNotebook(layoutModel, notebook.dir)) {
        closeTabNode(tab.getId());
      }
      setNotebooks((notebooks) =>
        notebooks.filter((n) => n._id !== notebook._id),
      );
      if (removed) {
        notify({
          severity: "warning",
          message: failureMessage(
            i18next.t("error/notebook-cleanup-failed"),
            removed.cleanupError,
          ),
        });
      }
    },
    [crossnote, layoutModel, closeTabNode],
  );

  // Writes out what the editors open in a notebook, or on one note of it,
  // hold, before git or a read from disk changes notes under them: where it
  // changed a note, the notebook read again afterwards puts the note as it
  // is on disk into its editor, over whatever had not been written yet. When
  // a note cannot be written, says which and throws, and the caller does
  // nothing.
  const saveOpenNotes = useCallback(
    async (where: { notebookPath: string; filePath?: string }) => {
      try {
        const notebook = getNotebookAtPath(where.notebookPath);
        if (notebook) await crossnote?.resumeNotebook?.(notebook);
        await flushNotes(where);
      } catch (error) {
        if (error instanceof NotebookConflictError) throw error;
        const notSaved =
          error instanceof NotesNotSavedError
            ? error
            : new NotesNotSavedError(
                [
                  {
                    notebookPath: where.notebookPath,
                    filePath: where.filePath ?? where.notebookPath,
                  },
                ],
                [error],
              );
        notify({
          severity: "error",
          message: failureMessage(
            i18next.t("error/notes-not-saved", {
              notes: notSaved.locations
                .map((location) => location.filePath)
                .join(", "),
            }),
            notSaved.errors[0],
          ),
          duration: 5000,
        });
        throw notSaved;
      }
    },
    [crossnote, getNotebookAtPath],
  );

  // Reads a notebook's notes again from disk, and has its open editors take
  // them.
  const readNotebookAgain = useCallback(async (notebook: Notebook) => {
    await notebook.refreshNotes({ dir: "./", includeSubdirectories: true });
    globalEmitter.emit(EventType.PerformedGitOperation, {
      notebookPath: notebook.dir,
    });
  }, []);

  const refreshNotebook = useCallback(
    async (notebook: Notebook) => {
      if (!crossnote) {
        return;
      }
      try {
        await saveOpenNotes({ notebookPath: notebook.dir });
      } catch (error) {
        return;
      }
      await readNotebookAgain(notebook);
    },
    [crossnote, saveOpenNotes, readNotebookAgain],
  );

  const hardResetNotebook = useCallback(
    async (notebook: Notebook) => {
      if (!crossnote) {
        return;
      }
      try {
        // Written first, or a write still to come would put back after the
        // reset what was typed before it. An editor typed into while the reset
        // runs then writes what it holds, which keeps the typing and undoes
        // the reset for that note; that is written, or fails, before the
        // notebook is read again, so the editors take what is on disk then.
        // A write that fails does not stop the reading again: the reset is
        // done.
        await saveOpenNotes({ notebookPath: notebook.dir });
        await crossnote.hardResetNotebook(notebook, notebook.localSha);
        await flushNotes({ notebookPath: notebook.dir }).catch(() => {});
        await readNotebookAgain(notebook);
      } catch (error) {}
    },
    [crossnote, saveOpenNotes, readNotebookAgain],
  );

  const pushNotebook = useCallback(
    async (args: PushNotebookArgs) => {
      if (!crossnote) {
        return;
      }
      setIsPushingNotebook(true);
      try {
        await saveOpenNotes({ notebookPath: args.notebook.dir });
        await crossnote.pushNotebook(args);
        await flushNotes({ notebookPath: args.notebook.dir });
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
        if (error instanceof NotebookConflictError) {
          await flushNotes({ notebookPath: args.notebook.dir });
          await readNotebookAgain(args.notebook);
        }
        throw error;
      }
    },
    [crossnote, saveOpenNotes, readNotebookAgain],
  );

  const pullNotebook = useCallback(
    async (args: PullNotebookArgs) => {
      if (!crossnote) {
        return;
      }
      setIsPullingNotebook(true);
      try {
        await saveOpenNotes({ notebookPath: args.notebook.dir });
        const result = await crossnote.pullNotebook(args);
        await flushNotes({ notebookPath: args.notebook.dir });
        await args.notebook.refreshNotes({
          dir: "./",
          includeSubdirectories: true,
        });
        globalEmitter.emit(EventType.PerformedGitOperation, {
          notebookPath: args.notebook.dir,
        });
        setIsPullingNotebook(false);
        return result;
      } catch (error) {
        setIsPullingNotebook(false);
        throw error;
      }
    },
    [crossnote, saveOpenNotes],
  );

  const checkoutNote = useCallback(
    async (note: Note) => {
      const notebook = getNotebookAtPath(note.notebookPath);
      if (!notebook || notebook.isLocal) {
        return;
      }
      return withNotePath(note, async (location) => {
        try {
          await saveOpenNotes({
            notebookPath: note.notebookPath,
            filePath: note.filePath,
          });
        } catch (error) {
          return;
        }
        const newNote = await writeNoteOperation(location, async () => {
          requireOriginalPath(note.filePath, location);
          return notebook.checkoutNote(note);
        });
        await notebook.refreshNotes({
          dir: "./",
          includeSubdirectories: true,
        });
        globalEmitter.emit(EventType.PerformedGitOperation, {
          notebookPath: note.notebookPath,
        });
        return newNote;
      });
    },
    [getNotebookAtPath, saveOpenNotes],
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

  const getNoteForPrint = useCallback(
    ({ notebookPath, filePath }: NoteLocation) =>
      withNotePath({ notebookPath, filePath }, async (location) => {
        await saveOpenNotes({ notebookPath, filePath });
        return notebookOperation(notebookPath, () => {
          requireOriginalPath(filePath, location);
          return getNote(location.notebookPath, location.filePath);
        });
      }),
    [getNote, saveOpenNotes],
  );

  const togglePin = useCallback(
    async (tabNode: TabNode, notebookPath: string, noteFilePath: string) => {
      await updateNoteConfig(tabNode, notebookPath, noteFilePath, (current) => {
        if (current.pinned) delete current.pinned;
        else current.pinned = true;
        return current;
      });
    },
    [updateNoteConfig],
  );

  const toggleFavorite = useCallback(
    async (tabNode: TabNode, notebookPath: string, noteFilePath: string) => {
      await updateNoteConfig(tabNode, notebookPath, noteFilePath, (current) => {
        if (current.favorited) delete current.favorited;
        else current.favorited = true;
        return current;
      });
    },
    [updateNoteConfig],
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
      let aliases = notebook.notes[noteFilePath]?.config.aliases ?? [];
      let newAliases: string[] = [];
      if (
        !(await updateNoteConfig(
          tabNode,
          notebookPath,
          noteFilePath,
          (current) => {
            aliases = current.aliases ?? [];
            newAliases = aliases.includes(alias)
              ? aliases
              : [...aliases, alias];
            return { ...current, aliases: newAliases };
          },
        ))
      ) {
        return aliases;
      }
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
      let aliases = notebook.notes[noteFilePath]?.config.aliases ?? [];
      let newAliases: string[] = [];
      if (
        !(await updateNoteConfig(
          tabNode,
          notebookPath,
          noteFilePath,
          (current) => {
            aliases = current.aliases ?? [];
            newAliases = aliases.filter((a) => a !== alias);
            if (newAliases.length) current.aliases = newAliases;
            else delete current.aliases;
            return current;
          },
        ))
      ) {
        return aliases;
      }
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

  const saveCurrentLayoutModel = useCallback(() => {
    if (layoutModel) {
      localStorage.setItem("layoutModel", JSON.stringify(layoutModel.toJson()));
    }
  }, [layoutModel]);

  const splitNoteHorizontally = useCallback(
    (note: Note, tabNode: TabNode) => {
      if (layoutModel) {
        const activeTabset: TabSetNode = layoutModel.getActiveTabset();
        if (!activeTabset) {
          return;
        }
        const newTabNode: CrossnoteTabNode = {
          type: "tab",
          name: note.title,
          component: "Note",
          config: {
            component: "Note",
            singleton: false,
            noteFilePath: note.filePath,
            notebookPath: note.notebookPath,
          },
        };
        layoutModel.doAction(
          Actions.addTab(
            newTabNode,
            activeTabset.getId(),
            DockLocation.BOTTOM,
            0,
          ),
        );
      }
    },
    [layoutModel],
  );

  const splitNoteVertically = useCallback(
    (note: Note) => {
      if (layoutModel) {
        const activeTabset: TabSetNode = layoutModel.getActiveTabset();
        if (!activeTabset) {
          return;
        }
        const newTabNode: CrossnoteTabNode = {
          type: "tab",
          name: note.title,
          component: "Note",
          config: {
            component: "Note",
            singleton: false,
            noteFilePath: note.filePath,
            notebookPath: note.notebookPath,
          },
        };
        layoutModel.doAction(
          Actions.addTab(
            newTabNode,
            activeTabset.getId(),
            DockLocation.RIGHT,
            0,
          ),
        );
      }
    },
    [layoutModel],
  );

  useEffect(() => {
    if (!crossnote || initialized) {
      return;
    }

    (async () => {
      const notebooks = await crossnote.listNotebooks();
      if (notebooks.length) {
        setNotebooks(notebooks);
        setInitialized(true);
      } else {
        const notebook = await crossnote.addNotebook({
          name: "Drafts",
          corsProxy: DEFAULT_CORS_PROXY,
          gitURL: "",
        });
        await pfs.writeFile(
          path.resolve(notebook.dir, "README.md"),
          `---
favorited: true
---
# Welcome to Crossnote 😊
`,
        );
        await pfs.storeTree(notebook.dir);
        setNotebooks([notebook]);
        setInitialized(true);
      }
    })();
  }, [crossnote, initialized]);

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
          console.error(error);
        }
      }
    }
    setIsPerformingAutoFetch(false);
  }, 60000); // Check every 1 minute

  return {
    crossnote,
    recoveryCollision,
    setRecoveryCollision,
    initialized,
    notebooks,
    updateNoteMarkdown,
    updateNoteConfig,
    createNewNote,
    deleteNote,
    changeNoteFilePath,
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
    getNoteForPrint,
    getNote,
    openNoteAtPath,
    openTodayNote,
    layoutModel,
    splitNoteHorizontally,
    splitNoteVertically,
    addTabNode,
    closeTabNode,
    getNotebookAtPath,
    getStatus,
    saveCurrentLayoutModel,
    currentNotebookPath,
    followLayout,
  };
}

export const CrossnoteContainer = createContainer(useCrossnoteContainer);
