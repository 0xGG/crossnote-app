import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import Noty from "noty";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { Notebook } from "../lib/notebook";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    textField: {
      marginBottom: theme.spacing(2),
    },
  }),
);

interface Props {
  open: boolean;
  onClose: () => void;
  notebook: Notebook;
}

export default function PushNotebookDialog(props: Props) {
  const classes = useStyles(props);
  const notebook = props.notebook;
  const [gitUsername, setGitUsername] = useState<string>(notebook.gitUsername);
  const [gitPassword, setGitPassword] = useState<string>(notebook.gitPassword);
  const [commitMessage, setCommitMessage] = useState<string>(
    "doc: Updated docs",
  );
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();

  const pushNotebook = useCallback(() => {
    crossnoteContainer
      .pushNotebook({
        notebook,
        authorName: settingsContainer.authorEmail,
        authorEmail: settingsContainer.authorEmail,
        username: gitUsername,
        password: gitPassword,
        message: commitMessage,
        onAuthFailure: () => {
          new Noty({
            type: "error",
            text: t("error/authentication-failed"),
            layout: "topRight",
            theme: "relax",
            timeout: 5000,
          }).show();
        },
      })
      .then(() => {
        props.onClose();
        new Noty({
          type: "success",
          text: t("success/notebook-uploaded"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
      })
      .catch((error: Error) => {
        console.log(error);
        props.onClose();
        new Noty({
          type: "error",
          text: error.message.match(/^error\//)
            ? t(error.message)
            : t("error/failed-to-upload-notebook"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
      });
  }, [
    settingsContainer.authorName,
    settingsContainer.authorEmail,
    gitUsername,
    gitPassword,
    notebook,
    commitMessage,
    props,
    t,
    crossnoteContainer.pushNotebook,
  ]);

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
        {`${t("general/upload-notebook")} "${notebook.name}"`}
        <Box>
          <Typography variant={"caption"}>
            {notebook.gitURL + ":" + notebook.gitBranch}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <TextField
          className={clsx(classes.textField)}
          label={t("settings/author-name")}
          fullWidth={true}
          value={settingsContainer.authorName}
          onChange={(event) =>
            settingsContainer.setAuthorName(event.target.value)
          }
        ></TextField>
        <TextField
          className={clsx(classes.textField)}
          label={t("settings/author-email")}
          fullWidth={true}
          value={settingsContainer.authorEmail}
          onChange={(event) =>
            settingsContainer.setAuthorEmail(event.target.value)
          }
        ></TextField>
        <TextField
          className={clsx(classes.textField)}
          label={t("general/commit-message")}
          fullWidth={true}
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
        ></TextField>
        <TextField
          className={clsx(classes.textField)}
          label={`${t("general/git-repository")} ${t("general/Username")} (${t(
            "general/optional",
          )})`}
          placeholder={`${t("general/git-repository")} ${t(
            "general/Username",
          )} (${t("general/optional")})`}
          fullWidth={true}
          value={gitUsername}
          onChange={(event) => setGitUsername(event.target.value)}
        ></TextField>
        <TextField
          className={clsx(classes.textField)}
          label={`${t("general/git-repository")} ${t("general/Password")} (${t(
            "general/optional",
          )})`}
          placeholder={`${t("general/git-repository")} ${t(
            "general/Password",
          )} (${t("general/optional")})`}
          type={"password"}
          fullWidth={true}
          value={gitPassword}
          onChange={(event) => setGitPassword(event.target.value)}
        ></TextField>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"primary"}
          disabled={crossnoteContainer.isPushingNotebook}
          onClick={pushNotebook}
        >
          {crossnoteContainer.isPushingNotebook
            ? t("general/Uploading")
            : t("general/Upload")}
        </Button>
        <Button onClick={props.onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
