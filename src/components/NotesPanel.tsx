import {
  Box,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  List,
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
import { TabNodeConfig } from "../lib/tabNode";
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
  const [notes, setNotes] = useState<Note[]>([]);
  const [needsToRefreshRawNotes, setNeedsToRefreshRawNotes] =
    useState<boolean>(false);
  const theme = useTheme();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const [searchValue, setSearchValue] =
    useState<string> // Search
    (props.initialSearchValue || "");
  const [searchValueInputTimeout, setSearchValueInputTimeout] =
    useState<ReturnType<typeof setTimeout>>(null);
  const [finalSearchValue, setFinalSearchValue] = useState<string>("");
  const [tabNodeVisible, setTabNodeVisible] = useState<boolean>(false);
  const container = useRef<HTMLDivElement>(null);
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
    if (!isMounted.current || !tabNodeVisible) {
      return;
    }
    await props.notebook.refreshNotesIfNotLoaded({
      dir: "./",
      includeSubdirectories: true,
    });
    setRawNotesMap(
      Object.assign(
        {},
        props.note
          ? await props.notebook.getReferredByNotes(props.note.filePath)
          : props.notebook.notes,
      ) as any,
    );
  }, [props.notebook, props.note, tabNodeVisible]);

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

    setTabNodeVisible(props.tabNode.isVisible());
    props.tabNode.setEventListener("visibility", function (params) {
      // hack: need to wait for props.tabNode.isVisible() === params.visible to setState
      setTimeout(() => {
        if (isMounted.current) {
          setTabNodeVisible(params.visible);
        }
      }, 1000);
    });
    return () => {
      props.tabNode.removeEventListener("visibility");
    };
  }, [props.tabNode, props.notebook.dir]);

  // Emitter
  useEffect(() => {
    if (!globalEmitter || !tabNodeVisible) {
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
  }, [
    refreshRawNotes,
    props.notebook,
    props.note,
    props.tabNode,
    tabNodeVisible,
  ]);

  useEffect(() => {
    if (refreshRawNotes) {
      refreshRawNotes();
    }
  }, [refreshRawNotes, props.note]);

  useEffect(() => {
    const newNotes = Object.values(rawNotesMap);
    if (orderBy === OrderBy.ModifiedAt) {
      if (orderDirection === OrderDirection.DESC) {
        newNotes.sort(
          (a, b) =>
            b.config.modifiedAt.getTime() - a.config.modifiedAt.getTime(),
        );
      } else {
        newNotes.sort(
          (a, b) =>
            a.config.modifiedAt.getTime() - b.config.modifiedAt.getTime(),
        );
      }
    } else if (orderBy === OrderBy.CreatedAt) {
      if (orderDirection === OrderDirection.DESC) {
        newNotes.sort(
          (a, b) => b.config.createdAt.getTime() - a.config.createdAt.getTime(),
        );
      } else {
        newNotes.sort(
          (a, b) => a.config.createdAt.getTime() - b.config.createdAt.getTime(),
        );
      }
    } else if (orderBy === OrderBy.Title) {
      if (orderDirection === OrderDirection.DESC) {
        newNotes.sort((a, b) => b.title.localeCompare(a.title));
      } else {
        newNotes.sort((a, b) => a.title.localeCompare(b.title));
      }
    }
    setNotes(newNotes);
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
    <NotesPanelRoot className={"notes-panel"} ref={container}>
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
          <IconButton
            aria-label={t("general/new-note")}
            onClick={createNewNote}
            disabled={!crossnoteContainer.initialized || isCreatingNote}
          >
            <Tooltip title={t("general/new-note")}>
              <FileEditOutline></FileEditOutline>
            </Tooltip>
          </IconButton>
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
          <ListItemButton
            onClick={() => setOrderBy(OrderBy.ModifiedAt)}
            sx={orderBy === OrderBy.ModifiedAt ? sortSelectedSx : undefined}
          >
            <ListItemText primary={t("general/date-modified")}></ListItemText>
          </ListItemButton>
          <ListItemButton
            onClick={() => setOrderBy(OrderBy.CreatedAt)}
            sx={orderBy === OrderBy.CreatedAt ? sortSelectedSx : undefined}
          >
            <ListItemText primary={t("general/date-created")}></ListItemText>
          </ListItemButton>
          <ListItemButton
            onClick={() => setOrderBy(OrderBy.Title)}
            sx={orderBy === OrderBy.Title ? sortSelectedSx : undefined}
          >
            <ListItemText primary={t("general/title")}></ListItemText>
          </ListItemButton>
          <Divider></Divider>
          <ListItemButton
            onClick={() => setOrderDirection(OrderDirection.DESC)}
            sx={
              orderDirection === OrderDirection.DESC
                ? sortSelectedSx
                : undefined
            }
          >
            <ListItemText primary={t("general/Desc")}></ListItemText>
            <ListItemIcon style={{ marginLeft: "8px" }}>
              <SortDescending></SortDescending>
            </ListItemIcon>
          </ListItemButton>
          <ListItemButton
            onClick={() => setOrderDirection(OrderDirection.ASC)}
            sx={
              orderDirection === OrderDirection.ASC ? sortSelectedSx : undefined
            }
          >
            <ListItemText primary={t("general/Asc")}></ListItemText>
            <ListItemIcon style={{ marginLeft: "8px" }}>
              <SortAscending></SortAscending>
            </ListItemIcon>
          </ListItemButton>
        </List>
      </Popover>

      {props.notebook.hasLoadedNotes ? (
        <Notes
          tabNode={props.tabNode}
          notebook={props.notebook}
          notes={notes}
          referredNote={props.note}
          searchValue={finalSearchValue}
          scrollElement={
            container && container.current && container.current.parentElement
          }
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
