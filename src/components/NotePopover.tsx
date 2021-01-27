import {
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Popover,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { TabNode } from "flexlayout-react";
import {
  Delete,
  Pin,
  PinOutline,
  Printer,
  RenameBox,
  Restore,
  ShareVariant,
  Star,
  StarOutline,
} from "mdi-material-ui";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/notebook";
import ChangeFilePathDialog from "./ChangeFilePathDialog";
import { DeleteNoteDialog } from "./DeleteNoteDialog";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    secondaryColor: {
      color: theme.palette.secondary.main,
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
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();

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
          {/*
          <ListItem button>
            <ListItemIcon>
              <ContentDuplicate></ContentDuplicate>
            </ListItemIcon>
            <ListItemText primary={t("general/create-a-copy")}></ListItemText>
          </ListItem>
          */}
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
          <Divider></Divider>
          <ListItem button>
            <ListItemIcon>
              <ShareVariant></ShareVariant>
            </ListItemIcon>
            <ListItemText primary={t("general/Share")}></ListItemText>
          </ListItem>
          <ListItem button>
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
    </React.Fragment>
  );
}
