import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Box,
  Typography,
  DialogActions,
  Button,
  Link,
  FormControlLabel,
  Checkbox,
  ExpansionPanel,
  ExpansionPanelDetails,
  ExpansionPanelSummary
} from "@material-ui/core";
import { ChevronDown } from "mdi-material-ui";
import { CrossnoteContainer } from "../containers/crossnote";
import { Notebook } from "../lib/crossnote";

interface Props {
  open: boolean;
  onClose: () => void;
  notebook: Notebook;
}

const MaxClickDeleteCount = 3;
export default function ConfigureNotebookDialog(props: Props) {
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [notebookName, setNotebookName] = useState<string>("");
  const [expanded, setExpanded] = useState<boolean>(false);
  const [gitURL, setGitURL] = useState<string>("");
  const [gitBranch, setGitBranch] = useState<string>("");
  const [gitUsername, setGitUsername] = useState<string>("");
  const [gitPassword, setGitPassword] = useState<string>("");
  const [gitCorsProxy, setGitCorsProxy] = useState<string>(
    "https://cors.isomorphic-git.org"
  );
  const [clickDeleteCount, setClickDeleteCount] = useState<number>(
    MaxClickDeleteCount
  );

  useEffect(() => {
    const notebook = props.notebook;
    if (!notebook) {
      return;
    }
    setNotebookName(notebook.name);
    setGitURL(notebook.gitURL);
    setGitBranch(notebook.gitBranch || "master");
    setGitUsername(notebook.gitUsername);
    setGitPassword(notebook.gitPassword);
    setGitCorsProxy(notebook.gitCorsProxy);
  }, [props.notebook]);

  const updateNotebook = useCallback(async () => {
    const notebook = props.notebook;
    if (!notebook) {
      props.onClose();
      return;
    }
    notebook.name = notebookName.trim();
    notebook.gitURL = gitURL.trim();
    notebook.gitBranch = gitBranch.trim();
    notebook.gitUsername = gitUsername.trim();
    notebook.gitPassword = gitPassword;
    notebook.gitCorsProxy = gitCorsProxy.trim();
    try {
      await crossnoteContainer.updateNotebook(notebook);
    } catch (error) {}
    props.onClose();
  }, [
    props,
    props.notebook,
    notebookName,
    gitURL,
    gitBranch,
    gitUsername,
    gitPassword,
    gitCorsProxy
  ]);

  const deleteNotebook = useCallback(async () => {
    const notebook = props.notebook;
    try {
      await crossnoteContainer.deleteNotebook(notebook);
    } catch (error) {}
    props.onClose();
  }, [props.notebook]);

  useEffect(() => {
    setClickDeleteCount(MaxClickDeleteCount);
  }, [props.notebook]);

  return (
    <Dialog
      open={props.open}
      onClose={!clickDeleteCount ? null : props.onClose}
    >
      <DialogTitle>Configure a notebook</DialogTitle>
      <DialogContent>
        <TextField
          label={"Notebook name"}
          value={notebookName}
          fullWidth={true}
          onChange={event => {
            setNotebookName(event.target.value);
          }}
          style={{ marginBottom: "16px" }}
        ></TextField>
        <ExpansionPanel
          elevation={2}
          expanded={expanded}
          onChange={() => setExpanded(!expanded)}
        >
          <ExpansionPanelSummary expandIcon={<ChevronDown></ChevronDown>}>
            <Typography>{"Git repository (optional)"}</Typography>
          </ExpansionPanelSummary>
          <ExpansionPanelDetails>
            <Box>
              <TextField
                label={"url"}
                placeholder={"https://abc/def.git"}
                disabled={true}
                fullWidth={true}
                value={gitURL}
                onChange={event => setGitURL(event.target.value)}
              ></TextField>
              <TextField
                label={"branch"}
                placeholder={"master"}
                disabled={true}
                fullWidth={true}
                value={gitBranch}
                onChange={event => setGitBranch(event.target.value)}
              ></TextField>
              <TextField
                label={"username (optional)"}
                placeholder={"username (optional)"}
                fullWidth={true}
                value={gitUsername}
                onChange={event => setGitUsername(event.target.value)}
              ></TextField>
              <TextField
                label={"password (optional)"}
                placeholder={"password (optional)"}
                type={"password"}
                fullWidth={true}
                value={gitPassword}
                onChange={event => setGitPassword(event.target.value)}
              ></TextField>
              <TextField
                label={"cors proxy"}
                placeholder={"https://cors.isomorphic-git.org"}
                fullWidth={true}
                value={gitCorsProxy}
                onChange={event => setGitCorsProxy(event.target.value)}
              ></TextField>
              <Link
                href={
                  "https://github.com/isomorphic-git/isomorphic-git#cors-support"
                }
                target={"_blank"}
              >
                Why we need cors proxy?
              </Link>
            </Box>
          </ExpansionPanelDetails>
        </ExpansionPanel>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"secondary"}
          disabled={!clickDeleteCount}
          onClick={() => {
            if (clickDeleteCount === 1) {
              deleteNotebook();
              setClickDeleteCount(clickDeleteCount - 1);
            } else {
              setClickDeleteCount(clickDeleteCount - 1);
            }
          }}
        >
          {"Delete" +
            (clickDeleteCount < MaxClickDeleteCount
              ? ` ${clickDeleteCount}`
              : "")}
        </Button>
        <Button
          variant={"contained"}
          color={"primary"}
          onClick={updateNotebook}
          disabled={!clickDeleteCount}
        >
          {"Save"}
        </Button>
        <Button onClick={props.onClose} disabled={!clickDeleteCount}>
          {"Cancel"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
