import React, { useState, useEffect } from "react";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { Box } from "@material-ui/core";
import NoteCard from "./NoteCard";
import { useTranslation } from "react-i18next";
import { Note } from "../lib/crossnote";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notesList: {
      position: "relative",
      flex: "1",
      overflowY: "auto",
      paddingBottom: theme.spacing(12)
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
  const searchValue = props.searchValue;

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
  }, [notesListElement, crossnoteContainer.notes]);

  return (
    <div
      className={clsx(classes.notesList)}
      ref={(element: HTMLElement) => {
        setNotesListElement(element);
      }}
    >
      {(notes || []).map(note => {
        return (
          <NoteCard key={"note-card-" + note.filePath} note={note}></NoteCard>
        );
      })}
    </div>
  );
}
