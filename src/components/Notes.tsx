import { Box, Chip, Skeleton, Typography } from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import { TabNode } from "flexlayout-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { Note } from "../lib/note";
import { Notebook } from "../lib/notebook";
import NoteCard, { NoteCardMargin } from "./NoteCard";

const lazyLoadPlaceholderHeight = 92 + 2 * NoteCardMargin;

// A card is drawn again only when it is handed a note of its own that is
// new: a refresh after a save hands the list one new note and the others as
// they were, and every card ever scrolled into view would draw again.
const MemoizedNoteCard = React.memo(NoteCard);

const NotesList = styled("div")(({ theme }) => ({
  "position": "relative",
  // "flex": "1",
  // "overflowY": "auto",
  "paddingTop": theme.spacing(2),
  "paddingLeft": theme.spacing(2),
  "paddingRight": theme.spacing(2),
  "paddingBottom": theme.spacing(12),
  [theme.breakpoints.down("md")]: {
    paddingLeft: theme.spacing(0.5),
    paddingRight: theme.spacing(0.5),
  },

  "& .note-card-sizer": {
    // width: `${NoteCardWidth + 2 * NoteCardMargin}px`,
    maxWidth: "100%",
    /*
      [theme.breakpoints.down("sm")]: {
        width: "100%",
      },
      */
  },
}));

interface Props {
  tabNode: TabNode;
  referredNote?: Note;
  notebook: Notebook;
  notes: Note[];
  searchValue: string;
  scrollElement: HTMLElement;
}

// Share one observer across the list. A card keeps its state after the first intersection.
function observeCards(root: HTMLElement | null) {
  if (typeof IntersectionObserver === "undefined") return undefined;
  const visible = new WeakMap<Element, () => void>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.get(entry.target)?.();
      }
    },
    { root },
  );
  return (element: Element, show: () => void) => {
    visible.set(element, show);
    observer.observe(element);
    return () => {
      observer.unobserve(element);
      visible.delete(element);
    };
  };
}

function LazyNoteCard({
  observe,
  children,
}: {
  observe: ReturnType<typeof observeCards>;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const placeholder = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  useEffect(() => {
    if (!shown && observe && placeholder.current) {
      return observe(placeholder.current, () => setShown(true));
    }
  }, [observe, shown]);
  if (shown || !observe) return children;
  return (
    <Box
      ref={placeholder}
      style={{
        maxWidth: "100%",
        margin: `${NoteCardMargin}px auto`,
        padding: theme.spacing(2, 0.5, 0),
        height: `${lazyLoadPlaceholderHeight}px`,
      }}
      className="note-card lazyload-placeholder"
    >
      <Skeleton />
      <Skeleton animation={false} />
      <Skeleton animation="wave" />
    </Box>
  );
}

export default function Notes(props: Props) {
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [notes, setNotes] = useState<Note[]>([]);
  const observe = useMemo(
    () => observeCards(props.scrollElement),
    [props.scrollElement],
  );

  useEffect(() => {
    const newNotes = props.notes;
    const searchValue = props.searchValue;
    const pinned: Note[] = [];
    const unpinned: Note[] = [];
    newNotes.forEach((note) => {
      // TODO: Convert to use MiniSearch for searching
      if (searchValue.trim().length) {
        const regexp = new RegExp(
          "(" +
            searchValue
              .trim()
              .split(/\s+/g)
              // Every character a pattern reads as more than itself.
              .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
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

    const mergedNotes = [...pinned, ...unpinned];

    // Compared as objects: a reload of the notebook hands out new notes for
    // the same files, and a card only follows its note when handed the new
    // one.
    if (
      mergedNotes.length !== notes.length ||
      mergedNotes.some((mergedNote, index) => mergedNote !== notes[index])
    ) {
      setNotes(mergedNotes);
    }
  }, [props.notes, props.searchValue]);

  return (
    <React.Fragment>
      <Box style={{ textAlign: "center" }}>
        <Chip
          size={"small"}
          variant={"outlined"}
          color={"default"}
          label={`${Object.keys(notes).length} ${t("profile-card/notes")}`}
        ></Chip>
      </Box>
      <NotesList>
        {notes.map((note) => (
          <LazyNoteCard key={note.filePath} observe={observe}>
            <MemoizedNoteCard
              tabNode={props.tabNode}
              note={note}
              referredNote={props.referredNote}
            />
          </LazyNoteCard>
        ))}
        {crossnoteContainer.initialized &&
          props.notebook.hasLoadedNotes &&
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
      </NotesList>
    </React.Fragment>
  );
}
