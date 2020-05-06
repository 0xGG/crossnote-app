import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Button,
} from "@material-ui/core";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onClose: () => void;
  tag: string;
}
export function RenameTagDialog(props: Props) {
  const { t } = useTranslation();
  const [tag, setTag] = useState<string>("");

  useEffect(() => {
    setTag(props.tag);
  }, [props.tag, props.open]);

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("general/rename-tag")}</DialogTitle>
      <DialogContent>
        <TextField
          placeholder={props.tag}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          fullWidth={true}
        ></TextField>
      </DialogContent>
      <DialogActions>
        <Button variant={"contained"} color={"primary"}>
          {t("general/Update")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
