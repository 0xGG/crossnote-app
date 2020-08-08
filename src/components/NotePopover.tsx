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
} from "mdi-material-ui";
import { useTranslation } from "react-i18next";

const useStyles = makeStyles((theme: Theme) => createStyles({}));

interface Props {
  anchorElement: Element;
  onClose: () => void;
}

export default function NotePopover(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();

  return (
    <Popover
      anchorEl={props.anchorElement}
      keepMounted
      open={Boolean(props.anchorElement)}
      onClose={props.onClose}
    >
      <List>
        <ListItem button>
          <ListItemIcon>
            <PinOutline></PinOutline>
          </ListItemIcon>
          <ListItemText primary={t("general/pin-the-note")}></ListItemText>
        </ListItem>
        <ListItem button>
          <ListItemIcon>
            <StarOutline></StarOutline>
          </ListItemIcon>
          <ListItemText
            primary={t("general/add-to-quick-access")}
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
