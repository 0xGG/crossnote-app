import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { TabNode } from "flexlayout-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/note";
import { failureMessage, notify } from "../lib/notifications";

interface Props {
  open: boolean;
  onClose: () => void;
  tabNode: TabNode;
  note: Note;
}

export function DeleteNoteDialog(props: Props) {
  const { t } = useTranslation();
  const isMounted = useRef<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const note = props.note;
  const crossnoteContainer = CrossnoteContainer.useContainer();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

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
          disabled={deleting}
          onClick={async () => {
            // Closed once the note is gone; a note that could not be deleted
            // leaves the dialog open, saying so.
            setDeleting(true);
            try {
              await crossnoteContainer.deleteNote(
                props.tabNode,
                note.notebookPath,
                note.filePath,
              );
              if (isMounted.current) {
                props.onClose();
              }
            } catch (error) {
              notify({
                severity: "error",
                message: failureMessage(
                  t("error/failed-to-delete-note"),
                  error,
                ),
                duration: 5000,
              });
            } finally {
              if (isMounted.current) {
                setDeleting(false);
              }
            }
          }}
        >
          {t("general/Delete")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
