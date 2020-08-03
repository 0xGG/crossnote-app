import React, { useState, useCallback, useEffect } from "react";
import {
  fade,
  createStyles,
  makeStyles,
  Theme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import {
  CrossnoteContainer,
  SelectedSectionType,
} from "../containers/crossnote";
import {
  Box,
  InputBase,
  Card,
  IconButton,
  Typography,
  Hidden,
  CircularProgress,
  Popover,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Tooltip,
} from "@material-ui/core";
import {
  Magnify,
  FileEditOutline,
  Cog,
  Menu as MenuIcon,
  SortVariant,
  SortDescending,
  SortAscending,
  Pencil,
  ChevronDown,
  TrashCan,
} from "mdi-material-ui";
import { useTranslation } from "react-i18next";
import ConfigureNotebookDialog from "./ConfigureNotebookDialog";
import Notes from "./Notes";
import { OrderBy, OrderDirection } from "../lib/order";
import { Notebook, Note } from "../lib/notebook";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notesPanel: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: theme.palette.background.default,
    },
    topPanel: {
      padding: theme.spacing(0, 1),
      borderRadius: 0,
      backgroundColor: theme.palette.background.paper,
    },
    row: {
      display: "flex",
      alignItems: "center",
    },
    sectionName: {
      marginLeft: theme.spacing(1),
    },
    search: {
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
  toggleDrawer: () => void;
  notebook: Notebook;
  referredNote?: Note;
  initialSearchValue?: string;
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
  const [rawNotes, setRawNotes] = useState<Note[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const crossnoteContainer = CrossnoteContainer.useContainer();

  // Search
  const [searchValue, setSearchValue] = useState<string>(
    props.initialSearchValue || "",
  );
  const [searchValueInputTimeout, setSearchValueInputTimeout] = useState<
    NodeJS.Timeout
  >(null);
  const [finalSearchValue, setFinalSearchValue] = useState<string>("");

  const [
    notebookConfigurationDialogOpen,
    setNotebookConfigurationDialogOpen,
  ] = useState<boolean>(false);

  const createNewNote = useCallback(() => {
    setIsCreatingNote(true);
    crossnoteContainer
      .createNewNote(crossnoteContainer.selectedNotebook)
      .then(() => {
        setIsCreatingNote(false);
      })
      .catch(() => {
        setIsCreatingNote(false);
      });
  }, [crossnoteContainer]);

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

  useEffect(() => {
    setSearchValue("");
    setFinalSearchValue("");
  }, [crossnoteContainer.selectedNotebook]);

  useEffect(() => {
    const notes = [];
    const notesMap = props.referredNote
      ? props.referredNote.mentionedBy
      : props.notebook.notes;

    for (let key in notesMap) {
      notes.push(notesMap[key]);
    }
    setRawNotes(notes);
  }, [props.notebook, props.referredNote]);

  useEffect(() => {
    const notes = rawNotes;
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
    setNotes([...notes]);
  }, [rawNotes, orderBy, orderDirection]);

  return (
    <Box className={clsx(classes.notesPanel)}>
      <Card className={clsx(classes.topPanel)}>
        <Box className={clsx(classes.row)}>
          <Hidden smUp implementation="css">
            <IconButton onClick={props.toggleDrawer}>
              <MenuIcon></MenuIcon>
            </IconButton>
          </Hidden>
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
        </Box>
        <Box
          className={clsx(classes.row)}
          style={{ justifyContent: "space-between" }}
        >
          {/*crossnoteContainer.selectedSection.type ===
          SelectedSectionType.Notes ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="notes">
                {"📒"}
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {crossnoteContainer.selectedNotebook &&
                  crossnoteContainer.selectedNotebook.name}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Today ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="today-notes">
                {"📅"}
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/today")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Todo ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="todo-notes">
                {"☑️"}
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/todo")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Tagged ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="tagged-notes">
                {"🏷️"}
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/tagged")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Untagged ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="untagged-notes">
                {"🈚"}
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/untagged")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Tag ? (
            <Box
              className={clsx(classes.row)}
              style={{ cursor: "pointer" }}
              onClick={(event) => setTagActionsAnchorEl(event.currentTarget)}
            >
              <span role="img" aria-label="tag">
                {"🏷️"}
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {crossnoteContainer.selectedSection.path}
              </Typography>
              <ChevronDown></ChevronDown>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Encrypted ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="encrypted-notes">
                {"🔐"}
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/encrypted")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Conflicted ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="conflicted-notes">
                ⚠️
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/conflicted")}
              </Typography>
            </Box>
          ) : (
            crossnoteContainer.selectedSection.type ===
              SelectedSectionType.Directory && (
              <Box
                className={clsx(classes.row)}
                style={{ cursor: "pointer" }}
                onClick={(event) =>
                  setDirectoryActionsAnchorEl(event.currentTarget)
                }
              >
                <span role="img" aria-label="folder">
                  {"📁"}
                </span>
                <Typography className={clsx(classes.sectionName)}>
                  {crossnoteContainer.selectedSection.path}
                </Typography>
                <ChevronDown></ChevronDown>
              </Box>
            )
              )*/}

          <Box>
            <IconButton
              onClick={(event) => setSortMenuAnchorEl(event.currentTarget)}
            >
              <SortVariant></SortVariant>
            </IconButton>
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
                  <ListItemText
                    primary={t("general/date-modified")}
                  ></ListItemText>
                </ListItem>
                <ListItem
                  button
                  onClick={() => setOrderBy(OrderBy.CreatedAt)}
                  className={clsx(
                    orderBy === OrderBy.CreatedAt && classes.sortSelected,
                  )}
                >
                  <ListItemText
                    primary={t("general/date-created")}
                  ></ListItemText>
                </ListItem>
                <ListItem
                  button
                  onClick={() => setOrderBy(OrderBy.Title)}
                  className={clsx(
                    orderBy === OrderBy.Title && classes.sortSelected,
                  )}
                >
                  <ListItemText primary={t("general/title")}></ListItemText>
                </ListItem>
                <Divider></Divider>
                <ListItem
                  button
                  onClick={() => setOrderDirection(OrderDirection.DESC)}
                  className={clsx(
                    orderDirection === OrderDirection.DESC &&
                      classes.sortSelected,
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
                    orderDirection === OrderDirection.ASC &&
                      classes.sortSelected,
                  )}
                >
                  <ListItemText primary={t("general/Asc")}></ListItemText>
                  <ListItemIcon style={{ marginLeft: "8px" }}>
                    <SortAscending></SortAscending>
                  </ListItemIcon>
                </ListItem>
              </List>
            </Popover>
          </Box>
        </Box>
      </Card>

      <ConfigureNotebookDialog
        open={notebookConfigurationDialogOpen}
        onClose={() => setNotebookConfigurationDialogOpen(false)}
        notebook={crossnoteContainer.selectedNotebook}
      ></ConfigureNotebookDialog>

      {crossnoteContainer.isLoadingNotebook && (
        <CircularProgress className={clsx(classes.loading)}></CircularProgress>
      )}

      <Notes notes={notes} searchValue={finalSearchValue}></Notes>
    </Box>
  );
}
