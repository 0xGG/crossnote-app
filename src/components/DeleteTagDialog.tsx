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

interface Props {
  open: boolean;
  onClose: () => void;
  tag: string;
}

export function DeleteTagDialog(props: Props) {
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("delete-tag-dialog/title")}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("delete-tag-dialog/subtitle")}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          style={{ color: "red" }}
          onClick={() => {
            crossnoteContainer.deleteTag(props.tag);
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
