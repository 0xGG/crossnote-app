import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@material-ui/core";
import { TabNode } from "flexlayout-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/note";

interface Props {
  open: boolean;
  onClose: () => void;
  tabNode: TabNode;
  note: Note;
}

export function DeleteNoteDialog(props: Props) {
  const { t } = useTranslation();
  const note = props.note;
  const crossnoteContainer = CrossnoteContainer.useContainer();

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("delete-note-dialog/title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("delete-note-dialog/subtitle")}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          style={{ color: "red" }}
          onClick={() => {
            crossnoteContainer.deleteNote(
              props.tabNode,
              note.notebookPath,
              note.filePath,
            );
            props.onClose();
          }}
        >
          {t("general/Delete")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
