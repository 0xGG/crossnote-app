import React, { useState, useEffect, useCallback } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Box, Typography, Button } from "@material-ui/core";
import NoteCard from "./NoteCard";
import { useTranslation } from "react-i18next";
import { Note } from "../lib/crossnote";
import useInterval from "@use-it/interval";
import { CloudDownloadOutline } from "mdi-material-ui";
import Noty from "noty";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notesList: {
      position: "relative",
      flex: "1",
      overflowY: "auto",
      paddingBottom: theme.spacing(12)
    },
    updatePanel: {
      padding: theme.spacing(2),
      textAlign: "center",
      borderBottom: "1px solid #ededed"
    }
  })
);

interface Props {
  searchValue: string;
}

export default function Notes(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesListElement, setNotesListElement] = useState<HTMLElement>(null);
  const [forceUpdate, setForceUpdate] = useState<number>(Date.now());
  const searchValue = props.searchValue;

  const pullNotebook = useCallback(() => {
    const notebook = crossnoteContainer.selectedNotebook;
    if (!notebook) {
      return;
    }
    crossnoteContainer
      .pullNotebook({
        notebook: notebook,
        onAuthFailure: () => {
          new Noty({
            type: "error",
            text: t("error/authentication-failed"),
            layout: "topRight",
            theme: "relax",
            timeout: 5000
          }).show();
        }
      })
      .then(() => {
        new Noty({
          type: "success",
          text: t("success/notebook-downloaded"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000
        }).show();
      })
      .catch(error => {
        console.log(error);
        new Noty({
          type: "error",
          text: t("error/failed-to-download-notebook"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000
        }).show();
      });
  }, [crossnoteContainer.selectedNotebook, t]);

  useEffect(() => {
    const pinned: Note[] = [];
    const unpinned: Note[] = [];
    crossnoteContainer.notes.forEach(note => {
      if (searchValue.trim().length) {
        const regexp = new RegExp(
          "(" +
            searchValue
              .trim()
              .split(/\s+/g)
              // .map(s => "\\" + s.split("").join("\\"))
              .join("|") +
            ")",
          "i"
        );

        if (note.markdown.match(regexp) || note.filePath.match(regexp)) {
          if (note.config.pinned) {
            pinned.push(note);
          } else {
            unpinned.push(note);
          }
        }
      } else {
        if (note.config.pinned) {
          pinned.push(note);
        } else {
          unpinned.push(note);
        }
      }
    });

    setNotes([...pinned, ...unpinned]);
  }, [crossnoteContainer.notes, searchValue]);

  useEffect(() => {
    if (notesListElement) {
      const keyDownHandler = (event: KeyboardEvent) => {
        const selectedNote = crossnoteContainer.selectedNote;
        const notes = crossnoteContainer.notes || [];
        if (!selectedNote) return;
        if (event.which === 40) {
          // Up
          const currentIndex = notes.findIndex(
            n => n.filePath === selectedNote.filePath
          );
          if (currentIndex >= 0 && currentIndex < notes.length - 1) {
            crossnoteContainer.setSelectedNote(notes[currentIndex + 1]);
          }
        } else if (event.which === 38) {
          // Down
          const currentIndex = notes.findIndex(
            n => n.filePath === selectedNote.filePath
          );
          if (currentIndex > 0 && currentIndex < notes.length) {
            crossnoteContainer.setSelectedNote(notes[currentIndex - 1]);
          }
        }
      };
      notesListElement.addEventListener("keydown", keyDownHandler);
      return () => {
        notesListElement.removeEventListener("keydown", keyDownHandler);
      };
    }
  }, [
    notesListElement,
    crossnoteContainer.notes,
    crossnoteContainer.selectedNote
  ]);

  useInterval(() => {
    if (crossnoteContainer.needsToRefreshNotes) {
      crossnoteContainer.setNeedsToRefreshNotes(false);
      setForceUpdate(Date.now());
    }
  }, 10000);

  return (
    <div
      className={clsx(classes.notesList)}
      ref={(element: HTMLElement) => {
        setNotesListElement(element);
      }}
    >
      {crossnoteContainer.selectedNotebook &&
        crossnoteContainer.selectedNotebook.localSha !==
          crossnoteContainer.selectedNotebook.remoteSha && (
          <Box className={clsx(classes.updatePanel)}>
            <Typography style={{ marginBottom: "8px" }}>
              {"🔔  " + t("general/notebook-updates-found")}
            </Typography>
            <Button
              color={"primary"}
              variant={"outlined"}
              onClick={pullNotebook}
              disabled={
                crossnoteContainer.isPullingNotebook ||
                crossnoteContainer.isPushingNotebook
              }
            >
              <CloudDownloadOutline
                style={{ marginRight: "8px" }}
              ></CloudDownloadOutline>
              {t("general/update-the-notebook")}
            </Button>
          </Box>
        )}
      {(notes || []).map(note => {
        return (
          <NoteCard key={"note-card-" + note.filePath} note={note}></NoteCard>
        );
      })}
      {crossnoteContainer.initialized &&
        !crossnoteContainer.isLoadingNotebook &&
        notes.length === 0 && (
          <Typography
            style={{
              textAlign: "center",
              marginTop: "32px"
            }}
            variant={"body2"}
          >
            {"🧐 " + t("general/no-notes-found")}
          </Typography>
        )}
    </div>
  );
}
