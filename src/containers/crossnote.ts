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
  TagNode
} from "../lib/crossnote";
import { getHeaderFromMarkdown } from "../utilities/note";

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
  Wiki = "Wiki"
}

export interface SelectedSection {
  type: SelectedSectionType;
  path?: string;
}

export enum OrderBy {
  CreatedAt = "CreatedAt",
  ModifiedAt = "ModifiedAt",
  Title = "Title"
}

export enum OrderDirection {
  ASC = "ASC",
  DESC = "DESC"
}

interface InitialState {
  crossnote: Crossnote;
}

function useCrossnoteContainer(initialState: InitialState) {
  const { t } = useTranslation();
  const crossnote = initialState.crossnote;
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook>(null);
  const [notebookNotes, setNotebookNotes] = useState<Note[]>([]);
  const [notebookDirectories, setNotebookDirectories] = useState<Directory>({
    name: ".",
    path: ".",
    children: []
  });
  const [notebookTagNode, setNotebookTagNode] = useState<TagNode>({
    name: ".",
    path: ".",
    children: []
  });
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note>(null);
  const [includeSubdirectories, setIncludeSubdirectories] = useState<boolean>(
    true
  );
  const [selectedSection, setSelectedSection] = useState<SelectedSection>({
    type: SelectedSectionType.Notes
  }); // $notes | $todau | $todo | real directory
  const [isAddingNotebook, setIsAddingNotebook] = useState<boolean>(false);
  const [isPushingNotebook, setIsPushingNotebook] = useState<boolean>(false);
  const [isPullingNotebook, setIsPullingNotebook] = useState<boolean>(false);
  const [displayMobileEditor, setDisplayMobileEditor] = useState<boolean>(
    false
  ); // For mobile device without any initial data, set to `true` will create empty white page.
  const [needsToRefreshNotes, setNeedsToRefreshNotes] = useState<boolean>(
    false
  );
  const [wikiTOCElement, setWikiTOCElement] = useState<HTMLElement>(null);
  const [isLoadingNotebook, setIsLoadingNotebook] = useState<boolean>(false);
  const [hasSummaryMD, setHasSummaryMD] = useState<boolean>(false);
  const [orderBy, setOrderBy] = useState<OrderBy>(OrderBy.ModifiedAt);
  const [orderDirection, setOrderDirection] = useState<OrderDirection>(
    OrderDirection.DESC
  );

  const updateNoteMarkdown = useCallback(
    (
      note: Note,
      markdown: string,
      password?: string,
      callback?: (status: string) => void
    ) => {
      crossnote
        .writeNote(
          note.notebook,
          note.filePath,
          markdown,
          note.config,
          password
        )
        .then(noteConfig => {
          note.config = noteConfig;
          note.markdown = markdown;
          if (callback) {
            crossnote.getStatus(note).then(status => {
              callback(status);
            });
          }
          setNeedsToRefreshNotes(true);
        });
    },
    [crossnote]
  );

  const deleteNote = useCallback(
    async (note: Note) => {
      await crossnote.deleteNote(selectedNotebook, note.filePath);
      setNotebookNotes(notes => {
        const newNotes = notes.filter(n => n.filePath !== note.filePath);
        if (newNotes.length !== notes.length) {
          setSelectedNote(null);
        }

        crossnote
          .getNotebookDirectoriesFromNotes(newNotes)
          .then(directories => {
            setNotebookDirectories(directories);
          });

        crossnote
          .hasSummaryMD(selectedNotebook)
          .then(exists => setHasSummaryMD(exists));

        setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(newNotes));
        return newNotes;
      });
      setDisplayMobileEditor(false);
    },
    [crossnote, selectedNotebook]
  );

  const changeNoteFilePath = useCallback(
    (note: Note, newFilePath: string) => {
      (async () => {
        try {
          await crossnote.changeNoteFilePath(
            selectedNotebook,
            note,
            newFilePath
          );
          const newNotes = notebookNotes.map(n => {
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
            await crossnote.getNotebookDirectoriesFromNotes(newNotes)
          );
          setHasSummaryMD(await crossnote.hasSummaryMD(selectedNotebook));
          setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(newNotes));
        } catch (error) {
          new Noty({
            type: "error",
            text: "Failed to change file path",
            layout: "topRight",
            theme: "relax",
            timeout: 5000
          }).show();
        }
      })();
    },
    [selectedNotebook, crossnote, notebookNotes]
  );

  const createNewNote = useCallback(
    (fileName: string = "") => {
      (async () => {
        if (!fileName) {
          fileName = randomID();
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
            selectedNotebook.dir,
            path.resolve(selectedNotebook.dir, selectedSection.path, fileName)
          );
        }

        const noteConfig: NoteConfig = {
          id: "",
          tags: tags,
          modifiedAt: new Date(),
          createdAt: new Date()
        };
        await crossnote.writeNote(selectedNotebook, filePath, "", noteConfig);
        const note: Note = {
          notebook: selectedNotebook,
          filePath: filePath,
          markdown: "",
          config: noteConfig
        };
        setNotebookNotes(notes => [note, ...notes]);
        setSelectedNote(note);
        setDisplayMobileEditor(true);
      })();
    },
    [selectedNotebook, crossnote, selectedSection]
  );

  const addNotebook = useCallback(
    async (
      name: string,
      gitURL: string,
      gitBranch: string,
      gitUsername: string,
      gitPassword: string,
      gitRememberCredentials: boolean,
      gitCorsProxy: string
    ) => {
      setIsAddingNotebook(true);
      try {
        const notebook = await crossnote.addNotebook({
          name,
          gitURL,
          branch: gitBranch,
          username: gitUsername,
          password: gitPassword,
          corsProxy: gitCorsProxy,
          rememberCredentials: gitRememberCredentials
        });
        setNotebooks(notebooks => [notebook, ...notebooks]);
        setIsAddingNotebook(false);
      } catch (error) {
        setIsAddingNotebook(false);
        throw error;
      }
    },
    [crossnote]
  );

  const updateNotebook = useCallback(
    async (notebook: Notebook) => {
      if (!crossnote) {
        return;
      }
      try {
        await crossnote.updateNotebook(notebook);
        setNotebooks(notebooks => [...notebooks]);
      } catch (error) {}
    },
    [crossnote]
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
      setNotebooks(notebooks =>
        notebooks.filter(n => {
          if (!selectedNotebook && n._id !== notebook._id) {
            selectedNotebook = n;
          }
          return n._id !== notebook._id;
        })
      );
      _setSelectedNotebook(selectedNotebook);
    },
    [crossnote]
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
      } catch (error) {
        setIsPushingNotebook(false);
        throw error;
      }
    },
    [crossnote]
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
          includeSubdirectories: true
        });
        setNotebookNotes(notes);
        setNotebookDirectories(
          await crossnote.getNotebookDirectoriesFromNotes(notes)
        );
        setHasSummaryMD(await crossnote.hasSummaryMD(args.notebook));
        setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(notes));

        const newNote = notes.find(n => n.filePath === selectedNote.filePath);
        if (!newNote) {
          setSelectedNote(notes[0]); // TODO: pull might remove currently selectedNote
        } else {
          setSelectedNote(newNote);
        }
      } catch (error) {
        setIsPullingNotebook(false);
        throw error;
      }
    },
    [crossnote, selectedNote]
  );

  const checkoutNote = useCallback(
    async (note: Note) => {
      if (!crossnote) {
        return;
      }
      const newNote = await crossnote.checkoutNote(note);
      if (newNote) {
        setNotebookNotes(notes =>
          notes.map(n => {
            if (n.filePath === newNote.filePath) {
              return newNote;
            } else {
              return n;
            }
          })
        );
        setNotes(notes =>
          notes.map(n => {
            if (n.filePath === newNote.filePath) {
              return newNote;
            } else {
              return n;
            }
          })
        );
        setSelectedNote(newNote);
      } else {
        // The note is deleted after checkout
        setNotebookNotes(notes => {
          const newNotes = notes.filter(n => n.filePath !== note.filePath);
          crossnote
            .getNotebookDirectoriesFromNotes(newNotes)
            .then(directories => {
              setNotebookDirectories(directories);
            });
          crossnote
            .hasSummaryMD(selectedNotebook)
            .then(exists => setHasSummaryMD(exists));
          setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(newNotes));
          return newNotes;
        });
        setNotes(notes => {
          const newNotes = notes.filter(n => n.filePath !== note.filePath);
          setSelectedNote(newNotes[0]);
          return newNotes;
        });
      }
    },
    [crossnote, selectedNotebook]
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
    [crossnote]
  );

  const openNoteAtPath = useCallback(
    (filePath: string) => {
      if (!crossnote) return;
      const note = notebookNotes.find(n => n.filePath === filePath);
      if (note) {
        setSelectedNote(note);
      }
    },
    [crossnote, notebookNotes]
  );

  useEffect(() => {
    if (!crossnote) {
      return;
    }

    (async () => {
      const notebooks = await crossnote.listNotebooks();
      let notebook: Notebook = null;
      if (notebooks.length) {
        setNotebooks(notebooks);
        const selectedNotebookID = localStorage.getItem("selectedNotebookID");
        notebook = notebooks.find(n => n._id === selectedNotebookID);
        if (!notebook) {
          notebook = notebooks[0];
        }
        _setSelectedNotebook(notebook); // TODO: <= default selected
      } else {
        /*
        notebook = await crossnote.cloneNotebook({
          corsProxy: "https://cors.isomorphic-git.org",
          gitURL: "https://github.com/0xGG/crossnote-doc.git"
        });
        */
        notebook = await crossnote.addNotebook({
          name: "Unamed",
          corsProxy: "https://cors.isomorphic-git.org",
          gitURL: ""
        });
        setNotebooks([notebook]);
        _setSelectedNotebook(notebook);
      }
    })();
  }, [crossnote]);

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
        children: []
      });
      setHasSummaryMD(false);
      setNotebookTagNode({
        name: ".",
        path: ".",
        children: []
      });

      const notes = await crossnote.listNotes({
        notebook: selectedNotebook,
        dir: "./",
        includeSubdirectories: true
      });
      setNotebookNotes(notes);
      setNotebookDirectories(
        await crossnote.getNotebookDirectoriesFromNotes(notes)
      );
      setHasSummaryMD(await crossnote.hasSummaryMD(selectedNotebook));
      setNotebookTagNode(crossnote.getNotebookTagNodeFromNotes(notes));
      setSelectedNote(null);
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
        notes = notebookNotes.filter(note =>
          note.markdown.match(/(\*|-|\d+\.)\s\[(\s+|x|X)\]\s/gm)
        );
      } else if (selectedSection.type === SelectedSectionType.Today) {
        notes = notebookNotes.filter(
          note => Date.now() - note.config.modifiedAt.getTime() <= OneDay
        );
      } else if (selectedSection.type === SelectedSectionType.Tagged) {
        notes = notebookNotes.filter(note => note.config.tags.length > 0);
      } else if (selectedSection.type === SelectedSectionType.Untagged) {
        notes = notebookNotes.filter(note => note.config.tags.length === 0);
      } else if (selectedSection.type === SelectedSectionType.Tag) {
        notes = notebookNotes.filter(note => {
          const tags = note.config.tags;
          return tags.find(
            tag =>
              (tag.toLocaleLowerCase() + "/").indexOf(
                selectedSection.path + "/"
              ) === 0
          );
        });
      } else if (selectedSection.type === SelectedSectionType.Conflicted) {
        notes = notebookNotes.filter(note => {
          return crossnote.markdownHasConflicts(note.markdown);
        });
      } else if (selectedSection.type === SelectedSectionType.Encrypted) {
        notes = notebookNotes.filter(note => {
          return note.config.encryption;
        });
      } else if (selectedSection.type === SelectedSectionType.Wiki) {
        // Do nothing here
      } else {
        // SelectedSectionType.Directory
        if (includeSubdirectories) {
          notes = notebookNotes.filter(
            note => note.filePath.indexOf(selectedSection.path + "/") === 0
          );
        } else {
          notes = notebookNotes.filter(
            note => path.dirname(note.filePath) === selectedSection.path
          );
        }
      }

      if (orderBy === OrderBy.ModifiedAt) {
        if (orderDirection === OrderDirection.DESC) {
          notes.sort(
            (a, b) =>
              b.config.modifiedAt.getTime() - a.config.modifiedAt.getTime()
          );
        } else {
          notes.sort(
            (a, b) =>
              a.config.modifiedAt.getTime() - b.config.modifiedAt.getTime()
          );
        }
      } else if (orderBy === OrderBy.CreatedAt) {
        if (orderDirection === OrderDirection.DESC) {
          notes.sort(
            (a, b) =>
              b.config.createdAt.getTime() - a.config.createdAt.getTime()
          );
        } else {
          notes.sort(
            (a, b) =>
              a.config.createdAt.getTime() - b.config.createdAt.getTime()
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
                getHeaderFromMarkdown(a.markdown)
            )
          );
        } else {
          notes.sort((a, b) =>
            (
              (a.config.encryption && a.config.encryption.title) ||
              getHeaderFromMarkdown(a.markdown)
            ).localeCompare(
              (b.config.encryption && b.config.encryption.title) ||
                getHeaderFromMarkdown(b.markdown)
            )
          );
        }
      }

      setNotes(notes);
      if (!selectedNote) {
        setSelectedNote(notes[0]);
      }
    }
  }, [
    selectedSection,
    crossnote,
    selectedNotebook,
    includeSubdirectories,
    selectedNote,
    notebookNotes,
    orderBy,
    orderDirection
  ]);

  useInterval(() => {
    if (needsToRefreshNotes) {
      setNeedsToRefreshNotes(false);
      setNotes(notes => [...notes]);
    }
  }, 4000);

  const _setSelectedNotebook = useCallback(
    (notebook: Notebook) => {
      localStorage.setItem("selectedNotebookID", notebook._id);
      setSelectedNotebook(notebook);
    },
    [setSelectedNotebook]
  );

  return {
    crossnote,
    notebooks,
    selectedNotebook,
    setSelectedNotebook: _setSelectedNotebook,
    notes,
    selectedNote,
    setSelectedNote,
    updateNoteMarkdown,
    createNewNote,
    selectedSection,
    setSelectedSection,
    includeSubdirectories,
    setIncludeSubdirectories,
    deleteNote,
    changeNoteFilePath,
    notebookDirectories,
    notebookTagNode,
    addNotebook,
    isAddingNotebook,
    isPushingNotebook,
    isPullingNotebook,
    updateNotebook,
    deleteNotebook,
    pushNotebook,
    pullNotebook,
    checkoutNote,
    displayMobileEditor,
    setDisplayMobileEditor,
    updateNotebookTagNode,
    getNote,
    isLoadingNotebook,
    openNoteAtPath,
    orderBy,
    setOrderBy,
    orderDirection,
    setOrderDirection,
    hasSummaryMD,
    wikiTOCElement,
    setWikiTOCElement
  };
}

export const CrossnoteContainer = createContainer(useCrossnoteContainer);
