import { Alert, Box, Button, Typography } from "@mui/material";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { isAppErrorKey } from "../i18n/i18n";
import { readNoteText } from "../lib/frontMatter";
import type { Notebook } from "../lib/notebook";
import { failureMessage } from "../lib/notifications";
import type { OpenNote } from "../lib/openNotes";

export function NoteConflictComparison({
  notebook,
  filePath,
  openNote,
  showEditor,
}: {
  notebook: Notebook;
  filePath: string;
  openNote: OpenNote;
  showEditor: () => void;
}) {
  const { t } = useTranslation();
  const { updateNoteMarkdown } = CrossnoteContainer.useContainer();
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compareOrSave() {
    setBusy(true);
    setError("");
    try {
      if (source === null) {
        setSource(await notebook.readConflictSource(filePath));
        showEditor();
      } else {
        await updateNoteMarkdown(
          { getId: () => openNote.saver.id },
          notebook.dir,
          filePath,
          openNote.document.text(),
          filePath,
          source,
        );
      }
    } catch (cause) {
      if (cause instanceof Error && isAppErrorKey(cause.message)) {
        if (
          cause.message === "error/note-comparison-changed" ||
          cause.message === "error/note-comparison-unavailable"
        )
          setSource(null);
        setError(t(cause.message));
      } else {
        setError(
          failureMessage(
            t(
              source === null
                ? "error/note-comparison-unavailable"
                : "error/failed-to-save-note",
            ),
            cause,
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ px: 1, py: 0.5 }} aria-label={t("editor/compare-disk")}>
      {source !== null && (
        <>
          <Typography variant="subtitle2">
            {t("editor/disk-version")}
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1,
              maxHeight: "22vh",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              bgcolor: "action.hover",
            }}
          >
            {readNoteText(source).text}
          </Box>
          <Typography variant="body2">
            {t("editor/compare-disk-help")}
          </Typography>
        </>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Button disabled={busy} onClick={compareOrSave}>
        {t(source === null ? "editor/compare-disk" : "editor/save-editor-text")}
      </Button>
      {source !== null && (
        <Button
          disabled={busy}
          onClick={() => {
            setSource(null);
            setError("");
          }}
        >
          {t("general/cancel")}
        </Button>
      )}
    </Box>
  );
}
