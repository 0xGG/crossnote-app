import React, { useState, useCallback, useEffect } from "react";
import * as path from "path";
import {
  createStyles,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer, EditorMode } from "../containers/crossnote";
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
  InputBase,
  Divider,
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
import { ThemeName } from "vickymd/theme";
import PushNotebookDialog from "./PushNotebookDialog";
import EditImageDialog from "./EditImageDialog";
import Noty from "noty";
import { formatDistance } from "date-fns";
import { getHeaderFromMarkdown } from "../utilities/note";
import {
  printPreview,
  postprocessPreview as previewPostprocessPreview,
  openURL,
} from "../utilities/preview";
import ChangeFilePathDialog from "./ChangeFilePathDialog";
import { SettingsContainer } from "../containers/settings";
import { initMathPreview } from "../editor/views/math-preview";
import EmojiDefinitions from "vickymd/addon/emoji";
import { TagStopRegExp, sanitizeTag } from "../utilities/markdown";
import { resolveNoteImageSrc } from "../utilities/image";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { copyToClipboard } from "../utilities/utils";
import { setTheme } from "../themes/manager";
import { Note } from "../lib/notebook";

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
      flexDirection: "row",
      borderRadius: 0,
    },
    editorLeftPanel: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      width: "calc(100% - 40px)",
    },
    editorRightPanel: {
      display: "flex",
      flexDirection: "column",
      padding: "4px 0",
      backgroundColor: "inherit",
      width: "40px",
    },
    topPanel: {
      position: "relative",
      padding: theme.spacing(0.5, 1), // theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      // borderBottom: "1px solid #eee",
      overflow: "auto",
      backgroundColor: "inherit",
      [theme.breakpoints.down("sm")]: {
        padding: "0",
      },
    },
    bottomPanel: {
      position: "relative",
      padding: theme.spacing(0.5, 1),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "inherit",
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
      backgroundColor: "inherit",
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
  return <Box></Box>;
}
