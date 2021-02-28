import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
} from "@material-ui/core";
import {
  createStyles,
  fade,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import useInterval from "@use-it/interval";
import clsx from "clsx";
import { TabNode } from "flexlayout-react";
import {
  FileEditOutline,
  Magnify,
  SortAscending,
  SortDescending,
  SortVariant,
} from "mdi-material-ui";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import {
  ChangedNoteFilePathEventData,
  CreatedNoteEventData,
  DeletedNotebookEventData,
  DeletedNoteEventData,
  EventType,
  globalEmitter,
  ModifiedMarkdownEventData,
  PerformedGitOperationEventData,
} from "../lib/event";
import { Note, Notes as NotesValue } from "../lib/note";
import { Notebook } from "../lib/notebook";
import { OrderBy, OrderDirection } from "../lib/order";
import Notes from "./Notes";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notesPanel: {
      backgroundColor: theme.palette.background.paper,
      width: "800px",
      maxWidth: "100%",
      margin: "0 auto",
    },
    topPanel: {
      padding: theme.spacing(0, 1),
      borderRadius: 0,
      backgroundColor: theme.palette.background.paper,
      zIndex: 9,
    },
    fixedTopPanel: {
      position: "sticky",
      top: `0`,
      width: "100%",
    },
    row: {
      display: "flex",
      alignItems: "center",
    },
    sectionName: {
      marginLeft: theme.spacing(1),
    },
    search: {
      "color": theme.palette.text.secondary,
      "position": "relative",
      "borderRadius": theme.shape.borderRadius,
      "backgroundColor": fade(theme.palette.common.white, 0.15),
      "&:hover": {
        backgroundColor: fade(theme.palette.common.white, 0.25),
      },
      "marginRight": 0, // theme.spacing(2),
      "marginLeft": 0,
      "width": "100%",
      [theme.breakpoints.up("sm")]: {
        // marginLeft: theme.spacing(3),
        // width: "auto"
      },
    },
    searchIcon: {
      width: theme.spacing(7),
      height: "100%",
      position: "absolute",
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.palette.text.primary,
    },
    inputRoot: {
      color: "inherit",
      border: "1px solid #bbb",
      borderRadius: "4px",
      width: "100%",
    },
    inputInput: {
      padding: theme.spacing(1, 1, 1, 7),
      transition: theme.transitions.create("width"),
      width: "100%",
      [theme.breakpoints.up("md")]: {
        // width: 200
      },
    },
    loading: {
      position: "absolute",
      top: "40%",
      left: "50%",
      transform: "translateX(-50%)",
    },
    sortSelected: {
      "color": theme.palette.primary.main,
      "& svg": {
        color: theme.palette.primary.main,
      },
    },
  }),
);

interface Props {
  tabNode: TabNode;
  notebook: Notebook;
  note?: Note;
  initialSearchValue?: string;
  title?: string;
}

export default function NotesPanel(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [sortMenuAnchorEl, setSortMenuAnchorEl] = useState<HTMLElement>(null);
  const [isCreatingNote, setIsCreatingNote] = useState<boolean>(false);
  const [orderBy, setOrderBy] = useState<OrderBy>(OrderBy.ModifiedAt);
  const [orderDirection, setOrderDirection] = useState<OrderDirection>(
    OrderDirection.DESC,
  );
  const [rawNotesMap, setRawNotesMap] = useState<NotesValue>({});
  const [notes, setNotes] = useState<Note[]>([]);
  const [needsToRefreshRawNotes, setNeedsToRefreshRawNotes] = useState<boolean>(
    false,
  );
  const theme = useTheme();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [searchValue, setSearchValue] = useState<string>( // Search
    props.initialSearchValue || "",
  );
  const [searchValueInputTimeout, setSearchValueInputTimeout] = useState<
    NodeJS.Timeout
  >(null);
  const [finalSearchValue, setFinalSearchValue] = useState<string>("");
  const [fixedTopPanel, setFixedTopPanel] = useState<boolean>(false);
  const container = useRef<HTMLDivElement>(null);
  const topPanel = useRef<HTMLElement>(null);
  const isMounted = useRef<boolean>(false);

  const createNewNote = useCallback(() => {
    setIsCreatingNote(true);
    let markdown = "";
    if (props.note) {
      if (props.note.title === props.note.filePath.replace(/\.md$/, "")) {
        markdown = `[[${props.note.title}]]`;
      } else {
        markdown = `[[${props.note.title}|${props.note.filePath}]]`;
      }
    }
    crossnoteContainer
      .createNewNote(props.notebook, "", markdown)
      .then((note) => {
        crossnoteContainer.openNoteAtPath(props.notebook, note.filePath);
        setIsCreatingNote(false);
      })
      .catch(() => {
        setIsCreatingNote(false);
      });
  }, [props.notebook, props.note]);

  const onChangeSearchValue = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const value = event.target.value;
      setSearchValue(value);
      if (searchValueInputTimeout) {
        clearTimeout(searchValueInputTimeout);
      }
      const timeout = setTimeout(() => {
        setFinalSearchValue(value);
      }, 400);
      setSearchValueInputTimeout(timeout);
    },
    [searchValueInputTimeout],
  );

  const refreshRawNotes = useCallback(async () => {
    if (!isMounted.current) {
      return;
    }
    setRawNotesMap(
      Object.assign(
        {},
        props.note
          ? await props.notebook.getReferredByNotes(props.note.filePath)
          : props.notebook.notes,
      ) as any,
    );
  }, [props.notebook, props.note]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    setSearchValue("");
    setFinalSearchValue("");
  }, [props.notebook]);

  // Emitter
  useEffect(() => {
    if (!globalEmitter) {
      return;
    }
    const modifiedMarkdownCallback = async (
      data: ModifiedMarkdownEventData,
    ) => {
      if (props.notebook.dir === data.notebookPath) {
        setNeedsToRefreshRawNotes(true);
      }
    };
    const createdNoteCallback = (data: CreatedNoteEventData) => {
      if (props.notebook.dir === data.notebookPath) {
        refreshRawNotes();
      }
    };
    const deletedNoteCallback = (data: DeletedNoteEventData) => {
      if (props.notebook.dir === data.notebookPath) {
        refreshRawNotes();
      }
    };
    const changedNoteFilePathCallback = (
      data: ChangedNoteFilePathEventData,
    ) => {
      if (props.notebook.dir === data.notebookPath) {
        refreshRawNotes();
      }
    };
    const performedGitOperationCallback = (
      data: PerformedGitOperationEventData,
    ) => {
      if (props.notebook.dir === data.notebookPath) {
        refreshRawNotes();
      }
    };
    const deletedNotebookCallback = (data: DeletedNotebookEventData) => {
      if (props.notebook.dir === data.notebookPath) {
        crossnoteContainer.closeTabNode(props.tabNode.getId());
      }
    };

    // TODO: Delay the modifiedMarkdownCallback
    globalEmitter.on(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
    globalEmitter.on(EventType.CreatedNote, createdNoteCallback);
    globalEmitter.on(EventType.DeletedNote, deletedNoteCallback);
    globalEmitter.on(EventType.DeletedNotebook, deletedNotebookCallback);
    globalEmitter.on(
      EventType.ChangedNoteFilePath,
      changedNoteFilePathCallback,
    );
    globalEmitter.on(
      EventType.PerformedGitOperation,
      performedGitOperationCallback,
    );
    return () => {
      globalEmitter.off(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
      globalEmitter.off(EventType.CreatedNote, createdNoteCallback);
      globalEmitter.off(EventType.DeletedNote, deletedNoteCallback);
      globalEmitter.off(
        EventType.ChangedNoteFilePath,
        changedNoteFilePathCallback,
      );
      globalEmitter.off(
        EventType.PerformedGitOperation,
        performedGitOperationCallback,
      );
      globalEmitter.off(EventType.DeletedNotebook, deletedNotebookCallback);
    };
  }, [refreshRawNotes, props.notebook, props.note, props.tabNode]);

  useEffect(() => {
    if (refreshRawNotes) {
      refreshRawNotes();
    }
  }, [refreshRawNotes, props.note]);

  useEffect(() => {
    const notes = Object.values(rawNotesMap);
    if (orderBy === OrderBy.ModifiedAt) {
      if (orderDirection === OrderDirection.DESC) {
        notes.sort(
          (a, b) =>
            b.config.modifiedAt.getTime() - a.config.modifiedAt.getTime(),
        );
      } else {
        notes.sort(
          (a, b) =>
            a.config.modifiedAt.getTime() - b.config.modifiedAt.getTime(),
        );
      }
    } else if (orderBy === OrderBy.CreatedAt) {
      if (orderDirection === OrderDirection.DESC) {
        notes.sort(
          (a, b) => b.config.createdAt.getTime() - a.config.createdAt.getTime(),
        );
      } else {
        notes.sort(
          (a, b) => a.config.createdAt.getTime() - b.config.createdAt.getTime(),
        );
      }
    } else if (orderBy === OrderBy.Title) {
      if (orderDirection === OrderDirection.DESC) {
        notes.sort((a, b) => b.title.localeCompare(a.title));
      } else {
        notes.sort((a, b) => a.title.localeCompare(b.title));
      }
    }
    setNotes(notes);
  }, [rawNotesMap, orderBy, orderDirection]);

  useEffect(() => {
    if (!container || !topPanel || !container.current || !topPanel.current) {
      return;
    }
    const containerElement = container.current;
    const scrollElement = containerElement.parentElement;
    const scrollEvent = function () {
      // console.log( "onscroll: ", scrollElement.scrollTop, containerElement.offsetTop,);
      if (scrollElement.scrollTop >= containerElement.offsetTop) {
        setFixedTopPanel(true);
      } else {
        setFixedTopPanel(false);
      }
    };
    scrollEvent();
    scrollElement.addEventListener("scroll", scrollEvent);
    return () => {
      scrollElement.removeEventListener("scroll", scrollEvent);
    };
  }, [container, topPanel]);

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
    <div className={clsx(classes.notesPanel, "notes-panel")} ref={container}>
      <Box
        className={clsx(
          classes.topPanel,
          fixedTopPanel ? classes.fixedTopPanel : "",
        )}
      >
        {props.title && (
          <Typography
            variant={"h6"}
            style={{ padding: "6px 0 7px", color: theme.palette.text.primary }}
          >
            {props.title}
          </Typography>
        )}
        <Box className={clsx(classes.row)}>
          <div className={classes.search}>
            <div className={classes.searchIcon}>
              <Magnify />
            </div>
            <InputBase
              placeholder={t("search/notes")}
              classes={{
                root: classes.inputRoot,
                input: classes.inputInput,
              }}
              value={searchValue}
              inputProps={{ "aria-label": "search" }}
              onChange={onChangeSearchValue}
              autoComplete={"off"}
              autoCorrect={"off"}
            />
          </div>
          <IconButton
            onClick={createNewNote}
            disabled={!crossnoteContainer.initialized || isCreatingNote}
          >
            <Tooltip title={t("general/new-note")}>
              <FileEditOutline></FileEditOutline>
            </Tooltip>
          </IconButton>
          <IconButton
            onClick={(event) => setSortMenuAnchorEl(event.currentTarget)}
          >
            <SortVariant></SortVariant>
          </IconButton>
        </Box>
      </Box>

      <Popover
        anchorEl={sortMenuAnchorEl}
        keepMounted
        open={Boolean(sortMenuAnchorEl)}
        onClose={() => setSortMenuAnchorEl(null)}
      >
        <List>
          <ListItem
            button
            onClick={() => setOrderBy(OrderBy.ModifiedAt)}
            className={clsx(
              orderBy === OrderBy.ModifiedAt && classes.sortSelected,
            )}
          >
            <ListItemText primary={t("general/date-modified")}></ListItemText>
          </ListItem>
          <ListItem
            button
            onClick={() => setOrderBy(OrderBy.CreatedAt)}
            className={clsx(
              orderBy === OrderBy.CreatedAt && classes.sortSelected,
            )}
          >
            <ListItemText primary={t("general/date-created")}></ListItemText>
          </ListItem>
          <ListItem
            button
            onClick={() => setOrderBy(OrderBy.Title)}
            className={clsx(orderBy === OrderBy.Title && classes.sortSelected)}
          >
            <ListItemText primary={t("general/title")}></ListItemText>
          </ListItem>
          <Divider></Divider>
          <ListItem
            button
            onClick={() => setOrderDirection(OrderDirection.DESC)}
            className={clsx(
              orderDirection === OrderDirection.DESC && classes.sortSelected,
            )}
          >
            <ListItemText primary={t("general/Desc")}></ListItemText>
            <ListItemIcon style={{ marginLeft: "8px" }}>
              <SortDescending></SortDescending>
            </ListItemIcon>
          </ListItem>
          <ListItem
            button
            onClick={() => setOrderDirection(OrderDirection.ASC)}
            className={clsx(
              orderDirection === OrderDirection.ASC && classes.sortSelected,
            )}
          >
            <ListItemText primary={t("general/Asc")}></ListItemText>
            <ListItemIcon style={{ marginLeft: "8px" }}>
              <SortAscending></SortAscending>
            </ListItemIcon>
          </ListItem>
        </List>
      </Popover>

      {crossnoteContainer.isLoadingNotebook && (
        <CircularProgress className={clsx(classes.loading)}></CircularProgress>
      )}

      <Notes
        tabNode={props.tabNode}
        notes={notes}
        referredNote={props.note}
        searchValue={finalSearchValue}
        scrollElement={
          container && container.current && container.current.parentElement
        }
      ></Notes>
    </div>
  );
}
