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
  directory: string;
}
export function RenameDirectoryDialog(props: Props) {
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [directory, setDirectory] = useState<string>("");

  const renameDirectory = useCallback(() => {
    crossnoteContainer
      .renameDirectory(props.directory, directory)
      .then(() => {
        props.onClose();
      })
      .catch(() => {
        props.onClose();
      });
  }, [props, directory]);

  useEffect(() => {
    setDirectory(props.directory);
  }, [props.directory, props.open]);

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("general/rename-directory")}</DialogTitle>
      <DialogContent>
        <TextField
          placeholder={t("general/Directory")}
          value={directory}
          onChange={(event) => setDirectory(event.target.value)}
          fullWidth={true}
          onKeyUp={(event) => {
            if (event.which === 13) {
              renameDirectory();
            }
          }}
        ></TextField>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"primary"}
          onClick={renameDirectory}
        >
          {t("general/Update")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
