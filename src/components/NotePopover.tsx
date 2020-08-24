import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  fade,
  createStyles,
  makeStyles,
  Theme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import {
  Popover,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from "@material-ui/core";
import {
  PinOutline,
  StarOutline,
  RenameBox,
  Delete,
  ContentDuplicate,
  Restore,
  ShareVariant,
  Printer,
  Pin,
  Star,
} from "mdi-material-ui";
import { useTranslation } from "react-i18next";
import { Note } from "../lib/notebook";
import { TabNode } from "flexlayout-react";
import { CrossnoteContainer } from "../containers/crossnote";

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
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();

  return (
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
        <ListItem button>
          <ListItemIcon>
            <RenameBox></RenameBox>
          </ListItemIcon>
          <ListItemText primary={t("general/change-file-path")}></ListItemText>
        </ListItem>
        <ListItem button>
          <ListItemIcon>
            <Delete></Delete>
          </ListItemIcon>
          <ListItemText primary={t("general/Delete")}></ListItemText>
        </ListItem>
        <ListItem button>
          <ListItemIcon>
            <ContentDuplicate></ContentDuplicate>
          </ListItemIcon>
          <ListItemText primary={t("general/create-a-copy")}></ListItemText>
        </ListItem>
        <ListItem button>
          <ListItemIcon>
            <Restore></Restore>
          </ListItemIcon>
          <ListItemText primary={t("general/restore-checkout")}></ListItemText>
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
  );
}
