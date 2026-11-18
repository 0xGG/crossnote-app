import i18next from "i18next";
import { isAppErrorKey } from "../i18n/i18n";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { Eye, EyeOff } from "mdi-material-ui";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { Notebook } from "../lib/notebook";
import { NotesNotSavedError } from "../lib/noteSaver";
import { NotebookConflictError } from "../lib/mergeFiles";
import { notify } from "../lib/notifications";

const SpacedTextField = styled(TextField)(({ theme }) => ({
  marginBottom: theme.spacing(2),
}));

interface Props {
  open: boolean;
  onClose: () => void;
  notebook: Notebook;
}

export default function PushNotebookDialog(props: Props) {
  const notebook = props.notebook;
  const [gitUsername, setGitUsername] = useState<string>(notebook.gitUsername);
  const [gitPassword, setGitPassword] = useState<string>(notebook.gitPassword);
  const [showUsername, setShowUsername] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [commitMessage, setCommitMessage] =
    useState<string>("doc: Updated docs");
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();

  const close = useCallback(() => {
    setShowUsername(false);
    setShowPassword(false);
    props.onClose();
  }, [props]);

  const pushNotebook = useCallback(() => {
    crossnoteContainer
      .pushNotebook({
        notebook,
        // Git makes no commit without an author name, and a cleared one
        // stands for the name the settings start with.
        authorName: settingsContainer.authorName || "Anonymous",
        authorEmail: settingsContainer.authorEmail,
        username: gitUsername,
        password: gitPassword,
        message: commitMessage,
        onAuthFailure: () => {
          notify({
            severity: "error",
            message: i18next.t("error/authentication-failed"),
            duration: 5000,
          });
        },
      })
      .then(() => {
        close();
        notify({
          severity: "success",
          message: i18next.t("success/notebook-uploaded"),
        });
      })
      .catch((error: Error) => {
        console.log(error);
        close();
        // Already said: which note could not be saved first.
        if (error instanceof NotesNotSavedError) {
          return;
        }
        notify({
          severity: "error",
          message:
            error instanceof NotebookConflictError
              ? i18next.t("error/notebook-sync-conflicts", {
                  files: error.describe((file, side) =>
                    i18next.t(`error/notebook-file-deleted-${side}`, { file }),
                  ),
                })
              : isAppErrorKey(error.message)
                ? i18next.t(error.message)
                : i18next.t("error/failed-to-upload-notebook"),
        });
      });
  }, [
    settingsContainer.authorName,
    settingsContainer.authorEmail,
    gitUsername,
    gitPassword,
    notebook,
    commitMessage,
    close,
    crossnoteContainer,
  ]);

  const [previousCredentials, setPreviousCredentials] = useState({
    username: notebook.gitUsername,
    password: notebook.gitPassword,
    open: props.open,
  });
  if (
    previousCredentials.username !== notebook.gitUsername ||
    previousCredentials.password !== notebook.gitPassword ||
    previousCredentials.open !== props.open
  ) {
    if (
      previousCredentials.username !== notebook.gitUsername ||
      previousCredentials.open !== props.open
    )
      setGitUsername(notebook.gitUsername);
    if (
      previousCredentials.password !== notebook.gitPassword ||
      previousCredentials.open !== props.open
    )
      setGitPassword(notebook.gitPassword);
    setPreviousCredentials({
      username: notebook.gitUsername,
      password: notebook.gitPassword,
      open: props.open,
    });
  }

  return (
    <Dialog
      open={props.open}
      onClose={() => {
        if (!crossnoteContainer.isPushingNotebook) {
          close();
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
        <SpacedTextField
          label={t("settings/author-name")}
          fullWidth={true}
          value={settingsContainer.authorName}
          onChange={(event) =>
            settingsContainer.setAuthorName(event.target.value)
          }
        ></SpacedTextField>
        <SpacedTextField
          label={t("settings/author-email")}
          fullWidth={true}
          value={settingsContainer.authorEmail}
          onChange={(event) =>
            settingsContainer.setAuthorEmail(event.target.value)
          }
        ></SpacedTextField>
        <SpacedTextField
          label={t("general/commit-message")}
          fullWidth={true}
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
        ></SpacedTextField>
        <SpacedTextField
          label={`${t("general/git-repository")} ${t("general/Username")} (${t(
            "general/optional",
          )})`}
          placeholder={`${t("general/git-repository")} ${t(
            "general/Username",
          )} (${t("general/optional")})`}
          type={showUsername ? "text" : "password"}
          fullWidth={true}
          value={gitUsername}
          onChange={(event) => setGitUsername(event.target.value)}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position={"end"}>
                  <IconButton
                    aria-label="toggle username visibility"
                    onClick={() => setShowUsername(!showUsername)}
                  >
                    {" "}
                    {showUsername ? <Eye></Eye> : <EyeOff></EyeOff>}{" "}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        ></SpacedTextField>
        <SpacedTextField
          label={`${t("general/git-repository")} ${t("general/Password")} (${t(
            "general/optional",
          )})`}
          placeholder={`${t("general/git-repository")} ${t(
            "general/Password",
          )} (${t("general/optional")})`}
          type={showPassword ? "text" : "password"}
          fullWidth={true}
          value={gitPassword}
          onChange={(event) => setGitPassword(event.target.value)}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position={"end"}>
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {" "}
                    {showPassword ? <Eye></Eye> : <EyeOff></EyeOff>}{" "}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        ></SpacedTextField>
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
        <Button onClick={close}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
