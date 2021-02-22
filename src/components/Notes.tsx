import { Box, Typography } from "@material-ui/core";
import {
  createStyles,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import { Skeleton } from "@material-ui/lab";
import clsx from "clsx";
import { TabNode } from "flexlayout-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import LazyLoad from "react-lazyload";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/note";
import NoteCard, { NoteCardMargin } from "./NoteCard";
const is = require("is_js");

const lazyLoadPlaceholderHeight = 92 + 2 * NoteCardMargin;

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notesList: {
      "position": "relative",
      // "flex": "1",
      // "overflowY": "auto",
      "paddingTop": theme.spacing(2),
      "paddingLeft": theme.spacing(2),
      "paddingRight": theme.spacing(2),
      "paddingBottom": theme.spacing(12),
      [theme.breakpoints.down("sm")]: {
        paddingLeft: theme.spacing(0.5),
        paddingRight: theme.spacing(0.5),
      },

      "& .note-card-sizer": {
        // width: `${NoteCardWidth + 2 * NoteCardMargin}px`,
        maxWidth: "100%",
        /*
        [theme.breakpoints.down("xs")]: {
          width: "100%",
        },
        */
      },
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
  tabNode: TabNode;
  referredNote?: Note;
  notes: Note[];
  searchValue: string;
  scrollElement: HTMLElement;
}

export default function Notes(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const theme = useTheme();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [forceUpdate, setForceUpdate] = useState<number>(Date.now());
  const [notes, setNotes] = useState<Note[]>([]);
  const [masonryInstance, setMasonryInstance] = useState<any>(null);

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

  useEffect(() => {
    const notes = props.notes;
    const searchValue = props.searchValue;
    const pinned: Note[] = [];
    const unpinned: Note[] = [];
    notes.forEach((note) => {
      // TODO: Convert to use MiniSearch for searching
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
  }, [props.notes, props.searchValue]);

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
    if (props.scrollElement) {
      const scrollElement = props.scrollElement;
      // Hack: fix note cards not displaying bug when searchValue is not empty
      const hack = () => {
        const initialHeight = scrollElement.style.height;
        const initialFlex = scrollElement.style.flex;
        scrollElement.style.flex = "initial";
        scrollElement.style.height = "10px";
        scrollElement.scrollTop += 1;
        scrollElement.scrollTop -= 1;
        scrollElement.style.height = initialHeight;
        scrollElement.style.flex = initialFlex;
      };
      window.addEventListener("resize", hack);
      hack();
      return () => {
        window.removeEventListener("resize", hack);
      };
    }
  }, [notes, props.scrollElement, masonryInstance]);

  return (
    <div className={clsx(classes.notesList)}>
      {(notes || []).map((note) => {
        return (
          <LazyLoad
            key={"lazy-load-note-card-" + note.filePath}
            placeholder={
              <Box
                style={{
                  maxWidth: "100%",
                  margin: `${NoteCardMargin}px auto`,
                  padding: theme.spacing(2, 0.5, 0),
                  height: `${lazyLoadPlaceholderHeight}px`,
                }}
                className={"note-card lazyload-placeholder"}
              >
                <Skeleton />
                <Skeleton animation={false} />
                <Skeleton animation="wave" />
              </Box>
            }
            height={lazyLoadPlaceholderHeight}
            overflow={true}
            once={true}
            scrollContainer={props.scrollElement}
            resize={true}
          >
            <NoteCard
              key={"note-card-" + note.filePath}
              tabNode={props.tabNode}
              note={note}
              referredNote={props.referredNote}
            ></NoteCard>
          </LazyLoad>

          //   <NoteCard key={"note-card-" + note.filePath} note={note}></NoteCard>
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
            color={"textPrimary"}
          >
            {"🧐 " + t("general/no-notes-found")}
          </Typography>
        )}
    </div>
  );
}
