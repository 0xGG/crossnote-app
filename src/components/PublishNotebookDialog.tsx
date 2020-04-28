import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Button,
  Typography,
  Box,
  useTheme,
  darken,
} from "@material-ui/core";
import { useTranslation } from "react-i18next";
import { usePublishNotebookMutation } from "../generated/graphql";
import { CloudContainer } from "../containers/cloud";
import Noty from "noty";

interface Props {
  open: boolean;
  onClose: () => void;
}
export default function PublishNotebookDialog(props: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const cloudContainer = CloudContainer.useContainer();
  const [gitURL, setGitURL] = useState<string>("");
  const [gitBranch, setGitBranch] = useState<string>("master");
  const [
    resPublishNotebook,
    executePublishNotebookMutation,
  ] = usePublishNotebookMutation();

  useEffect(() => {
    if (resPublishNotebook.error) {
      new Noty({
        type: "error",
        text: "Failed to publish the notebook",
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
    } else if (resPublishNotebook.data) {
      new Noty({
        type: "success",
        text: "Notebook is published",
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
      props.onClose();
      window.location.reload();
    }
  }, [resPublishNotebook]);

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{"Publish your notebook"}</DialogTitle>
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
        <Box style={{ marginTop: "32px" }}></Box>
        <Typography variant={"caption"}>
          {
            "* We currently only support publishing the notebook from a public repository on GitHub, GitLab, Gitea, or Gitea. We only collect README.md file data."
          }
        </Typography>
        <br></br>
        <Typography variant={"caption"}>
          {
            "* Please declare the ownership of your notebook by adding the following front-matter to README.md in remote repository:"
          }
        </Typography>
        <pre
          style={{
            padding: theme.spacing(1),
            backgroundColor: darken(theme.palette.background.default, 0.01),
            color: theme.palette.text.primary,
          }}
        >
          <code className="language-markdown">
            {`--- 
notebook: 
  owner: ${
    cloudContainer.viewer
      ? cloudContainer.viewer.username
      : t("general/Username")
  }
---

# ${t("general/notebook-name")}
...
`}
          </code>
        </pre>

        {/*
        <Typography variant={"caption"}>
          {
            "* We reserve our rights to remove your notebook if it contains content that violates the local laws."
          }
        
        </Typography>
        */}
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"primary"}
          disabled={resPublishNotebook.fetching}
          onClick={() => {
            if (gitURL.trim().length > 0) {
              executePublishNotebookMutation({
                gitURL: gitURL.trim(),
                gitBranch: gitBranch.trim() || "master",
              });
            }
          }}
        >
          {t("general/Publish")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
