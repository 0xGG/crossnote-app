import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentError } from "../lib/attachments";
import type { Notebook } from "../lib/notebook";
import { exportNotebookZip, NotebookBackupError } from "../lib/notebookBackup";
import { NotesNotSavedError } from "../lib/noteSaver";
import { failureMessage } from "../lib/notifications";

type Archive = Awaited<ReturnType<typeof exportNotebookZip>>;
type State =
  | { phase: "idle" | "working" }
  | { phase: "failed"; message: string }
  | { phase: "ready"; archive: Archive };

export function ExportNotebookDialog({
  notebook,
  onClose,
}: {
  notebook: Notebook;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ phase: "idle" });
  const busy = state.phase === "working";

  function download(archive: Archive) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(archive.blob);
    link.href = url;
    link.download = archive.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onClose();
  }

  function errorMessage(error: unknown) {
    if (error instanceof NotesNotSavedError) {
      const message = t("error/notes-not-saved", {
        notes: error.locations.map(({ filePath }) => filePath).join(", "),
      });
      const first = error.errors[0];
      return first instanceof AttachmentError
        ? `${message} ${t(`attachment/${first.reason}`)}`
        : failureMessage(message, first);
    }
    if (error instanceof NotebookBackupError) {
      return failureMessage(
        t(error.key, { file: error.filePath }),
        error.cause,
      );
    }
    return failureMessage(t("backup/failed"), error);
  }

  async function start() {
    setState({ phase: "working" });
    try {
      const archive = await exportNotebookZip(notebook);
      if (archive.windowsPaths.length) setState({ phase: "ready", archive });
      else download(archive);
    } catch (error) {
      setState({ phase: "failed", message: errorMessage(error) });
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      aria-labelledby="notebook-export-title"
      aria-describedby="notebook-export-description"
    >
      <DialogTitle id="notebook-export-title">
        {t("backup/title", { notebook: notebook.name })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="notebook-export-description">
          {t("backup/private-files")}
        </DialogContentText>
        {notebook.isLocal && (
          <DialogContentText sx={{ mt: 1 }}>
            {t("backup/disk-links")}
          </DialogContentText>
        )}
        {busy && (
          <DialogContentText role="status" sx={{ mt: 1 }}>
            {t("backup/preparing")}
          </DialogContentText>
        )}
        {state.phase === "failed" && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {state.message}
          </Alert>
        )}
        {state.phase === "ready" && (
          <Alert severity="warning" sx={{ mt: 2, overflowWrap: "anywhere" }}>
            {t("backup/windows-paths")}
            <Box component="ul" sx={{ my: 0 }}>
              {state.archive.windowsPaths.map((file) => (
                <li key={file}>
                  <Box component="code" sx={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(file)}
                  </Box>
                </li>
              ))}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("general/cancel")}
        </Button>
        {state.phase === "ready" ? (
          <Button onClick={() => download(state.archive)}>
            {t("backup/download")}
          </Button>
        ) : (
          <Button onClick={start} disabled={busy}>
            {t(state.phase === "failed" ? "layout/retry" : "backup/export")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
