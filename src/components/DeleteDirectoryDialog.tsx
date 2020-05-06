import React from "react";
import { Note } from "../lib/crossnote";
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

interface Props {
  open: boolean;
  onClose: () => void;
  directory: string;
}

export function DeleteDirectoryDialog(props: Props) {
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("delete-directory-dialog/title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("delete-directory-dialog/subtitle")}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          style={{ color: "red" }}
          onClick={() => {
            crossnoteContainer.deleteDirectory(props.directory);
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
