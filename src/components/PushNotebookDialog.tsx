import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import i18next from "../i18n/i18n";
import { GitUploadError } from "../lib/crossnote";
import { gitErrorMessage, notifyGit, redactGitText } from "../lib/gitResults";
import { needsGitSettings } from "../lib/gitConnection";
import { Notebook } from "../lib/notebook";
import { NotesNotSavedError } from "../lib/noteSaver";
import { IgnoredUploadFileError } from "../lib/notebookOperation";
import { NotebookConflictError } from "../lib/mergeFiles";
import { RecoveryDirectoryCollisionError } from "../lib/recoveryDirectory";

const SpacedTextField = styled(TextField)(({ theme }) => ({
  marginBottom: theme.spacing(2),
}));

const resultMessage = {
  "uploaded": "success/notebook-uploaded",
  "uploaded-and-downloaded": "git/uploaded-and-downloaded",
  "confirmed": "git/upload-confirmed",
  "confirmed-and-downloaded": "git/confirmed-and-downloaded",
  "downloaded": "git/downloaded-no-upload",
  "up-to-date": "git/upload-unchanged",
} as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  notebook: Notebook;
}

export default function PushNotebookDialog({
  open,
  onClose,
  onOpenSettings,
  notebook,
}: Props) {
  const [commitMessage, setCommitMessage] = useState("doc: Updated docs");
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();

  async function pushNotebook() {
    try {
      const completed = await crossnoteContainer.pushNotebook({
        notebook,
        // Git needs an author name even when the user clears this setting.
        authorName: settingsContainer.authorName || "Anonymous",
        authorEmail: settingsContainer.authorEmail,
        message: commitMessage,
      });
      onClose();
      if (completed) {
        notifyGit("success", i18next.t(resultMessage[completed.result]), {
          updateFailure: completed.updateFailure,
          credentials: notebook,
        });
      }
    } catch (error) {
      onClose();
      if (error instanceof RecoveryDirectoryCollisionError) {
        crossnoteContainer.setRecoveryCollision({
          notebook,
          directory: error.directory,
          canRelease: error.canRelease,
        });
        return;
      }
      // The note save already reported which edit could not be written.
      if (error instanceof NotesNotSavedError) return;

      const cause = error instanceof GitUploadError ? error.cause : error;
      let message = gitErrorMessage(
        cause,
        t("error/failed-to-upload-notebook"),
      );
      let files: string | undefined;
      let updateFailure: { error: unknown } | undefined;
      if (error instanceof NotebookConflictError) {
        files = error.describe((file, side) =>
          t(`error/notebook-file-deleted-${side}`, { file }),
        );
        message = t("error/notebook-sync-conflicts", {
          files: redactGitText(files, notebook),
        });
      } else if (error instanceof IgnoredUploadFileError) {
        files = error.filepath;
        message = t("error/notebook-file-ignored", {
          file: redactGitText(files, notebook),
        });
      } else if (error instanceof GitUploadError) {
        if (error.phase === "download") {
          message = t("git/upload-download-failed");
        } else if (error.phase === "prepare") {
          message = t("git/upload-prepare-failed");
        } else if (error.phase === "finish") {
          message = i18next.t(
            resultMessage[
              error.downloaded ? "uploaded-and-downloaded" : "uploaded"
            ],
          );
          updateFailure = { error: cause };
        } else if (error.downloaded) {
          message = t("git/upload-push-failed-after-download");
        }
      }
      notifyGit("error", message, {
        error: cause,
        credentials: notebook,
        files,
        updateFailure,
        openSettings:
          !updateFailure && needsGitSettings(cause)
            ? onOpenSettings
            : undefined,
      });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!crossnoteContainer.isPushingNotebook) onClose();
      }}
    >
      <DialogTitle>
        {`${t("general/upload-notebook")} "${notebook.name}"`}
        <Box>
          <Typography variant="caption">
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
        />
        <SpacedTextField
          label={t("settings/author-email")}
          fullWidth={true}
          value={settingsContainer.authorEmail}
          onChange={(event) =>
            settingsContainer.setAuthorEmail(event.target.value)
          }
        />
        <SpacedTextField
          label={t("general/commit-message")}
          fullWidth={true}
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          color="primary"
          disabled={crossnoteContainer.isPushingNotebook}
          onClick={pushNotebook}
        >
          {crossnoteContainer.isPushingNotebook
            ? t("general/Uploading")
            : t("general/Upload")}
        </Button>
        <Button onClick={onClose}>{t("general/cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
