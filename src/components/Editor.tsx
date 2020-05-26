import React, { useState, useCallback, useEffect } from "react";
import {
  createStyles,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { Note, TagNode } from "../lib/crossnote";
import {
  CrossnoteContainer,
  EditorMode,
  SelectedSectionType,
} from "../containers/crossnote";
import { useTranslation } from "react-i18next";
import * as CryptoJS from "crypto-js";
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
  TextField,
  ButtonGroup,
  IconButton,
  Popover,
  Hidden,
  Breadcrumbs,
  Card,
} from "@material-ui/core";
import {
  Editor as CodeMirrorEditor,
  EditorChangeLinkedList,
  TextMarker,
  Position,
} from "codemirror";
import {
  RenameBox,
  Delete,
  FilePresentationBox,
  Pencil,
  CodeTags,
  CloudUploadOutline,
  CloudDownloadOutline,
  Restore,
  Fullscreen,
  FullscreenExit,
  ChevronLeft,
  Close,
  Pin,
  PinOutline,
  LockOpenOutline,
  Lock,
  LockOpen,
  TagOutline,
  Printer,
  Tag,
  ContentDuplicate,
  ShareVariant,
  ContentCopy,
  ViewSplitVertical,
} from "mdi-material-ui";
import { renderPreview } from "vickymd/preview";
import PushNotebookDialog from "./PushNotebookDialog";
import EditImageDialog from "./EditImageDialog";
import Noty from "noty";
import { formatDistance } from "date-fns";
import { getHeaderFromMarkdown } from "../utilities/note";
import {
  printPreview,
  openURL,
  postprocessPreview as previewPostprocessPreview,
} from "../utilities/preview";
import ChangeFilePathDialog from "./ChangeFilePathDialog";
import { SettingsContainer } from "../containers/settings";
import { initMathPreview } from "../editor/views/math-preview";
import EmojiDefinitions from "vickymd/addon/emoji";
import { TagStopRegExp, sanitizeTag } from "../utilities/markdown";
import { resolveNoteImageSrc } from "../utilities/image";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { ThemeName } from "vickymd/theme";
import { copyToClipboard } from "../utilities/utils";
import { setTheme } from "../themes/manager";
import { TagsMenuPopover } from "./TagsMenuPopover";

const VickyMD = require("vickymd/core");
const is = require("is_js");

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

const previewZIndex = 99;
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    editorPanel: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      borderRadius: 0,
    },
    topPanel: {
      position: "relative",
      padding: theme.spacing(0.5, 1), // theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      // borderBottom: "1px solid #eee",
      overflow: "auto",
      backgroundColor: theme.palette.background.paper,
    },
    bottomPanel: {
      position: "relative",
      padding: theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.palette.background.paper,
      // borderTop: "1px solid #eee",
      // color: theme.palette.primary.contrastText,
      // backgroundColor: theme.palette.primary.main
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
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
    cursorPositionInfo: {
      // position: "absolute",
      // right: "16px",
      // bottom: "16px",
      zIndex: 150,
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
        height: "100%",
        padding: theme.spacing(0, 2),
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
    presentation: {
      padding: "0 !important",
    },
    fullScreen: {
      position: "fixed",
      width: "100%",
      height: "100%",
      left: "0",
      top: "0",
      zIndex: 2000,
      overflow: "auto",
      padding: "0",
    },

    editor: {
      width: "100%",
      height: "100%",
      backgroundColor: theme.palette.background.default,
      border: "none",
    },
    preview: {
      position: "relative",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      border: "none",
      overflow: "auto !important",
      padding: theme.spacing(1, 2),
      zIndex: previewZIndex,
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1),
      },
    },
    splitView: {
      "display": "flex",
      "flexDirection": "row",
      "& .CodeMirror.CodeMirror": {
        width: "50%",
      },
      "& $preview": {
        position: "relative",
        width: "50%",
        borderLeft: `1px solid ${theme.palette.divider}`,
      },
    },
    backBtn: {
      marginRight: "8px",
      [theme.breakpoints.up("sm")]: {
        display: "none",
      },
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

interface CursorPosition {
  ch: number;
  line: number;
}
interface TimerText {
  text: string;
  line: number;
  date: Date;
}
interface Props {
  note: Note;
}
export default function Editor(props: Props) {
  const note = props.note;
  const classes = useStyles(props);
  const theme = useTheme();
  const [textAreaElement, setTextAreaElement] = useState<HTMLTextAreaElement>(
    null,
  );
  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    line: 0,
    ch: 0,
  });
  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState<boolean>(
    false,
  );
  const [filePathDialogOpen, setFilePathDialogOpen] = useState<boolean>(false);
  const [pushDialogOpen, setPushDialogOpen] = useState<boolean>(false);
  const [previewElement, setPreviewElement] = useState<HTMLElement>(null);
  const [previewIsPresentation, setPreviewIsPresentation] = useState<boolean>(
    false,
  );
  const [gitStatus, setGitStatus] = useState<string>("");
  const [fullScreenMode, setFullScreenMode] = useState<boolean>(false);
  const [tagsMenuAnchorEl, setTagsMenuAnchorEl] = useState<HTMLElement>(null);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [shareAnchorEl, setShareAnchorEl] = useState<HTMLElement>(null);
  const [toggleEncryptionDialogOpen, setToggleEncryptionDialogOpen] = useState<
    boolean
  >(false);
  const [toggleEncryptionPassword, setToggleEncryptionPassword] = useState<
    string
  >("");
  const [decryptionDialogOpen, setDecryptionDialogOpen] = useState<boolean>(
    false,
  );
  const [decryptionPassword, setDecryptionPassword] = useState<string>("");
  const [isDecrypted, setIsDecrypted] = useState<boolean>(false);
  const [needsToPrint, setNeedsToPrint] = useState<boolean>(false);
  const [editImageElement, setEditImageElement] = useState<HTMLImageElement>(
    null,
  );
  const [editImageTextMarker, setEditImageTextMarker] = useState<TextMarker>(
    null,
  );
  const [editImageDialogOpen, setEditImageDialogOpen] = useState<boolean>(
    false,
  );
  const [forceUpdate, setForceUpdate] = useState<number>(Date.now());

  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();

  const { t } = useTranslation();

  const closeFilePathDialog = useCallback(() => {
    if (!note) return;
    setFilePathDialogOpen(false);
  }, [note]);

  const closeEncryptionDialog = useCallback(() => {
    setToggleEncryptionPassword("");
    setToggleEncryptionDialogOpen(false);
  }, []);

  const closeDecryptionDialog = useCallback(() => {
    setDecryptionPassword("");
    setDecryptionDialogOpen(false);
  }, []);

  const pullNotebook = useCallback(() => {
    new Noty({
      type: "info",
      text: t("info/downloading-notebook"),
      layout: "topRight",
      theme: "relax",
      timeout: 2000,
    }).show();
    if (!note) return;
    crossnoteContainer
      .pullNotebook({
        notebook: note.notebook,
        onAuthFailure: () => {
          new Noty({
            type: "error",
            text: t("error/authentication-failed"),
            layout: "topRight",
            theme: "relax",
            timeout: 5000,
          }).show();
        },
      })
      .then(() => {
        new Noty({
          type: "success",
          text: t("success/notebook-downloaded"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
      })
      .catch((error) => {
        console.log(error);
        new Noty({
          type: "error",
          text: t("error/failed-to-download-notebook"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
      });
  }, [note]);

  const checkoutNote = useCallback(() => {
    if (!note) return;
    crossnoteContainer.checkoutNote(note);
  }, [note]);

  const addTag = useCallback(
    (tagName: string) => {
      if (!note || !editor || !isDecrypted) {
        return;
      }
      const tag = sanitizeTag(tagName);
      if (!tag.length) {
        return;
      }
      setTagNames((tagNames) => {
        const newTagNames =
          tagNames.indexOf(tag) >= 0 ? [...tagNames] : [tag, ...tagNames];
        note.config.tags = newTagNames.sort((x, y) => x.localeCompare(y));
        crossnoteContainer.updateNoteMarkdown(
          note,
          editor.getValue(),
          note.config.encryption ? decryptionPassword : "",
          (status) => {
            setGitStatus(status);
          },
        );
        crossnoteContainer.updateNotebookTagNode();
        return newTagNames;
      });
    },
    [note, editor, decryptionPassword, isDecrypted],
  );

  const deleteTag = useCallback(
    (tagName: string) => {
      if (note && editor && isDecrypted) {
        setTagNames((tagNames) => {
          const newTagNames = tagNames.filter((t) => t !== tagName);
          note.config.tags = newTagNames.sort((x, y) => x.localeCompare(y));
          crossnoteContainer.updateNoteMarkdown(
            note,
            editor.getValue(),
            note.config.encryption ? decryptionPassword : "",
            (status) => {
              setGitStatus(status);
            },
          );
          crossnoteContainer.updateNotebookTagNode();
          return newTagNames;
        });
      }
    },
    [note, editor, decryptionPassword, isDecrypted],
  );

  const toggleEncryption = useCallback(() => {
    if (note && editor) {
      const markdown = editor.getValue();
      if (note.config.encryption) {
        // Disable encryption
        // Check if the password is correct
        crossnoteContainer
          .getNote(note.notebook, note.filePath)
          .then((n) => {
            try {
              const bytes = CryptoJS.AES.decrypt(
                n.markdown.trim(),
                toggleEncryptionPassword,
              );
              const json = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
              // Disable encryption
              note.config.encryption = null;
              delete note.config.encryption;
              crossnoteContainer.updateNoteMarkdown(
                note,
                json.markdown,
                "",
                (status) => {
                  setGitStatus(status);
                  setDecryptionPassword("");
                  setIsDecrypted(true);
                  closeEncryptionDialog();
                  editor.setValue(json.markdown);
                  editor.setOption("readOnly", false);
                },
              );
            } catch (error) {
              new Noty({
                type: "error",
                text: t("error/failed-to-disable-encryption"),
                layout: "topRight",
                theme: "relax",
                timeout: 5000,
              }).show();
            }
          })
          .catch((error) => {
            new Noty({
              type: "error",
              text: t("error/failed-to-disable-encryption"),
              layout: "topRight",
              theme: "relax",
              timeout: 5000,
            }).show();
          });
      } else {
        // Enable encryption
        note.config.encryption = {
          title: getHeaderFromMarkdown(markdown),
        };
        crossnoteContainer.updateNoteMarkdown(
          note,
          editor.getValue(),
          toggleEncryptionPassword,
          (status) => {
            setDecryptionPassword(toggleEncryptionPassword);
            setIsDecrypted(true);
            setGitStatus(status);
            closeEncryptionDialog();
          },
        );
      }
    }
  }, [note, editor, closeEncryptionDialog, toggleEncryptionPassword]);

  const decryptNote = useCallback(() => {
    if (note && editor) {
      crossnoteContainer
        .getNote(note.notebook, note.filePath)
        .then((n) => {
          // Decrypt
          try {
            const bytes = CryptoJS.AES.decrypt(
              n.markdown.trim(),
              decryptionPassword,
            );
            const json = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
            editor.setOption("readOnly", false);
            editor.setValue(json.markdown);
            setIsDecrypted(true);
            setDecryptionDialogOpen(false); // Don't clear decryptionPassword
          } catch (error) {
            new Noty({
              type: "error",
              text: t("error/decryption-failed"),
              layout: "topRight",
              theme: "relax",
              timeout: 5000,
            }).show();
            setIsDecrypted(false);
          }
        })
        .catch((error) => {
          setIsDecrypted(false);
          console.log(error);
        });
    }
  }, [note, editor, decryptionPassword, closeDecryptionDialog]);

  const togglePin = useCallback(() => {
    if (note && editor && isDecrypted) {
      note.config.pinned = !note.config.pinned;
      if (!note.config.pinned) {
        delete note.config.pinned;
      }
      crossnoteContainer.updateNoteMarkdown(
        note,
        editor.getValue(),
        note.config.encryption ? decryptionPassword : "",
        (status) => {
          setGitStatus(status);
          setForceUpdate(Date.now());
        },
      );
    }
  }, [note, editor, decryptionPassword, isDecrypted]);

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
    }
  }, [note]);

  // Initialize cursor color
  useEffect(() => {
    const styleID = "codemirror-cursor-style";
    let style = document.getElementById(styleID);
    if (!style) {
      style = document.createElement("style");
      style.id = styleID;
      document.body.appendChild(style);
    }
    style.innerText = `
.CodeMirror-cursor.CodeMirror-cursor {
  border-left: 2px solid ${settingsContainer.editorCursorColor || "#333"};
}
.cm-fat-cursor-mark.cm-fat-cursor-mark {
  background-color: ${settingsContainer.editorCursorColor || "#333"};
}
  `;
  }, [settingsContainer.editorCursorColor]);

  useEffect(() => {
    if (note) {
      crossnoteContainer.crossnote
        .getStatus(note.notebook, note.filePath)
        .then((status) => {
          setGitStatus(status);
        });
    }
  }, [note, crossnoteContainer.crossnote]);

  // Decryption
  useEffect(() => {
    if (!editor || !note) return;
    if (note.config.encryption) {
      setIsDecrypted(false);
      setDecryptionPassword("");
      editor.setOption("readOnly", true);
      editor.setValue(`🔐 ${t("general/encrypted")}`);
      setDecryptionDialogOpen(true);
    } else {
      setIsDecrypted(true);
      setDecryptionPassword("");
      editor.setOption("readOnly", false);
      editor.setValue(note.markdown);

      if (note.markdown.length === 0) {
        setTimeout(() => {
          editor.refresh();
        }, 50);
      }
    }
  }, [editor, note]);

  useEffect(() => {
    if (textAreaElement && !editor && note) {
      // console.log("textarea element mounted");
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
      initMathPreview(editor);
    }
  }, [textAreaElement, note, editor]);

  // Change theme
  useEffect(() => {
    if (editor && settingsContainer.theme) {
      setTheme({
        editor,
        themeName: settingsContainer.theme.name,
      });
    }
  }, [settingsContainer.theme, editor]);

  useEffect(() => {
    if (editor && note) {
      setTagNames(note.config.tags || []);
      const changesHandler = () => {
        if (editor.getOption("readOnly") || !isDecrypted) {
          // This line is necessary for decryption...
          return;
        }
        const markdown = editor.getValue();

        if (!note.config.encryption && markdown === note.markdown) {
          return;
        }
        crossnoteContainer.updateNoteMarkdown(
          note,
          markdown,
          note.config.encryption ? decryptionPassword : "",
          (status) => {
            setGitStatus(status);
            setTagNames(note.config.tags || []); // After resolve conflicts
          },
        );
      };
      editor.on("changes", changesHandler);

      const keyupHandler = () => {
        if (!isDecrypted && note.config.encryption) {
          setDecryptionDialogOpen(true);
        }
      };
      editor.on("keyup", keyupHandler);

      const linkIconClickedHandler = (args: any) => {
        const url = args.element.getAttribute("data-url");
        openURL(url || "", note);
      };
      editor.on("linkIconClicked", linkIconClickedHandler);

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
        editor.off("keyup", keyupHandler);
        editor.off("linkIconClicked", linkIconClickedHandler);
        editor.off("imageClicked", imageClickedHandler);
        editor.off("imageReadyToLoad", loadImage);
      };
    }
  }, [editor, note, decryptionPassword, isDecrypted]);

  useEffect(() => {
    // Hack: for update after crossnoteContainer.renameTag
    setTagNames(note?.config.tags || []);
  }, [note?.config.tags]);

  useEffect(() => {
    if (!editor || !note) return;
    if (crossnoteContainer.editorMode === EditorMode.VickyMD) {
      VickyMD.switchToHyperMD(editor);
      editor.setOption("hmdFold", HMDFold);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    } else if (crossnoteContainer.editorMode === EditorMode.SourceCode) {
      VickyMD.switchToNormal(editor);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    } else if (crossnoteContainer.editorMode === EditorMode.Preview) {
      editor.getWrapperElement().style.display = "none";
    } else if (crossnoteContainer.editorMode === EditorMode.SplitView) {
      VickyMD.switchToNormal(editor);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    }
  }, [crossnoteContainer.editorMode, editor, note, isDecrypted]);

  // Render Preview
  useEffect(() => {
    if (
      (crossnoteContainer.editorMode === EditorMode.Preview ||
        crossnoteContainer.editorMode === EditorMode.SplitView) &&
      editor &&
      note &&
      previewElement
    ) {
      if (isDecrypted) {
        try {
          renderPreview(previewElement, editor.getValue());
          postprocessPreview(previewElement);
          previewElement.scrollTop = 0;
        } catch (error) {
          previewElement.innerText = error;
        }
      } else {
        previewElement.innerHTML = `🔐 ${t("general/encrypted")}`;
        const clickHandler = () => {
          setDecryptionDialogOpen(true);
        };
        previewElement.addEventListener("click", clickHandler);
        return () => {
          previewElement.removeEventListener("click", clickHandler);
        };
      }
    }
  }, [
    crossnoteContainer.editorMode,
    editor,
    previewElement,
    note,
    isDecrypted,
    postprocessPreview,
    t,
  ]);

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

      // Check tag
      if (
        changeObject.text.length === 1 &&
        changeObject.text[0] !== " " &&
        changeObject.from.ch > 0 &&
        editor.getLine(changeObject.from.line)[changeObject.from.ch - 1] === "#"
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
            if (lineStr[start] !== "#") {
              start = start - 1;
            }
            const currentWord: string = lineStr
              .slice(start, end)
              .replace(TagStopRegExp, "");
            const commands: { text: string; displayText: string }[] = [];
            if (currentWord.trim().length > 0) {
              commands.push({
                text: `#${currentWord} `,
                displayText: `+ #${currentWord}`,
              });
            }
            const helper = (children: TagNode[]) => {
              if (!children || !children.length) return;
              for (let i = 0; i < children.length; i++) {
                const tag = children[i].path;
                commands.push({
                  text: `#${tag} `,
                  displayText: `+ #${tag}`,
                });
                helper(children[i].children);
              }
            };
            helper(crossnoteContainer.notebookTagNode.children);
            const filtered = commands.filter(
              (item) => item.text.toLocaleLowerCase().indexOf(currentWord) >= 0,
            );

            return {
              list: filtered.length ? filtered : commands,
              from: { line, ch: start },
              to: { line, ch: end },
            };
          },
        });
      }

      // Timer
      if (
        changeObject.text.length > 0 &&
        changeObject.text[0].startsWith("<!-- @timer ") &&
        changeObject.removed.length > 0 &&
        changeObject.removed[0].startsWith("/")
      ) {
        // Calcuate date time
        const lines = editor.getValue().split("\n");
        const timerTexts: TimerText[] = [];
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(/^`@timer\s.+`/);
          if (match) {
            const text = match[0];
            const dataMatch = text.match(/^`@timer\s+(.+)`/);
            if (!dataMatch || !dataMatch.length) {
              continue;
            }
            const dataStr = dataMatch[1];
            try {
              const data = JSON.parse(`{${dataStr}}`);
              const datetime = data["date"];
              if (datetime) {
                timerTexts.push({
                  text: text,
                  line: i,
                  date: new Date(datetime),
                });
              }
            } catch (error) {
              continue;
            }
          }
        }
        for (let i = 1; i < timerTexts.length; i++) {
          const currentTimerText = timerTexts[i];
          const previousTimerText = timerTexts[i - 1];
          const duration = formatDistance(
            currentTimerText.date,
            previousTimerText.date,
            { includeSeconds: true },
          );
          const newText = `\`@timer ${JSON.stringify({
            date: currentTimerText.date.toString(),
            duration,
          })
            .replace(/^{/, "")
            .replace(/}$/, "")}\``;
          editor.replaceRange(
            newText,
            { line: currentTimerText.line, ch: 0 },
            { line: currentTimerText.line, ch: currentTimerText.text.length },
          );
        }
      }

      // Add Tag
      if (
        changeObject.origin === "complete" &&
        changeObject.removed[0] &&
        changeObject.removed[0].match(/^#[^\s]/) &&
        changeObject.text[0] &&
        changeObject.text[0].match(/^#[^\s]/)
      ) {
        addTag(changeObject.text[0].replace(/^#/, ""));
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
  }, [editor, note, crossnoteContainer.notebookTagNode, addTag /*t*/]);

  // Split view
  useEffect(() => {
    if (
      !editor ||
      !note ||
      !previewElement ||
      crossnoteContainer.editorMode !== EditorMode.SplitView
    ) {
      return;
    }
    let onChangeCallback: any = null;
    let onCursorActivityCallback: any = null;
    let onScrollCallback: any = null;
    let onWindowResizeCallback: any = null;
    let scrollMap: any = null;
    let scrollTimeout: NodeJS.Timeout = null;
    let previewScrollDelay = Date.now();
    let editorScrollDelay = Date.now();
    let currentLine: number = -1;
    let editorClientWidth = editor.getScrollInfo().clientWidth;
    let editorClientHeight = editor.getScrollInfo().clientHeight;
    let lastCursorPosition: Position = null;

    const totalLineCount = editor.lineCount();
    const buildScrollMap = () => {
      if (!totalLineCount) {
        return null;
      }
      const scrollMap = [];
      const nonEmptyList = [];

      for (let i = 0; i < totalLineCount; i++) {
        scrollMap.push(-1);
      }

      nonEmptyList.push(0);
      scrollMap[0] = 0;

      // write down the offsetTop of element that has 'data-line' property to scrollMap
      const lineElements = previewElement.getElementsByClassName("sync-line");

      for (let i = 0; i < lineElements.length; i++) {
        let el = lineElements[i] as HTMLElement;
        let t: any = el.getAttribute("data-line");
        if (!t) {
          continue;
        }

        t = parseInt(t, 10);
        if (!t) {
          continue;
        }

        // this is for ignoring footnote scroll match
        if (t < nonEmptyList[nonEmptyList.length - 1]) {
          el.removeAttribute("data-line");
        } else {
          nonEmptyList.push(t);

          let offsetTop = 0;
          while (el && el !== previewElement) {
            offsetTop += el.offsetTop;
            el = el.offsetParent as HTMLElement;
          }

          scrollMap[t] = Math.round(offsetTop);
        }
      }

      nonEmptyList.push(totalLineCount);
      scrollMap.push(previewElement.scrollHeight);

      let pos = 0;
      for (let i = 0; i < totalLineCount; i++) {
        if (scrollMap[i] !== -1) {
          pos++;
          continue;
        }

        const a = nonEmptyList[pos - 1];
        const b = nonEmptyList[pos];
        scrollMap[i] = Math.round(
          (scrollMap[b] * (i - a) + scrollMap[a] * (b - i)) / (b - a),
        );
      }

      return scrollMap; // scrollMap's length == screenLineCount (vscode can't get screenLineCount... sad)
    };
    const scrollToPos = (scrollTop: number) => {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
        scrollTimeout = null;
      }

      if (scrollTop < 0) {
        return;
      }

      const delay = 10;

      const helper = (duration = 0) => {
        scrollTimeout = setTimeout(() => {
          if (duration <= 0) {
            previewScrollDelay = Date.now() + 500;
            previewElement.scrollTop = scrollTop;
            return;
          }

          const difference = scrollTop - previewElement.scrollTop;

          const perTick = (difference / duration) * delay;

          // disable preview onscroll
          previewScrollDelay = Date.now() + 500;

          previewElement.scrollTop += perTick;
          if (previewElement.scrollTop === scrollTop) {
            return;
          }

          helper(duration - delay);
        }, delay);
      };

      const scrollDuration = 120;
      helper(scrollDuration);
    };
    const scrollToRevealSourceLine = (line: number, topRatio = 0.372) => {
      if (line === currentLine) {
        return;
      } else {
        currentLine = line;
      }

      // disable preview onscroll
      previewScrollDelay = Date.now() + 500;

      /*
        if (presentationMode) {
          scrollSyncToSlide(line);
        } else {
          scrollSyncToLine(line, topRatio);
        }
        */
      scrollSyncToLine(line, topRatio);
    };
    const scrollSyncToLine = (line: number, topRatio: number = 0.372) => {
      if (!scrollMap) {
        scrollMap = buildScrollMap();
      }
      if (!scrollMap || line >= scrollMap.length) {
        return;
      }

      if (line + 1 === totalLineCount) {
        // last line
        scrollToPos(previewElement.scrollHeight);
      } else {
        /**
         * Since I am not able to access the viewport of the editor
         * I used `golden section` (0.372) here for scrollTop.
         */
        scrollToPos(
          Math.max(scrollMap[line] - previewElement.offsetHeight * topRatio, 0),
        );
      }
    };
    const revealEditorLine = (line: number) => {
      const scrollInfo = editor.getScrollInfo();
      editor.scrollIntoView({ line: line, ch: 0 }, scrollInfo.clientHeight / 2);
      editorScrollDelay = Date.now() + 500;
      if (
        scrollInfo.clientHeight !== editorClientHeight ||
        scrollInfo.clientWidth !== editorClientWidth
      ) {
        editorClientHeight = scrollInfo.clientHeight;
        editorClientWidth = scrollInfo.clientWidth;
        scrollMap = null;
      }
    };
    const previewSyncSource = () => {
      let scrollToLine;

      if (previewElement.scrollTop === 0) {
        // editorScrollDelay = Date.now() + 100
        scrollToLine = 0;

        revealEditorLine(scrollToLine);
        return;
      }

      const top = previewElement.scrollTop + previewElement.offsetHeight / 2;

      // try to find corresponding screen buffer row
      if (!scrollMap) {
        scrollMap = buildScrollMap();
      }

      let i = 0;
      let j = scrollMap.length - 1;
      let count = 0;
      let screenRow = -1; // the screenRow is the bufferRow in vscode.
      let mid;

      while (count < 20) {
        if (Math.abs(top - scrollMap[i]) < 20) {
          screenRow = i;
          break;
        } else if (Math.abs(top - scrollMap[j]) < 20) {
          screenRow = j;
          break;
        } else {
          mid = Math.floor((i + j) / 2);
          if (top > scrollMap[mid]) {
            i = mid;
          } else {
            j = mid;
          }
        }
        count++;
      }

      if (screenRow === -1) {
        screenRow = mid;
      }

      scrollToLine = screenRow;
      revealEditorLine(scrollToLine);
      // @scrollToPos(screenRow * @editor.getLineHeightInPixels() - @previewElement.offsetHeight / 2, @editor.getElement())
      // # @editor.getElement().setScrollTop

      // track currnet time to disable onDidChangeScrollTop
      // editorScrollDelay = Date.now() + 100
    };

    onChangeCallback = () => {
      try {
        const markdown = editor.getValue();
        setTimeout(() => {
          const newMarkdown = editor.getValue();
          if (markdown === newMarkdown) {
            renderPreview(previewElement, newMarkdown);
            postprocessPreview(previewElement);
          }
        }, 300);
      } catch (error) {
        previewElement.innerText = error;
      }
      // Reset scrollMap
      scrollMap = null;
    };
    onCursorActivityCallback = () => {
      const cursor = editor.getCursor();
      const scrollInfo = editor.getScrollInfo();
      const firstLine = editor.lineAtHeight(scrollInfo.top, "local");
      const lastLine = editor.lineAtHeight(
        scrollInfo.top + scrollInfo.clientHeight,
        "local",
      );
      if (!lastCursorPosition || lastCursorPosition.line !== cursor.line) {
        scrollSyncToLine(
          cursor.line,
          (cursor.line - firstLine) / (lastLine - firstLine),
        );
      }
      lastCursorPosition = cursor;
    };
    onScrollCallback = () => {
      // console.log("scroll editor: ", editor.getScrollInfo());
      // console.log("viewport: ", editor.getViewport());
      const scrollInfo = editor.getScrollInfo();
      if (
        scrollInfo.clientHeight !== editorClientHeight ||
        scrollInfo.clientWidth !== editorClientWidth
      ) {
        editorClientHeight = scrollInfo.clientHeight;
        editorClientWidth = scrollInfo.clientWidth;
        scrollMap = null;
      }

      if (Date.now() < editorScrollDelay) {
        return;
      }
      const topLine = editor.lineAtHeight(scrollInfo.top, "local");
      const bottomLine = editor.lineAtHeight(
        scrollInfo.top + scrollInfo.clientHeight,
        "local",
      );
      let midLine;
      if (topLine === 0) {
        midLine = 0;
      } else if (bottomLine === totalLineCount - 1) {
        midLine = bottomLine;
      } else {
        midLine = Math.floor((topLine + bottomLine) / 2);
      }
      scrollSyncToLine(midLine);
    };
    onWindowResizeCallback = () => {
      const scrollInfo = editor.getScrollInfo();
      editorClientHeight = scrollInfo.clientHeight;
      editorClientWidth = scrollInfo.clientWidth;
      scrollMap = null;
    };

    editor.on("changes", onChangeCallback);
    onChangeCallback();

    editor.on("cursorActivity", onCursorActivityCallback);
    editor.on("scroll", onScrollCallback);
    previewElement.onscroll = () => {
      // console.log("scroll preview: ", previewElement.scrollTop);
      if (Date.now() < previewScrollDelay) {
        return;
      }
      previewSyncSource();
    };
    window.addEventListener("resize", onWindowResizeCallback);

    return () => {
      if (onChangeCallback) {
        editor.off("changes", onChangeCallback);
      }
      if (onCursorActivityCallback) {
        editor.off("cursorActivity", onCursorActivityCallback);
      }
      if (onScrollCallback) {
        editor.off("scroll", onScrollCallback);
      }
      if (onWindowResizeCallback) {
        window.removeEventListener("resize", onWindowResizeCallback);
      }
    };
  }, [
    editor,
    note,
    previewElement,
    crossnoteContainer.editorMode,
    fullScreenMode,
    postprocessPreview,
  ]);

  // Print preview
  useEffect(() => {
    if (!note || !editor || !needsToPrint) {
      return;
    }
    if (
      crossnoteContainer.editorMode === EditorMode.Preview &&
      previewElement
    ) {
      const tempPreviewElement = document.createElement("div");
      tempPreviewElement.classList.add("preview");
      tempPreviewElement.style.zIndex = "999999";
      document.body.appendChild(tempPreviewElement);

      const bannerElement = document.createElement("div");
      bannerElement.style.position = "fixed";
      bannerElement.style.width = "100%";
      bannerElement.style.height = "100%";
      bannerElement.style.top = "0";
      bannerElement.style.left = "0";
      bannerElement.style.textAlign = "center";
      bannerElement.style.backgroundColor = theme.palette.background.default;
      bannerElement.style.color = theme.palette.text.primary;
      bannerElement.style.zIndex = "9999";
      bannerElement.innerHTML = `<p>${t("general/please-wait")}</p>`;

      const currentTheme = editor.getOption("theme") as ThemeName;
      setTheme({
        editor: null,
        themeName: "light",
      });
      const printDone = () => {
        tempPreviewElement.remove();
        setTheme({
          editor: null,
          themeName: currentTheme,
        });
        setNeedsToPrint(false);
      };
      renderPreview(
        tempPreviewElement,
        editor.getValue(),
        previewIsPresentation,
      )
        .then(() => {
          printPreview(tempPreviewElement, bannerElement)
            .then(() => {
              printDone();
            })
            .catch(() => {
              printDone();
            });
        })
        .catch(() => {
          printDone();
        });
    } else {
      crossnoteContainer.setEditorMode(EditorMode.Preview);
    }
  }, [
    needsToPrint,
    crossnoteContainer.editorMode,
    note,
    editor,
    previewElement,
    previewIsPresentation,
  ]);

  // Wiki TOC Render
  useEffect(() => {
    if (
      note &&
      editor &&
      note.filePath === "SUMMARY.md" &&
      crossnoteContainer.wikiTOCElement
    ) {
      const onChangesHandler = () => {
        renderPreview(crossnoteContainer.wikiTOCElement, editor.getValue());
        postprocessPreview(crossnoteContainer.wikiTOCElement);
      };
      editor.on("changes", onChangesHandler);
      renderPreview(crossnoteContainer.wikiTOCElement, editor.getValue());
      postprocessPreview(crossnoteContainer.wikiTOCElement);
      return () => {
        editor.off("changes", onChangesHandler);
      };
    }
  }, [note, editor, crossnoteContainer.wikiTOCElement]);

  if (!note) {
    return (
      <Box className={clsx(classes.editorPanel, "editor-panel")}>
        <Hidden smUp>
          <Box className={clsx(classes.topPanel)}>
            <Box className={clsx(classes.row)}>
              <ButtonGroup className={clsx(classes.backBtn)}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={() => {
                    crossnoteContainer.setDisplayMobileEditor(false);
                    crossnoteContainer.setEditorMode(EditorMode.Preview);
                  }}
                >
                  <ChevronLeft></ChevronLeft>
                </Button>
              </ButtonGroup>
            </Box>
          </Box>
        </Hidden>
        <Button
          style={{
            margin: "0 auto",
            top: "50%",
            position: "relative",
          }}
          onClick={() =>
            crossnoteContainer.createNewNote(
              crossnoteContainer.selectedNotebook,
            )
          }
          disabled={
            !crossnoteContainer.initialized ||
            crossnoteContainer.isLoadingNotebook
          }
          variant={"outlined"}
        >
          <Typography>{`📝 ${t("general/add-a-note")}`}</Typography>
        </Button>
      </Box>
    );
  }

  return (
    <Box className={clsx(classes.editorPanel, "editor-panel")}>
      <Box className={clsx(classes.topPanel, "editor-toolbar")}>
        <Box className={clsx(classes.row)}>
          <ButtonGroup className={clsx(classes.backBtn)}>
            <Button
              className={clsx(classes.controlBtn)}
              onClick={() => {
                crossnoteContainer.setDisplayMobileEditor(false);
                crossnoteContainer.setEditorMode(EditorMode.Preview);
              }}
            >
              <ChevronLeft></ChevronLeft>
            </Button>
          </ButtonGroup>
          <ButtonGroup
            variant={"outlined"}
            color="default"
            aria-label="editor mode"
          >
            <Tooltip title={t("general/vickymd")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  crossnoteContainer.editorMode === EditorMode.VickyMD &&
                    classes.controlBtnSelected,
                )}
                color={
                  crossnoteContainer.editorMode === EditorMode.VickyMD
                    ? "primary"
                    : "default"
                }
                onClick={() =>
                  crossnoteContainer.setEditorMode(EditorMode.VickyMD)
                }
              >
                <Pencil></Pencil>
              </Button>
            </Tooltip>
            <Tooltip title={t("editor/note-control/source-code")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  crossnoteContainer.editorMode === EditorMode.SourceCode &&
                    classes.controlBtnSelected,
                )}
                color={
                  crossnoteContainer.editorMode === EditorMode.SourceCode
                    ? "primary"
                    : "default"
                }
                onClick={() =>
                  crossnoteContainer.setEditorMode(EditorMode.SourceCode)
                }
              >
                <CodeTags></CodeTags>
              </Button>
            </Tooltip>
            <Tooltip title={t("editor/note-control/split-view")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  crossnoteContainer.editorMode === EditorMode.SplitView &&
                    classes.controlBtnSelected,
                )}
                color={
                  crossnoteContainer.editorMode === EditorMode.SplitView
                    ? "primary"
                    : "default"
                }
                onClick={() =>
                  crossnoteContainer.setEditorMode(EditorMode.SplitView)
                }
              >
                <ViewSplitVertical></ViewSplitVertical>
              </Button>
            </Tooltip>
            <Tooltip title={t("editor/note-control/preview")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  crossnoteContainer.editorMode === EditorMode.Preview &&
                    classes.controlBtnSelected,
                )}
                color={
                  crossnoteContainer.editorMode === EditorMode.Preview
                    ? "primary"
                    : "default"
                }
                onClick={() =>
                  crossnoteContainer.setEditorMode(EditorMode.Preview)
                }
              >
                <FilePresentationBox></FilePresentationBox>
              </Button>
            </Tooltip>
          </ButtonGroup>
          <ButtonGroup style={{ marginLeft: "8px" }}>
            <Tooltip title={t("general/Fullscreen")}>
              <Button
                className={clsx(classes.controlBtn)}
                onClick={() => setFullScreenMode(true)}
              >
                <Fullscreen></Fullscreen>
              </Button>
            </Tooltip>
          </ButtonGroup>
          <ButtonGroup style={{ marginLeft: "8px" }}>
            {isDecrypted && (
              <Tooltip title={t("general/tags")}>
                <Button
                  className={clsx(
                    classes.controlBtn,
                    note.config.tags &&
                      note.config.tags.length > 0 &&
                      classes.controlBtnSelectedSecondary,
                  )}
                  onClick={(event) => setTagsMenuAnchorEl(event.currentTarget)}
                >
                  {note.config.tags && note.config.tags.length > 0 ? (
                    <Tag></Tag>
                  ) : (
                    <TagOutline></TagOutline>
                  )}
                </Button>
              </Tooltip>
            )}
            {isDecrypted && (
              <Tooltip title={t("general/Pin")}>
                <Button
                  className={clsx(
                    classes.controlBtn,
                    note.config.pinned && classes.controlBtnSelectedSecondary,
                  )}
                  onClick={togglePin}
                >
                  {note.config.pinned ? <Pin></Pin> : <PinOutline></PinOutline>}
                </Button>
              </Tooltip>
            )}
            <Tooltip title={t("general/Encryption")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  note.config.encryption && classes.controlBtnSelectedSecondary,
                )}
                onClick={() => setToggleEncryptionDialogOpen(true)}
              >
                {note.config.encryption ? (
                  <Lock></Lock>
                ) : (
                  <LockOpenOutline></LockOpenOutline>
                )}
              </Button>
            </Tooltip>
          </ButtonGroup>
          <ButtonGroup style={{ marginLeft: "8px" }}>
            <Tooltip title={t("general/change-file-path")}>
              <Button
                className={clsx(classes.controlBtn)}
                onClick={() => setFilePathDialogOpen(true)}
              >
                <RenameBox></RenameBox>
              </Button>
            </Tooltip>
            <Tooltip title={t("general/Delete")}>
              <Button
                className={clsx(classes.controlBtn)}
                onClick={() => setDeleteNoteDialogOpen(true)}
              >
                <Delete></Delete>
              </Button>
            </Tooltip>
            {!note.config.encryption && (
              <Tooltip title={t("general/create-a-copy")}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={() => crossnoteContainer.duplicateNote(note)}
                >
                  <ContentDuplicate></ContentDuplicate>
                </Button>
              </Tooltip>
            )}
            {is.desktop() && (
              <Tooltip title={t("general/Print")}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={() => setNeedsToPrint(true)}
                >
                  <Printer></Printer>
                </Button>
              </Tooltip>
            )}
            <Tooltip title={t("general/Share")}>
              <Button
                className={clsx(classes.controlBtn)}
                onClick={(event) => setShareAnchorEl(event.currentTarget)}
              >
                <ShareVariant></ShareVariant>
              </Button>
            </Tooltip>
          </ButtonGroup>
          {note.notebook.gitURL && ( // If no git url set, then don't allow push/pull
            <ButtonGroup style={{ marginLeft: "8px" }}>
              <Tooltip title={t("general/restore-checkout")}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={checkoutNote}
                >
                  <Restore></Restore>
                </Button>
              </Tooltip>
              <Tooltip title={t("general/upload-push")}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={() => setPushDialogOpen(true)}
                  disabled={
                    crossnoteContainer.isPullingNotebook ||
                    crossnoteContainer.isPushingNotebook
                  }
                >
                  <CloudUploadOutline></CloudUploadOutline>
                </Button>
              </Tooltip>
              <Tooltip title={t("general/download-pull")}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={pullNotebook}
                  disabled={
                    crossnoteContainer.isPullingNotebook ||
                    crossnoteContainer.isPushingNotebook
                  }
                >
                  <CloudDownloadOutline></CloudDownloadOutline>
                </Button>
              </Tooltip>
            </ButtonGroup>
          )}
          <TagsMenuPopover
            anchorElement={tagsMenuAnchorEl}
            onClose={() => setTagsMenuAnchorEl(null)}
            addTag={addTag}
            deleteTag={deleteTag}
            tagNames={tagNames}
          ></TagsMenuPopover>
          <Popover
            open={Boolean(shareAnchorEl)}
            anchorEl={shareAnchorEl}
            keepMounted
            onClose={() => setShareAnchorEl(null)}
          >
            <Box style={{ padding: theme.spacing(1) }}>
              <Typography variant={"subtitle2"}>
                {t("editor/note-control/shareable-link")}
              </Typography>
              <Box className={clsx(classes.row)}>
                <Tooltip
                  title={t("editor/note-control/copy-to-clipboard")}
                  onClick={() => {
                    copyToClipboard(
                      note.notebook.gitURL
                        ? `${window.location.origin}/?repo=${encodeURIComponent(
                            note.notebook.gitURL,
                          )}&branch=${encodeURIComponent(
                            note.notebook.gitBranch || "master",
                          )}&filePath=${encodeURIComponent(note.filePath)}`
                        : `${window.location.origin}/?notebookID=${
                            note.notebook._id
                          }&filePath=${encodeURIComponent(note.filePath)}`,
                    );
                  }}
                >
                  <IconButton>
                    <ContentCopy></ContentCopy>
                  </IconButton>
                </Tooltip>
                <TextField
                  onChange={(event) => event.preventDefault()}
                  value={
                    note.notebook.gitURL
                      ? `${window.location.origin}/?repo=${encodeURIComponent(
                          note.notebook.gitURL,
                        )}&branch=${encodeURIComponent(
                          note.notebook.gitBranch || "master",
                        )}&filePath=${encodeURIComponent(note.filePath)}`
                      : `${window.location.origin}/?notebookID=${
                          note.notebook._id
                        }&filePath=${encodeURIComponent(note.filePath)}`
                  }
                  inputRef={(input: HTMLInputElement) => {
                    if (input) {
                      input.focus();
                      if (input.setSelectionRange) {
                        input.setSelectionRange(0, input.value.length);
                      }
                    }
                  }}
                ></TextField>
              </Box>
            </Box>
          </Popover>
        </Box>
      </Box>
      <Box
        className={clsx(
          classes.editorWrapper,
          fullScreenMode ? classes.fullScreen : null,
          crossnoteContainer.editorMode === EditorMode.SplitView
            ? classes.splitView
            : null,
        )}
      >
        <textarea
          className={clsx(classes.editor, "editor-textarea")}
          placeholder={t("editor/placeholder")}
          ref={(element: HTMLTextAreaElement) => {
            setTextAreaElement(element);
          }}
        ></textarea>
        {(crossnoteContainer.editorMode === EditorMode.Preview ||
          crossnoteContainer.editorMode === EditorMode.SplitView) &&
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
        {fullScreenMode && (
          <IconButton
            style={{
              position: "fixed",
              right: "0",
              top: "0",
              zIndex: 2001,
            }}
            onClick={() => setFullScreenMode(false)}
          >
            <FullscreenExit></FullscreenExit>
          </IconButton>
        )}
      </Box>
      <Box className={clsx(classes.bottomPanel, "editor-bottom-panel")}>
        <Box className={clsx(classes.row)}>
          <Breadcrumbs aria-label={"File path"} maxItems={4}>
            {note.filePath.split("/").map((path, offset, arr) => {
              return (
                <Typography
                  variant={"caption"}
                  style={{ cursor: "pointer" }}
                  color={"textPrimary"}
                  key={`${offset}-${path}`}
                  onClick={() => {
                    if (offset === arr.length - 1) {
                      setFilePathDialogOpen(true);
                    } else {
                      crossnoteContainer.setSelectedSection({
                        type: SelectedSectionType.Directory,
                        path: arr.slice(0, offset + 1).join("/"),
                      });
                    }
                  }}
                >
                  {path}
                </Typography>
              );
            })}
          </Breadcrumbs>
          <Typography
            variant={"caption"}
            style={{ marginLeft: "4px", marginTop: "3px" }}
            color={"textPrimary"}
          >
            {"- " + t(`git/status/${gitStatus}`)}
          </Typography>
        </Box>
        <Box className={clsx(classes.cursorPositionInfo)}>
          <Typography variant={"caption"} color={"textPrimary"}>
            {`${t("editor/ln")} ${cursorPosition.line + 1}, ${t(
              "editor/col",
            )} ${cursorPosition.ch}`}
          </Typography>
        </Box>
      </Box>
      <DeleteNoteDialog
        open={deleteNoteDialogOpen}
        onClose={() => setDeleteNoteDialogOpen(false)}
        note={note}
      ></DeleteNoteDialog>
      <ChangeFilePathDialog
        note={note}
        open={filePathDialogOpen}
        onClose={closeFilePathDialog}
      ></ChangeFilePathDialog>
      <Dialog open={toggleEncryptionDialogOpen} onClose={closeEncryptionDialog}>
        <DialogTitle>
          {note.config.encryption
            ? t("general/disable-the-encryption-on-this-note")
            : t("general/encrypt-this-note-with-password")}
        </DialogTitle>
        <DialogContent>
          <TextField
            value={toggleEncryptionPassword}
            autoFocus={true}
            onChange={(event) =>
              setToggleEncryptionPassword(event.target.value)
            }
            onKeyUp={(event) => {
              if (event.which === 13) {
                toggleEncryption();
              }
            }}
            placeholder={t("general/Password")}
            type={"password"}
          ></TextField>
        </DialogContent>
        <DialogActions>
          <Button
            variant={"contained"}
            color={"primary"}
            onClick={toggleEncryption}
          >
            {note.config.encryption ? <Lock></Lock> : <LockOpen></LockOpen>}
            {note.config.encryption
              ? t("general/disable-encryption")
              : t("general/encrypt")}
          </Button>
          <Button onClick={closeEncryptionDialog}>{t("general/cancel")}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={decryptionDialogOpen} onClose={closeDecryptionDialog}>
        <DialogTitle>{t("general/decrypt-this-note")}</DialogTitle>
        <DialogContent>
          <TextField
            value={decryptionPassword}
            autoFocus={true}
            onChange={(event) => setDecryptionPassword(event.target.value)}
            placeholder={t("general/Password")}
            type={"password"}
            onKeyUp={(event) => {
              if (event.which === 13) {
                decryptNote();
              }
            }}
          ></TextField>
        </DialogContent>
        <DialogActions>
          <Button variant={"contained"} color={"primary"} onClick={decryptNote}>
            {t("general/decrypt")}
          </Button>
          <Button onClick={closeDecryptionDialog}>{t("general/cancel")}</Button>
        </DialogActions>
      </Dialog>
      <PushNotebookDialog
        open={pushDialogOpen}
        onClose={() => setPushDialogOpen(false)}
        notebook={note.notebook}
      ></PushNotebookDialog>
      <EditImageDialog
        open={editImageDialogOpen}
        onClose={() => setEditImageDialogOpen(false)}
        editor={editor}
        imageElement={editImageElement}
        marker={editImageTextMarker}
        note={note}
      ></EditImageDialog>

      <Card
        id="math-preview"
        className={clsx(classes.floatWin, "float-win", "float-win-hidden")}
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
