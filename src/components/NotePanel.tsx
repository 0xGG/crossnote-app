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
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
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
} from "mdi-material-ui";
import Noty from "noty";
import * as path from "path";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import EmojiDefinitions from "vickymd/addon/emoji";
import { renderPreview } from "vickymd/preview";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { initMathPreview } from "../editor/views/math-preview";
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
import { Note } from "../lib/note";
import { resolveNoteImageSrc } from "../utilities/image";
import {
  openURL,
  postprocessPreview as previewPostprocessPreview,
} from "../utilities/preview";
import EditImageDialog from "./EditImageDialog";
import NotePopover from "./NotePopover";
import NotesPanel from "./NotesPanel";
const VickyMD = require("vickymd/core");

const previewZIndex = 99;

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
  render: (element: HTMLElement, data: any, current: CommandHint) => void;
}

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
    notePanel: {
      height: "100%",
      overflow: "hidden",
    },
    topPanel: {
      display: "flex",
      flexDirection: "column",
      padding: "4px 0 0",
      position: "relative",
      backgroundColor: "inherit",
      [theme.breakpoints.down("sm")]: {
        padding: "0",
      },
    },
    contentPanel: {
      height: "calc(100% - 48px)",
      overflow: "auto",
    },
    editorWrapper: {
      "flex": 1,
      "overflow": "auto",
      "backgroundColor": theme.palette.background.paper,
      "& .CodeMirror-gutters": {
        display: "none",
      },
      "& .CodeMirror-code": {
        width: "100%",
      },
      "& .CodeMirror": {
        width: "800px",
        maxWidth: "100%",
        margin: "0 auto",
        height: "100%",
        padding: theme.spacing(0, 1),
        [theme.breakpoints.down("sm")]: {
          padding: theme.spacing(1),
        },
      },
      "& .CodeMirror-vscrollbar": {
        // display: "none !important",
      },
      "& .CodeMirror-placeholder": {
        color: `${theme.palette.action.disabled} !important`,
      },
      /*
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1),
      },
      */
    },
    editor: {
      width: "100%",
      height: "100%",
      backgroundColor: "inherit",
      border: "none",
    },
    preview: {
      position: "relative",
      left: "0",
      top: "0",
      width: "800px",
      maxWidth: "100%",
      margin: "0 auto",
      height: "100%",
      border: "none",
      overflow: "auto !important",
      padding: theme.spacing(1, 2),
      zIndex: previewZIndex,
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1),
      },
    },
    presentation: {
      padding: "0 !important",
    },
    controlBtn: {
      padding: theme.spacing(0.5, 0),
      color: theme.palette.text.secondary,
    },
    controlBtnSelected: {
      color: theme.palette.primary.main,
    },
    controlBtnSelectedSecondary: {
      color: theme.palette.secondary.main,
    },
    // math
    floatWin: {
      position: "fixed",
      zIndex: 100,
      background: theme.palette.background.paper,
      borderRadius: "5px",
      overflow: "hidden",
      minWidth: "200px",
      maxWidth: "70%",
    },
    floatWinHidden: {
      display: "none",
    },
    floatWinTitle: {
      display: "flex",
      alignItems: "center",
      background: "#579",
      color: "#eee",
    },
    floatWinContent: {
      maxHeight: "80vh",
      overflow: "auto",
      padding: "10px 20px",
    },
    floatWinClose: {
      color: "#eee",
    },
  }),
);

interface Props {
  note: Note;
  tabNode: TabNode;
}
export default function NotePanel(props: Props) {
  const classes = useStyles(props);
  const tabNode = props.tabNode;
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();
  const { t } = useTranslation();
  const [noteTitle, setNoteTitle] = useState<string>("");
  const [note, setNote] = useState<Note>(props.note);
  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>(EditorMode.Preview);
  const [previewElement, setPreviewElement] = useState<HTMLElement>(null);
  const [previewIsPresentation, setPreviewIsPresentation] = useState<boolean>(
    false,
  );
  const [textAreaElement, setTextAreaElement] = useState<HTMLTextAreaElement>(
    null,
  );
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    line: 0,
    ch: 0,
  });
  const mathPreviewElement = useRef<HTMLElement>(null);
  const [editImageElement, setEditImageElement] = useState<HTMLImageElement>(
    null,
  );
  const [editImageTextMarker, setEditImageTextMarker] = useState<TextMarker>(
    null,
  );
  const [editImageDialogOpen, setEditImageDialogOpen] = useState<boolean>(
    false,
  );
  const [notePopoverElement, setNotePopoverElement] = useState<Element>(null);

  const confirmNoteTitle = useCallback(() => {
    const finalNoteTitle = noteTitle.trim().replace(/\//g, "-");
    if (
      !note ||
      !finalNoteTitle.length ||
      note.title.trim() === finalNoteTitle
    ) {
      return;
    }

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
        new Noty({
          type: "error",
          text: t("error/failed-to-change-file-path"),
          layout: "topRight",
          theme: "relax",
          timeout: 5000,
        }).show();
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
    if (!note) {
      return () => {
        setEditor(null);
        setTextAreaElement(null);
        setPreviewElement(null);
      };
    } else {
      if (note.markdown.length === 0) {
        setEditorMode(EditorMode.VickyMD);
      }
    }
  }, [note]);

  useEffect(() => {
    if (!note || !crossnoteContainer.layoutModel || !tabNode) {
      return;
    }
    setNoteTitle(note.title);
    crossnoteContainer.layoutModel.doAction(
      Actions.renameTab(tabNode.getId(), `📝 ` + note.title),
    );
  }, [note, crossnoteContainer.layoutModel, tabNode]);

  // Emitter
  useEffect(() => {
    if (!globalEmitter || !tabNode || !editor || !note) {
      return;
    }

    const modifiedMarkdownCallback = (data: ModifiedMarkdownEventData) => {
      note.config = data.noteConfig;
      if (data.tabId === tabNode.getId()) {
        return;
      }
      if (
        data.notebookPath === note.notebookPath &&
        data.noteFilePath === note.filePath
      ) {
        if (editor.getValue() !== data.markdown) {
          editor.setValue(data.markdown);
        }
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
  }, [tabNode, editor, note]);

  // Set editor
  useEffect(() => {
    if (textAreaElement && !editor && note) {
      const editor: CodeMirrorEditor = VickyMD.fromTextArea(textAreaElement, {
        mode: {
          name: "hypermd",
          hashtag: true,
        },
        // inputStyle: "textarea", // Break mobile device paste functionality
        hmdFold: HMDFold,
        keyMap: settingsContainer.keyMap,
        showCursorWhenSelecting: true,
        inputStyle: "contenteditable",
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
      });
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
    }
  }, [textAreaElement, note, editor]);

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
        renderPreview(previewElement, editor.getValue());
        postprocessPreview(previewElement);
        previewElement.scrollTop = 0;
      } catch (error) {
        previewElement.innerText = error;
      }
    }
  }, [editorMode, editor, previewElement, note, postprocessPreview, t]);

  // Toggle editor & preview
  useEffect(() => {
    if (!editor || !note) return;
    if (editorMode === EditorMode.VickyMD) {
      VickyMD.switchToHyperMD(editor);
      editor.setOption("hmdFold", HMDFold);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    } else if (editorMode === EditorMode.SourceCode) {
      VickyMD.switchToNormal(editor);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    } else if (editorMode === EditorMode.Preview) {
      editor.getWrapperElement().style.display = "none";
    } else if (editorMode === EditorMode.SplitView) {
      VickyMD.switchToNormal(editor);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    }
  }, [editorMode, editor, note]);

  // Change markdown
  useEffect(() => {
    if (editor && note && tabNode) {
      const changesHandler = () => {
        if (editor.getOption("readOnly")) {
          // This line is necessary for decryption...
          return;
        }
        const markdown = editor.getValue();

        if (markdown === note.markdown) {
          return;
        }
        setTimeout(() => {
          if (markdown === editor.getValue()) {
            crossnoteContainer.updateNoteMarkdown(
              tabNode,
              note.notebookPath,
              note.filePath,
              markdown,
            );
          }
          if (editorMode === EditorMode.Preview && previewElement) {
            try {
              renderPreview(previewElement, editor.getValue());
              postprocessPreview(previewElement);
              previewElement.scrollTop = 0;
            } catch (error) {
              previewElement.innerText = error;
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
  }, [editor, note, tabNode, editorMode, previewElement]);

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
                /*
                {
                  text: "<!-- @crossnote.netease_music -->  \n",
                  displayText: `/netease - ${t(
                    "editor/toolbar/netease-music",
                  )}`,
                },
                */
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
                  text:
                    '<!-- @crossnote.kanban "v":2,"board":{"columns":[]} -->  \n',
                  command: "/kanban",
                  description: `${t("editor/toolbar/insert-kanban")} (beta)`,
                  icon: "mdi-developer-board",
                  render,
                },
                /*
                {
                  text: "<!-- @crossnote.abc -->  \n",
                  displayText: `/abc - ${t(
                    "editor/toolbar/insert-abc-notation",
                  )}`,
                },
                */
                {
                  text: "<!-- @crossnote.github_gist -->  \n",
                  command: "/github_gist",
                  description: t("editor/toolbar/insert-github-gist"),
                  icon: "mdi-github",
                  render,
                },
                {
                  text: "<!-- @crossnote.comment -->  \n",
                  command: "/crossnote.comment",
                  description: t("editor/toolbar/insert-comment"),
                  icon: "mdi-comment-multiple",
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

            const commands: { text: string; displayText: string }[] = [];
            for (const def in EmojiDefinitions) {
              const emoji = EmojiDefinitions[def];
              commands.push({
                text: doubleSemiColon ? `:${def}: ` : `${emoji} `,
                displayText: `:${def}: ${emoji}`,
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
    };
    editor.on("change", onChangeHandler);

    const onCursorActivityHandler = (instance: CodeMirrorEditor) => {
      // console.log("cursorActivity", editor.getCursor());
      // console.log("selection: ", editor.getSelection());
      return;
    };
    editor.on("cursorActivity", onCursorActivityHandler);

    return () => {
      editor.off("change", onChangeHandler);
      editor.off("cursorActivity", onCursorActivityHandler);
    };
  }, [editor, note]);

  return (
    <Box className={clsx(classes.notePanel)}>
      <Box
        className={clsx(classes.topPanel, "editor-toolbar")}
        style={{
          backgroundColor:
            settingsContainer.theme.name === "light" ? "#fff" : "inherit",
        }}
      >
        <Box className={clsx(classes.row)} style={{ width: "100%" }}>
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
            onBlur={confirmNoteTitle}
            onKeyUp={(event) => {
              if (event.which === 13) {
                confirmNoteTitle();
              }
            }}
          ></InputBase>
          <ButtonGroup
            variant="text"
            color="default"
            aria-label="editor mode"
            size="small"
          >
            <Tooltip title={t("editor/note-control/preview")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  editorMode === EditorMode.Preview &&
                    classes.controlBtnSelected,
                )}
                color={
                  editorMode === EditorMode.Preview ? "primary" : "default"
                }
                onClick={() => setEditorMode(EditorMode.Preview)}
              >
                <FilePresentationBox></FilePresentationBox>
              </Button>
            </Tooltip>
            <Tooltip title={t("general/vickymd")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  editorMode === EditorMode.VickyMD &&
                    classes.controlBtnSelected,
                )}
                color={
                  editorMode === EditorMode.VickyMD ? "primary" : "default"
                }
                onClick={() => setEditorMode(EditorMode.VickyMD)}
              >
                <Pencil></Pencil>
              </Button>
            </Tooltip>
            <Tooltip title={t("editor/note-control/source-code")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  editorMode === EditorMode.SourceCode &&
                    classes.controlBtnSelected,
                )}
                color={
                  editorMode === EditorMode.SourceCode ? "primary" : "default"
                }
                onClick={() => setEditorMode(EditorMode.SourceCode)}
              >
                <CodeTags></CodeTags>
              </Button>
            </Tooltip>
          </ButtonGroup>
          <ButtonGroup
            variant="text"
            color="default"
            aria-label="editor mode"
            size="small"
          >
            <Button
              className={clsx(classes.controlBtn)}
              onClick={(event) => setNotePopoverElement(event.currentTarget)}
            >
              <DotsVertical></DotsVertical>
            </Button>
          </ButtonGroup>
        </Box>
        <Divider></Divider>
      </Box>
      <Box className={clsx(classes.contentPanel)}>
        <Box className={clsx(classes.editorWrapper)}>
          <textarea
            className={clsx(classes.editor, "editor-textarea")}
            placeholder={t("editor/placeholder")}
            ref={(element: HTMLTextAreaElement) => {
              setTextAreaElement(element);
            }}
          ></textarea>
          {(editorMode === EditorMode.Preview ||
            editorMode === EditorMode.SplitView) &&
          editor ? (
            <div
              className={clsx(
                classes.preview,
                "preview",
                previewIsPresentation ? classes.presentation : null,
              )}
              ref={(element: HTMLElement) => {
                setPreviewElement(element);
              }}
            ></div>
          ) : null}
        </Box>
        {Object.keys(note.mentionedBy).length > 0 && (
          <React.Fragment>
            <Divider style={{ marginTop: "32px" }}></Divider>
            <NotesPanel
              title={"Linked references"}
              tabNode={props.tabNode}
              notebook={crossnoteContainer.getNotebookAtPath(note.notebookPath)}
              referredNote={note}
            ></NotesPanel>
          </React.Fragment>
        )}
      </Box>

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

      <Card
        id="math-preview"
        className={clsx(classes.floatWin, "float-win", "float-win-hidden")}
        ref={mathPreviewElement}
      >
        <Box className={clsx(classes.floatWinTitle, "float-win-title")}>
          <IconButton
            className={clsx(classes.floatWinClose, "float-win-close")}
          >
            <Close></Close>
          </IconButton>
          <Typography>{t("general/math-preview")}</Typography>
        </Box>
        <Box
          className={clsx(classes.floatWinContent, "float-win-content")}
          id="math-preview-content"
        ></Box>
      </Card>
    </Box>
  );
}
