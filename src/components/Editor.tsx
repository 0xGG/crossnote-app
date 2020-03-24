import React, { useState, useCallback, useEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { Note } from "../lib/crossnote";
import { CrossnoteContainer } from "../containers/crossnote";
import { useTranslation } from "react-i18next";
import * as CryptoJS from "crypto-js";
import * as path from "path";
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Tooltip,
  TextField,
  ButtonGroup,
  IconButton,
  Popover,
  List,
  ListItem,
  Hidden
} from "@material-ui/core";
import {
  Editor as CodeMirrorEditor,
  EditorChangeLinkedList,
  TextMarker
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
  Printer
} from "mdi-material-ui";
import { renderPreview } from "vickymd/preview";
import PushNotebookDialog from "./PushNotebookDialog";
import EditImageDialog from "./EditImageDialog";
import Noty from "noty";
import { formatDistance } from "date-fns";
import { getHeaderFromMarkdown } from "../utilities/note";
import { printPreview } from "../utilities/preview";

const VickyMD = require("vickymd");
const is = require("is_js");

const previewZIndex = 99;
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    editorPanel: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column"
    },
    topPanel: {
      position: "relative",
      padding: theme.spacing(0.5, 1), // theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid #eee",
      overflow: "auto"
    },
    bottomPanel: {
      position: "relative",
      padding: theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: "1px solid #eee"
      // color: theme.palette.primary.contrastText,
      // backgroundColor: theme.palette.primary.main
    },
    controlBtn: {
      padding: theme.spacing(0.5, 0),
      color: theme.palette.text.secondary
    },
    controlBtnSelected: {
      color: theme.palette.primary.main
    },
    controlBtnSelectedSecondary: {
      color: theme.palette.secondary.main
    },
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    },
    cursorPositionInfo: {
      // position: "absolute",
      // right: "16px",
      // bottom: "16px",
      zIndex: 150
    },
    editorWrapper: {
      //     display: "contents",
      flex: 1,
      overflow: "auto",
      "& .CodeMirror-gutters": {
        display: "none"
      },
      "& .CodeMirror-code": {
        width: "100%"
      },
      "& .CodeMirror": {
        height: "100%",
        padding: theme.spacing(0, 2),
        [theme.breakpoints.down("sm")]: {
          padding: theme.spacing(0)
        }
      },
      "& .CodeMirror-vscrollbar": {
        display: "none !important"
      },
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1)
      }
    },
    fullScreen: {
      position: "fixed",
      width: "100%",
      height: "100%",
      left: "0",
      top: "0",
      zIndex: 2000,
      overflow: "auto",
      padding: "0"
    },
    editor: {
      width: "100%",
      height: "100%"
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
        padding: theme.spacing(1)
      }
      // gridArea: "2 / 2 / 3 / 3"
    },
    backBtn: {
      marginRight: "8px",
      [theme.breakpoints.up("sm")]: {
        display: "none"
      }
    },
    menuItemOverride: {
      cursor: "default",
      padding: `0 0 0 ${theme.spacing(2)}px`,
      "&:hover": {
        backgroundColor: "inherit"
      }
    },
    menuItemTextField: {
      paddingRight: theme.spacing(2)
    }
  })
);

export enum EditorMode {
  VickyMD = "VickyMD",
  SourceCode = "SourceCode",
  Preview = "Preview"
}
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
    null
  );
  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    line: 0,
    ch: 0
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [filePathDialogOpen, setFilePathDialogOpen] = useState<boolean>(false);
  const [pushDialogOpen, setPushDialogOpen] = useState<boolean>(false);
  const [newFilePath, setNewFilePath] = useState<string>(
    (note && note.filePath) || ""
  );
  const [editorMode, setEditorMode] = useState<EditorMode>(EditorMode.VickyMD);
  const [previewElement, setPreviewElement] = useState<HTMLElement>(null);
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
    false
  );
  const [decryptionPassword, setDecryptionPassword] = useState<string>("");
  const [isDecrypted, setIsDecrypted] = useState<boolean>(false);
  const [needsToPrint, setNeedsToPrint] = useState<boolean>(false);
  const [editImageElement, setEditImageElement] = useState<HTMLImageElement>(
    null
  );
  const [editImageTextMarker, setEditImageTextMarker] = useState<TextMarker>(
    null
  );
  const [editImageDialogOpen, setEditImageDialogOpen] = useState<boolean>(
    false
  );

  const crossnoteContainer = CrossnoteContainer.useContainer();

  const { t } = useTranslation();

  const closeFilePathDialog = useCallback(() => {
    if (!note) return;
    setFilePathDialogOpen(false);
    setNewFilePath(note.filePath);
  }, [note]);

  const closeEncryptionDialog = useCallback(() => {
    setToggleEncryptionPassword("");
    setToggleEncryptionDialogOpen(false);
  }, []);

  const closeDecryptionDialog = useCallback(() => {
    setDecryptionPassword("");
    setDecryptionDialogOpen(false);
  }, []);

  const changeFilePath = useCallback(
    (newFilePath: string) => {
      if (!note) return;
      (async () => {
        newFilePath = newFilePath.replace(/^\/+/, "");
        if (!newFilePath.endsWith(".md")) {
          newFilePath = newFilePath + ".md";
        }
        if (note.filePath !== newFilePath) {
          await crossnoteContainer.changeNoteFilePath(note, newFilePath);
        }
        setNewFilePath(newFilePath);
        setFilePathDialogOpen(false);
      })();
    },
    [note, closeFilePathDialog]
  );

  const pullNotebook = useCallback(() => {
    new Noty({
      type: "info",
      text: "Pulling notebook...",
      layout: "topRight",
      theme: "relax",
      timeout: 2000
    }).show();
    if (!note) return;
    crossnoteContainer
      .pullNotebook({
        notebook: note.notebook,
        onAuthFailure: () => {
          new Noty({
            type: "error",
            text: "Authentication failed",
            layout: "topRight",
            theme: "relax",
            timeout: 5000
          }).show();
        }
      })
      .then(() => {
        new Noty({
          type: "success",
          text: "Notebook pulled",
          layout: "topRight",
          theme: "relax",
          timeout: 2000
        }).show();
      })
      .catch(error => {
        console.log(error);
        new Noty({
          type: "error",
          text: "Failed to pull notebook",
          layout: "topRight",
          theme: "relax",
          timeout: 2000
        }).show();
      });
  }, [note]);

  const checkoutNote = useCallback(() => {
    if (!note) return;
    crossnoteContainer.checkoutNote(note);
  }, [note]);

  const addTag = useCallback(() => {
    let tag = tagName.trim() || "";
    if (!note || !tag.length || !editor || !isDecrypted) {
      return;
    }
    tag = tag
      .replace(/\s+/g, " ")
      .split("/")
      .map(t => t.trim())
      .filter(x => x.length > 0)
      .join("/");
    setTagNames(tagNames => {
      const newTagNames =
        tagNames.indexOf(tag) >= 0 ? [...tagNames] : [tag, ...tagNames];
      note.config.tags = newTagNames.sort((x, y) => x.localeCompare(y));
      crossnoteContainer.updateNoteMarkdown(
        note,
        editor.getValue(),
        note.config.encryption ? decryptionPassword : "",
        status => {
          setGitStatus(status);
        }
      );
      crossnoteContainer.updateNotebookTagNode();
      return newTagNames;
    });
    setTagName("");
  }, [tagName, note, editor, decryptionPassword, isDecrypted]);

  const deleteTag = useCallback(
    (tagName: string) => {
      if (note && editor && isDecrypted) {
        setTagNames(tagNames => {
          const newTagNames = tagNames.filter(t => t !== tagName);
          note.config.tags = newTagNames.sort((x, y) => x.localeCompare(y));
          crossnoteContainer.updateNoteMarkdown(
            note,
            editor.getValue(),
            note.config.encryption ? decryptionPassword : "",
            status => {
              setGitStatus(status);
            }
          );
          crossnoteContainer.updateNotebookTagNode();
          return newTagNames;
        });
      }
    },
    [note, editor, decryptionPassword, isDecrypted]
  );

  const toggleEncryption = useCallback(() => {
    if (note && editor) {
      const markdown = editor.getValue();
      if (note.config.encryption) {
        // Disable encryption
        // Check if the password is correct
        crossnoteContainer
          .getNote(note.notebook, note.filePath)
          .then(n => {
            try {
              const bytes = CryptoJS.AES.decrypt(
                n.markdown.trim(),
                toggleEncryptionPassword
              );
              const json = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
              // Disable encryption
              note.config.encryption = null;
              delete note.config.encryption;
              crossnoteContainer.updateNoteMarkdown(
                note,
                json.markdown,
                "",
                status => {
                  setGitStatus(status);
                  setDecryptionPassword("");
                  setIsDecrypted(true);
                  closeEncryptionDialog();
                  editor.setValue(json.markdown);
                  editor.setOption("readOnly", false);
                }
              );
            } catch (error) {
              new Noty({
                type: "error",
                text: "Failed to disable encryption",
                layout: "topRight",
                theme: "relax",
                timeout: 5000
              }).show();
            }
          })
          .catch(error => {
            new Noty({
              type: "error",
              text: "Failed to disable encryption",
              layout: "topRight",
              theme: "relax",
              timeout: 5000
            }).show();
          });
      } else {
        // Enable encryption
        note.config.encryption = {
          title: getHeaderFromMarkdown(markdown)
        };
        crossnoteContainer.updateNoteMarkdown(
          note,
          editor.getValue(),
          toggleEncryptionPassword,
          status => {
            setDecryptionPassword(toggleEncryptionPassword);
            setIsDecrypted(true);
            setGitStatus(status);
            closeEncryptionDialog();
          }
        );
      }
    }
  }, [note, editor, closeEncryptionDialog, toggleEncryptionPassword]);

  const decryptNote = useCallback(() => {
    if (note && editor) {
      crossnoteContainer
        .getNote(note.notebook, note.filePath)
        .then(n => {
          // Decrypt
          try {
            const bytes = CryptoJS.AES.decrypt(
              n.markdown.trim(),
              decryptionPassword
            );
            const json = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
            editor.setOption("readOnly", false);
            editor.setValue(json.markdown);
            setIsDecrypted(true);
            setDecryptionDialogOpen(false); // Don't clear decryptionPassword
          } catch (error) {
            new Noty({
              type: "error",
              text: "Decryption failed",
              layout: "topRight",
              theme: "relax",
              timeout: 5000
            }).show();
            setIsDecrypted(false);
          }
        })
        .catch(error => {
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
        status => {
          setGitStatus(status);
        }
      );
    }
  }, [note, editor, decryptionPassword, isDecrypted]);

  const openURL = useCallback(
    (url: string = "") => {
      if (!note || !editor || !url) {
        return;
      }
      if (url.match(/https?:\/\//)) {
        window.open(url, "_blank");
      } else if (url.startsWith("/")) {
        let filePath = path.relative(
          note.notebook.dir,
          path.resolve(note.notebook.dir, url.replace(/^\//, ""))
        );
        crossnoteContainer.openNoteAtPath(filePath);
      } else {
        let filePath = path.relative(
          note.notebook.dir,
          path.resolve(
            path.dirname(path.resolve(note.notebook.dir, note.filePath)),
            url
          )
        );
        crossnoteContainer.openNoteAtPath(filePath);
      }
    },
    [note, editor]
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

  useEffect(() => {
    if (note) {
      setNewFilePath(note.filePath);
    }
  }, [note]);

  useEffect(() => {
    if (note) {
      crossnoteContainer.crossnote.getStatus(note).then(status => {
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
      editor.setValue("🔐 encrypted");
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
          hashtag: true
        },
        inputStyle: "textarea"
      });
      editor.setOption("lineNumbers", false);
      editor.setOption("foldGutter", false);
      editor.setValue(note.markdown || "");
      editor.on("cursorActivity", instance => {
        const cursor = instance.getCursor();
        if (cursor) {
          setCursorPosition({
            line: cursor.line,
            ch: cursor.ch
          });
        }
      });
      setEditor(editor);
    }
  }, [textAreaElement, note, editor]);

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
          status => {
            setGitStatus(status);
            setTagNames(note.config.tags || []); // After resolve conflicts
          }
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
          JSON.stringify(marker.find())
        );
        setEditImageElement(imageElement);
        setEditImageTextMarker(marker);
        setEditImageDialogOpen(true);
      };
      editor.on("imageClicked", imageClickedHandler);

      return () => {
        editor.off("changes", changesHandler);
        editor.off("keyup", keyupHandler);
        editor.off("linkIconClicked", linkIconClickedHandler);
        editor.off("imageClicked", imageClickedHandler);
      };
    }
  }, [editor, note, decryptionPassword, isDecrypted]);

  useEffect(() => {
    if (!editor || !note) return;
    if (editorMode === EditorMode.VickyMD) {
      VickyMD.switchToHyperMD(editor);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    } else if (editorMode === EditorMode.SourceCode) {
      VickyMD.switchToNormal(editor);
      editor.getWrapperElement().style.display = "block";
      editor.refresh();
    } else {
      editor.getWrapperElement().style.display = "none";
    }
  }, [editorMode, editor, note, isDecrypted]);

  // Render Preview
  useEffect(() => {
    if (editorMode === EditorMode.Preview && editor && note && previewElement) {
      if (isDecrypted) {
        const handleLinksClickEvent = (preview: HTMLElement) => {
          // Handle link click event
          const links = preview.getElementsByTagName("A");
          for (let i = 0; i < links.length; i++) {
            const link = links[i] as HTMLAnchorElement;
            link.onclick = event => {
              event.preventDefault();
              openURL(link.getAttribute("href"));
            };
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
              .body as HTMLElement
          );
        } else {
          // normal
          // previewElement.style.maxWidth = `${EditorPreviewMaxWidth}px`;
          previewElement.style.height = "100%";
          previewElement.style.overflow = "hidden !important";
          handleLinksClickEvent(previewElement);
        }
      } else {
        previewElement.innerHTML = "🔐 encrypted";
      }
    }
  }, [editorMode, editor, previewElement, note, isDecrypted]);

  // Command
  useEffect(() => {
    if (!editor || !note) return;
    const onChangeHandler = (
      instance: CodeMirrorEditor,
      changeObject: EditorChangeLinkedList
    ) => {
      // Check commands
      if (changeObject.text.length === 1 && changeObject.text[0] === "/") {
        editor.showHint({
          closeOnUnfocus: false,
          completeSingle: false,
          hint: () => {
            const cursor = editor.getCursor();
            const token = editor.getTokenAt(cursor);
            const start = token.string.lastIndexOf("/");
            const line = cursor.line;
            const end: number = cursor.ch;
            const currentWord: string = token.string.slice(start + 1, end);

            const commands = [
              {
                text: "# ",
                displayText: `/h1 - ${t("editor/toolbar/insert-header-1")}`
              },
              {
                text: "## ",
                displayText: `/h2 - ${t("editor/toolbar/insert-header-2")}`
              },
              {
                text: "### ",
                displayText: `/h3 - ${t("editor/toolbar/insert-header-3")}`
              },
              {
                text: "#### ",
                displayText: `/h4 - ${t("editor/toolbar/insert-header-4")}`
              },
              {
                text: "##### ",
                displayText: `/h5 - ${t("editor/toolbar/insert-header-5")}`
              },
              {
                text: "###### ",
                displayText: `/h6 - ${t("editor/toolbar/insert-header-6")}`
              },
              {
                text: "> ",
                displayText: `/blockquote - ${t(
                  "editor/toolbar/insert-blockquote"
                )}`
              },
              {
                text: "* ",
                displayText: `/ul - ${t(
                  "editor/toolbar/insert-unordered-list"
                )}`
              },
              {
                text: "1. ",
                displayText: `/ol - ${t("editor/toolbar/insert-ordered-list")}`
              },
              {
                text: "`@crossnote.image`\n",
                displayText: `/image - ${t("editor/toolbar/insert-image")}`
              },
              {
                text: `|   |   |
|---|---|
|   |   |
`,
                displayText: `/table - ${t("editor/toolbar/insert-table")}`
              },
              {
                text:
                  "`@timer " +
                  JSON.stringify({ date: new Date().toString() })
                    .replace(/^{/, "")
                    .replace(/}$/, "") +
                  "`\n",
                displayText: `/timer - ${t("editor/toolbar/insert-clock")}`
              },
              {
                text: "",
                displayText: `/emoji - ${t("editor/toolbar/insert-emoji")}`
              },
              {
                text: "`@crossnote.audio`  \n",
                displayText: `/audio - ${t("editor/toolbar/audio-url")}`
              },
              {
                text: "`@crossnote.netease_music`  \n",
                displayText: `/netease - ${t("editor/toolbar/netease-music")}`
              },
              {
                text: "`@crossnote.video`  \n",
                displayText: `/video - ${t("editor/toolbar/video-url")}`
              },
              {
                text: "`@crossnote.youtube`  \n",
                displayText: `/youtube - ${t("editor/toolbar/youtube")}`
              },
              {
                text: "`@crossnote.bilibili`  \n",
                displayText: `/bilibili - ${t("editor/toolbar/bilibili")}`
              },
              {
                text: "<!-- slide -->  \n",
                displayText: `/slide - ${t("editor/toolbar/insert-slide")}`
              },
              {
                text: "`@crossnote.ocr`  \n",
                displayText: `/ocr - ${t("editor/toolbar/insert-ocr")}`
              },
              {
                text: '`@crossnote.kanban "v":2,"board":{"columns":[]}`  \n',
                displayText: `/kanban - ${t(
                  "editor/toolbar/insert-kanban"
                )} (beta)`
              },
              {
                text: "`@crossnote.abc`  \n",
                displayText: `/abc - ${t("editor/toolbar/insert-abc-notation")}`
              }
            ];
            const filtered = commands.filter(
              item =>
                item.displayText
                  .toLocaleLowerCase()
                  .indexOf(currentWord.toLowerCase()) >= 0
            );
            return {
              list: filtered.length ? filtered : commands,
              from: { line, ch: start },
              to: { line, ch: end }
            };
          }
        });
      }

      // Timer
      if (
        changeObject.text.length > 0 &&
        changeObject.text[0].startsWith("`@timer ") &&
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
                  date: new Date(datetime)
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
            { includeSeconds: true }
          );
          const newText = `\`@timer ${JSON.stringify({
            date: currentTimerText.date.toString(),
            duration
          })
            .replace(/^{/, "")
            .replace(/}$/, "")}\``;
          editor.replaceRange(
            newText,
            { line: currentTimerText.line, ch: 0 },
            { line: currentTimerText.line, ch: currentTimerText.text.length }
          );
        }
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
  }, [editor, note /*t*/]);

  // Print preview
  useEffect(() => {
    if (!note || !editor || !needsToPrint) {
      return;
    }
    if (editorMode === EditorMode.Preview && previewElement) {
      const printDone = () => {
        setNeedsToPrint(false);
        previewElement.style.zIndex = `${previewZIndex}`;
      };
      printPreview(previewElement)
        .then(() => {
          printDone();
        })
        .catch(() => {
          printDone();
        });
    } else {
      setEditorMode(EditorMode.Preview);
    }
  }, [needsToPrint, editorMode, note, editor, previewElement]);

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
          link.onclick = event => {
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
            position: "relative"
          }}
          onClick={() => crossnoteContainer.createNewNote()}
          disabled={crossnoteContainer.isLoadingNotebook}
          variant={"outlined"}
        >
          <Typography>{"📝 Create a note"}</Typography>
        </Button>
      </Box>
    );
  }

  return (
    <Box className={clsx(classes.editorPanel, "editor-panel")}>
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
          <ButtonGroup
            variant={"outlined"}
            color="default"
            aria-label="editor mode"
          >
            <Tooltip title={t("general/vickymd")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  editorMode === EditorMode.VickyMD &&
                    classes.controlBtnSelected
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
                    classes.controlBtnSelected
                )}
                color={
                  editorMode === EditorMode.SourceCode ? "primary" : "default"
                }
                onClick={() => setEditorMode(EditorMode.SourceCode)}
              >
                <CodeTags></CodeTags>
              </Button>
            </Tooltip>
            <Tooltip title={t("editor/note-control/preview")}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  editorMode === EditorMode.Preview &&
                    classes.controlBtnSelected
                )}
                color={
                  editorMode === EditorMode.Preview ? "primary" : "default"
                }
                onClick={() => setEditorMode(EditorMode.Preview)}
              >
                <FilePresentationBox></FilePresentationBox>
              </Button>
            </Tooltip>
          </ButtonGroup>
          <ButtonGroup style={{ marginLeft: "8px" }}>
            {isDecrypted && (
              <Tooltip title={"Tags"}>
                <Button
                  className={clsx(classes.controlBtn)}
                  onClick={event => setTagsMenuAnchorEl(event.currentTarget)}
                >
                  <TagOutline></TagOutline>
                </Button>
              </Tooltip>
            )}
            {isDecrypted && (
              <Tooltip title={"Pin"}>
                <Button
                  className={clsx(
                    classes.controlBtn,
                    note.config.pinned && classes.controlBtnSelectedSecondary
                  )}
                  onClick={togglePin}
                >
                  {note.config.pinned ? <Pin></Pin> : <PinOutline></PinOutline>}
                </Button>
              </Tooltip>
            )}
            <Tooltip title={"Encryption"}>
              <Button
                className={clsx(
                  classes.controlBtn,
                  note.config.encryption && classes.controlBtnSelectedSecondary
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
            <Tooltip title={"Change file path"}>
              <Button
                className={clsx(classes.controlBtn)}
                onClick={() => setFilePathDialogOpen(true)}
              >
                <RenameBox></RenameBox>
              </Button>
            </Tooltip>
            <Tooltip title={"Restore (checkout)"}>
              <Button
                className={clsx(classes.controlBtn)}
                onClick={checkoutNote}
              >
                <Restore></Restore>
              </Button>
            </Tooltip>
            <Tooltip title={"Delete file"}>
              <Button
                className={clsx(classes.controlBtn)}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Delete></Delete>
              </Button>
            </Tooltip>
            {is.desktop() && (
              <Tooltip title={"Print"}>
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
            <Tooltip title={"Fullscreen"}>
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
              <Tooltip title={"Upload (Push)"}>
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
              <Tooltip title={"Download (Pull)"}>
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
                  classes.menuItemTextField
                )}
              >
                <TextField
                  placeholder={"Add tag..."}
                  autoFocus={true}
                  value={tagName}
                  onChange={event => {
                    event.stopPropagation();
                    setTagName(event.target.value);
                  }}
                  onKeyUp={event => {
                    if (event.which === 13) {
                      addTag();
                    }
                  }}
                ></TextField>
              </ListItem>
              {tagNames.length > 0 ? (
                tagNames.map(tagName => {
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
                          width: "100%"
                        }}
                      >
                        <Typography>{tagName}</Typography>
                        <IconButton onClick={() => deleteTag(tagName)}>
                          <Close></Close>
                        </IconButton>
                      </Box>
                    </ListItem>
                  );
                })
              ) : (
                <ListItem className={clsx(classes.menuItemOverride)}>
                  <Typography style={{ margin: "8px 0" }}>
                    {"No tags"}
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
          fullScreenMode ? classes.fullScreen : null
        )}
      >
        <textarea
          className={clsx(classes.editor, "editor-textarea")}
          placeholder={t("editor/placeholder")}
          ref={(element: HTMLTextAreaElement) => {
            setTextAreaElement(element);
          }}
        ></textarea>
        {editorMode === EditorMode.Preview &&
        /*!editorContainer.pinPreviewOnTheSide &&*/
        editor ? (
          <div
            className={clsx(classes.preview, "preview")}
            id="preview"
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
              zIndex: 2001
            }}
            onClick={() => setFullScreenMode(false)}
          >
            <FullscreenExit></FullscreenExit>
          </IconButton>
        )}
      </Box>
      <Box className={clsx(classes.bottomPanel, "editor-bottom-panel")}>
        <Box className={clsx(classes.row)}>
          <Typography
            variant={"caption"}
            style={{ cursor: "pointer" }}
            onClick={() => {
              setFilePathDialogOpen(true);
            }}
          >
            {note.filePath}
          </Typography>
          <Typography variant={"caption"} style={{ marginLeft: "4px" }}>
            {"- " + gitStatus}
          </Typography>
        </Box>
        <Box className={clsx(classes.cursorPositionInfo)}>
          <Typography variant={"caption"}>
            {`Ln ${cursorPosition.line + 1}, Col ${cursorPosition.ch}`}
          </Typography>
        </Box>
      </Box>
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Are you sure to delete this file?</DialogTitle>
        <DialogContent>
          <DialogContentText>Can't be undone</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            style={{ color: "red" }}
            onClick={() => {
              crossnoteContainer.deleteNote(note);
              setDeleteDialogOpen(false);
            }}
          >
            Delete
          </Button>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={filePathDialogOpen} onClose={closeFilePathDialog}>
        <DialogTitle>Change file path</DialogTitle>
        <DialogContent>
          <TextField
            value={newFilePath}
            autoFocus={true}
            onChange={event => setNewFilePath(event.target.value)}
            onKeyUp={event => {
              if (event.which === 13) {
                changeFilePath(newFilePath);
              }
            }}
          ></TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => changeFilePath(newFilePath)}>Save</Button>
          <Button onClick={closeFilePathDialog}>Cancel</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={toggleEncryptionDialogOpen} onClose={closeEncryptionDialog}>
        <DialogTitle>
          {note.config.encryption
            ? "Disable the encryption"
            : "Encrypt this note with password"}
        </DialogTitle>
        <DialogContent>
          <TextField
            value={toggleEncryptionPassword}
            autoFocus={true}
            onChange={event => setToggleEncryptionPassword(event.target.value)}
            onKeyUp={event => {
              if (event.which === 13) {
                toggleEncryption();
              }
            }}
            placeholder={"password"}
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
            {note.config.encryption ? "Disable encryption" : "Encrypt"}
          </Button>
          <Button onClick={closeEncryptionDialog}>Cancel</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={decryptionDialogOpen} onClose={closeDecryptionDialog}>
        <DialogTitle>{"Decrypt this note"}</DialogTitle>
        <DialogContent>
          <TextField
            value={decryptionPassword}
            autoFocus={true}
            onChange={event => setDecryptionPassword(event.target.value)}
            placeholder={"password"}
            type={"password"}
            onKeyUp={event => {
              if (event.which === 13) {
                decryptNote();
              }
            }}
          ></TextField>
        </DialogContent>
        <DialogActions>
          <Button variant={"contained"} color={"primary"} onClick={decryptNote}>
            {"Decrypt"}
          </Button>
          <Button onClick={closeDecryptionDialog}>Cancel</Button>
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
      ></EditImageDialog>
    </Box>
  );
}
