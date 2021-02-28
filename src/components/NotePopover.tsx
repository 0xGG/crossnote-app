import { renderPreview } from "@0xgg/echomd/preview";
import {
  Box,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from "@material-ui/core";
import {
  createStyles,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { TabNode } from "flexlayout-react";
import {
  ContentCopy,
  Delete,
  Pin,
  PinOutline,
  Printer,
  RenameBox,
  Restore,
  ShareVariant,
  Star,
  StarOutline,
  TooltipEdit,
} from "mdi-material-ui";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { Note } from "../lib/note";
import { setTheme } from "../themes/manager";
import { printPreview } from "../utilities/preview";
import { copyToClipboard } from "../utilities/utils";
import ChangeFilePathDialog from "./ChangeFilePathDialog";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { NoteAliasPopover } from "./NoteAliasPopover";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    secondaryColor: {
      color: theme.palette.secondary.main,
    },
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
  }),
);

interface Props {
  tabNode: TabNode;
  note: Note;
  anchorElement: Element;
  onClose: () => void;
}

export default function NotePopover(props: Props) {
  const classes = useStyles(props);
  const note = props.note;
  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState<boolean>(
    false,
  );
  const [
    changeNoteFilePathDialogOpen,
    setChangeNoteFilePathDialogOpen,
  ] = useState<boolean>(false);
  const [needsToPrint, setNeedsToPrint] = useState<boolean>(false);
  const [shareAnchorEl, setShareAnchorEl] = useState<HTMLElement>(null);
  const [noteAliasAnchorEl, setNoteAliasAnchorEl] = useState<HTMLElement>(null);
  const [aliases, setAliases] = useState<string[]>(note.config.aliases);
  const theme = useTheme();
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();
  const notebook = crossnoteContainer.getNotebookAtPath(note.notebookPath);
  const isLocal = notebook && notebook.isLocal;

  // Print preview
  useEffect(() => {
    if (!note || !needsToPrint) {
      return;
    }

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

    const currentTheme = settingsContainer.theme.name; // editor.getOption("theme") as ThemeName;
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
    crossnoteContainer
      .getNote(note.notebookPath, note.filePath)
      .then((note) => {
        const previewIsPresentation = !!note.markdown.match(/^<!--\s*slide/im);
        renderPreview(tempPreviewElement, note.markdown, previewIsPresentation)
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
      })
      .catch(() => {
        printDone();
      });
  }, [
    needsToPrint,
    note,
    settingsContainer.theme.name,
    t,
    theme.palette.background.default,
    theme.palette.text.primary,
  ]);

  return (
    <React.Fragment>
      <Popover
        anchorEl={props.anchorElement}
        keepMounted
        open={Boolean(props.anchorElement)}
        onClose={props.onClose}
      >
        <List>
          <ListItem
            button
            onClick={() => {
              crossnoteContainer.togglePin(
                props.tabNode,
                note.notebookPath,
                note.filePath,
              );
              props.onClose();
            }}
          >
            <ListItemIcon
              className={clsx(note.config.pinned && classes.secondaryColor)}
            >
              {note.config.pinned ? <Pin></Pin> : <PinOutline></PinOutline>}
            </ListItemIcon>
            <ListItemText
              primary={
                note.config.pinned
                  ? t("general/unpin-the-note")
                  : t("general/pin-the-note")
              }
            ></ListItemText>
          </ListItem>
          <ListItem
            button
            onClick={() => {
              crossnoteContainer.toggleFavorite(
                props.tabNode,
                note.notebookPath,
                note.filePath,
              );
              props.onClose();
            }}
          >
            <ListItemIcon
              className={clsx(note.config.favorited && classes.secondaryColor)}
            >
              {note.config.favorited ? (
                <Star></Star>
              ) : (
                <StarOutline></StarOutline>
              )}
            </ListItemIcon>
            <ListItemText
              primary={
                note.config.favorited
                  ? t("general/remove-from-quick-access")
                  : t("general/add-to-quick-access")
              }
            ></ListItemText>
          </ListItem>
          <ListItem></ListItem>
          <Divider></Divider>
          <ListItem
            button
            onClick={() => {
              setChangeNoteFilePathDialogOpen(true);
              props.onClose();
            }}
          >
            <ListItemIcon>
              <RenameBox></RenameBox>
            </ListItemIcon>
            <ListItemText
              primary={t("general/change-file-path")}
            ></ListItemText>
          </ListItem>
          <ListItem
            button
            onClick={(event) => setNoteAliasAnchorEl(event.currentTarget)}
          >
            <ListItemIcon>
              <TooltipEdit></TooltipEdit>
            </ListItemIcon>
            <ListItemText primary={t("general/edit-note-alias")}></ListItemText>
          </ListItem>
          <ListItem
            button
            onClick={() => {
              setDeleteNoteDialogOpen(true);
              props.onClose();
            }}
          >
            <ListItemIcon>
              <Delete></Delete>
            </ListItemIcon>
            <ListItemText primary={t("general/Delete")}></ListItemText>
          </ListItem>
          {!isLocal && (
            <ListItem
              button
              onClick={() => {
                crossnoteContainer.checkoutNote(note);
                props.onClose();
              }}
            >
              <ListItemIcon>
                <Restore></Restore>
              </ListItemIcon>
              <ListItemText
                primary={t("general/restore-checkout")}
              ></ListItemText>
            </ListItem>
          )}
          <Divider></Divider>
          {!isLocal && notebook && notebook.gitURL && (
            <ListItem
              button
              onClick={(event) => setShareAnchorEl(event.currentTarget)}
            >
              <ListItemIcon>
                <ShareVariant></ShareVariant>
              </ListItemIcon>
              <ListItemText primary={t("general/Share")}></ListItemText>
            </ListItem>
          )}
          <ListItem
            button
            onClick={() => {
              setNeedsToPrint(true);
              props.onClose();
            }}
          >
            <ListItemIcon>
              <Printer></Printer>
            </ListItemIcon>
            <ListItemText primary={t("general/Print")}></ListItemText>
          </ListItem>
        </List>
      </Popover>
      <DeleteNoteDialog
        open={deleteNoteDialogOpen}
        onClose={() => {
          setDeleteNoteDialogOpen(false);
        }}
        tabNode={props.tabNode}
        note={note}
      ></DeleteNoteDialog>
      <ChangeFilePathDialog
        open={changeNoteFilePathDialogOpen}
        onClose={() => {
          setChangeNoteFilePathDialogOpen(false);
        }}
        tabNode={props.tabNode}
        note={note}
      ></ChangeFilePathDialog>
      <NoteAliasPopover
        anchorElement={noteAliasAnchorEl}
        onClose={() => {
          setNoteAliasAnchorEl(null);
        }}
        addAlias={(alias) => {
          crossnoteContainer
            .addNoteAlias(
              props.tabNode,
              note.notebookPath,
              note.filePath,
              alias,
            )
            .then((aliases) => setAliases(aliases));
        }}
        deleteAlias={(alias) => {
          crossnoteContainer
            .deleteNoteAlias(
              props.tabNode,
              note.notebookPath,
              note.filePath,
              alias,
            )
            .then((aliases) => setAliases(aliases));
        }}
        aliases={aliases}
      ></NoteAliasPopover>
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
                  notebook.gitURL
                    ? `${window.location.origin}/?repo=${encodeURIComponent(
                        notebook.gitURL,
                      )}&branch=${encodeURIComponent(
                        notebook.gitBranch || "master",
                      )}&filePath=${encodeURIComponent(note.filePath)}`
                    : `${window.location.origin}/?notebookID=${
                        notebook._id
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
                notebook.gitURL
                  ? `${window.location.origin}${
                      window.location.origin.match(/0xgg\./i)
                        ? "/crossnote"
                        : "/"
                    }?repo=${encodeURIComponent(
                      notebook.gitURL,
                    )}&branch=${encodeURIComponent(
                      notebook.gitBranch || "master",
                    )}&filePath=${encodeURIComponent(note.filePath)}`
                  : `${window.location.origin}/?notebookID=${
                      notebook._id
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
    </React.Fragment>
  );
}
