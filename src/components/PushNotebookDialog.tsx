import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box
} from "@material-ui/core";
import { CrossnoteContainer } from "../containers/crossnote";
import { Notebook } from "../lib/crossnote";
import Noty from "noty";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onClose: () => void;
  notebook: Notebook;
}

export default function PushNotebookDialog(props: Props) {
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const notebook = props.notebook;
  const [authorName, setAuthorName] = useState<string>(
    localStorage.getItem("authorName") || "anonymous"
  );
  const [authorEmail, setAuthorEmail] = useState<string>(
    localStorage.getItem("authorEmail") || "anonymous@crossnote.app"
  );
  const [gitUsername, setGitUsername] = useState<string>(notebook.gitUsername);
  const [gitPassword, setGitPassword] = useState<string>(notebook.gitPassword);
  const [commitMessage, setCommitMessage] = useState<string>(
    "doc: Updated docs"
  );
  const { t } = useTranslation();

  const pushNotebook = useCallback(() => {
    crossnoteContainer
      .pushNotebook({
        notebook,
        authorName,
        authorEmail,
        username: gitUsername,
        password: gitPassword,
        message: commitMessage,
        onAuthFailure: () => {
          new Noty({
            type: "error",
            text: "Authentication failed",
            layout: "topRight",
            theme: "relax",
            timeout: 5000
          }).show();
        }
      })
      .then(() => {
        props.onClose();
        new Noty({
          type: "success",
          text: "Notebook pushed",
          layout: "topRight",
          theme: "relax",
          timeout: 2000
        }).show();
      })
      .catch((error: Error) => {
        props.onClose();
        new Noty({
          type: "error",
          text: error.message.match(/^error\//)
            ? t(error.message)
            : "Failed to push notebook",
          layout: "topRight",
          theme: "relax",
          timeout: 2000
        }).show();
      });
  }, [
    authorEmail,
    authorName,
    gitUsername,
    gitPassword,
    notebook,
    commitMessage,
    props
  ]);

  useEffect(() => {
    localStorage.setItem("authorName", authorName);
  }, [authorName]);

  useEffect(() => {
    localStorage.setItem("authorEmail", authorEmail);
  }, [authorEmail]);

  useEffect(() => {
    setGitUsername(notebook.gitUsername);
  }, [notebook.gitUsername, props.open]);

  useEffect(() => {
    setGitPassword(notebook.gitPassword);
  }, [notebook.gitPassword, props.open]);

  return (
    <Dialog
      open={props.open}
      onClose={() => {
        if (!crossnoteContainer.isPushingNotebook) {
          props.onClose();
        }
      }}
    >
      <DialogTitle>
        {`Push notebook ${notebook.name} to git repository`}
        <Box>
          <Typography variant={"caption"}>
            {notebook.gitURL + ":" + notebook.gitBranch}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <TextField
          label={"Author name"}
          fullWidth={true}
          value={authorName}
          onChange={event => setAuthorName(event.target.value)}
        ></TextField>
        <TextField
          label={"Author email"}
          fullWidth={true}
          value={authorEmail}
          onChange={event => setAuthorEmail(event.target.value)}
        ></TextField>
        <TextField
          label={"Commit message"}
          fullWidth={true}
          value={commitMessage}
          onChange={event => setCommitMessage(event.target.value)}
        ></TextField>
        <TextField
          label={"username"}
          placeholder={"username"}
          fullWidth={true}
          value={gitUsername}
          onChange={event => setGitUsername(event.target.value)}
        ></TextField>
        <TextField
          label={"password"}
          placeholder={"password"}
          type={"password"}
          fullWidth={true}
          value={gitPassword}
          onChange={event => setGitPassword(event.target.value)}
        ></TextField>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"primary"}
          disabled={crossnoteContainer.isPushingNotebook}
          onClick={pushNotebook}
        >
          {crossnoteContainer.isPushingNotebook ? "Pushing..." : "Push"}
        </Button>
        <Button onClick={props.onClose}>{"Cancel"}</Button>
      </DialogActions>
    </Dialog>
  );
}
