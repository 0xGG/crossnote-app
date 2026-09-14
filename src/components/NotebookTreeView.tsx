import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { Theme, darken } from "@mui/material/styles";
import { SimpleTreeView, TreeItem } from "@mui/x-tree-view";
import { makeStyles } from "tss-react/mui";
import clsx from "clsx";
import { ChevronDown, ChevronRight } from "mdi-material-ui";
import Noty from "noty";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import {
  ChangedNoteFilePathEventData,
  DeletedNoteEventData,
  EventType,
  globalEmitter,
  ModifiedMarkdownEventData,
  PerformedGitOperationEventData,
} from "../lib/event";
import { getNoteIcon, Notes } from "../lib/note";
import { Notebook } from "../lib/notebook";
import ConfigureNotebookDialog from "./ConfigureNotebookDialog";
import { Emoji } from "./EmojiWrapper";
import PushNotebookDialog from "./PushNotebookDialog";

const useStyles = makeStyles<void, "treeItemContent">()(
  (theme: Theme, _params, classes) => ({
    treeItemRoot: {
      paddingLeft: "4px",
      // color: theme.palette.text.secondary,
      [`&:focus > .${classes.treeItemContent}`]: {
        color: theme.palette.text.primary,
        backgroundColor: darken(theme.palette.background.paper, 0.05),
      },
    },
    treeItemContent: {
      // v4 carried the indentation on each group's margin, which this file
      // zeroed out so every row sits flush in the 200px drawer. v9 moved the
      // indentation, the padding and a gap onto the content element itself,
      // which costs the label 33px and clips whatever sits at its end.
      "padding": 0,
      "gap": 0,
      "cursor": "default",
      "color": theme.palette.text.primary,
      "userSelect": "none",
      "fontWeight": theme.typography.fontWeightMedium as any,
      "&[data-expanded]": {
        fontWeight: theme.typography.fontWeightRegular as any,
      },
    },
    treeItemGroup: {
      marginLeft: 0,
    },
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
    treeItemLabelText: {
      paddingLeft: "12px",
      flexGrow: 1,
    },
    disabled: {
      color: theme.palette.text.disabled,
    },
    emojiIcon: {
      top: "2px",
      position: "relative",
    },
  }),
);

interface Props {
  notebook: Notebook;
  onCloseDrawer: () => void;
}
function ExpandIcon() {
  const { t } = useTranslation();
  return (
    <IconButton
      aria-label={t("general/expand")}
      disableFocusRipple={true}
      disableRipple={true}
      size={"medium"}
    >
      <ChevronRight></ChevronRight>
    </IconButton>
  );
}

function CollapseIcon() {
  const { t } = useTranslation();
  return (
    <IconButton
      aria-label={t("general/collapse")}
      disableFocusRipple={true}
      disableRipple={true}
      size={"medium"}
    >
      <ChevronDown></ChevronDown>
    </IconButton>
  );
}

function EndIcon() {
  return <div style={{ width: 24 }} />;
}

export default function NotebookTreeView(props: Props) {
  const { classes } = useStyles();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [notebookConfigurationDialogOpen, setNotebookConfigurationDialogOpen] =
    useState<boolean>(false);
  const [pushNotebookDialogOpen, setPushNotebookDialogOpen] =
    useState<boolean>(false);
  const [favoritedNotes, setFavoritedNotes] = useState<Notes>({});
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const { t } = useTranslation();

  const refreshQuickAccessNotes = useCallback((notes: Notes) => {
    const favoritedNotes: Notes = {};
    for (let filePath in notes) {
      const note = notes[filePath];
      if (note.config.favorited) {
        favoritedNotes[note.filePath] = note;
      }
    }
    setFavoritedNotes(favoritedNotes);
  }, []);

  const handleChange = useCallback(
    (event: React.SyntheticEvent | null, nodes: string[]) => {
      if (!event) {
        return;
      }
      event.stopPropagation();
      const element = event.target as HTMLElement;
      if (
        element &&
        element.tagName &&
        element.tagName.toUpperCase().match(/^(SVG|PATH|BUTTON)$/)
      ) {
        props.notebook
          .refreshNotesIfNotLoaded({
            dir: "./",
            includeSubdirectories: true,
          })
          .then((notes) => {
            refreshQuickAccessNotes(notes);
            globalEmitter.emit(EventType.PerformedGitOperation, {
              notebookPath: props.notebook.dir,
            });
          })
          .catch((error) => {
            console.error(error);
          });

        setExpanded(nodes);
      }
    },
    [props.notebook, refreshQuickAccessNotes],
  );

  // Emitter
  useEffect(() => {
    const modifiedMarkdownCallback = (data: ModifiedMarkdownEventData) => {
      if (!(data.noteFilePath in props.notebook.notes)) {
        return;
      }
      const isFavorited = data.noteFilePath in favoritedNotes;
      if (data.noteConfig.favorited !== isFavorited) {
        refreshQuickAccessNotes(props.notebook.notes);
      } else if (isFavorited) {
        const oNote = favoritedNotes[data.noteFilePath];
        const nNote = props.notebook.notes[data.noteFilePath];
        if (oNote.config.icon !== nNote.config.icon) {
          refreshQuickAccessNotes(props.notebook.notes);
        }
      }
      // refreshQuickAccessNotes(props.notebook.notes);
    };
    const deletedNoteCallback = (data: DeletedNoteEventData) => {
      if (props.notebook.dir === data.notebookPath) {
        refreshQuickAccessNotes(props.notebook.notes);
      }
    };
    const changedNoteFilePathCallback = (
      data: ChangedNoteFilePathEventData,
    ) => {
      if (props.notebook.dir === data.notebookPath) {
        refreshQuickAccessNotes(props.notebook.notes);
      }
    };
    const performedGitOperationCallback = (
      data: PerformedGitOperationEventData,
    ) => {
      if (props.notebook.dir === data.notebookPath) {
        refreshQuickAccessNotes(props.notebook.notes);
      }
    };

    if (globalEmitter) {
      globalEmitter.on(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
      globalEmitter.on(EventType.DeletedNote, deletedNoteCallback);
      globalEmitter.on(
        EventType.ChangedNoteFilePath,
        changedNoteFilePathCallback,
      );
      globalEmitter.on(
        EventType.PerformedGitOperation,
        performedGitOperationCallback,
      );
    }

    return () => {
      if (globalEmitter) {
        globalEmitter.off(EventType.ModifiedMarkdown, modifiedMarkdownCallback);
        globalEmitter.off(EventType.DeletedNote, deletedNoteCallback);
        globalEmitter.off(
          EventType.ChangedNoteFilePath,
          changedNoteFilePathCallback,
        );
        globalEmitter.off(
          EventType.PerformedGitOperation,
          performedGitOperationCallback,
        );
      }
    };
  }, [props.notebook, refreshQuickAccessNotes, favoritedNotes]);

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
      <SimpleTreeView
        slots={{
          expandIcon: ExpandIcon,
          collapseIcon: CollapseIcon,
          endIcon: EndIcon,
        }}
        expandedItems={expanded}
        onExpandedItemsChange={handleChange}
        style={{ width: "100%" }}
      >
        <TreeItem
          itemId={"notes"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            groupTransition: classes.treeItemGroup,
            label: classes.treeItemLabel,
          }}
          label={
            <Box
              onClick={() => {
                props.notebook
                  .refreshNotesIfNotLoaded({
                    dir: "./",
                    includeSubdirectories: true,
                  })
                  .then((notes) => {
                    refreshQuickAccessNotes(notes);
                    globalEmitter.emit(EventType.PerformedGitOperation, {
                      notebookPath: props.notebook.dir,
                    });
                  })
                  .catch((error) => {
                    console.error(error);
                  });
              }}
              className={clsx(classes.treeItemLabelRoot)}
            >
              <Typography
                color={"inherit"}
                variant={"body1"}
                className={clsx(classes.treeItemLabelText)}
                style={{ paddingLeft: "4px" }}
              >
                <span
                  role="img"
                  className={clsx(classes.emojiIcon)}
                  style={{ paddingRight: "8px" }}
                >
                  {props.notebook.isLocal ? (
                    <Emoji emoji={":card_index_dividers:"} size={16}></Emoji>
                  ) : props.notebook.localSha === props.notebook.remoteSha ? (
                    <Emoji emoji={":cloud:"} size={16}></Emoji>
                  ) : (
                    <Emoji emoji={":bell:"} size={16}></Emoji>
                  )}
                </span>
                {props.notebook.name}
              </Typography>
            </Box>
          }
        >
          <TreeItem
            itemId={"today-notes"}
            classes={{
              root: classes.treeItemRoot,
              content: classes.treeItemContent,
              groupTransition: classes.treeItemGroup,
              label: classes.treeItemLabel,
            }}
            label={
              <Box
                onClick={() => {
                  crossnoteContainer.openTodayNote(props.notebook);
                  props.onCloseDrawer();
                }}
                className={clsx(classes.treeItemLabelRoot)}
              >
                <span
                  role="img"
                  className={clsx(classes.emojiIcon)}
                  aria-label="today-notes"
                >
                  <Emoji emoji={":calendar:"} size={16}></Emoji>
                </span>
                <Typography className={clsx(classes.treeItemLabelText)}>
                  {t("general/today")}
                </Typography>
              </Box>
            }
          ></TreeItem>
          <TreeItem
            itemId={"graph-view"}
            classes={{
              root: classes.treeItemRoot,
              content: classes.treeItemContent,
              groupTransition: classes.treeItemGroup,
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
                      component: "Graph",
                      singleton: true,
                      notebookPath: props.notebook.dir,
                      icon: ":spider_web:",
                    },
                  });
                  props.onCloseDrawer();
                }}
                className={clsx(classes.treeItemLabelRoot)}
              >
                <span
                  role="img"
                  className={clsx(classes.emojiIcon)}
                  aria-label="todo-notes"
                >
                  <Emoji emoji={":spider_web:"} size={16}></Emoji>
                </span>
                <Typography className={clsx(classes.treeItemLabelText)}>
                  {t("general/graph-view")}
                </Typography>
              </Box>
            }
          ></TreeItem>
          <TreeItem
            itemId={"all-notes"}
            classes={{
              root: classes.treeItemRoot,
              content: classes.treeItemContent,
              groupTransition: classes.treeItemGroup,
              label: classes.treeItemLabel,
            }}
            label={
              <Box
                onClick={() => {
                  crossnoteContainer.addTabNode({
                    type: "tab",
                    component: "Notes",
                    id: "Notes: " + props.notebook.dir,
                    name: props.notebook.name,
                    config: {
                      component: "Notes",
                      singleton: true,
                      notebookPath: props.notebook.dir,
                      icon: ":notebook_with_decorative_cover:",
                    },
                  });
                  props.onCloseDrawer();
                }}
                className={clsx(classes.treeItemLabelRoot)}
              >
                <span
                  role="img"
                  className={clsx(classes.emojiIcon)}
                  aria-label="Notes"
                >
                  <Emoji
                    emoji={":notebook_with_decorative_cover:"}
                    size={16}
                  ></Emoji>
                </span>
                <Typography className={clsx(classes.treeItemLabelText)}>
                  {t("general/notes")}
                </Typography>
              </Box>
            }
          ></TreeItem>
          {Object.values(favoritedNotes).map((note) => {
            return (
              <TreeItem
                key={`${note.notebookPath}/${note.filePath}`}
                itemId={`${note.notebookPath}/${note.filePath}`}
                classes={{
                  root: classes.treeItemRoot,
                  content: classes.treeItemContent,
                  groupTransition: classes.treeItemGroup,
                  label: classes.treeItemLabel,
                }}
                label={
                  <Box
                    onClick={() => {
                      crossnoteContainer.addTabNode({
                        type: "tab",
                        component: "Note",
                        config: {
                          component: "Note",
                          singleton: false,
                          noteFilePath: note.filePath,
                          notebookPath: props.notebook.dir,
                          icon: getNoteIcon(note),
                        },
                        name: note.title,
                      });
                      props.onCloseDrawer();
                    }}
                    className={clsx(classes.treeItemLabelRoot)}
                  >
                    <span
                      role="img"
                      className={clsx(classes.emojiIcon)}
                      aria-label="quick-access"
                    >
                      <Emoji emoji={getNoteIcon(note)} size={16}></Emoji>
                    </span>
                    <Typography className={clsx(classes.treeItemLabelText)}>
                      {note.title}
                    </Typography>
                    <Chip
                      size={"small"}
                      variant={"outlined"}
                      style={{ marginRight: "4px" }}
                      label={props.notebook.referenceMap.getReferredByNotesCount(
                        note.filePath,
                      )}
                    ></Chip>
                  </Box>
                }
              ></TreeItem>
            );
          })}
          <TreeItem
            itemId={"settings"}
            classes={{
              root: classes.treeItemRoot,
              content: classes.treeItemContent,
              groupTransition: classes.treeItemGroup,
              label: classes.treeItemLabel,
            }}
            label={
              <Box
                onClick={() => setNotebookConfigurationDialogOpen(true)}
                className={clsx(classes.treeItemLabelRoot)}
              >
                <span
                  role="img"
                  className={clsx(classes.emojiIcon)}
                  aria-label={t("general/Settings")}
                >
                  <Emoji emoji={":gear:"} size={16}></Emoji>
                </span>
                <Typography className={clsx(classes.treeItemLabelText)}>
                  {t("general/Settings")}
                </Typography>
              </Box>
            }
          ></TreeItem>
          {props.notebook.gitURL && (
            <TreeItem
              itemId={"upload"}
              classes={{
                root: classes.treeItemRoot,
                content: classes.treeItemContent,
                groupTransition: classes.treeItemGroup,
                label: classes.treeItemLabel,
              }}
              label={
                <Box
                  onClick={() => setPushNotebookDialogOpen(true)}
                  className={clsx(classes.treeItemLabelRoot)}
                >
                  <span
                    role="img"
                    className={clsx(classes.emojiIcon)}
                    aria-label={t("general/Upload")}
                  >
                    <Emoji emoji={":outbox_tray:"} size={16}></Emoji>
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
          {props.notebook.isLocal && (
            <TreeItem
              itemId={"reload"}
              classes={{
                root: classes.treeItemRoot,
                content: classes.treeItemContent,
                groupTransition: classes.treeItemGroup,
                label: classes.treeItemLabel,
              }}
              label={
                <Box
                  onClick={() =>
                    crossnoteContainer.refreshNotebook(props.notebook)
                  }
                  className={clsx(classes.treeItemLabelRoot)}
                >
                  <span
                    role="img"
                    className={clsx(classes.emojiIcon)}
                    aria-label={t("general/refresh")}
                  >
                    <Emoji
                      emoji={":arrows_counterclockwise:"}
                      size={16}
                    ></Emoji>
                  </span>
                  <Tooltip title={t("general/refresh")}>
                    <Typography className={clsx(classes.treeItemLabelText)}>
                      {t("general/refresh")}
                    </Typography>
                  </Tooltip>
                </Box>
              }
            ></TreeItem>
          )}
          {props.notebook.gitURL && (
            <TreeItem
              itemId={"download"}
              classes={{
                root: classes.treeItemRoot,
                content: classes.treeItemContent,
                groupTransition: classes.treeItemGroup,
                label: classes.treeItemLabel,
              }}
              label={
                <Box
                  onClick={() => {
                    if (
                      crossnoteContainer.isPullingNotebook ||
                      crossnoteContainer.isPushingNotebook
                    ) {
                      return;
                    }
                    crossnoteContainer
                      .pullNotebook({
                        notebook: props.notebook,
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
                  }}
                  className={clsx(
                    classes.treeItemLabelRoot,
                    crossnoteContainer.isPullingNotebook ||
                      crossnoteContainer.isPushingNotebook
                      ? classes.disabled
                      : null,
                  )}
                >
                  <span
                    role="img"
                    className={clsx(classes.emojiIcon)}
                    aria-label={t("general/Download")}
                  >
                    <Emoji emoji={":inbox_tray:"} size={16}></Emoji>
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
          itemId={"conflicted-notes"}
          classes={{
            root: classes.treeItemRoot,
            content: classes.treeItemContent,
            groupTransition: classes.treeItemGroup,
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
      </SimpleTreeView>
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
