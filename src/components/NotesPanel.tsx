import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, styled, useTheme } from "@mui/material/styles";
import { inputBaseClasses } from "@mui/material/InputBase";
import useInterval from "../utilities/useInterval";
import { TabNode } from "flexlayout-react";
import {
  FileEditOutline,
  Magnify,
  SortAscending,
  SortDescending,
  SortVariant,
} from "mdi-material-ui";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import i18next from "../i18n/i18n";
import { CrossnoteContainer } from "../containers/crossnote";
import {
  EventType,
  globalEmitter,
  ModifiedMarkdownEventData,
} from "../lib/event";
import { Note, Notes as NotesValue } from "../lib/note";
import { Notebook } from "../lib/notebook";
import { failureMessage, notify } from "../lib/notifications";
import { OrderBy, OrderDirection } from "../lib/order";
import { TabNodeConfig } from "../lib/tabNode";
import { onTabVisibility } from "../lib/tabVisibility";
import Notes from "./Notes";

const NotesPanelRoot = styled("div")(({ theme }) => ({
  "backgroundColor": theme.palette.background.paper,
  "width": "800px",
  "maxWidth": "100%",
  "margin": "0 auto",
  // Moving the focus to a card's controls scrolls them clear of the search
  // bar pinned above the list, not merely into the pane, where it hides them.
  "& .note-card *": {
    scrollMarginTop: theme.spacing(12),
  },
}));

// Stays at the top of the scrolling pane once the list scrolls under it.
const TopPanel = styled(Box)(({ theme }) => ({
  position: "sticky",
  top: 0,
  padding: theme.spacing(0, 1),
  borderRadius: 0,
  backgroundColor: theme.palette.background.paper,
  zIndex: 9,
}));

const Row = styled(Box)({
  display: "flex",
  alignItems: "center",
});

const SearchBox = styled("div")(({ theme }) => ({
  "color": theme.palette.text.secondary,
  "position": "relative",
  "borderRadius": theme.shape.borderRadius,
  "backgroundColor": alpha(theme.palette.common.white, 0.15),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  "marginRight": 0, // theme.spacing(2),
  "marginLeft": 0,
  "width": "100%",
  [theme.breakpoints.up("sm")]: {
    // marginLeft: theme.spacing(3),
    // width: "auto"
  },
}));

const SearchIconWrapper = styled("div")(({ theme }) => ({
  width: theme.spacing(7),
  height: "100%",
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: theme.palette.text.primary,
}));

// The two rules used to arrive as InputBase's root and input slot classes; the
// slot is now addressed by its own class name from the same styled component.
const SearchInput = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  border: "1px solid #bbb",
  borderRadius: "4px",
  width: "100%",
  [`& .${inputBaseClasses.input}`]: {
    padding: theme.spacing(1, 1, 1, 7),
    transition: theme.transitions.create("width"),
    width: "100%",
    [theme.breakpoints.up("md")]: {
      // width: 200
    },
  },
}));

const Loading = styled(CircularProgress)({
  position: "absolute",
  top: "40%",
  left: "50%",
  transform: "translateX(-50%)",
});

const sortSelectedSx = {
  "color": "primary.main",
  "& svg": {
    color: "primary.main",
  },
} as const;

interface Props {
  tabNode: TabNode;
  notebook: Notebook;
  note?: Note;
  initialSearchValue?: string;
  title?: string;
}

function NotesPanel(props: Props) {
  const { t } = useTranslation();
  const [sortMenuAnchorEl, setSortMenuAnchorEl] = useState<HTMLElement>(null);
  const [isCreatingNote, setIsCreatingNote] = useState<boolean>(false);
  const [orderBy, setOrderBy] = useState<OrderBy>(OrderBy.ModifiedAt);
  const [orderDirection, setOrderDirection] = useState<OrderDirection>(
    OrderDirection.DESC,
  );
  const [rawNotesMap, setRawNotesMap] = useState<NotesValue>({});
  const [needsToRefreshRawNotes, setNeedsToRefreshRawNotes] =
    useState<boolean>(false);
  const theme = useTheme();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const { createNewNote: createNote, openNoteAtPath } = crossnoteContainer;
  const [searchValue, setSearchValue] =
    useState<string> // Search
    (props.initialSearchValue || "");
  const searchValueInputTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const [finalSearchValue, setFinalSearchValue] = useState<string>("");
  const [tabNodeVisible, setTabNodeVisible] = useState<boolean>(false);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const listRoot = useCallback((element: HTMLDivElement | null) => {
    setScrollElement(element?.parentElement ?? null);
  }, []);
  const isMounted = useRef<boolean>(false);
  const refreshSequence = useRef(0);

  const createNewNote = useCallback(() => {
    setIsCreatingNote(true);
    // Made from a note's references, the new note starts with a link back
    // to it: [[target|text]], the target its path, shown by its title.
    let markdown = "";
    if (props.note) {
      const target = props.note.filePath.replace(/\.md$/, "");
      markdown =
        target === props.note.title
          ? `[[${target}]]`
          : `[[${target}|${props.note.title}]]`;
    }
    createNote(props.notebook, "", markdown)
      .then((note) => {
        openNoteAtPath(props.notebook, note.filePath);
        setIsCreatingNote(false);
      })
      .catch((error) => {
        notify({
          severity: "error",
          message: failureMessage(
            i18next.t("error/failed-to-create-note"),
            error,
          ),
          duration: 5000,
        });
        setIsCreatingNote(false);
      });
  }, [props.notebook, props.note, createNote, openNoteAtPath]);

  const onChangeSearchValue = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const value = event.target.value;
      setSearchValue(value);
      clearTimeout(searchValueInputTimeout.current);
      searchValueInputTimeout.current = setTimeout(
        () => setFinalSearchValue(value),
        400,
      );
    },
    [],
  );

  const refreshRawNotes = useCallback(async () => {
    if (!isMounted.current || !tabNodeVisible) {
      return;
    }
    const request = ++refreshSequence.current;
    await props.notebook.refreshNotesIfNotLoaded({
      dir: "./",
      includeSubdirectories: true,
    });
    const notes = props.note
      ? await props.notebook.getReferredByNotes(props.note.filePath)
      : props.notebook.notes;
    if (isMounted.current && request === refreshSequence.current) {
      setRawNotesMap({ ...notes });
    }
  }, [props.notebook, props.note, tabNodeVisible]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Reset the search when the external notebook changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchValue("");
    setFinalSearchValue("");
    return () => clearTimeout(searchValueInputTimeout.current);
  }, [props.notebook]);

  // Visibility
  useEffect(() => {
    if (!props.tabNode) {
      return;
    }
    const tabNodeConfig: TabNodeConfig = props.tabNode.getConfig();
    if (
      (tabNodeConfig.component !== "Notes" &&
        tabNodeConfig.component !== "Note") ||
      tabNodeConfig.notebookPath !== props.notebook.dir
    ) {
      return;
    }

    let timer = setTimeout(
      () => setTabNodeVisible(props.tabNode.isVisible()),
      0,
    );
    const stop = onTabVisibility(props.tabNode, (visible) => {
      clearTimeout(timer);
      timer = setTimeout(() => setTabNodeVisible(visible), 0);
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [props.tabNode, props.notebook.dir]);

  // Emitter
  useEffect(() => {
    if (!globalEmitter || !tabNodeVisible) {
      return;
    }
    const modifiedMarkdownCallback = (data: ModifiedMarkdownEventData) => {
      if (props.notebook.dir === data.notebookPath) {
        if (finalSearchValue.trim()) {
          // A matching card may not be mounted to hear this save. Keep an
          // active search in sync instead of waiting for the batch interval.
          refreshRawNotes();
        } else {
          setNeedsToRefreshRawNotes(true);
        }
      }
    };
    const refreshNotebook = ({ notebookPath }: { notebookPath: string }) => {
      if (props.notebook.dir === notebookPath) refreshRawNotes();
    };

    globalEmitter.on(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
    globalEmitter.on(EventType.CreatedNote, refreshNotebook);
    globalEmitter.on(EventType.DeletedNote, refreshNotebook);
    globalEmitter.on(EventType.ChangedNoteFilePath, refreshNotebook);
    globalEmitter.on(EventType.PerformedGitOperation, refreshNotebook);
    return () => {
      globalEmitter.off(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
      globalEmitter.off(EventType.CreatedNote, refreshNotebook);
      globalEmitter.off(EventType.DeletedNote, refreshNotebook);
      globalEmitter.off(EventType.ChangedNoteFilePath, refreshNotebook);
      globalEmitter.off(EventType.PerformedGitOperation, refreshNotebook);
    };
  }, [
    refreshRawNotes,
    props.notebook,
    props.note,
    props.tabNode,
    tabNodeVisible,
    finalSearchValue,
  ]);

  useEffect(() => {
    // Search must use the newest saved notes, including saves completed while
    // the tab was hidden or before the search debounce expired.
    const sequence = refreshSequence;
    refreshRawNotes();
    return () => {
      sequence.current++;
    };
  }, [refreshRawNotes, finalSearchValue]);

  const notes = useMemo(() => {
    const direction = orderDirection === OrderDirection.DESC ? -1 : 1;
    return Object.values(rawNotesMap).sort((a, b) => {
      switch (orderBy) {
        case OrderBy.Title:
          return direction * a.title.localeCompare(b.title);
        case OrderBy.CreatedAt:
          return (
            direction *
            (a.config.createdAt.getTime() - b.config.createdAt.getTime())
          );
        case OrderBy.ModifiedAt:
          return (
            direction *
            (a.config.modifiedAt.getTime() - b.config.modifiedAt.getTime())
          );
        default:
          return 0;
      }
    });
  }, [rawNotesMap, orderBy, orderDirection]);

  useInterval(() => {
    if (needsToRefreshRawNotes) {
      refreshRawNotes();
      setNeedsToRefreshRawNotes(false);
    }
  }, 15000);

  if (props.note && !notes.length) {
    return <Box></Box>;
  }

  return (
    <NotesPanelRoot
      className={"notes-panel"}
      ref={listRoot}
      style={props.note ? { marginTop: "32px" } : undefined}
    >
      <TopPanel>
        {props.title && (
          <Typography
            variant={"h6"}
            style={{
              padding: "6px 0 7px",
              color: theme.palette.text.primary,
            }}
          >
            {props.title}
          </Typography>
        )}
        <Row>
          <SearchBox>
            <SearchIconWrapper>
              <Magnify />
            </SearchIconWrapper>
            <SearchInput
              placeholder={t("search/notes")}
              value={searchValue}
              inputProps={{ "aria-label": "search" }}
              onChange={onChangeSearchValue}
              autoComplete={"off"}
              autoCorrect={"off"}
            />
          </SearchBox>
          <Tooltip title={t("general/new-note")}>
            <span>
              <IconButton
                aria-label={t("general/new-note")}
                onClick={createNewNote}
                disabled={!crossnoteContainer.initialized || isCreatingNote}
              >
                <FileEditOutline />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton
            aria-label={t("general/sort-notes")}
            onClick={(event) => setSortMenuAnchorEl(event.currentTarget)}
          >
            <SortVariant></SortVariant>
          </IconButton>
        </Row>
      </TopPanel>

      <Popover
        anchorEl={sortMenuAnchorEl}
        keepMounted
        open={Boolean(sortMenuAnchorEl)}
        onClose={() => setSortMenuAnchorEl(null)}
      >
        <List>
          {(
            [
              [OrderBy.ModifiedAt, "general/date-modified"],
              [OrderBy.CreatedAt, "general/date-created"],
              [OrderBy.Title, "general/title"],
            ] as const
          ).map(([value, label]) => (
            <ListItem disablePadding key={value}>
              <ListItemButton
                onClick={() => setOrderBy(value)}
                sx={orderBy === value ? sortSelectedSx : undefined}
              >
                <ListItemText primary={t(label)} />
              </ListItemButton>
            </ListItem>
          ))}
          {/* A line between groups, hidden from assistive technology: as an li,
              MUI gives it the separator role, which a list may not hold. */}
          <Divider component="li" aria-hidden></Divider>
          {(
            [
              [OrderDirection.DESC, "general/Desc", SortDescending],
              [OrderDirection.ASC, "general/Asc", SortAscending],
            ] as const
          ).map(([value, label, Icon]) => (
            <ListItem disablePadding key={value}>
              <ListItemButton
                onClick={() => setOrderDirection(value)}
                sx={orderDirection === value ? sortSelectedSx : undefined}
              >
                <ListItemText primary={t(label)} />
                <ListItemIcon style={{ marginLeft: "8px" }}>
                  <Icon />
                </ListItemIcon>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Popover>

      {props.notebook.hasLoadedNotes ? (
        <Notes
          tabNode={props.tabNode}
          notebook={props.notebook}
          notes={notes}
          referredNote={props.note}
          searchValue={finalSearchValue}
          scrollElement={scrollElement}
        ></Notes>
      ) : (
        <Loading></Loading>
      )}
    </NotesPanelRoot>
  );
}

// Drawn again only when its props change, or its own state or the app's
// does: a note panel draws its references with the same props on every
// keystroke, and the layout redraws every open list after each save.
export default React.memo(NotesPanel);
