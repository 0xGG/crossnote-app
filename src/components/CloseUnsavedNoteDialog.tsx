import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import React from "react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  // Keeps the tab, and what its editor holds.
  onCancel: () => void;
  // Closes the tab, and what was not saved with it.
  onDiscard: () => void;
}

// Asked as a note's tab is closed while what its editor holds cannot be
// saved.
export function CloseUnsavedNoteDialog(props: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={props.open} onClose={props.onCancel}>
      <DialogTitle>{t("unsaved-note-dialog/title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("unsaved-note-dialog/subtitle")}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button style={{ color: "red" }} onClick={props.onDiscard}>
          {t("unsaved-note-dialog/close-anyway")}
        </Button>
        <Button onClick={props.onCancel}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
