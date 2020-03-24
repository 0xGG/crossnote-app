import React, { useState, useCallback } from "react";
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
import Noty from "noty";

interface Props {
  open: boolean;
  onClose: () => void;
  canCancel: boolean;
}

export default function AddNotebookDialog(props: Props) {
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
  const [rememberCredentialsChecked, setRememberCredentialsChecked] = useState<
    boolean
  >(false);

  const addNotebook = useCallback(async () => {
    try {
      new Noty({
        type: "info",
        text: "Getting notebook...",
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
      await crossnoteContainer.addNotebook(
        notebookName,
        gitURL,
        gitBranch,
        gitUsername,
        gitPassword,
        rememberCredentialsChecked,
        gitCorsProxy
      );
      props.onClose();
    } catch (error) {
      new Noty({
        type: "error",
        text: "Failed to get notebook...",
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
      props.onClose();
    }
  }, [
    props,
    notebookName,
    gitURL,
    gitBranch,
    gitUsername,
    gitPassword,
    rememberCredentialsChecked,
    gitCorsProxy
  ]);

  return (
    <Dialog
      open={props.open}
      onClose={() => {
        if (!crossnoteContainer.isAddingNotebook) {
          props.onClose();
        }
      }}
    >
      <DialogTitle>Add a notebook</DialogTitle>
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
                fullWidth={true}
                value={gitURL}
                onChange={event => setGitURL(event.target.value)}
              ></TextField>
              <TextField
                label={"branch"}
                placeholder={"master"}
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
              <FormControlLabel
                control={
                  <Checkbox
                    checked={rememberCredentialsChecked}
                    onChange={() =>
                      setRememberCredentialsChecked(!rememberCredentialsChecked)
                    }
                    value={rememberCredentialsChecked}
                  />
                }
                label={
                  <Typography>
                    {"Remember credentials" +
                      " " +
                      (rememberCredentialsChecked ? "(stored locally)" : "")}
                  </Typography>
                }
              />
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
          color={"primary"}
          onClick={addNotebook}
          disabled={crossnoteContainer.isAddingNotebook}
        >
          {crossnoteContainer.isAddingNotebook ? "Adding..." : "Add"}
        </Button>
        {props.canCancel && <Button onClick={props.onClose}>{"Cancel"}</Button>}
      </DialogActions>
    </Dialog>
  );
}
