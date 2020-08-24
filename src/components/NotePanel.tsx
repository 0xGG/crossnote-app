import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  fade,
  createStyles,
  makeStyles,
  Theme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/notebook";
import {
  Box,
  ButtonGroup,
  Button,
  InputBase,
  Divider,
  Card,
  IconButton,
  Typography,
  Tooltip,
} from "@material-ui/core";
import { TabNode, Actions } from "flexlayout-react";
import { SettingsContainer } from "../containers/settings";
import {
  ChevronLeft,
  Close,
  FilePresentationBox,
  Pencil,
  CodeTags,
  DotsVertical,
} from "mdi-material-ui";
import * as path from "path";
import { useTranslation } from "react-i18next";
import {
  Editor as CodeMirrorEditor,
  EditorChangeLinkedList,
  TextMarker,
  Position as CursorPosition,
} from "codemirror";
import { EditorMode } from "../lib/editorMode";
import {
  printPreview,
  postprocessPreview as previewPostprocessPreview,
  openURL,
} from "../utilities/preview";
import { initMathPreview } from "../editor/views/math-preview";
import { renderPreview } from "vickymd/preview";
import NotesPanel from "./NotesPanel";
import { resolveNoteImageSrc } from "../utilities/image";
import EditImageDialog from "./EditImageDialog";
import NotePopover from "./NotePopover";
import {
  EventType,
  globalEmitter,
  ModifiedMarkdownEventData,
} from "../lib/event";
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
      if (data.tabId === tabNode.getId()) {
        return;
      }
      if (data.noteFilePath === note.filePath) {
        if (editor.getValue() !== data.markdown) {
          editor.setValue(data.markdown);
        }
      }
      note.config = data.noteConfig;
    };
    globalEmitter.on(EventType.ModifiedMarkdown, modifiedMarkdownCallback);

    return () => {
      globalEmitter.off(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
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
            <Divider></Divider>
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
