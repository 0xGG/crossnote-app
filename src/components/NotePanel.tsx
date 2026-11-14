import { renderTwemoji } from "../render/emoji";
import {
  Box,
  Button,
  ButtonGroup,
  Divider,
  InputBase,
  Tooltip,
  Typography,
} from "@mui/material";
import { darken, styled } from "@mui/material/styles";
import { Actions, TabNode } from "flexlayout-react";
import {
  CodeTags,
  DotsVertical,
  FilePresentationBox,
  Pencil,
  TableOfContents,
} from "mdi-material-ui";
import path from "path-browserify";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import type { TextPosition } from "../editor/handle";
import { NoteEditor, type EditorDisplay } from "../editor/noteEditor";
import { outline } from "../editor/outline";
import { EditorMode } from "../lib/editorMode";
import {
  ChangedNoteFilePathEventData,
  DeletedNotebookEventData,
  DeletedNoteEventData,
  EventType,
  globalEmitter,
  ModifiedMarkdownEventData,
  PerformedGitOperationEventData,
} from "../lib/event";
import { readNoteText } from "../lib/frontMatter";
import { Note } from "../lib/note";
import { Notebook } from "../lib/notebook";
import { tagCompletions, wikiLinkCompletions } from "../lib/noteCompletions";
import { isFinishingEnter } from "../lib/keys";
import { failureMessage, notify } from "../lib/notifications";
import {
  joinNote,
  leaveNote,
  moveNote,
  type OpenNote,
  type OpenNoteCalls,
} from "../lib/openNotes";
import { Reference } from "../lib/reference";
import { onTabVisibility } from "../lib/tabVisibility";
import { MountedPreview, mountPreview } from "../render";
import { setTheme } from "../themes/manager";
import { resolveNoteImageSrc } from "../utilities/image";
import { openURL } from "../utilities/preview";
import { debounce } from "../utilities/utils";
import EditImageDialog, { type EditedImage } from "./EditImageDialog";
import { Loading } from "./Loading";
import { NoteNotFound } from "./NoteNotFound";
import NotePopover from "./NotePopover";
import NotesPanel from "./NotesPanel";
import {
  drawSlashCommandIcon,
  prepareSlashCommandIcons,
  slashCommandDescription,
} from "./slashCommands";
import SplitPane from "./SplitPane";

const previewZIndex = 99;
// A missing or hand-edited entry parses to NaN, which would otherwise reach
// the panel as `width: NaNpx`.
const storedTocPanelWidth = parseInt(
  localStorage.getItem("toc-panel-width") || "",
);
let tocPanelWidth = Number.isFinite(storedTocPanelWidth)
  ? storedTocPanelWidth
  : 300;
const tocPanelMinWidth = 150;
const tocPanelMaxWidth = 350;
const bottomPanelHeight = 20;

const Row = styled(Box)({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
});

const NotePanelRoot = styled(Box)(({ theme }) => ({
  "height": "100%",
  "overflow": "hidden",
  "backgroundColor": theme.palette.background.paper,
  "& .reference-highlight": {
    backgroundColor: `${theme.palette.warning.light} !important`,
  },
}));

const TopPanel = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  padding: "4px 0 0",
  position: "relative",
  backgroundColor: "inherit",
  [theme.breakpoints.down("md")]: {
    padding: "0",
  },
}));

const ContentPanel = styled(Box)({
  position: "relative",
  height: `calc(100% - 48px - ${bottomPanelHeight}px)`,
  display: "block",
});

const EditorContentPanel = styled(Box)({
  display: "block",
  overflow: "auto",
  height: "100%",
});

// The divider between the two panes is drawn by the split pane itself, so the
// border this used to carry would be a second hairline right beside it.
const TocPanel = styled(Box)({
  height: "100%",
  padding: "0",
  overflow: "auto",
  paddingTop: "32px",
});

const Toc = styled("div")(({ theme }) => ({
  "& .toc-item": {
    cursor: "pointer",
    // borderBottom: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
    padding: ".5em",
  },
  "& .toc-item:hover": {
    backgroundColor: darken(theme.palette.background.paper, 0.06),
  },
  "& .emoji": {
    height: "1rem",
    top: "2px",
    position: "relative",
  },
}));

// How the editor shows a note in each of the panel's modes that has one.
function displayOf(editorMode: EditorMode): EditorDisplay {
  return editorMode === EditorMode.SourceCode ? "source" : "live";
}

// The editor fills the wrapper and scrolls inside itself; its colours are the
// theme's own (editor/theme.ts).
const EditorWrapper = styled(Box)(({ theme }) => ({
  "position": "relative",
  "flex": 1,
  "overflow": "auto",
  "backgroundColor": "inherit",
  "& .cm-editor": {
    width: "100%",
    maxWidth: "100%",
    margin: "0 auto",
    height: "100%",
    padding: theme.spacing(0, 1),
    [theme.breakpoints.down("md")]: {
      padding: theme.spacing(1),
    },
  },
}));

const EditorHost = styled("div")({
  width: "100%",
  height: "100%",
});

const Preview = styled("div")(({ theme }) => ({
  "position": "relative",
  "left": "0",
  "top": "0",
  // width: "800px",
  "width": "100%",
  "maxWidth": "100%",
  "margin": "0 auto",
  "height": "100%",
  "border": "none",
  "overflow": "auto !important",
  "padding": theme.spacing(1, 2),
  "zIndex": previewZIndex,
  [theme.breakpoints.down("md")]: {
    padding: theme.spacing(1),
  },
  "& span.emoji": {
    height: "1.2em !important",
    width: "1.2em !important",
    top: ".2em !important",
    position: "relative",
  },
}));

const TocButtonGroup = styled(ButtonGroup)({
  position: "absolute",
  top: "60px",
  right: "8px",
  zIndex: previewZIndex + 1,
});

const ControlButton = styled(Button)(({ theme }) => ({
  padding: theme.spacing(0.5, 0),
  color: theme.palette.text.secondary,
}));

const BottomPanel = styled(Box)(({ theme }) => ({
  position: "absolute",
  bottom: "0",
  width: "100%",
  padding: theme.spacing(0.5, 1),
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  maxHeight: `${bottomPanelHeight}px`,
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.getContrastText(theme.palette.primary.main),
  zIndex: previewZIndex + 1,
}));

const FilePath = styled(Typography)({
  wordBreak: "break-all",
});

const CursorPositionInfo = styled(Box)({
  // position: "absolute",
  // right: "16px",
  // bottom: "16px",
  zIndex: 150,
});

// The three conditional rules; sx keeps the condition at the call site.
const controlBtnSelectedSx = { color: "primary.main" } as const;

interface Props {
  notebook: Notebook;
  noteFilePath: string;
  tabNode: TabNode;
  reference?: Reference;
}
export default function NotePanel(props: Props) {
  const tabNode = props.tabNode;
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();
  const { t } = useTranslation();
  const [noteTitle, setNoteTitle] = useState<string>("");
  const [note, setNote] = useState<Note>(null);
  // The note's text, undo history and saver, shared with every other tab the
  // note is open in; and this tab's editor of it.
  const [openNote, setOpenNote] = useState<OpenNote>(null);
  const [editor, setEditor] = useState<NoteEditor>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(
    settingsContainer.defaultEditorMode,
  );
  const tocElement = useRef<HTMLDivElement>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const mountedPreview = useRef<MountedPreview>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const [cursorPosition, setCursorPosition] = useState<TextPosition>({
    line: 0,
    ch: 0,
  });
  const [editedImage, setEditedImage] = useState<EditedImage>(null);
  const [editImageDialogOpen, setEditImageDialogOpen] =
    useState<boolean>(false);
  const [notePopoverElement, setNotePopoverElement] = useState<Element>(null);
  const [gitStatus, setGitStatus] = useState<string>("");
  const [tocEnabled, setTocEnabled] = useState<boolean>(
    false, // props.tabNode.getTabRect().width >= 500,
  );
  const isMounted = useRef<boolean>(false);
  // The file a rename is moving the note away from, until the note shown has
  // moved off it. Enter renames the note and so does leaving the box, which
  // Tab straight after Enter does; neither may start a second rename of a
  // file the first is still moving, or has moved before the panel shows it.
  const renamingFrom = useRef<string>(null);
  // What the editor, made once, reads as of the latest commit.
  const latest = useRef<{
    note: Note;
    notebook: Notebook;
    t: typeof t;
    editorMode: EditorMode;
    sourceCodeLineNumbers: boolean;
  }>(null);
  useLayoutEffect(() => {
    latest.current = {
      note,
      notebook: props.notebook,
      t,
      editorMode,
      sourceCodeLineNumbers: settingsContainer.sourceCodeLineNumbers,
    };
  });
  const confirmNoteTitle = useCallback(() => {
    const finalNoteTitle = noteTitle.trim().replace(/\//g, "-");
    if (!note || note.filePath === renamingFrom.current) {
      return;
    }
    if (!finalNoteTitle.length || note.title.trim() === finalNoteTitle) {
      // Nothing to rename to: show the name the note has.
      setNoteTitle(note.title);
      return;
    }

    renamingFrom.current = note.filePath;
    crossnoteContainer
      .changeNoteFilePath(
        tabNode,
        note,
        path.join(path.dirname(note.filePath), `${finalNoteTitle}.md`),
      )
      .then((note) => {
        setNote(note);
      })
      .catch((error) => {
        renamingFrom.current = null;
        notify({
          severity: "error",
          message: t("error/failed-to-change-file-path"),
          duration: 5000,
        });
        setNoteTitle(note.title);
      });
  }, [noteTitle, note, tabNode, t]);

  const showPreview = useCallback(
    (text: string) => {
      const element = previewElement.current;
      if (!element) {
        return;
      }
      // The preview element is a new one each time the preview shows, so
      // what was drawn into the last one is disposed of here.
      mountedPreview.current?.dispose();
      const preview = mountPreview(element, text, { note });
      mountedPreview.current = preview;
      element.scrollTop = 0;
    },
    [note],
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!note || !crossnoteContainer.layoutModel || !tabNode) {
      return;
    }
    if (note.filePath !== renamingFrom.current) {
      renamingFrom.current = null;
    }
    setNoteTitle(note.title);
    crossnoteContainer.layoutModel.doAction(
      Actions.renameTab(tabNode.getId(), note.title),
    );
  }, [note, crossnoteContainer.layoutModel, tabNode]);

  // What the note's saver calls on, as of this tab's latest commit. The note
  // may be open in other tabs too: whichever drew last answers.
  const noteCalls = useRef<OpenNoteCalls>(null);
  const [writtenCount, setWrittenCount] = useState<number>(0);
  useLayoutEffect(() => {
    noteCalls.current = {
      write: (writer, location, text) =>
        crossnoteContainer.updateNoteMarkdown(
          writer,
          location.notebookPath,
          location.filePath,
          text,
        ),
      // Said once; what was typed stays in the editor for the next change to
      // save, and the page asks before it is left with it.
      failed: (error) => {
        notify({
          severity: "error",
          message: failureMessage(t("error/failed-to-save-note"), error),
          duration: 5000,
        });
      },
    };
    if (openNote) {
      openNote.calls = noteCalls.current;
    }
  });

  // Joins the note's other tabs, or opens the note with the text the
  // notebook holds, once the note has loaded; leaves with the panel.
  const noteLoaded = !!note;
  useEffect(() => {
    if (!noteLoaded) {
      return;
    }
    const { note } = latest.current;
    const tabId = tabNode.getId();
    const joined = joinNote(
      tabId,
      { notebookPath: note.notebookPath, filePath: note.filePath },
      note.markdown || "",
      noteCalls.current,
      note.lineBreak,
    );
    setOpenNote(joined);
    return () => {
      leaveNote(joined, tabId);
      setOpenNote(null);
    };
  }, [noteLoaded, tabNode]);

  // The status bar's git status follows what is written.
  useEffect(() => {
    if (!openNote) {
      return;
    }
    return openNote.onWritten(() => {
      if (isMounted.current) {
        setWrittenCount((count) => count + 1);
      }
    });
  }, [openNote]);

  useEffect(() => {
    if (openNote && note) {
      moveNote(openNote, {
        notebookPath: note.notebookPath,
        filePath: note.filePath,
      });
    }
  }, [openNote, note]);

  // Emitter
  useEffect(() => {
    if (!globalEmitter || !tabNode || !note || !openNote) {
      return;
    }

    const modifiedMarkdownCallback = (data: ModifiedMarkdownEventData) => {
      const here =
        data.notebookPath === note.notebookPath &&
        data.noteFilePath === note.filePath;
      if (here && data.tabId !== tabNode.getId()) {
        note.config = data.noteConfig;
      }
      openNote.written(
        data.tabId,
        { notebookPath: data.notebookPath, filePath: data.noteFilePath },
        data.markdown,
        data.lineBreak,
      );
    };

    const deletedNoteCallback = (data: DeletedNoteEventData) => {
      if (
        data.notebookPath === note.notebookPath &&
        data.noteFilePath === note.filePath
      ) {
        crossnoteContainer.closeTabNode(tabNode.getId());
      }
    };

    const changedNoteFilePathCallback = async (
      data: ChangedNoteFilePathEventData,
    ) => {
      if (
        data.notebookPath === note.notebookPath &&
        data.oldNoteFilePath === note.filePath
      ) {
        const newNote = await crossnoteContainer.getNote(
          data.notebookPath,
          data.newNoteFilePath,
        );
        setNote(newNote);
      }
    };

    const performedGitOperationCallback = async (
      data: PerformedGitOperationEventData,
    ) => {
      if (data.notebookPath === note.notebookPath) {
        const newNote = await crossnoteContainer.getNote(
          data.notebookPath,
          note.filePath,
        );
        if (newNote) {
          setNote(newNote);
          if (openNote.saver.isOwn(newNote.markdown)) {
            if (openNote.document.text() === newNote.markdown) {
              openNote.document.load(newNote.markdown, newNote.lineBreak);
            }
            return;
          }
          openNote.document.load(newNote.markdown, newNote.lineBreak);
          openNote.saver.took(newNote.markdown);
        } else {
          crossnoteContainer.closeTabNode(tabNode.getId());
        }
      }
    };

    const deletedNotebookCallback = (data: DeletedNotebookEventData) => {
      if (data.notebookPath === note.notebookPath) {
        crossnoteContainer.closeTabNode(tabNode.getId());
      }
    };

    globalEmitter.on(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
    globalEmitter.on(EventType.DeletedNote, deletedNoteCallback);
    globalEmitter.on(
      EventType.ChangedNoteFilePath,
      changedNoteFilePathCallback,
    );
    globalEmitter.on(
      EventType.PerformedGitOperation,
      performedGitOperationCallback,
    );
    globalEmitter.on(EventType.DeletedNotebook, deletedNotebookCallback);
    return () => {
      globalEmitter.off(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
      globalEmitter.off(EventType.DeletedNote, deletedNoteCallback);
      globalEmitter.off(
        EventType.ChangedNoteFilePath,
        changedNoteFilePathCallback,
      );
      globalEmitter.off(
        EventType.PerformedGitOperation,
        performedGitOperationCallback,
      );
      globalEmitter.off(EventType.DeletedNotebook, deletedNotebookCallback);
    };
  }, [
    tabNode,
    note,
    openNote,
    crossnoteContainer.layoutModel,
    crossnoteContainer.closeTabNode,
    crossnoteContainer.getNote,
  ]);

  // get note
  const modeChosen = useRef<boolean>(false);
  // Whether the notebook was found to have no note at the tab's path, and
  // how many times it has been looked in again since.
  const [missing, setMissing] = useState<boolean>(false);
  const [lookedFor, setLookedFor] = useState<number>(0);
  useEffect(() => {
    props.notebook
      .refreshNotesIfNotLoaded({
        dir: "./",
        includeSubdirectories: true,
      })
      .then((notes) => {
        const loaded = notes[props.noteFilePath];
        // An empty note opens in the editor rather than the preview. Decided
        // once, with the first note the panel loads: a rename loads the note
        // again from its new path, and that, like a pull replacing the note,
        // would undo a mode chosen since.
        if (loaded && !modeChosen.current) {
          modeChosen.current = true;
          if (loaded.markdown.length === 0) {
            setEditorMode(EditorMode.EchoMD);
          }
        }
        setNote(loaded);
        // The notebook has no note at this path: the tab says so, rather
        // than go on as if the note were still being read.
        setMissing(!loaded);
      })
      .catch((error) => {
        console.error(error);
        setMissing(true);
      });
  }, [props.noteFilePath, props.notebook, lookedFor]);

  // A note that is not there may come: pulled or restored by git, created,
  // or another note renamed to its path. Each has the notebook looked in
  // again.
  useEffect(() => {
    if (!missing) {
      return;
    }
    const notebookPath = props.notebook.dir;
    const lookAgain = () => setLookedFor((times) => times + 1);
    const inNotebook = (data: { notebookPath: string }) => {
      if (data.notebookPath === notebookPath) {
        lookAgain();
      }
    };
    globalEmitter.on(EventType.PerformedGitOperation, inNotebook);
    globalEmitter.on(EventType.CreatedNote, inNotebook);
    globalEmitter.on(EventType.ChangedNoteFilePath, inNotebook);
    return () => {
      globalEmitter.off(EventType.PerformedGitOperation, inNotebook);
      globalEmitter.off(EventType.CreatedNote, inNotebook);
      globalEmitter.off(EventType.ChangedNoteFilePath, inNotebook);
    };
  }, [missing, props.notebook]);

  // Front matter YAML cannot read is kept as it is, and the note's settings
  // are saved before it. Said once, as the note opens: front matter caught
  // half typed later on is still being typed.
  const frontMatterChecked = useRef<boolean>(false);
  useEffect(() => {
    if (note && !frontMatterChecked.current) {
      frontMatterChecked.current = true;
      if (readNoteText(note.markdown).unreadable) {
        notify({
          severity: "warning",
          message: t("warning/front-matter-unreadable"),
          duration: 5000,
        });
      }
    }
  }, [note, t]);

  // The editor: one for the panel, made once the note's shared text is at
  // hand, and taken away with it.
  useEffect(() => {
    if (!openNote || !editorHost.current) {
      return;
    }
    prepareSlashCommandIcons();
    const created = new NoteEditor({
      parent: editorHost.current,
      document: openNote.document,
      display: displayOf(latest.current.editorMode),
      lineNumbers: latest.current.sourceCodeLineNumbers,
      testId: "note-editor",
      placeholder: latest.current.t("editor/placeholder"),
      // Written at once, rather than a moment after the last key.
      onSave: () => {
        openNote.saver.flush().catch(() => {});
      },
      onSelection: (editor) => setCursorPosition(editor.caret()),
      onLinkClick: (link) => {
        // A link, in markdown's form or a wiki link, opens as it does in
        // the preview.
        if (link.kind !== "hashtag") {
          openURL(link.target, latest.current.note);
        }
      },
      images: {
        loadImage: (element, src) => {
          resolveNoteImageSrc(latest.current.note, src)
            .then((url) => {
              element.src = url;
            })
            .catch(() => {});
        },
        onImageClick: (image) => {
          setEditedImage({ ...image, document: created.document.doc });
          setEditImageDialogOpen(true);
        },
      },
      completion: {
        describeCommand: (name) => {
          const key = slashCommandDescription(name);
          return key ? latest.current.t(key) : "";
        },
        drawCommandIcon: drawSlashCommandIcon,
        tags: (typed) =>
          tagCompletions(latest.current.notebook, latest.current.note, typed),
        wikiLinks: (typed) =>
          wikiLinkCompletions(
            latest.current.notebook,
            latest.current.note,
            typed,
          ),
      },
    });
    if (latest.current.editorMode === EditorMode.Preview) {
      created.setHidden(true);
    }
    setEditor(created);
    if (tabNode.getRect()) {
      setTocEnabled(tabNode.getRect().width >= 500);
    }
    return () => {
      created.destroy();
      setEditor(null);
    };
  }, [openNote, tabNode]);

  useEffect(() => {
    editor?.refreshImages();
  }, [editor, note?.notebookPath, note?.filePath]);

  // Render Preview
  useEffect(() => {
    if (
      editorMode === EditorMode.Preview &&
      editor &&
      openNote &&
      note &&
      previewElement
    ) {
      showPreview(openNote.document.text());
      // Drawn again a moment after the note's text changes under it: typed
      // in another tab, or taken from the notebook.
      let timer: ReturnType<typeof setTimeout> = null;
      const stop = openNote.document.onChange(() => {
        clearTimeout(timer);
        timer = setTimeout(() => showPreview(openNote.document.text()), 300);
      });
      // Leaving the preview, or the panel going, disposes of the drawing:
      // images still being read are not written.
      return () => {
        stop();
        clearTimeout(timer);
        mountedPreview.current?.dispose();
      };
    }
  }, [editorMode, editor, openNote, previewElement, note, showPreview, t]);

  // Check need to highlight reference
  useEffect(() => {
    if (props.reference) {
      if (editorMode === EditorMode.Preview && previewElement.current) {
        const highlightedElements = previewElement.current.querySelectorAll(
          ".reference-highlight",
        );
        for (let i = 0; i < highlightedElements.length; i++) {
          highlightedElements[i].classList.remove("reference-highlight");
        }

        // The id comes from the note's text and may not be a valid
        // selector as it is.
        const element = props.reference.elementId
          ? previewElement.current.querySelector(
              `#${CSS.escape(props.reference.elementId)}`,
            )
          : null;
        if (element) {
          element.classList.add("reference-highlight");
          element.scrollIntoView({
            behavior: "auto",
            block: "center",
            inline: "center",
          });
          const removeHighlightClass = () => {
            element.classList.remove("reference-highlight");
          };
          const previewElementCurrent = previewElement.current;
          previewElementCurrent.addEventListener("click", removeHighlightClass);
          return () => {
            previewElementCurrent.removeEventListener(
              "click",
              removeHighlightClass,
            );
          };
        }
      } else if (editor) {
        const lineNo = props.reference.lines[0];
        if (typeof lineNo === "number") {
          editor.revealLine(lineNo);
        }
      }
    }
  }, [props.reference, editorMode, editor, previewElement]);

  // Toggle editor & preview: the editor stays as it is under the preview,
  // text, selection and undo history, and is shown again as the mode asks.
  useEffect(() => {
    if (!editor) {
      return;
    }
    if (editorMode === EditorMode.Preview) {
      editor.setHidden(true);
    } else {
      editor.show(
        displayOf(editorMode),
        settingsContainer.sourceCodeLineNumbers,
      );
      editor.setHidden(false);
    }
  }, [editorMode, editor, settingsContainer.sourceCodeLineNumbers]);

  // TOC
  useEffect(() => {
    if (!editor || !openNote || !tocElement.current || !note || !tocEnabled) {
      return;
    }
    const element = tocElement.current;

    let lastTOC = "";
    const draw = () => {
      const items = [
        { line: 0, level: 1, text: note.title },
        ...outline(editor.view.state),
      ];
      const newTOC = JSON.stringify(items);
      if (newTOC === lastTOC) {
        return;
      }
      lastTOC = newTOC;
      element.replaceChildren(
        ...items.map(({ line, level, text }) => {
          const item = document.createElement("div");
          item.className = "toc-item";
          item.dataset.line = String(line);
          item.style.paddingLeft = `${level}em`;
          item.textContent = text;
          return item;
        }),
      );
      renderTwemoji(element);
    };
    const update = debounce(draw, 300);

    const tocClick = (event: Event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>(
        ".toc-item",
      );
      if (!item) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const lineNo = parseInt(item.dataset.line);
      if (editorMode === EditorMode.Preview) {
        // In this panel's preview: another tab's may show the same line.
        previewElement.current
          ?.querySelector(`[data-line="${lineNo}"]`)
          ?.scrollIntoView();
      } else {
        editor.revealLine(lineNo);
        editor.focus();
      }
    };

    const stop = openNote.document.onChange(update);
    element.addEventListener("click", tocClick);
    draw();

    return () => {
      stop();
      element.removeEventListener("click", tocClick);
    };
  }, [
    editor,
    openNote,
    editorMode,
    previewElement,
    tocElement,
    note,
    tocEnabled,
  ]);

  // Git Status, read again as the note changes and once what is typed has
  // been written. A reading that git cannot give (as it may while a reset
  // rewrites the index) leaves the status as it was, and one that comes back
  // after a newer one was asked for is dropped.
  useEffect(() => {
    if (!note || !isMounted.current) {
      return;
    }
    let latest = true;
    crossnoteContainer
      .getStatus(note.notebookPath, note.filePath)
      .then((status) => {
        if (latest) {
          setGitStatus(status);
        }
      })
      .catch(() => {});
    return () => {
      latest = false;
    };
  }, [note, writtenCount, crossnoteContainer.getStatus]);

  // Set theme: the page's, which the preview and the editor both follow.
  useEffect(() => {
    if (settingsContainer.theme) {
      setTheme({ themeName: settingsContainer.theme.name });
    }
  }, [settingsContainer.theme]);

  // TabNode becomes visible
  useEffect(() => {
    if (!tabNode || !note) {
      return;
    }
    globalEmitter.emit(EventType.FocusedOnNote, {
      notebookPath: note.notebookPath,
      noteFilePath: note.filePath,
    });
  }, [note, tabNode]);
  useEffect(() => {
    if (!tabNode || !note || !globalEmitter) {
      return;
    }
    return onTabVisibility(tabNode, (visible) => {
      if (visible) {
        // What changed while the tab was in the background (a mode swap made
        // from the settings tab, say) was laid out with no size. FlexLayout
        // tells of this while it is still rendering, so measure again once
        // the tab has been committed to the DOM.
        if (editor) {
          setTimeout(() => editor.view.requestMeasure(), 0);
        }
        globalEmitter.emit(EventType.FocusedOnNote, {
          notebookPath: note.notebookPath,
          noteFilePath: note.filePath,
        });
      }
    });
  }, [tabNode, note, editor]);

  if (!note) {
    return missing ? (
      <NoteNotFound
        notebookName={props.notebook.name}
        filePath={props.noteFilePath}
      ></NoteNotFound>
    ) : (
      <Loading></Loading>
    );
  }

  const tocVisible = tocEnabled;

  return (
    <NotePanelRoot>
      <TopPanel
        className={"editor-toolbar"}
        style={{
          backgroundColor:
            settingsContainer.theme.name === "light" ? "#fff" : "inherit",
        }}
      >
        <Row style={{ width: "100%" }}>
          <InputBase
            value={noteTitle}
            style={{
              fontSize: "1.5rem",
              fontWeight: 400,
              marginLeft: "6px",
            }}
            placeholder={t("general/title")}
            fullWidth={true}
            onChange={(event) => setNoteTitle(event.currentTarget.value)}
            // Enter renames the note, and so does leaving the box. An Enter
            // that confirms an input method's candidate is part of typing the
            // title.
            onBlur={confirmNoteTitle}
            onKeyDown={(event) => {
              if (isFinishingEnter(event.nativeEvent)) {
                confirmNoteTitle();
              }
            }}
          ></InputBase>
          <ButtonGroup
            variant="text"
            color="inherit"
            aria-label="editor mode"
            size="small"
          >
            <Tooltip title={t("editor/note-control/preview")}>
              <ControlButton
                aria-label={t("editor/note-control/preview")}
                aria-pressed={editorMode === EditorMode.Preview}
                sx={
                  editorMode === EditorMode.Preview
                    ? controlBtnSelectedSx
                    : undefined
                }
                color={
                  editorMode === EditorMode.Preview ? "primary" : "inherit"
                }
                onClick={() => setEditorMode(EditorMode.Preview)}
              >
                <FilePresentationBox></FilePresentationBox>
              </ControlButton>
            </Tooltip>
            <Tooltip title={t("general/echomd")}>
              <ControlButton
                aria-label={t("general/echomd")}
                aria-pressed={editorMode === EditorMode.EchoMD}
                sx={
                  editorMode === EditorMode.EchoMD
                    ? controlBtnSelectedSx
                    : undefined
                }
                color={editorMode === EditorMode.EchoMD ? "primary" : "inherit"}
                onClick={() => setEditorMode(EditorMode.EchoMD)}
              >
                <Pencil></Pencil>
              </ControlButton>
            </Tooltip>
            <Tooltip title={t("editor/note-control/source-code")}>
              <ControlButton
                aria-label={t("editor/note-control/source-code")}
                aria-pressed={editorMode === EditorMode.SourceCode}
                sx={
                  editorMode === EditorMode.SourceCode
                    ? controlBtnSelectedSx
                    : undefined
                }
                color={
                  editorMode === EditorMode.SourceCode ? "primary" : "inherit"
                }
                onClick={() => setEditorMode(EditorMode.SourceCode)}
              >
                <CodeTags></CodeTags>
              </ControlButton>
            </Tooltip>
          </ButtonGroup>
          <ButtonGroup
            variant="text"
            color="inherit"
            aria-label="actions"
            size="small"
          >
            <ControlButton
              aria-label={t("general/note-menu")}
              onClick={(event) => setNotePopoverElement(event.currentTarget)}
            >
              <DotsVertical></DotsVertical>
            </ControlButton>
          </ButtonGroup>
          <TocButtonGroup
            variant="text"
            color="inherit"
            aria-label="table of contents"
            size="small"
          >
            <ControlButton
              aria-label={t("general/table-of-contents")}
              sx={tocEnabled ? controlBtnSelectedSx : undefined}
              onClick={() => setTocEnabled(!tocEnabled)}
            >
              <TableOfContents></TableOfContents>
            </ControlButton>
          </TocButtonGroup>
        </Row>
        <Divider></Divider>
      </TopPanel>
      <ContentPanel>
        <SplitPane
          primary={"second"}
          defaultSize={tocPanelWidth}
          minSize={tocPanelMinWidth}
          maxSize={tocPanelMaxWidth}
          sizedPaneHidden={!tocVisible}
          label={t("general/table-of-contents")}
          onResizeEnd={(newSize: number) => {
            tocPanelWidth = newSize;
            localStorage.setItem("toc-panel-width", `${tocPanelWidth}`);
          }}
        >
          <EditorContentPanel>
            <EditorWrapper>
              <EditorHost ref={editorHost}></EditorHost>
              {editorMode === EditorMode.Preview && editor ? (
                <Preview
                  className={"preview"}
                  data-testid="note-preview"
                  ref={previewElement}
                ></Preview>
              ) : null}
            </EditorWrapper>
            <Box style={{ marginTop: "32px" }}></Box>
            <NotesPanel
              title={t("general/References")}
              tabNode={props.tabNode}
              notebook={props.notebook}
              note={note}
            ></NotesPanel>
          </EditorContentPanel>
          <TocPanel>
            <Toc ref={tocElement}></Toc>
          </TocPanel>
        </SplitPane>
      </ContentPanel>
      <BottomPanel className={"editor-bottom-panel"}>
        <Row>
          <FilePath variant={"caption"}>
            {props.notebook.name +
              ": " +
              note.filePath +
              (gitStatus ? " - " + t(`git/status/${gitStatus}`) : "")}
          </FilePath>
        </Row>
        {editorMode !== EditorMode.Preview && (
          <CursorPositionInfo>
            <Typography variant={"caption"}>
              {`${t("editor/ln")} ${cursorPosition.line + 1}, ${t(
                "editor/col",
              )} ${cursorPosition.ch}`}
            </Typography>
          </CursorPositionInfo>
        )}
      </BottomPanel>

      <EditImageDialog
        open={editImageDialogOpen}
        onClose={() => setEditImageDialogOpen(false)}
        editor={editor}
        image={editedImage}
        note={note}
      ></EditImageDialog>

      <NotePopover
        tabNode={props.tabNode}
        note={note}
        anchorElement={notePopoverElement}
        onClose={() => setNotePopoverElement(null)}
      ></NotePopover>
    </NotePanelRoot>
  );
}
