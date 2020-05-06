import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Button,
} from "@material-ui/core";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";

interface Props {
  open: boolean;
  onClose: () => void;
  tag: string;
}
export function RenameTagDialog(props: Props) {
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [tag, setTag] = useState<string>("");

  const renameTag = useCallback(() => {
    crossnoteContainer
      .renameTag(props.tag, tag)
      .then(() => {
        props.onClose();
      })
      .catch(() => {
        props.onClose();
      });
  }, [props, tag]);

  useEffect(() => {
    setTag(props.tag);
  }, [props.tag, props.open]);

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("general/rename-tag")}</DialogTitle>
      <DialogContent>
        <TextField
          placeholder={t("general/Tag")}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          fullWidth={true}
          onKeyUp={(event) => {
            if (event.which === 13) {
              renameTag();
            }
          }}
          autoFocus={true}
        ></TextField>
      </DialogContent>
      <DialogActions>
        <Button variant={"contained"} color={"primary"} onClick={renameTag}>
          {t("general/Update")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
