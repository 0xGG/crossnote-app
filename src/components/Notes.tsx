import React, { useState, useEffect, useCallback } from "react";
import LazyLoad from "react-lazyload";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Box, Typography, Button } from "@material-ui/core";
import NoteCard from "./NoteCard";
import { useTranslation } from "react-i18next";
import useInterval from "@use-it/interval";
import { CloudDownloadOutline } from "mdi-material-ui";
import Noty from "noty";
import { Skeleton } from "@material-ui/lab";
import { Note } from "../lib/notebook";

const lazyLoadPlaceholderHeight = 92;

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notesList: {
      position: "relative",
      flex: "1",
      overflowY: "auto",
      paddingBottom: theme.spacing(12),
      marginTop: theme.spacing(0.5),
    },
    updatePanel: {
      padding: theme.spacing(2),
      textAlign: "center",
      borderBottom: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper,
    },
  }),
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

  /*
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
            timeout: 5000,
          }).show();
        },
      })
      .then(() => {
        new Noty({
          type: "success",
          text: t("success/notebook-downloaded"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
      })
      .catch((error) => {
        console.log(error);
        new Noty({
          type: "error",
          text: t("error/failed-to-download-notebook"),
          layout: "topRight",
          theme: "relax",
          timeout: 2000,
        }).show();
      });
  }, [crossnoteContainer.selectedNotebook, t]);
  */

  /*
  useEffect(() => {
    const pinned: Note[] = [];
    const unpinned: Note[] = [];
    crossnoteContainer.notes.forEach((note) => {
      if (searchValue.trim().length) {
        const regexp = new RegExp(
          "(" +
            searchValue
              .trim()
              .split(/\s+/g)
              .map((s) => s.replace(/[.!@#$%^&*()_+\-=[\]]/g, (x) => `\\${x}`)) // escape special regexp characters
              .join("|") +
            ")",
          "i",
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
  */

  /*
  useEffect(() => {
    if (notesListElement) {
      const keyDownHandler = (event: KeyboardEvent) => {
        const selectedNote = crossnoteContainer.selectedNote;
        if (!selectedNote || !notes.length) {
          return;
        }
        const currentIndex = notes.findIndex(
          (n) => n.filePath === selectedNote.filePath,
        );
        if (currentIndex < 0) {
          crossnoteContainer.setSelectedNote(notes[0]);
        } else if (event.which === 40) {
          // Up
          if (currentIndex >= 0 && currentIndex < notes.length - 1) {
            crossnoteContainer.setSelectedNote(notes[currentIndex + 1]);
          }
        } else if (event.which === 38) {
          // Down
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
  }, [notesListElement, notes, crossnoteContainer.selectedNote]);
  */

  useEffect(() => {
    if (notesListElement) {
      // Hack: fix note cards not displaying bug when searchValue is not empty
      const hack = () => {
        const initialHeight = notesListElement.style.height;
        const initialFlex = notesListElement.style.flex;
        notesListElement.style.flex = "initial";
        notesListElement.style.height = "10px";
        notesListElement.scrollTop += 1;
        notesListElement.scrollTop -= 1;
        notesListElement.style.height = initialHeight;
        notesListElement.style.flex = initialFlex;
      };
      window.addEventListener("resize", hack);
      hack();
      return () => {
        window.removeEventListener("resize", hack);
      };
    }
  }, [notes, notesListElement]);

  useInterval(() => {
    if (crossnoteContainer.needsToRefreshNotes) {
      crossnoteContainer.setNeedsToRefreshNotes(false);
      setForceUpdate(Date.now());
    }
  }, 15000);

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
              // onClick={pullNotebook}
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
      {(notes || []).map((note) => {
        return (
          <LazyLoad
            key={"lazy-load-note-card-" + note.filePath}
            placeholder={
              <Box
                style={{
                  textAlign: "center",
                  height: `${lazyLoadPlaceholderHeight}px`,
                  paddingTop: "16px",
                  paddingBottom: "16px",
                  boxSizing: "border-box",
                }}
              >
                <Skeleton />
                <Skeleton animation={false} />
                <Skeleton animation="wave" />
              </Box>
            }
            height={lazyLoadPlaceholderHeight}
            overflow={true}
            once={true}
            scrollContainer={notesListElement}
            resize={true}
          >
            <NoteCard key={"note-card-" + note.filePath} note={note}></NoteCard>
          </LazyLoad>
        );
      })}
      {crossnoteContainer.initialized &&
        !crossnoteContainer.isLoadingNotebook &&
        notes.length === 0 && (
          <Typography
            style={{
              textAlign: "center",
              marginTop: "32px",
            }}
            variant={"body2"}
          >
            {"🧐 " + t("general/no-notes-found")}
          </Typography>
        )}
    </div>
  );
}
