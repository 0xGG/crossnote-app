import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { isAppErrorKey } from "../i18n/i18n";
import { tabsInNotebook } from "../lib/layout";
import type { Notebook } from "../lib/notebook";
import { flushNotes, hasNoteWriterInDirectory } from "../lib/noteSaver";
import { failureMessage, notify } from "../lib/notifications";

interface Props {
  notebook: Notebook;
  directory: string;
  onClose: () => void;
}

export function RecoveryDirectoryDialog({
  notebook,
  directory,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { crossnote, layoutModel } = CrossnoteContainer.useContainer();
  const [archive, setArchive] = useState<{
    files: Map<string, Uint8Array>;
    url: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (archive) URL.revokeObjectURL(archive.url);
    },
    [archive],
  );

  function report(cause: unknown) {
    setError(
      cause instanceof Error && isAppErrorKey(cause.message)
        ? t(cause.message)
        : failureMessage(t("error/recovery-files"), cause),
    );
  }

  async function download() {
    setBusy(true);
    setError("");
    setArchive(null);
    try {
      await flushNotes({ notebookPath: notebook.dir });
      const files = await crossnote.readRecoveryFiles(notebook, directory);
      const { zipSync } = await import("fflate");
      const entries = Object.fromEntries(
        Array.from(files, ([name, bytes]) => [directory + "/" + name, bytes]),
      );
      const bytes = zipSync(entries, { level: 0 });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
      );
      link.download = directory.slice(1) + ".zip";
      setArchive({ files, url: link.href });
      link.click();
    } catch (cause) {
      report(cause);
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!archive) return;
    setBusy(true);
    setError("");
    try {
      await crossnote.releaseRecoveryFiles(
        notebook,
        directory,
        archive.files,
        () =>
          !tabsInNotebook(layoutModel, notebook.dir).some((tab) =>
            tab.getConfig().noteFilePath?.startsWith(directory + "/"),
          ) && !hasNoteWriterInDirectory(notebook.dir, directory),
      );
      notify({ severity: "success", message: t("recovery/retry") });
      onClose();
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message === "error/recovery-files-changed"
      )
        setArchive(null);
      report(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      aria-labelledby="recovery-directory-title"
    >
      <DialogTitle id="recovery-directory-title">
        {t("recovery/title")}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("recovery/instructions", { directory, notebook: notebook.name })}
        </DialogContentText>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("general/close")}
        </Button>
        <Button onClick={download} disabled={busy}>
          {t("recovery/download")}
        </Button>
        <Button onClick={release} disabled={busy || !archive}>
          {t("recovery/confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
