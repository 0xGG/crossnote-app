import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  Button,
  Typography,
  Divider,
  Box,
} from "@material-ui/core";
import { useTranslation } from "react-i18next";
import { CloudContainer } from "../containers/cloud";

interface Props {
  open: boolean;
  onClose: () => void;
}
export default function PublishNotebookDialog(props: Props) {
  const { t } = useTranslation();
  const cloudContainer = CloudContainer.useContainer();
  const [gitURL, setGitURL] = useState<string>("");
  const [gitBranch, setGitBranch] = useState<string>("master");

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
            "* We currently only support publishing the notebook from a public repository on GitHub, GitLab, Gitea, or Gitea."
          }
        </Typography>
        <br></br>
        <Typography variant={"caption"}>
          {
            "* Please declare the ownership of your notebook by adding the following front-matter to README.md in remote repository."
          }
        </Typography>
        <pre>
          <code className="language-yaml">
            {`--- 
notebook: 
  owner: ${
    cloudContainer.viewer
      ? cloudContainer.viewer.username
      : t("general/Username")
  }
---
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
        <Button variant={"contained"} color={"primary"}>
          {t("general/Publish")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
