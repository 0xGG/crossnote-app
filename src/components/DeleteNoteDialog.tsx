import React from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@material-ui/core";
import { Note } from "../lib/notebook";

interface Props {
  open: boolean;
  onClose: () => void;
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
            crossnoteContainer.deleteNote(note);
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
