import { debounce } from "@0xgg/echomd";
import { EmojiDefinitions } from "@0xgg/echomd/addon/emoji";
import { renderPreview, renderTwemoji } from "@0xgg/echomd/preview";
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  IconButton,
  InputBase,
  Tooltip,
  Typography,
} from "@mui/material";
import { darken, styled } from "@mui/material/styles";
import {
  Editor as CodeMirrorEditor,
  EditorChangeLinkedList,
  Position as CursorPosition,
  TextMarker,
} from "codemirror";
import { Actions, TabNode } from "flexlayout-react";
import {
  Close,
  CodeTags,
  DotsVertical,
  FilePresentationBox,
  Pencil,
  TableOfContents,
} from "mdi-material-ui";
import path from "path-browserify";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { initMathPreview } from "../editor/views/math-preview";
import {
  applyCodeMirrorMode,
  EditorMode,
  HYPERMD_MODE,
  markdownState,
} from "../lib/editorMode";
import {
  ChangedNoteFilePathEventData,
  DeletedNotebookEventData,
  DeletedNoteEventData,
  EventType,
  globalEmitter,
  ModifiedMarkdownEventData,
  PerformedGitOperationEventData,
} from "../lib/event";
import { Note } from "../lib/note";
import { Notebook } from "../lib/notebook";
import { isFinishingEnter } from "../lib/keys";
import { notify } from "../lib/notifications";
import { Reference } from "../lib/reference";
import { TabNodeConfig } from "../lib/tabNode";
import { setTheme } from "../themes/manager";
import { resolveNoteImageSrc } from "../utilities/image";
import {
  openURL,
  postprocessPreview as previewPostprocessPreview,
} from "../utilities/preview";
import EditImageDialog from "./EditImageDialog";
import { Emoji } from "./EmojiWrapper";
import IconPopover from "./IconPopover";
import { Loading } from "./Loading";
import NotePopover from "./NotePopover";
import NotesPanel from "./NotesPanel";
import SplitPane from "./SplitPane";
import * as EchoMD from "@0xgg/echomd/core";

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

const HMDFold = {
  image: true,
  link: true,
  math: true,
  html: true, // maybe dangerous
  emoji: true,
  widget: true,
  code: true,
};

interface CommandHint {
  text: string;
  command: string;
  description: string;
  icon?: string;
  render: (
    element: HTMLElement,
    data: CommandHint[],
    current: CommandHint,
  ) => void;
}

interface EmojiHint {
  shortName: string;
  text: string;
  displayText: string;
  render: (element: HTMLElement, data: EmojiHint[], current: EmojiHint) => void;
}

const codeMirrorSelectCss = {
  background: `#5091DA !important`,
  color: `#fff !important`,
};

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

// Carried over verbatim: R3 replaces CodeMirror 5, and none of these
// class names survive that, so they all get rewritten then anyway.
const EditorWrapper = styled(Box)(({ theme }) => ({
  "position": "relative",
  "flex": 1,
  "overflow": "auto",
  "backgroundColor": "inherit",
  // "width": "800px",
  // "margin": "0 auto",
  // "maxWidth": "100%",
  "& .CodeMirror-gutters": {
    display: "none",
  },
  "& .CodeMirror-code": {
    width: "100%",
  },
  "& .CodeMirror": {
    // width: "800px",
    width: "100%",
    maxWidth: "100%",
    margin: "0 auto",
    height: "100%",
    padding: theme.spacing(0, 1),
    backgroundColor: `${theme.palette.background.paper} !important`,
    [theme.breakpoints.down("md")]: {
      padding: theme.spacing(1),
    },
  },
  "& .CodeMirror-vscrollbar": {
    // display: "none !important",
  },
  "& .CodeMirror-placeholder": {
    color: `${theme.palette.text.disabled} !important`,
  },
  /*
    CodeMirror selected text css:
      .CodeMirror-selected { background: red; }
      .CodeMirror-focused .CodeMirror-selected { background: blue; }
      .CodeMirror-crosshair { cursor: crosshair; }
      .CodeMirror-line::selection, .CodeMirror-line > span::selection, .CodeMirror-line > span > span::selection { background: #yellow; }
      .CodeMirror-line::-moz-selection, .CodeMirror-line > span::-moz-selection, .CodeMirror-line > span > span::-moz-selection { background: #purple; }
    */
  "& .CodeMirror-selected": codeMirrorSelectCss,
  "& .CodeMirror-focused .CodeMirror-selected": codeMirrorSelectCss,
  "& .CodeMirror-line::selection": codeMirrorSelectCss,
  "& .CodeMirror-line > span::selection": codeMirrorSelectCss,
  "& .CodeMirror-line > span > span::selection ": codeMirrorSelectCss,
  "& .CodeMirror-line::-moz-selection": codeMirrorSelectCss,
  "& .CodeMirror-line > span::-moz-selection": codeMirrorSelectCss,
  "& .CodeMirror-line > span > span::-moz-selection": codeMirrorSelectCss,
  /*
    [theme.breakpoints.down("md")]: {
      padding: theme.spacing(1),
    },
    */

  "& .CodeMirror span.emoji": {
    height: "1.2em !important",
    width: "1.2em !important",
    top: ".2em !important",
    position: "relative",
  },
}));

const EditorTextArea = styled("textarea")({
  width: "100%",
  height: "100%",
  backgroundColor: "inherit",
  border: "none",
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
  "backgroundColor": `${theme.palette.background.paper} !important`,
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

const FloatWin = styled(Card)(({ theme }) => ({
  position: "fixed",
  zIndex: 100,
  background: theme.palette.background.paper,
  borderRadius: "5px",
  overflow: "hidden",
  minWidth: "200px",
  maxWidth: "70%",
}));

const FloatWinTitle = styled(Box)({
  display: "flex",
  alignItems: "center",
  background: "#579",
  color: "#eee",
});

const FloatWinContent = styled(Box)({
  maxHeight: "80vh",
  overflow: "auto",
  padding: "10px 20px",
});

const FloatWinClose = styled(IconButton)({
  color: "#eee",
});

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

const presentationSx = {
  padding: "0 !important",
  overflow: "hidden !important",
} as const;

const editorPresentationSx = { height: "100%" } as const;

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
  const [noteIcon, setNoteIcon] = useState<string>("");
  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(
    settingsContainer.defaultEditorMode,
  );
  const tocElement = useRef<HTMLDivElement>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const [previewIsPresentation, setPreviewIsPresentation] =
    useState<boolean>(false);
  const textAreaElement = useRef<HTMLTextAreaElement>(null);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    line: 0,
    ch: 0,
  });
  const mathPreviewElement = useRef<HTMLDivElement>(null);
  const [editImageElement, setEditImageElement] =
    useState<HTMLImageElement>(null);
  const [editImageTextMarker, setEditImageTextMarker] =
    useState<TextMarker>(null);
  const [editImageDialogOpen, setEditImageDialogOpen] =
    useState<boolean>(false);
  const [notePopoverElement, setNotePopoverElement] = useState<Element>(null);
  const [iconPopoverElement, setIconPopoverElement] = useState<Element>(null);
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

  const postprocessPreview = useCallback(
    (previewElement: HTMLElement) => {
      previewPostprocessPreview(previewElement, note, (flag) => {
        setPreviewIsPresentation(flag);
      });
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
    if (!note) {
      return () => {
        setEditor(null);
      };
    } else {
      if (note.markdown.length === 0) {
        setEditorMode(EditorMode.EchoMD);
      }
    }
  }, [note]);

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

  // Emitter
  useEffect(() => {
    if (!globalEmitter || !tabNode || !editor || !note) {
      return;
    }

    const modifiedMarkdownCallback = (data: ModifiedMarkdownEventData) => {
      const updateNoteIcon = () => {
        const tabNodeConfig: TabNodeConfig = tabNode.getConfig();
        tabNodeConfig.icon = data.noteConfig.icon;
        setNoteIcon(data.noteConfig.icon);
        crossnoteContainer.layoutModel.doAction(
          Actions.updateNodeAttributes(tabNode.getId(), {
            config: tabNodeConfig,
          }),
        );
      };
      if (data.tabId === tabNode.getId()) {
        return updateNoteIcon();
      }
      if (
        data.notebookPath === note.notebookPath &&
        data.noteFilePath === note.filePath
      ) {
        note.config = data.noteConfig;
        if (editor.getValue() !== data.markdown) {
          editor.setValue(data.markdown);
        }
        return updateNoteIcon();
      }
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
          if (editor.getValue() !== newNote.markdown) {
            editor.setValue(newNote.markdown);
          }
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
    editor,
    note,
    crossnoteContainer.layoutModel,
    crossnoteContainer.closeTabNode,
    crossnoteContainer.getNote,
  ]);

  // get note
  useEffect(() => {
    props.notebook
      .refreshNotesIfNotLoaded({
        dir: "./",
        includeSubdirectories: true,
      })
      .then((notes) => {
        setNote(notes[props.noteFilePath]);
      })
      .catch((error) => {
        console.error(error);
      });
  }, [props.noteFilePath, props.notebook]);

  // set note icon
  useEffect(() => {
    if (note) {
      setNoteIcon(note.config.icon);
    }
  }, [note]);

  // Set editor
  useEffect(() => {
    if (textAreaElement.current && !editor && note) {
      const editor: CodeMirrorEditor = EchoMD.fromTextArea(
        textAreaElement.current,
        {
          mode: HYPERMD_MODE,
          // inputStyle: "textarea", // Break mobile device paste functionality
          hmdFold: HMDFold,
          keyMap: settingsContainer.keyMap,
          showCursorWhenSelecting: true,
          inputStyle: "contenteditable",
          // The insert-file add-on gets no file handler here, so it inserts
          // nothing; left on for drops, it still moves the caret to wherever
          // anything is dropped, a dragged tab included.
          hmdInsertFile: { byPaste: true, byDrop: false },
          hmdClick: (info: any, cm: CodeMirrorEditor) => {
            let { text, url } = info;
            if (info.type === "link" || info.type === "url") {
              const footnoteRef = text.match(/\[[^[\]]+\](?:\[\])?$/); // bare link, footref or [foot][] . assume no escaping char inside
              if (!footnoteRef && (info.ctrlKey || info.altKey) && url) {
                // Hack: Fix a wikilink click bug when clicking text like "[[haha]]."
                if (url.startsWith("[[")) {
                  url = url.slice(2, url.length);
                  const i = url.lastIndexOf("]]");
                  if (i > 0) {
                    url = url.slice(0, i);
                  }
                }

                // just open URL
                openURL(url, note);
                return false; // Prevent default click event
              }
            }
          },
        },
      );
      editor.setOption("lineNumbers", false);
      editor.setOption("foldGutter", false);
      editor.setValue(note.markdown || "");
      editor.on("cursorActivity", (instance) => {
        const cursor = instance.getCursor();
        if (cursor) {
          setCursorPosition({
            line: cursor.line,
            ch: cursor.ch,
          });
        }
      });
      setEditor(editor);

      if (props.tabNode.getRect()) {
        setTocEnabled(props.tabNode.getRect().width >= 500);
      }
    }
  }, [textAreaElement, note, editor, props.tabNode, settingsContainer.keyMap]);

  // Save note info to editor
  useEffect(() => {
    if (note && editor) {
      (editor.setOption as any)("note", note);
    }
  }, [note, editor]);

  // Math preview
  useEffect(() => {
    if (editor && mathPreviewElement) {
      initMathPreview(editor, mathPreviewElement.current);
    }
  }, [editor, mathPreviewElement]);

  // Render Preview
  useEffect(() => {
    if (editorMode === EditorMode.Preview && editor && note && previewElement) {
      try {
        renderPreview(previewElement.current, editor.getValue());
        postprocessPreview(previewElement.current);
        previewElement.current.scrollTop = 0;
      } catch (error) {
        previewElement.current.innerText = String(error);
      }
    }
  }, [editorMode, editor, previewElement, note, postprocessPreview, t]);

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

        const element = previewElement.current.querySelector(
          `#` + props.reference.elementId,
        );
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
      } /* else if (editor) { // <= Doesn't work very well
        const line = (props.reference.parentToken.map || [])[0];
        console.log("refer line: ", line);
        if (typeof line === "number") {
          const lineText = editor.getLine(line);
          editor.markText(
            { line, ch: 0 },
            { line, ch: lineText.length },
            {
              className: "reference-highlight",
              clearOnEnter: true,
              atomic: true,
            },
          );
        }
      }*/ else if (editor) {
        const lineNo = (props.reference.parentToken.map || [])[0];
        if (typeof lineNo === "number") {
          editor.setCursor({ line: editor.lastLine(), ch: 0 });
          setTimeout(function () {
            editor.setCursor({ line: lineNo, ch: 0 });
          }, 10);
        }
      }
    }
  }, [props.reference, editorMode, editor, previewElement]);

  // Toggle editor & preview
  useEffect(() => {
    if (!editor || !note) return;
    if (editorMode === EditorMode.EchoMD) {
      applyCodeMirrorMode(
        editor,
        editorMode,
        settingsContainer.plainTextSourceCode,
      );
      EchoMD.switchToHyperMD(editor);
      editor.setOption("hmdFold" as any, HMDFold);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    } else if (editorMode === EditorMode.SourceCode) {
      // Styled source by default: HyperMD keeps laying the lines out and
      // only the folding goes. The plain text setting swaps the mode as well.
      applyCodeMirrorMode(
        editor,
        editorMode,
        settingsContainer.plainTextSourceCode,
      );
      EchoMD.switchToNormal(editor);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    } else if (editorMode === EditorMode.Preview) {
      editor.getWrapperElement().style.display = "none";
    }
  }, [editorMode, editor, note, settingsContainer.plainTextSourceCode]);

  // Change markdown
  useEffect(() => {
    if (editor && note && tabNode) {
      const changesHandler = () => {
        if (editor.getOption("readOnly")) {
          // This line is necessary for decryption...
          return;
        }
        const markdown = editor.getValue();
        // Not compared with the note the tab opened with, which saving does
        // not replace: a change back to that text would never be saved.
        // updateNoteMarkdown skips text the notebook already holds.
        setTimeout(() => {
          if (markdown === editor.getValue()) {
            crossnoteContainer.updateNoteMarkdown(
              tabNode,
              note.notebookPath,
              note.filePath,
              markdown,
            );
          }
          if (editorMode === EditorMode.Preview && previewElement.current) {
            try {
              renderPreview(previewElement.current, editor.getValue());
              postprocessPreview(previewElement.current);
              previewElement.current.scrollTop = 0;
            } catch (error) {
              previewElement.current.innerText = String(error);
            }
          }
        }, 300);
      };
      editor.on("changes", changesHandler);

      const imageClickedHandler = (args: any) => {
        const marker: TextMarker = args.marker;
        const imageElement: HTMLImageElement = args.element;
        imageElement.setAttribute(
          "data-marker-position",
          JSON.stringify(marker.find()),
        );
        setEditImageElement(imageElement);
        setEditImageTextMarker(marker);
        setEditImageDialogOpen(true);
      };
      editor.on("imageClicked", imageClickedHandler);

      const loadImage = async (args: any) => {
        const element = args.element;
        const imageSrc = element.getAttribute("data-src");
        element.setAttribute("src", await resolveNoteImageSrc(note, imageSrc));
      };
      editor.on("imageReadyToLoad", loadImage);

      return () => {
        editor.off("changes", changesHandler);
        editor.off("imageClicked", imageClickedHandler);
        editor.off("imageReadyToLoad", loadImage);
      };
    }
  }, [editor, note, tabNode, editorMode, previewElement, postprocessPreview]);

  // Command
  useEffect(() => {
    if (!editor || !note) return;
    const onChangeHandler = (
      instance: CodeMirrorEditor,
      changeObject: EditorChangeLinkedList,
    ) => {
      // Check commands
      if (changeObject.text.length === 1 && changeObject.text[0] === "/") {
        const aheadStr = editor
          .getLine(changeObject.from.line)
          .slice(0, changeObject.from.ch + 1);
        if (!aheadStr.match(/#[^\s]+?\/$/)) {
          // Not `/` inside a tag
          editor.showHint({
            closeOnUnfocus: false,
            completeSingle: false,
            hint: () => {
              const cursor = editor.getCursor();
              const token = editor.getTokenAt(cursor);
              const line = cursor.line;
              const lineStr = editor.getLine(line);
              const end: number = cursor.ch;
              let start = token.start;
              if (lineStr[start] !== "/") {
                start = start - 1;
              }
              const currentWord: string = lineStr
                .slice(start, end)
                .replace(/^\//, "");

              const render = (
                element: HTMLElement,
                data: CommandHint[],
                cur: CommandHint,
              ) => {
                const wrapper = document.createElement("div");
                wrapper.style.padding = "6px 0";
                wrapper.style.display = "flex";
                wrapper.style.flexDirection = "row";
                wrapper.style.alignItems = "flex-start";
                wrapper.style.maxWidth = "100%";
                wrapper.style.minWidth = "200px";

                const leftPanel = document.createElement("div");
                const iconWrapper = document.createElement("div");
                iconWrapper.style.padding = "0 6px";
                iconWrapper.style.marginRight = "6px";
                iconWrapper.style.fontSize = "1rem";

                const iconElement = document.createElement("span");
                iconElement.classList.add("mdi");
                iconElement.classList.add(
                  cur.icon || "mdi-help-circle-outline",
                );
                iconWrapper.appendChild(iconElement);
                leftPanel.appendChild(iconWrapper);

                const rightPanel = document.createElement("div");

                const descriptionElement = document.createElement("p");
                descriptionElement.innerText = cur.description;
                descriptionElement.style.margin = "2px 0";
                descriptionElement.style.padding = "0";

                const commandElement = document.createElement("p");
                commandElement.innerText = cur.command;
                commandElement.style.margin = "0";
                commandElement.style.padding = "0";
                commandElement.style.fontSize = "0.7rem";

                rightPanel.appendChild(descriptionElement);
                rightPanel.appendChild(commandElement);

                wrapper.appendChild(leftPanel);
                wrapper.appendChild(rightPanel);
                element.appendChild(wrapper);
              };

              const commands: CommandHint[] = [
                {
                  text: "# ",
                  command: "/h1",
                  description: t("editor/toolbar/insert-header-1"),
                  icon: "mdi-format-header-1",
                  render,
                },
                {
                  text: "## ",
                  command: "/h2",
                  description: t("editor/toolbar/insert-header-2"),
                  icon: "mdi-format-header-2",
                  render,
                },
                {
                  text: "### ",
                  command: "/h3",
                  description: t("editor/toolbar/insert-header-3"),
                  icon: "mdi-format-header-3",
                  render,
                },
                {
                  text: "#### ",
                  command: "/h4",
                  description: t("editor/toolbar/insert-header-4"),
                  icon: "mdi-format-header-4",
                  render,
                },
                {
                  text: "##### ",
                  command: "/h5",
                  description: t("editor/toolbar/insert-header-5"),
                  icon: "mdi-format-header-5",
                  render,
                },
                {
                  text: "###### ",
                  command: "/h6",
                  description: t("editor/toolbar/insert-header-6"),
                  icon: "mdi-format-header-6",
                  render,
                },
                {
                  text: "> ",
                  command: "/blockquote",
                  description: t("editor/toolbar/insert-blockquote"),
                  icon: "mdi-format-quote-open",
                  render,
                },
                {
                  text: "* ",
                  command: "/ul",
                  description: t("editor/toolbar/insert-unordered-list"),
                  icon: "mdi-format-list-bulleted",
                  render,
                },
                {
                  text: "1. ",
                  command: "/ol",
                  description: t("editor/toolbar/insert-ordered-list"),
                  icon: "mdi-format-list-numbered",
                  render,
                },
                {
                  text: "<!-- @crossnote.image -->\n",
                  command: "/image",
                  description: t("editor/toolbar/insert-image"),
                  icon: "mdi-image",
                  render,
                },
                {
                  text: `|   |   |
|---|---|
|   |   |
`,
                  command: "/table",
                  description: t("editor/toolbar/insert-table"),
                  icon: "mdi-table",
                  render,
                },
                {
                  text:
                    "<!-- @timer " +
                    JSON.stringify({ date: new Date().toString() })
                      .replace(/^{/, "")
                      .replace(/}$/, "") +
                    " -->\n",
                  command: "/timer",
                  description: t("editor/toolbar/insert-clock"),
                  icon: "mdi-timer",
                  render,
                },
                {
                  text: "<!-- @crossnote.audio -->  \n",
                  command: "/audio",
                  description: t("editor/toolbar/insert-audio"),
                  icon: "mdi-music",
                  render,
                },
                //
                // {
                //   text: "<!-- @crossnote.netease_music -->  \n",
                //   displayText: `/netease - ${t(
                //   "editor/toolbar/netease-music",
                //   )}`,
                //  },
                {
                  text: "<!-- @crossnote.video -->  \n",
                  command: "/video",
                  description: t("editor/toolbar/insert-video"),
                  icon: "mdi-video",
                  render,
                },
                {
                  text: "<!-- @crossnote.youtube -->  \n",
                  command: "/youtube",
                  description: t("editor/toolbar/insert-youtube"),
                  icon: "mdi-youtube",
                  render,
                },
                {
                  text: "<!-- @crossnote.bilibili -->  \n",
                  command: "/bilibili",
                  description: t("editor/toolbar/insert-bilibili"),
                  icon: "mdi-television-classic",
                  render,
                },
                {
                  text: "<!-- slide -->  \n",
                  command: "/slide",
                  description: t("editor/toolbar/insert-slide"),
                  icon: "mdi-presentation",
                  render,
                },
                {
                  text: "<!-- @crossnote.ocr -->  \n",
                  command: "/ocr",
                  description: t("editor/toolbar/insert-ocr"),
                  icon: "mdi-ocr",
                  render,
                },
                {
                  text: '<!-- @crossnote.kanban "v":2,"board":{"columns":[]} -->  \n',
                  command: "/kanban",
                  description: `${t("editor/toolbar/insert-kanban")} (beta)`,
                  icon: "mdi-developer-board",
                  render,
                },
                // {
                //   text: "<!-- @crossnote.abc -->  \n",
                //   displayText: `/abc - ${t(
                //      "editor/toolbar/insert-abc-notation",
                //    )}`,
                //  },
                {
                  text: "<!-- @crossnote.github_gist -->  \n",
                  command: "/github_gist",
                  description: t("editor/toolbar/insert-github-gist"),
                  icon: "mdi-github",
                  render,
                },
              ];
              const filtered = commands.filter(
                (item) =>
                  (item.command + item.description)
                    .toLocaleLowerCase()
                    .indexOf(currentWord.toLowerCase()) >= 0,
              );
              return {
                list: filtered.length ? filtered : commands,
                from: { line, ch: start },
                to: { line, ch: end },
              };
            },
          });
        }
      }

      // Check emoji
      if (
        changeObject.text.length === 1 &&
        changeObject.text[0].length > 0 &&
        changeObject.text[0] !== " " &&
        changeObject.text[0] !== ":" &&
        changeObject.from.ch > 0 &&
        editor.getLine(changeObject.from.line)[changeObject.from.ch - 1] === ":"
      ) {
        editor.showHint({
          closeOnUnfocus: true,
          completeSingle: false,
          hint: () => {
            const cursor = editor.getCursor();
            const token = editor.getTokenAt(cursor);
            const line = cursor.line;
            const lineStr = editor.getLine(line);
            const end: number = cursor.ch;
            let start = token.start;
            let doubleSemiColon = false;
            if (lineStr[start] !== ":") {
              start = start - 1;
            }
            if (start > 0 && lineStr[start - 1] === ":") {
              start = start - 1;
              doubleSemiColon = true;
            }
            const currentWord: string = lineStr
              .slice(start, end)
              .replace(/^:+/, "");
            const render = (
              element: HTMLElement,
              data: EmojiHint[],
              cur: EmojiHint,
            ) => {
              const wrapper = document.createElement("div");
              wrapper.style.padding = "6px 0";
              wrapper.style.display = "flex";
              wrapper.style.flexDirection = "row";
              wrapper.style.alignItems = "flex-start";
              wrapper.style.justifyContent = "space-between";
              wrapper.style.maxWidth = "100%";
              wrapper.style.minWidth = "200px";

              const leftPanel = document.createElement("div");
              const shortNameWrapper = document.createElement("div");
              shortNameWrapper.style.padding = "0 6px";
              shortNameWrapper.style.marginRight = "6px";
              shortNameWrapper.style.fontSize = "0.7rem";
              shortNameWrapper.innerText = `:${cur.shortName}:`;
              leftPanel.appendChild(shortNameWrapper);

              const rightPanel = document.createElement("div");
              rightPanel.innerText = EmojiDefinitions[cur.shortName];
              rightPanel.style.padding = "0 6px";
              renderTwemoji(rightPanel);

              wrapper.appendChild(leftPanel);
              wrapper.appendChild(rightPanel);
              element.appendChild(wrapper);
            };

            const commands: EmojiHint[] = [];
            for (const shortName in EmojiDefinitions) {
              const emoji = EmojiDefinitions[shortName];
              commands.push({
                shortName,
                text: doubleSemiColon ? `:${shortName}: ` : `${emoji} `,
                displayText: `:${shortName}: ${emoji}`,
                render,
              });
            }
            const filtered = commands.filter(
              (item) =>
                item.displayText
                  .toLocaleLowerCase()
                  .indexOf(currentWord.toLowerCase()) >= 0,
            );
            return {
              list: filtered.length ? filtered : commands,
              from: { line, ch: start },
              to: { line, ch: end },
            };
          },
        });
      }

      // Check tag
      if (changeObject.text.length === 1 && changeObject.text[0] === "#") {
        editor.showHint({
          closeOnUnfocus: true,
          completeSingle: false,
          hint: () => {
            const cursor = editor.getCursor();
            const token = editor.getTokenAt(cursor);
            const line = cursor.line;
            const lineStr = editor.getLine(line);
            const end: number = cursor.ch;
            let start = token.start;
            if (lineStr[start] !== "#") {
              start = start - 1;
            }
            const currentWord: string = lineStr
              .slice(start, end)
              .replace(/^#/, "");
            const searchResults = props.notebook.search.search(currentWord, {
              fuzzy: true,
              filter: (result: any) => {
                const filePath = path.relative(
                  path.dirname(path.join(note.notebookPath, note.filePath)),
                  path.join(note.notebookPath, result["filePath"]),
                );
                return result["title"] + ".md" === filePath;
              },
              fields: ["title"],
            });
            const commands: {
              text: string;
              displayText: string;
            }[] = searchResults.map((searchResult: any) => {
              const val =
                "#" +
                searchResult.title +
                (searchResult.title.match(/\s/) ? "#" : "");
              return {
                text: val,
                displayText: val,
              };
            });
            return {
              list: commands,
              from: { line, ch: start },
              to: { line, ch: end },
            };
          },
        });
      }

      const withinWikiLink = function (line: number, ch: number) {
        const aheadStr = editor.getLine(changeObject.from.line).slice(0, ch);
        return aheadStr.lastIndexOf("[[") > aheadStr.lastIndexOf("]]");
      };
      // Check Wikilink
      if (withinWikiLink(changeObject.from.line, changeObject.from.ch)) {
        editor.showHint({
          closeOnUnfocus: true,
          completeSingle: false,
          hint: () => {
            const cursor = editor.getCursor();
            const token = editor.getTokenAt(cursor);
            const line = cursor.line;
            const lineStr = editor.getLine(line);
            const end: number = lineStr.indexOf("]]", cursor.ch);
            let start = token.start;
            while (lineStr[start] !== "[") {
              start = start - 1;
            }
            const currentWord: string = lineStr
              .slice(start, end)
              .replace(/^\[+/, "");
            const searchResults = props.notebook.search.search(currentWord, {
              fuzzy: true,
              fields: ["title", "aliases", "filePath"],
            });
            const commands: {
              text: string;
              displayText: string;
            }[] = [];
            for (let i = 0; i < searchResults.length; i++) {
              const searchResult = searchResults[i];
              const filtPath = path.relative(
                path.dirname(path.join(note.notebookPath, note.filePath)),
                path.join(note.notebookPath, searchResult.filePath),
              );
              const aliases = searchResult.aliases
                .split("|")
                .concat(searchResult.title) as string[];
              const terms = searchResult.terms;
              aliases.forEach((alias) => {
                let find = true;
                for (let i = 0; i < terms.length; i++) {
                  const lower = alias.toLocaleLowerCase();
                  if (lower.indexOf(terms[i]) < 0) {
                    find = false;
                    break;
                  }
                }
                if (find) {
                  const val =
                    alias + ".md" === filtPath
                      ? `[[${alias}]]`
                      : `[[${filtPath}|${alias}]]`;
                  commands.push({
                    text: val,
                    displayText: val,
                  });
                }
              });
            }
            return {
              list: commands,
              from: { line, ch: start - 1 },
              to: { line, ch: end + 2 },
            };
          },
        });
      }
    };
    editor.on("change", onChangeHandler);
    return () => {
      editor.off("change", onChangeHandler);
    };
  }, [editor, note, props.notebook, t]);

  // TOC
  useEffect(() => {
    if (!editor || !tocElement || !note || !tocEnabled) {
      return;
    }

    // The following code is referred from HymerPD demo/toc.js
    let lastTOC = "";
    const update = debounce(function () {
      let newTOC = "";
      editor.eachLine(function (line) {
        const tmp = /^(#+)\s+(.+)(?:\s+\1)?$/.exec(line.text);
        if (!tmp) return;
        const lineNo = (line as any).lineNo();
        // Double check with the parser at the markdown level: a fenced code
        // block runs its own mode, and a heading inside one is not the note's.
        const state = markdownState(
          editor.getMode(),
          editor.getStateAfter(lineNo),
        );
        if (!state.header) return;
        const level = tmp[1].length;
        let title = tmp[2];
        title = title.replace(/([*_]{1,2}|~~|`+)(.+?)\1/g, "$2"); // em / bold / del / code
        title = title.replace(
          /\\(?=.)|\[\^.+?\]|\!\[((?:[^\\\]]+|\\.)+)\](\(.+?\)| ?\[.+?\])?/g,
          "",
        ); // images / escaping slashes / footref
        title = title.replace(
          /\[((?:[^\\\]]+|\\.)+)\](\(.+?\)| ?\[.+?\])/g,
          "$1",
        ); // links
        title = title.replace(/\[\[(.+?)\]\]/g, "$1"); // wikilinks
        title = title.replace(/&/g, "&amp;");
        title = title.replace(/</g, "&lt;");
        title = title.replace(/:(.+?):/g, ($0, $1) => {
          if ($1 in EmojiDefinitions) {
            return EmojiDefinitions[$1];
          } else {
            return $0;
          }
        });
        newTOC +=
          '<div data-line="' +
          lineNo +
          '" class="toc-item" style="padding-left:' +
          level +
          'em">' +
          title +
          "</div>";
      });
      newTOC =
        `<div data-line="0" class="toc-item" style="padding-left: 1em;">${note.title}</div>` +
        newTOC;
      if (newTOC === lastTOC) return;
      if (tocElement && tocElement.current) {
        tocElement.current.innerHTML = lastTOC = newTOC;
        renderTwemoji(tocElement.current);
      }
    }, 300);

    const tocClick = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      const t = event.target as HTMLElement;
      if (!/toc-item/.test(t.className)) return;
      const lineNo = parseInt(t.getAttribute("data-line"));
      if (editorMode === EditorMode.Preview) {
        const anchor = document.querySelector(`[data-line="${lineNo}"]`);
        if (anchor) {
          anchor.scrollIntoView();
        }
      } else {
        editor.setCursor({ line: editor.lastLine(), ch: 0 });
        setTimeout(function () {
          editor.setCursor({ line: lineNo, ch: 0 });
        }, 10);
      }
    };

    editor.on("changes", update);
    const tocElementCurrent = tocElement.current;
    tocElementCurrent.addEventListener("click", tocClick, true);
    update();

    return () => {
      editor.off("changes", update);
      tocElementCurrent.removeEventListener("click", tocClick);
    };
  }, [editor, editorMode, previewElement, tocElement, note, tocEnabled]);

  // Git Status
  useEffect(() => {
    if (!note || !isMounted.current) {
      return;
    }
    crossnoteContainer
      .getStatus(note.notebookPath, note.filePath)
      .then((status) => {
        setGitStatus(status);
      });
  }, [note, crossnoteContainer.getStatus]);

  // Set theme
  useEffect(() => {
    if (editor && settingsContainer.theme) {
      setTheme({
        editor,
        themeName: settingsContainer.theme.name,
      });
    }
  }, [settingsContainer.theme, editor]);

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
    tabNode.setEventListener("visibility", function (params) {
      if (params.visible) {
        // Options that changed while the tab was in the background (a mode
        // swap made from the settings tab, say) are not drawn yet: CodeMirror
        // skips hidden editors. FlexLayout fires this event while it is still
        // rendering, so redraw once the tab has been committed to the DOM.
        if (editor) {
          setTimeout(() => editor.refresh(), 0);
        }
        globalEmitter.emit(EventType.FocusedOnNote, {
          notebookPath: note.notebookPath,
          noteFilePath: note.filePath,
        });
      }
    });
    return () => {
      tabNode.removeEventListener("visibility");
    };
  }, [tabNode, note, editor]);

  if (!note) {
    return <Loading></Loading>;
  }

  const tocVisible =
    tocEnabled && !(previewIsPresentation && editorMode === EditorMode.Preview);

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
          <Box>
            <IconButton
              aria-label={t("general/change-note-icon")}
              color={"primary"}
              onClick={(event) => setIconPopoverElement(event.currentTarget)}
            >
              {<Emoji emoji={noteIcon || ":memo:"} size={32}></Emoji>}
            </IconButton>
          </Box>
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
          {!(previewIsPresentation && editorMode === EditorMode.Preview) && (
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
          )}
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
            <EditorWrapper
              sx={
                previewIsPresentation && editorMode === EditorMode.Preview
                  ? editorPresentationSx
                  : undefined
              }
            >
              <EditorTextArea
                className={"editor-textarea"}
                placeholder={t("editor/placeholder")}
                ref={textAreaElement}
              ></EditorTextArea>
              {editorMode === EditorMode.Preview && editor ? (
                <Preview
                  className={"preview"}
                  sx={previewIsPresentation ? presentationSx : undefined}
                  ref={previewElement}
                ></Preview>
              ) : null}
            </EditorWrapper>
            {!(editorMode === EditorMode.Preview && previewIsPresentation) && (
              <React.Fragment>
                <Box style={{ marginTop: "32px" }}></Box>
                <NotesPanel
                  title={t("general/References")}
                  tabNode={props.tabNode}
                  notebook={props.notebook}
                  note={note}
                ></NotesPanel>
              </React.Fragment>
            )}
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
        imageElement={editImageElement}
        marker={editImageTextMarker}
        note={note}
      ></EditImageDialog>

      <NotePopover
        tabNode={props.tabNode}
        note={note}
        anchorElement={notePopoverElement}
        onClose={() => setNotePopoverElement(null)}
      ></NotePopover>

      <IconPopover
        tabNode={props.tabNode}
        note={note}
        anchorElement={iconPopoverElement}
        onClose={() => setIconPopoverElement(null)}
      ></IconPopover>

      <FloatWin
        id="math-preview"
        className={"float-win float-win-hidden"}
        ref={mathPreviewElement}
      >
        <FloatWinTitle className={"float-win-title"}>
          <FloatWinClose
            aria-label={t("general/close")}
            className={"float-win-close"}
          >
            <Close></Close>
          </FloatWinClose>
          <Typography>{t("general/math-preview")}</Typography>
        </FloatWinTitle>
        <FloatWinContent
          className={"float-win-content"}
          id="math-preview-content"
        ></FloatWinContent>
      </FloatWin>
    </NotePanelRoot>
  );
}
