import { TreeView, TreeItem } from "@material-ui/lab";
import {
  createStyles,
  makeStyles,
  Theme,
  darken,
  fade,
} from "@material-ui/core/styles";
import clsx from "clsx";
import React, { useState, useCallback, useEffect } from "react";
import { IconButton, Box, Typography, Tooltip } from "@material-ui/core";
import {
  ChevronRight,
  ChevronDown,
  Cog,
  Upload,
  Download,
} from "mdi-material-ui";
import {
  CrossnoteContainer,
  SelectedSectionType,
  HomeSection,
} from "../containers/crossnote";
import { useTranslation } from "react-i18next";
import ConfigureNotebookDialog from "./ConfigureNotebookDialog";
import PushNotebookDialog from "./PushNotebookDialog";

import { Notebook, Note, Notes } from "../lib/notebook";
import {
  globalEmitter,
  EventType,
  ModifiedMarkdownEventData,
} from "../lib/event";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    treeItemRoot: {
      "paddingLeft": "4px",
      // color: theme.palette.text.secondary,
      "&:focus > $treeItemContent": {
        color: theme.palette.text.primary,
        backgroundColor: darken(theme.palette.background.paper, 0.05),
      },
      "&:focus > $treeItemLabelIcon": {
        color: theme.palette.text.primary,
      },
    },
    treeItemContent: {
      "cursor": "default",
      "color": theme.palette.text.primary,
      // paddingLeft: theme.spacing(1),
      // paddingRight: theme.spacing(1),
      "userSelect": "none",
      "fontWeight": theme.typography.fontWeightMedium,
      "$treeItemExpanded > &": {
        fontWeight: theme.typography.fontWeightRegular,
      },
    },
    treeItemGroup: {
      "marginLeft": 0,
      "& $treeItemContent": {
        // paddingLeft: theme.spacing(2)
      },
    },
    treeItemExpanded: {},
    treeItemLabel: {
      fontWeight: "inherit",
      color: "inherit",
      backgroundColor: "transparent !important",
    },
    treeItemLabelRoot: {
      display: "flex",
      alignItems: "center",
      padding: theme.spacing(1, 0),
    },
    treeItemLabelIcon: {},
    treeItemLabelText: {
      paddingLeft: "12px",
      flexGrow: 1,
    },
  }),
);

interface Props {
  notebook: Notebook;
}
export default function NotebookTreeView(props: Props) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [
    notebookConfigurationDialogOpen,
    setNotebookConfigurationDialogOpen,
  ] = useState<boolean>(false);
  const [pushNotebookDialogOpen, setPushNotebookDialogOpen] = useState<boolean>(
    false,
  );
  const [favoritedNotes, setFavoritedNotes] = useState<Note[]>([]);
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const { t } = useTranslation();

  const refreshQuickAccessNotes = useCallback((notes: Notes) => {
    const favoritedNotes = [];
    for (let filePath in notes) {
      const note = notes[filePath];
      if (note.config.favorited) {
        favoritedNotes.push(note);
      }
    }
    setFavoritedNotes(favoritedNotes);
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<{}>, nodes: string[]) => {
      event.stopPropagation();
      const element = event.target as HTMLElement;
      if (
        element &&
        element.tagName &&
        element.tagName.toUpperCase().match(/^(SVG|PATH|BUTTON)$/)
      ) {
        props.notebook
          .refreshNotesInNotLoaded({
            dir: "./",
            includeSubdirectories: true,
          })
          .then((notes) => {
            refreshQuickAccessNotes(notes);
          });
        setExpanded(nodes);
      }
    },
    [props.notebook, refreshQuickAccessNotes],
  );

  // Emitter
  useEffect(() => {
    if (globalEmitter) {
      const modifiedMarkdownCallback = (data: ModifiedMarkdownEventData) => {
        if (!(data.noteFilePath in props.notebook.notes)) {
          return;
        }
        refreshQuickAccessNotes(props.notebook.notes);
      };
      globalEmitter.on(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
      return () => {
        globalEmitter.off(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
      };
    }
  }, [props.notebook, refreshQuickAccessNotes]);

  useEffect(() => {
    if (crossnoteContainer.homeSection !== HomeSection.Notebooks) {
      setExpanded([]);
    }
  }, [crossnoteContainer.homeSection]);

  useEffect(() => {
    refreshQuickAccessNotes(props.notebook.notes);
  }, [props.notebook, refreshQuickAccessNotes]);

  /*
  useEffect(() => {
    if (crossnoteContainer.selectedNotebook !== props.notebook) {
      setExpanded([]);
    }
  }, [crossnoteContainer.selectedNotebook, props.notebook]);
  */

  return (
    <React.Fragment>
      <TreeView
        defaultExpandIcon={
          <IconButton
            disableFocusRipple={true}
            disableRipple={true}
            size={"medium"}
          >
            <ChevronRight></ChevronRight>
          </IconButton>
        }
        defaultCollapseIcon={
          <IconButton
            disableFocusRipple={true}
            disableRipple={true}
            size={"medium"}
          >
            <ChevronDown></ChevronDown>
          </IconButton>
        }
        defaultEndIcon={<div style={{ width: 24 }} />}
        expanded={expanded}
        onNodeToggle={handleChange}
        style={{ width: "100%" }}
      >
        <TreeItem
          nodeId={"notes"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            expanded: classes.treeItemExpanded,
            group: classes.treeItemGroup,
            label: classes.treeItemLabel,
          }}
          label={
            <Box
              onClick={() => {
                props.notebook
                  .refreshNotesInNotLoaded({
                    dir: "./",
                    includeSubdirectories: true,
                  })
                  .then((notes) => {
                    refreshQuickAccessNotes(notes);
                  });
              }}
              className={clsx(classes.treeItemLabelRoot)}
            >
              <Typography
                color={"inherit"}
                variant={"body1"}
                className={clsx(classes.treeItemLabelText)}
              >
                {props.notebook.name +
                  (props.notebook.localSha === props.notebook.remoteSha
                    ? ""
                    : " 🔔")}
              </Typography>
            </Box>
          }
        >
          <TreeItem
            nodeId={"today-notes"}
            classes={{
              root: classes.treeItemRoot,
              content: classes.treeItemContent,
              expanded: classes.treeItemExpanded,
              group: classes.treeItemGroup,
              label: classes.treeItemLabel,
            }}
            label={
              <Box
                onClick={() => {
                  crossnoteContainer.openTodayNote(props.notebook);
                }}
                className={clsx(classes.treeItemLabelRoot)}
              >
                <span role="img" aria-label="today-notes">
                  {"📅"}
                </span>
                <Typography className={clsx(classes.treeItemLabelText)}>
                  {t("general/today")}
                </Typography>
              </Box>
            }
          ></TreeItem>
          <TreeItem
            nodeId={"graph-view"}
            classes={{
              root: classes.treeItemRoot,
              content: classes.treeItemContent,
              expanded: classes.treeItemExpanded,
              group: classes.treeItemGroup,
              label: classes.treeItemLabel,
            }}
            label={
              <Box
                onClick={() => {
                  crossnoteContainer.addTabNode({
                    type: "tab",
                    component: "Graph",
                    id: "Graph: " + props.notebook.dir,
                    name: t("general/graph-view"),
                    config: {
                      singleton: true,
                      notebook: props.notebook,
                    },
                  });
                }}
                className={clsx(classes.treeItemLabelRoot)}
              >
                <span role="img" aria-label="todo-notes">
                  {"🕸"}
                </span>
                <Typography className={clsx(classes.treeItemLabelText)}>
                  {t("general/graph-view")}
                </Typography>
              </Box>
            }
          ></TreeItem>
          {/*
        <TreeItem
          nodeId={"todo-notes"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            expanded: classes.treeItemExpanded,
            group: classes.treeItemGroup,
            label: classes.treeItemLabel,
          }}
          label={
            <Box
              onClick={() => {
                crossnoteContainer.addTabNode({
                  type: "tab",
                  component: "Todo",
                  id: "Todo: " + props.notebook.dir,
                  name: t("general/todo"),
                  config: {
                    singleton: true,
                    notebook: props.notebook,
                  },
                });
              }}
              className={clsx(classes.treeItemLabelRoot)}
            >
              <span role="img" aria-label="todo-notes">
                {"☑️"}
              </span>
              <Typography className={clsx(classes.treeItemLabelText)}>
                {t("general/todo")}
              </Typography>
            </Box>
          }
        ></TreeItem>*/}
          <TreeItem
            nodeId={"all-notes"}
            classes={{
              root: classes.treeItemRoot,
              content: classes.treeItemContent,
              expanded: classes.treeItemExpanded,
              group: classes.treeItemGroup,
              label: classes.treeItemLabel,
            }}
            label={
              <Box
                onClick={() => {
                  crossnoteContainer.addTabNode({
                    type: "tab",
                    component: "Notes",
                    id: "Notes: " + props.notebook.dir,
                    name: "📔 " + props.notebook.name,
                    config: {
                      singleton: true,
                      notebook: props.notebook,
                    },
                  });
                }}
                className={clsx(classes.treeItemLabelRoot)}
              >
                <span role="img" aria-label="Notes">
                  {"📔"}
                </span>
                <Typography className={clsx(classes.treeItemLabelText)}>
                  {t("general/notes")}
                </Typography>
              </Box>
            }
          ></TreeItem>
          {favoritedNotes.map((note) => {
            return (
              <TreeItem
                key={`${note.notebookPath}/${note.filePath}`}
                nodeId={`${note.notebookPath}/${note.filePath}`}
                classes={{
                  root: classes.treeItemRoot,
                  content: classes.treeItemContent,
                  expanded: classes.treeItemExpanded,
                  group: classes.treeItemGroup,
                  label: classes.treeItemLabel,
                }}
                label={
                  <Box
                    onClick={() => {
                      crossnoteContainer.addTabNode({
                        type: "tab",
                        component: "Note",
                        config: {
                          singleton: false,
                          note,
                        },
                        name: `📝 ` + note.title,
                      });
                    }}
                    className={clsx(classes.treeItemLabelRoot)}
                  >
                    <span role="img" aria-label="quick-access">
                      {"⭐️"}
                    </span>
                    <Typography className={clsx(classes.treeItemLabelText)}>
                      {note.title}
                    </Typography>
                  </Box>
                }
              ></TreeItem>
            );
          })}
          <TreeItem
            nodeId={"settings"}
            classes={{
              root: classes.treeItemRoot,
              content: classes.treeItemContent,
              expanded: classes.treeItemExpanded,
              group: classes.treeItemGroup,
              label: classes.treeItemLabel,
            }}
            label={
              <Box
                onClick={() => setNotebookConfigurationDialogOpen(true)}
                className={clsx(classes.treeItemLabelRoot)}
              >
                <span role="img" aria-label={t("general/Settings")}>
                  {"⚙️"}
                </span>
                <Typography className={clsx(classes.treeItemLabelText)}>
                  {t("general/Settings")}
                </Typography>
              </Box>
            }
          ></TreeItem>
          {props.notebook.gitURL && (
            <TreeItem
              nodeId={"upload"}
              classes={{
                root: classes.treeItemRoot,
                content: classes.treeItemContent,
                expanded: classes.treeItemExpanded,
                group: classes.treeItemGroup,
                label: classes.treeItemLabel,
              }}
              label={
                <Box
                  onClick={() => setNotebookConfigurationDialogOpen(true)}
                  className={clsx(classes.treeItemLabelRoot)}
                >
                  <span role="img" aria-label={t("general/Upload")}>
                    {"📤"}
                  </span>
                  <Tooltip title={t("general/upload-push")}>
                    <Typography className={clsx(classes.treeItemLabelText)}>
                      {t("general/Upload")}
                    </Typography>
                  </Tooltip>
                </Box>
              }
            ></TreeItem>
          )}
          {props.notebook.gitURL && (
            <TreeItem
              nodeId={"download"}
              classes={{
                root: classes.treeItemRoot,
                content: classes.treeItemContent,
                expanded: classes.treeItemExpanded,
                group: classes.treeItemGroup,
                label: classes.treeItemLabel,
              }}
              label={
                <Box
                  onClick={() => setPushNotebookDialogOpen(true)}
                  className={clsx(classes.treeItemLabelRoot)}
                >
                  <span role="img" aria-label={t("general/Download")}>
                    {"📥"}
                  </span>
                  <Tooltip title={t("general/download-pull")}>
                    <Typography className={clsx(classes.treeItemLabelText)}>
                      {t("general/Download")}
                    </Typography>
                  </Tooltip>
                </Box>
              }
            ></TreeItem>
          )}
          {/*<TreeItem
          nodeId={"conflicted-notes"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            expanded: classes.treeItemExpanded,
            group: classes.treeItemGroup,
            label: classes.treeItemLabel,
          }}
          label={
            <Box
              onClick={() => {
                crossnoteContainer.addTabNode({
                  type: "tab",
                  component: "Conflicted",
                  id: "Conflicted: " + props.notebook.dir,
                  name: t("general/conflicted"),
                  config: {
                    singleton: true,
                    notebook: props.notebook,
                  },
                });
              }}
              className={clsx(classes.treeItemLabelRoot)}
            >
              <span role="img" aria-label="conflicted-notes">
                {"⚠️"}
              </span>
              <Typography className={clsx(classes.treeItemLabelText)}>
                {t("general/conflicted")}
              </Typography>
            </Box>
          }
        ></TreeItem>
        */}
        </TreeItem>
      </TreeView>
      <ConfigureNotebookDialog
        open={notebookConfigurationDialogOpen}
        onClose={() => setNotebookConfigurationDialogOpen(false)}
        notebook={props.notebook}
      ></ConfigureNotebookDialog>
      <PushNotebookDialog
        notebook={props.notebook}
        open={pushNotebookDialogOpen}
        onClose={() => setPushNotebookDialogOpen(false)}
      ></PushNotebookDialog>
    </React.Fragment>
  );
}
