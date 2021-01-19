import {
  Box,
  Button,
  darken,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  useTheme,
} from "@material-ui/core";
import Noty from "noty";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudContainer } from "../containers/cloud";
import { usePublishNotebookMutation } from "../generated/graphql";

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
        text: t("error/failed-to-publish-notebook"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
    } else if (resPublishNotebook.data) {
      /*
      new Noty({
        type: "success",
        text: "Notebook is published",
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
      props.onClose();*/
      window.location.reload();
    }
  }, [resPublishNotebook]);

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>{t("general/publish-your-notebook")}</DialogTitle>
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
          {"* " + t("publish-notebook/disclaimer-1")}
        </Typography>
        <br></br>
        <Typography variant={"caption"}>
          {"* " + t("publish-notebook/disclaimer-2")}
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
  name: ${t("general/notebook-name") + ` (${t("general/optional")})`}
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
