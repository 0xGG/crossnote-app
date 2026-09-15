import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { darken, styled } from "@mui/material/styles";
import { SimpleTreeView, TreeItem, treeItemClasses } from "@mui/x-tree-view";
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

// Every tree item here passed the same four slot classes, so those four rules
// move onto one styled component and address the slots by their own names.
const NotebookTreeItem = styled(TreeItem)(({ theme }) => ({
  paddingLeft: "4px",
  // color: theme.palette.text.secondary,
  [`&:focus > .${treeItemClasses.content}`]: {
    color: theme.palette.text.primary,
    backgroundColor: darken(theme.palette.background.paper, 0.05),
  },
  [`& > .${treeItemClasses.content}`]: {
    // v4 carried the indentation on each group's margin, which this file
    // zeroed out so every row sits flush in the 200px drawer. v9 moved the
    // indentation, the padding and a gap onto the content element itself,
    // which costs the label 33px and clips whatever sits at its end.
    "padding": 0,
    "gap": 0,
    "cursor": "default",
    "color": theme.palette.text.primary,
    "userSelect": "none",
    "fontWeight": theme.typography.fontWeightMedium,
    "&[data-expanded]": {
      fontWeight: theme.typography.fontWeightRegular,
    },
  },
  [`& > .${treeItemClasses.groupTransition}`]: {
    marginLeft: 0,
  },
  [`& > .${treeItemClasses.content} > .${treeItemClasses.label}`]: {
    fontWeight: "inherit",
    color: "inherit",
    backgroundColor: "transparent !important",
  },
}));

const LabelRoot = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(1, 0),
}));

const LabelText = styled(Typography)({
  paddingLeft: "12px",
  flexGrow: 1,
});

const EmojiIcon = styled("span")({
  top: "2px",
  position: "relative",
});

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
        <NotebookTreeItem
          itemId={"notes"}
          label={
            <LabelRoot
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
            >
              <LabelText
                color={"inherit"}
                variant={"body1"}
                style={{ paddingLeft: "4px" }}
              >
                <EmojiIcon role="img" style={{ paddingRight: "8px" }}>
                  {props.notebook.isLocal ? (
                    <Emoji emoji={":card_index_dividers:"} size={16}></Emoji>
                  ) : props.notebook.localSha === props.notebook.remoteSha ? (
                    <Emoji emoji={":cloud:"} size={16}></Emoji>
                  ) : (
                    <Emoji emoji={":bell:"} size={16}></Emoji>
                  )}
                </EmojiIcon>
                {props.notebook.name}
              </LabelText>
            </LabelRoot>
          }
        >
          <NotebookTreeItem
            itemId={"today-notes"}
            label={
              <LabelRoot
                onClick={() => {
                  crossnoteContainer.openTodayNote(props.notebook);
                  props.onCloseDrawer();
                }}
              >
                <EmojiIcon role="img" aria-label="today-notes">
                  <Emoji emoji={":calendar:"} size={16}></Emoji>
                </EmojiIcon>
                <LabelText>{t("general/today")}</LabelText>
              </LabelRoot>
            }
          ></NotebookTreeItem>
          <NotebookTreeItem
            itemId={"graph-view"}
            label={
              <LabelRoot
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
              >
                <EmojiIcon role="img" aria-label="todo-notes">
                  <Emoji emoji={":spider_web:"} size={16}></Emoji>
                </EmojiIcon>
                <LabelText>{t("general/graph-view")}</LabelText>
              </LabelRoot>
            }
          ></NotebookTreeItem>
          <NotebookTreeItem
            itemId={"all-notes"}
            label={
              <LabelRoot
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
              >
                <EmojiIcon role="img" aria-label="Notes">
                  <Emoji
                    emoji={":notebook_with_decorative_cover:"}
                    size={16}
                  ></Emoji>
                </EmojiIcon>
                <LabelText>{t("general/notes")}</LabelText>
              </LabelRoot>
            }
          ></NotebookTreeItem>
          {Object.values(favoritedNotes).map((note) => {
            return (
              <NotebookTreeItem
                key={`${note.notebookPath}/${note.filePath}`}
                itemId={`${note.notebookPath}/${note.filePath}`}
                label={
                  <LabelRoot
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
                  >
                    <EmojiIcon role="img" aria-label="quick-access">
                      <Emoji emoji={getNoteIcon(note)} size={16}></Emoji>
                    </EmojiIcon>
                    <LabelText>{note.title}</LabelText>
                    <Chip
                      size={"small"}
                      variant={"outlined"}
                      style={{ marginRight: "4px" }}
                      label={props.notebook.referenceMap.getReferredByNotesCount(
                        note.filePath,
                      )}
                    ></Chip>
                  </LabelRoot>
                }
              ></NotebookTreeItem>
            );
          })}
          <NotebookTreeItem
            itemId={"settings"}
            label={
              <LabelRoot
                onClick={() => setNotebookConfigurationDialogOpen(true)}
              >
                <EmojiIcon role="img" aria-label={t("general/Settings")}>
                  <Emoji emoji={":gear:"} size={16}></Emoji>
                </EmojiIcon>
                <LabelText>{t("general/Settings")}</LabelText>
              </LabelRoot>
            }
          ></NotebookTreeItem>
          {props.notebook.gitURL && (
            <NotebookTreeItem
              itemId={"upload"}
              label={
                <LabelRoot onClick={() => setPushNotebookDialogOpen(true)}>
                  <EmojiIcon role="img" aria-label={t("general/Upload")}>
                    <Emoji emoji={":outbox_tray:"} size={16}></Emoji>
                  </EmojiIcon>
                  <Tooltip title={t("general/upload-push")}>
                    <LabelText>{t("general/Upload")}</LabelText>
                  </Tooltip>
                </LabelRoot>
              }
            ></NotebookTreeItem>
          )}
          {props.notebook.isLocal && (
            <NotebookTreeItem
              itemId={"reload"}
              label={
                <LabelRoot
                  onClick={() =>
                    crossnoteContainer.refreshNotebook(props.notebook)
                  }
                >
                  <EmojiIcon role="img" aria-label={t("general/refresh")}>
                    <Emoji
                      emoji={":arrows_counterclockwise:"}
                      size={16}
                    ></Emoji>
                  </EmojiIcon>
                  <Tooltip title={t("general/refresh")}>
                    <LabelText>{t("general/refresh")}</LabelText>
                  </Tooltip>
                </LabelRoot>
              }
            ></NotebookTreeItem>
          )}
          {props.notebook.gitURL && (
            <NotebookTreeItem
              itemId={"download"}
              label={
                <LabelRoot
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
                  sx={
                    crossnoteContainer.isPullingNotebook ||
                    crossnoteContainer.isPushingNotebook
                      ? { color: "text.disabled" }
                      : undefined
                  }
                >
                  <EmojiIcon role="img" aria-label={t("general/Download")}>
                    <Emoji emoji={":inbox_tray:"} size={16}></Emoji>
                  </EmojiIcon>
                  <Tooltip title={t("general/download-pull")}>
                    <LabelText>{t("general/Download")}</LabelText>
                  </Tooltip>
                </LabelRoot>
              }
            ></NotebookTreeItem>
          )}
          {/*<NotebookTreeItem
          itemId={"conflicted-notes"}
          label={
            <LabelRoot
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
            >
              <span role="img" aria-label="conflicted-notes">
                {"⚠️"}
              </span>
              <LabelText>
                {t("general/conflicted")}
              </LabelText>
            </LabelRoot>
          }
        ></NotebookTreeItem>
        */}
        </NotebookTreeItem>
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
