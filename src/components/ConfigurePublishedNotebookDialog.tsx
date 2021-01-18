import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@material-ui/core";
import Noty from "noty";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NotebookFieldsFragment,
  useUnpublishNotebookMutation,
  useUpdateNotebookMutation,
} from "../generated/graphql";

interface Props {
  notebook: NotebookFieldsFragment;
  open: boolean;
  onClose: () => void;
}

const MaxClickDeleteCount = 3;
export default function ConfigurePublishedNotebookDialog(props: Props) {
  const notebook = props.notebook;
  const { t } = useTranslation();
  const [gitURL, setGitURL] = useState<string>("");
  const [gitBranch, setGitBranch] = useState<string>("");
  const [
    resUpdateNotebook,
    executeUpdateNotebookMutation,
  ] = useUpdateNotebookMutation();
  const [
    resUnpublishNotebook,
    executeUnpublishNotebookMutation,
  ] = useUnpublishNotebookMutation();
  const [clickDeleteCount, setClickDeleteCount] = useState<number>(
    MaxClickDeleteCount,
  );

  const updateNotebook = useCallback(() => {
    executeUpdateNotebookMutation({
      notebookID: notebook.id,
      gitURL: gitURL,
      gitBranch: gitBranch,
    });
  }, [notebook, gitURL, gitBranch, executeUpdateNotebookMutation]);

  const unpublishNotebook = useCallback(() => {
    executeUnpublishNotebookMutation({
      notebookID: notebook.id,
    });
  }, [notebook, executeUnpublishNotebookMutation]);

  useEffect(() => {
    setClickDeleteCount(MaxClickDeleteCount);
  }, [props.open]);

  useEffect(() => {
    setGitURL(notebook.gitURL);
    setGitBranch(notebook.gitBranch);
  }, [props.open, notebook, notebook.gitURL, notebook.gitBranch]);

  useEffect(() => {
    if (resUpdateNotebook.error) {
      new Noty({
        type: "error",
        text: t("error/failed-to-update-the-notebook"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
      setClickDeleteCount(MaxClickDeleteCount);
    } else if (resUpdateNotebook.data) {
      window.location.reload();
    }
  }, [resUpdateNotebook]);

  useEffect(() => {
    if (resUnpublishNotebook.error) {
      new Noty({
        type: "error",
        text: t("error/failed-to-unpublish-the-notebook"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
      setClickDeleteCount(MaxClickDeleteCount);
    } else if (resUnpublishNotebook.data) {
      window.location.reload();
    }
  }, [resUnpublishNotebook]);

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("general/configure-the-notebook")}</DialogTitle>
      <DialogContent>
        <TextField
          label={t("general/url")}
          placeholder={"https://github.com/0xGG/welcome-notebook.git"}
          fullWidth={true}
          value={gitURL}
          onChange={(event) => setGitURL(event.target.value)}
        ></TextField>
        <TextField
          label={t("general/branch")}
          placeholder={"master"}
          fullWidth={true}
          value={gitBranch}
          onChange={(event) => setGitBranch(event.target.value)}
        ></TextField>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"primary"}
          onClick={updateNotebook}
          disabled={resUnpublishNotebook.fetching || resUpdateNotebook.fetching}
        >
          {t("general/Update")}
        </Button>
        <Button
          variant={"contained"}
          color={"secondary"}
          onClick={() => {
            if (clickDeleteCount === 1) {
              unpublishNotebook();
              setClickDeleteCount(clickDeleteCount - 1);
            } else {
              setClickDeleteCount(clickDeleteCount - 1);
            }
          }}
          disabled={resUnpublishNotebook.fetching || resUpdateNotebook.fetching}
        >
          {t("general/Unpublish") +
            (clickDeleteCount < MaxClickDeleteCount
              ? ` ${clickDeleteCount}`
              : "")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
