import React, { useState, useCallback, useEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { Note, TagNode } from "../lib/crossnote";
import {
  CrossnoteContainer,
  EditorMode,
  SelectedSectionType,
} from "../containers/crossnote";
import { useTranslation } from "react-i18next";
import * as CryptoJS from "crypto-js";
import * as path from "path";
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
  List,
  ListItem,
  Hidden,
  Breadcrumbs,
} from "@material-ui/core";
import {
  Editor as CodeMirrorEditor,
  EditorChangeLinkedList,
  TextMarker,
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
} from "mdi-material-ui";
import { renderPreview } from "vickymd/preview";
import PushNotebookDialog from "./PushNotebookDialog";
import EditImageDialog from "./EditImageDialog";
import Noty from "noty";
import { formatDistance } from "date-fns";
import { getHeaderFromMarkdown } from "../utilities/note";
import { printPreview } from "../utilities/preview";
import ChangeFilePathDialog from "./ChangeFilePathDialog";
import { SettingsContainer } from "../containers/settings";
import { initMathPreview } from "../editor/views/math-preview";
import EmojiDefinitions from "vickymd/addon/emoji";
import { TagStopRegExp } from "../utilities/markdown";
import { resolveNoteImageSrc } from "../utilities/image";
import { DeleteDialog } from "./DeleteDialog";
import { setTheme } from "vickymd/theme";

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
      //     display: "contents",
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
      padding: theme.spacing(2),
      zIndex: previewZIndex,
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1),
      },
      // gridArea: "2 / 2 / 3 / 3"
    },
    backBtn: {
      marginRight: "8px",
      [theme.breakpoints.up("sm")]: {
        display: "none",
      },
    },
    menuItemOverride: {
      "cursor": "default",
      "padding": `0 0 0 ${theme.spacing(2)}px`,
      "&:hover": {
        backgroundColor: "inherit",
      },
    },
    menuItemTextField: {
      paddingRight: theme.spacing(2),
    },
    // math
    floatWin: {
      position: "fixed",
      zIndex: 100,
      background: "#EEE",
      backgroundImage: "linear-gradient(to bottom, #FFF, #EEE)",
      borderRadius: "5px",
      overflow: "hidden",
      boxShadow: "0 3px 7px rgba(0,0,0,0.3)",
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
      backgroundImage: "linear-gradient(to bottom, #68A, #579)",
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
    iconBtnSVG: {
      color: theme.palette.text.secondary,
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
  const [textAreaElement, setTextAreaElement] = useState<HTMLTextAreaElement>(
    null,
  );
  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    line: 0,
    ch: 0,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [filePathDialogOpen, setFilePathDialogOpen] = useState<boolean>(false);
  const [pushDialogOpen, setPushDialogOpen] = useState<boolean>(false);
  const [previewElement, setPreviewElement] = useState<HTMLElement>(null);
  const [previewIsPresentation, setPreviewIsPresentation] = useState<boolean>(
    false,
  );
  const [gitStatus, setGitStatus] = useState<string>("");
  const [fullScreenMode, setFullScreenMode] = useState<boolean>(false);
  const [tagsMenuAnchorEl, setTagsMenuAnchorEl] = useState<HTMLElement>(null);
  const [tagName, setTagName] = useState<string>("");
  const [tagNames, setTagNames] = useState<string[]>([]);
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
      let tag = tagName.trim() || "";
      if (!note || !tag.length || !editor || !isDecrypted) {
        return;
      }
      tag = tag
        .replace(/\s+/g, " ")
        .replace(TagStopRegExp, "")
        .split("/")
        .map((t) => t.trim())
        .filter((x) => x.length > 0)
        .join("/");
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
      setTagName("");
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

  const openURL = useCallback(
    (url: string = "") => {
      if (!note || !editor || !url) {
        return;
      }
      if (url.match(/https?:\/\//)) {
        window.open(url, "_blank"); // TODO: opener bug, check zhihu
      } else if (url.startsWith("/")) {
        let filePath = path.relative(
          note.notebook.dir,
          path.resolve(note.notebook.dir, url.replace(/^\//, "")),
        );
        crossnoteContainer.openNoteAtPath(filePath);
      } else {
        let filePath = path.relative(
          note.notebook.dir,
          path.resolve(
            path.dirname(path.resolve(note.notebook.dir, note.filePath)),
            url,
          ),
        );
        crossnoteContainer.openNoteAtPath(filePath);
      }
    },
    [note, editor],
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
  `;
  }, [settingsContainer.editorCursorColor]);

  useEffect(() => {
    if (note) {
      crossnoteContainer.crossnote.getStatus(note).then((status) => {
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
        inputStyle: "textarea",
        hmdFold: HMDFold,
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

  useEffect(() => {
    if (editor && settingsContainer.theme) {
      setTheme({
        editor,
        themeName: settingsContainer.theme.name,
        baseUri: "/styles/",
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
        openURL(url || "");
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
  }, [editor, note, decryptionPassword, isDecrypted, openURL]);

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
    } else {
      editor.getWrapperElement().style.display = "none";
    }
  }, [crossnoteContainer.editorMode, editor, note, isDecrypted]);

  // Render Preview
  useEffect(() => {
    if (
      crossnoteContainer.editorMode === EditorMode.Preview &&
      editor &&
      note &&
      previewElement
    ) {
      if (isDecrypted) {
        const handleLinksClickEvent = (preview: HTMLElement) => {
          // Handle link click event
          const links = preview.getElementsByTagName("A");
          for (let i = 0; i < links.length; i++) {
            const link = links[i] as HTMLAnchorElement;
            link.onclick = (event) => {
              event.preventDefault();
              if (link.hasAttribute("data-topic")) {
                const tag = link.getAttribute("data-topic");
                if (tag.length) {
                  crossnoteContainer.setSelectedSection({
                    type: SelectedSectionType.Tag,
                    path: tag,
                  });
                }
              } else {
                openURL(link.getAttribute("href"));
              }
            };
          }
        };
        const resolveImages = async (preview: HTMLElement) => {
          const images = preview.getElementsByTagName("IMG");
          for (let i = 0; i < images.length; i++) {
            const image = images[i] as HTMLImageElement;
            const imageSrc = image.getAttribute("src");
            image.setAttribute(
              "src",
              await resolveNoteImageSrc(note, imageSrc),
            );
          }
        };
        renderPreview(previewElement, editor.getValue());
        if (
          previewElement.childElementCount &&
          previewElement.children[0].tagName.toUpperCase() === "IFRAME"
        ) {
          // presentation
          previewElement.style.maxWidth = "100%";
          previewElement.style.height = "100%";
          previewElement.style.overflow = "hidden !important";
          handleLinksClickEvent(
            (previewElement.children[0] as HTMLIFrameElement).contentDocument
              .body as HTMLElement,
          );
          resolveImages(
            (previewElement.children[0] as HTMLIFrameElement).contentDocument
              .body as HTMLElement,
          );
          setPreviewIsPresentation(true);
        } else {
          // normal
          // previewElement.style.maxWidth = `${EditorPreviewMaxWidth}px`;
          previewElement.style.height = "100%";
          previewElement.style.overflow = "hidden !important";
          handleLinksClickEvent(previewElement);
          resolveImages(previewElement);
          setPreviewIsPresentation(false);
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
    openURL,
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

              const commands = [
                {
                  text: "# ",
                  displayText: `/h1 - ${t("editor/toolbar/insert-header-1")}`,
                },
                {
                  text: "## ",
                  displayText: `/h2 - ${t("editor/toolbar/insert-header-2")}`,
                },
                {
                  text: "### ",
                  displayText: `/h3 - ${t("editor/toolbar/insert-header-3")}`,
                },
                {
                  text: "#### ",
                  displayText: `/h4 - ${t("editor/toolbar/insert-header-4")}`,
                },
                {
                  text: "##### ",
                  displayText: `/h5 - ${t("editor/toolbar/insert-header-5")}`,
                },
                {
                  text: "###### ",
                  displayText: `/h6 - ${t("editor/toolbar/insert-header-6")}`,
                },
                {
                  text: "> ",
                  displayText: `/blockquote - ${t(
                    "editor/toolbar/insert-blockquote",
                  )}`,
                },
                {
                  text: "* ",
                  displayText: `/ul - ${t(
                    "editor/toolbar/insert-unordered-list",
                  )}`,
                },
                {
                  text: "1. ",
                  displayText: `/ol - ${t(
                    "editor/toolbar/insert-ordered-list",
                  )}`,
                },
                {
                  text: "<!-- @crossnote.image -->\n",
                  displayText: `/image - ${t("editor/toolbar/insert-image")}`,
                },
                {
                  text: `|   |   |
|---|---|
|   |   |
`,
                  displayText: `/table - ${t("editor/toolbar/insert-table")}`,
                },
                {
                  text:
                    "<!-- @timer " +
                    JSON.stringify({ date: new Date().toString() })
                      .replace(/^{/, "")
                      .replace(/}$/, "") +
                    " -->\n",
                  displayText: `/timer - ${t("editor/toolbar/insert-clock")}`,
                },
                {
                  text: "<!-- @crossnote.audio -->  \n",
                  displayText: `/audio - ${t("editor/toolbar/audio-url")}`,
                },
                {
                  text: "<!-- @crossnote.netease_music -->  \n",
                  displayText: `/netease - ${t(
                    "editor/toolbar/netease-music",
                  )}`,
                },
                {
                  text: "<!-- @crossnote.video -->  \n",
                  displayText: `/video - ${t("editor/toolbar/video-url")}`,
                },
                {
                  text: "<!-- @crossnote.youtube -->  \n",
                  displayText: `/youtube - ${t("editor/toolbar/youtube")}`,
                },
                {
                  text: "<!-- @crossnote.bilibili -->  \n",
                  displayText: `/bilibili - ${t("editor/toolbar/bilibili")}`,
                },
                {
                  text: "<!-- slide -->  \n",
                  displayText: `/slide - ${t("editor/toolbar/insert-slide")}`,
                },
                {
                  text: "<!-- @crossnote.ocr -->  \n",
                  displayText: `/ocr - ${t("editor/toolbar/insert-ocr")}`,
                },
                {
                  text:
                    '<!-- @crossnote.kanban "v":2,"board":{"columns":[]} -->  \n',
                  displayText: `/kanban - ${t(
                    "editor/toolbar/insert-kanban",
                  )} (beta)`,
                },
                {
                  text: "<!-- @crossnote.abc -->  \n",
                  displayText: `/abc - ${t(
                    "editor/toolbar/insert-abc-notation",
                  )}`,
                },
                {
                  text: "<!-- @crossnote.github_gist -->  \n",
                  displayText: `/github_gist - ${t(
                    "editor/toolbar/insert-github-gist",
                  )}`,
                },
                {
                  text: "<!-- @crossnote.comment -->  \n",
                  displayText: `/crossnote.comment - ${t(
                    "editor/toolbar/insert-comment",
                  )}`,
                },
              ];
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
      }

      // Check emoji
      if (changeObject.text.length === 1 && changeObject.text[0] === ":") {
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
            if (lineStr[start] !== ":") {
              start = start - 1;
            }
            const currentWord: string = lineStr
              .slice(start, end)
              .replace(/^:/, "");

            const commands: { text: string; displayText: string }[] = [];
            for (const def in EmojiDefinitions) {
              const emoji = EmojiDefinitions[def];
              commands.push({
                text: `:${def}: `,
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
      const printDone = () => {
        setNeedsToPrint(false);
        tempPreviewElement.remove();
      };
      renderPreview(
        tempPreviewElement,
        editor.getValue(),
        previewIsPresentation,
      )
        .then(() => {
          printPreview(tempPreviewElement)
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
      const handleLinksClickEvent = (preview: HTMLElement) => {
        // Handle link click event
        const links = preview.getElementsByTagName("A");
        for (let i = 0; i < links.length; i++) {
          const link = links[i] as HTMLAnchorElement;
          link.onclick = (event) => {
            event.preventDefault();
            openURL(link.getAttribute("href"));
          };
        }
      };
      const onChangesHandler = () => {
        renderPreview(crossnoteContainer.wikiTOCElement, editor.getValue());
        handleLinksClickEvent(crossnoteContainer.wikiTOCElement);
      };
      editor.on("changes", onChangesHandler);
      renderPreview(crossnoteContainer.wikiTOCElement, editor.getValue());
      handleLinksClickEvent(crossnoteContainer.wikiTOCElement);
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
                onClick={() => setDeleteDialogOpen(true)}
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
          <Popover
            open={Boolean(tagsMenuAnchorEl)}
            anchorEl={tagsMenuAnchorEl}
            keepMounted
            onClose={() => setTagsMenuAnchorEl(null)}
          >
            <List>
              <ListItem
                className={clsx(
                  classes.menuItemOverride,
                  classes.menuItemTextField,
                )}
              >
                <TextField
                  placeholder={t("general/add-a-tag")}
                  autoFocus={true}
                  value={tagName}
                  onChange={(event) => {
                    event.stopPropagation();
                    setTagName(event.target.value);
                  }}
                  onKeyUp={(event) => {
                    if (event.which === 13) {
                      addTag(tagName);
                    }
                  }}
                ></TextField>
              </ListItem>
              {tagNames.length > 0 ? (
                tagNames.map((tagName) => {
                  return (
                    <ListItem
                      key={tagName}
                      className={clsx(classes.menuItemOverride)}
                    >
                      <Box
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                        }}
                      >
                        <Typography>{tagName}</Typography>
                        <IconButton onClick={() => deleteTag(tagName)}>
                          <Close className={clsx(classes.iconBtnSVG)}></Close>
                        </IconButton>
                      </Box>
                    </ListItem>
                  );
                })
              ) : (
                <ListItem className={clsx(classes.menuItemOverride)}>
                  <Typography style={{ margin: "8px 0" }}>
                    {t("general/no-tags")}
                  </Typography>
                </ListItem>
              )}
            </List>
          </Popover>
        </Box>
      </Box>
      <Box
        className={clsx(
          classes.editorWrapper,
          fullScreenMode ? classes.fullScreen : null,
        )}
      >
        <textarea
          className={clsx(classes.editor, "editor-textarea")}
          placeholder={t("editor/placeholder")}
          ref={(element: HTMLTextAreaElement) => {
            setTextAreaElement(element);
          }}
        ></textarea>
        {crossnoteContainer.editorMode === EditorMode.Preview &&
        /*!editorContainer.pinPreviewOnTheSide &&*/
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
            {"- " + gitStatus}
          </Typography>
        </Box>
        <Box className={clsx(classes.cursorPositionInfo)}>
          <Typography variant={"caption"} color={"textPrimary"}>
            {`Ln ${cursorPosition.line + 1}, Col ${cursorPosition.ch}`}
          </Typography>
        </Box>
      </Box>
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        note={note}
      ></DeleteDialog>
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

      <Box
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
      </Box>
    </Box>
  );
}
