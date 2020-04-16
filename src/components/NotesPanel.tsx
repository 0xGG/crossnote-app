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
  OrderBy,
  OrderDirection,
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
} from "@material-ui/core";
import {
  Magnify,
  FileEditOutline,
  Cog,
  Menu as MenuIcon,
  SortVariant,
  SortDescending,
  SortAscending,
} from "mdi-material-ui";
import { useTranslation } from "react-i18next";
import ConfigureNotebookDialog from "./ConfigureNotebookDialog";
import Notes from "./Notes";

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
      padding: theme.spacing(1),
      borderRadius: 0,
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
      // color: "rgba(0, 0, 0, 0.54)",
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
    },
    inputInput: {
      padding: theme.spacing(1, 1, 1, 7),
      transition: theme.transitions.create("width"),
      width: "100%",
      [theme.breakpoints.up("md")]: {
        // width: 200
      },
    },
    notesList: {
      position: "relative",
      flex: "1",
      overflowY: "auto",
      paddingBottom: theme.spacing(12),
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
}

export default function NotesPanel(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [sortMenuAnchorEl, setSortMenuAnchorEl] = useState<HTMLElement>(null);
  const [isCreatingNote, setIsCreatingNote] = useState<boolean>(false);
  const crossnoteContainer = CrossnoteContainer.useContainer();

  // Search
  const [searchValue, setSearchValue] = useState<string>("");
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

  return (
    <Box className={clsx(classes.notesPanel)}>
      <Box className={clsx(classes.topPanel)}>
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
              placeholder={t("search/placeholder")}
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
            <FileEditOutline></FileEditOutline>
          </IconButton>
        </Box>
        <Box
          className={clsx(classes.row)}
          style={{ justifyContent: "space-between" }}
        >
          {crossnoteContainer.selectedSection.type ===
          SelectedSectionType.Notes ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="notes">
                📒
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
                🗓
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/today")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Todo ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="todo-notes">
                ☑️
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/todo")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Tagged ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="tagged-notes">
                🏷️
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/tagged")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Untagged ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="untagged-notes">
                🈚
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {t("general/untagged")}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Tag ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="tag">
                🏷️
              </span>
              <Typography className={clsx(classes.sectionName)}>
                {crossnoteContainer.selectedSection.path}
              </Typography>
            </Box>
          ) : crossnoteContainer.selectedSection.type ===
            SelectedSectionType.Encrypted ? (
            <Box className={clsx(classes.row)}>
              <span role="img" aria-label="encrypted-notes">
                🔐
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
              <Box className={clsx(classes.row)}>
                <span role="img" aria-label="folder">
                  {"📁"}
                </span>
                <Typography className={clsx(classes.sectionName)}>
                  {crossnoteContainer.selectedSection.path}
                </Typography>
              </Box>
            )
          )}

          <Box>
            {
              /*crossnoteContainer.selectedSection.type ===
              SelectedSectionType.Notes && (*/
              <IconButton
                onClick={() => setNotebookConfigurationDialogOpen(true)}
              >
                <Cog></Cog>
              </IconButton>
              /*)*/
            }
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
                  onClick={() =>
                    crossnoteContainer.setOrderBy(OrderBy.ModifiedAt)
                  }
                  className={clsx(
                    crossnoteContainer.orderBy === OrderBy.ModifiedAt &&
                      classes.sortSelected,
                  )}
                >
                  <ListItemText
                    primary={t("general/date-modified")}
                  ></ListItemText>
                </ListItem>
                <ListItem
                  button
                  onClick={() =>
                    crossnoteContainer.setOrderBy(OrderBy.CreatedAt)
                  }
                  className={clsx(
                    crossnoteContainer.orderBy === OrderBy.CreatedAt &&
                      classes.sortSelected,
                  )}
                >
                  <ListItemText
                    primary={t("general/date-created")}
                  ></ListItemText>
                </ListItem>
                <ListItem
                  button
                  onClick={() => crossnoteContainer.setOrderBy(OrderBy.Title)}
                  className={clsx(
                    crossnoteContainer.orderBy === OrderBy.Title &&
                      classes.sortSelected,
                  )}
                >
                  <ListItemText primary={t("general/title")}></ListItemText>
                </ListItem>
                <Divider></Divider>
                <ListItem
                  button
                  onClick={() =>
                    crossnoteContainer.setOrderDirection(OrderDirection.DESC)
                  }
                  className={clsx(
                    crossnoteContainer.orderDirection === OrderDirection.DESC &&
                      classes.sortSelected,
                  )}
                >
                  <ListItemText primary={"Desc"}></ListItemText>
                  <ListItemIcon style={{ marginLeft: "8px" }}>
                    <SortDescending></SortDescending>
                  </ListItemIcon>
                </ListItem>
                <ListItem
                  button
                  onClick={() =>
                    crossnoteContainer.setOrderDirection(OrderDirection.ASC)
                  }
                  className={clsx(
                    crossnoteContainer.orderDirection === OrderDirection.ASC &&
                      classes.sortSelected,
                  )}
                >
                  <ListItemText primary={"Asc"}></ListItemText>
                  <ListItemIcon style={{ marginLeft: "8px" }}>
                    <SortAscending></SortAscending>
                  </ListItemIcon>
                </ListItem>
              </List>
            </Popover>
          </Box>
        </Box>
      </Box>

      <ConfigureNotebookDialog
        open={notebookConfigurationDialogOpen}
        onClose={() => setNotebookConfigurationDialogOpen(false)}
        notebook={crossnoteContainer.selectedNotebook}
      ></ConfigureNotebookDialog>

      {crossnoteContainer.isLoadingNotebook && (
        <CircularProgress className={clsx(classes.loading)}></CircularProgress>
      )}

      <Notes searchValue={finalSearchValue}></Notes>
    </Box>
  );
}
