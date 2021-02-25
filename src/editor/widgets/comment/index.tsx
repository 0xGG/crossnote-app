import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  Tooltip,
  Typography,
} from "@material-ui/core";
import {
  createStyles,
  darken,
  makeStyles,
  Theme,
  ThemeProvider,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { Emoji, Picker as EmojiPicker } from "emoji-mart";
import "emoji-mart/css/emoji-mart.css";
import { CommentOutline, StickerEmoji } from "mdi-material-ui";
import Noty from "noty";
import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { Provider } from "urql";
import { globalContainers } from "../../../containers/global";
import {
  CommentWidgetFieldsFragment,
  useAddReactionToCommentWidgetMutation,
  useCommentWidgetQuery,
  useCreateCommentWidgetMutation,
  useRemoveReactionFromCommentWidgetMutation,
} from "../../../generated/graphql";
import { Note } from "../../../lib/note";
import { GraphQLClient } from "../../../utilities/client";
import { getHeaderFromMarkdown } from "../../../utilities/note";
import { WidgetTopPanel } from "../widget/WidgetTopPanel";
import { CommentDialog } from "./CommentDialog";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    commentWidget: {
      position: "relative",
      // backgroundColor: theme.palette.grey[100],
      backgroundColor: darken(theme.palette.background.paper, 0.05),
    },
    topPanel: {
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(1),
    },
    interactionPanel: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
    button: {},
    reactionChip: {
      "marginBottom": "2px",
      "&:hover": {
        cursor: "pointer",
      },
    },
  }),
);

function CommentWidget(props: WidgetArgs) {
  const classes = useStyles(props);
  const widgetID = props.attributes["id"];
  const editor = props.editor;
  const { t } = useTranslation();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState<boolean>(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState<boolean>(false);
  const [forceUpdate, setForceUpdate] = useState<number>(Date.now());
  const [
    resCreateCommentWidget,
    executeCreateCommentWidgetMutation,
  ] = useCreateCommentWidgetMutation();
  const [resCommentWidget, executeCommentWidgetQuery] = useCommentWidgetQuery({
    requestPolicy: "network-only",
    pause: true,
    variables: {
      widgetID,
    },
  });
  const [
    resAddReactionToCommentWidget,
    executeAddReactionToCommentWidgetMutation,
  ] = useAddReactionToCommentWidgetMutation();
  const [
    resRemoveReactionFromCommentWidget,
    executeRemoveReactionFromCommentWidgetMutation,
  ] = useRemoveReactionFromCommentWidgetMutation();
  const [commentWidget, setCommentWidget] = useState<
    CommentWidgetFieldsFragment
  >(null);

  const updateReactionSummaries = useCallback(
    (reaction: string) => {
      if (!commentWidget) {
        return;
      }
      let found = false;
      for (
        let i = 0;
        i < commentWidget.instance.commentWidget.reactionSummaries.length;
        i++
      ) {
        if (
          commentWidget.instance.commentWidget.reactionSummaries[i].reaction ===
          reaction
        ) {
          found = true;
          commentWidget.instance.commentWidget.reactionSummaries[i].count += 1;
          commentWidget.instance.commentWidget.reactionSummaries[
            i
          ].selfAuthored = true;
          break;
        }
      }
      if (!found) {
        commentWidget.instance.commentWidget.reactionSummaries = [
          {
            reaction: reaction,
            count: 1,
            selfAuthored: true,
          },
          ...commentWidget.instance.commentWidget.reactionSummaries,
        ];
        commentWidget.instance.commentWidget.reactionsCount += 1;
      }
      setForceUpdate(Date.now());
    },
    [commentWidget],
  );

  // Create comment widget
  useEffect(() => {
    if (widgetID || props.isPreview) {
      return;
    }
    if (resCreateCommentWidget.error) {
      // TODO: Either user not logged in or server failed to create the widget
      new Noty({
        type: "error",
        text: t("error/failed-to-create-widget"),
        layout: "topRight",
        theme: "relax",
        timeout: 5000,
      }).show();

      if (!globalContainers.cloudContainer.loggedIn) {
        new Noty({
          type: "info",
          text: t("general/please-sign-in-first"),
          layout: "topRight",
          theme: "relax",
          timeout: 5000,
        }).show();
        globalContainers.cloudContainer.setAuthDialogOpen(true);
      }

      props.removeSelf();
    } else if (resCreateCommentWidget.data) {
      const id = resCreateCommentWidget.data.createWidget.id;
      props.setAttributes(Object.assign(props.attributes, { id }));
    }
  }, [resCreateCommentWidget, t, props, widgetID]);

  useEffect(() => {
    if (resCommentWidget.error) {
      // TODO: This part has issue if we delete a widget and create a new one. The error will repeatly occur.
      /*
      console.log(resCommentWidget.error);
      new Noty({
        type: "error",
        text: t("error/failed-to-fetch-widget"),
        layout: "topRight",
        theme: "relax",
        timeout: 5000
      }).show();
      */
      setCommentWidget(null);
    } else if (resCommentWidget.data) {
      setCommentWidget(resCommentWidget.data.widget);
      resCommentWidget.data = null;
    }
  }, [resCommentWidget, t]);

  // Create widget
  useEffect(() => {
    if (
      !widgetID &&
      !resCreateCommentWidget.fetching &&
      !resCreateCommentWidget.error &&
      !resCreateCommentWidget.data &&
      editor
    ) {
      const title =
        getHeaderFromMarkdown(editor.getValue()) || t("general/Untitled");
      const note = (editor.getOption as any)("note") as Note;
      let source = window.location.href;
      if (note) {
        const notebook = globalContainers.crossnoteContainer.getNotebookAtPath(
          note.notebookPath,
        );
        if (notebook) {
          // TODO: Refactor with NotePopover.tsx
          source = notebook.gitURL
            ? `${window.location.origin}/?repo=${encodeURIComponent(
                notebook.gitURL,
              )}&branch=${encodeURIComponent(
                notebook.gitBranch || "master",
              )}&filePath=${encodeURIComponent(note.filePath)}`
            : `${window.location.origin}/?notebookID=${
                notebook._id
              }&filePath=${encodeURIComponent(note.filePath)}`;
        }
      }
      const description = `💬  **${title}**`;
      executeCreateCommentWidgetMutation({
        description,
        source,
      });
    }
  }, [
    widgetID,
    resCreateCommentWidget,
    editor,
    t,
    executeCreateCommentWidgetMutation,
  ]);

  // Query created widget
  useEffect(() => {
    if (widgetID && executeCommentWidgetQuery) {
      executeCommentWidgetQuery({
        requestPolicy: "network-only",
      });
    }
  }, [widgetID, executeCommentWidgetQuery]);

  if (resCommentWidget.error) {
    return <Box>{t("error/failed-to-load-widget")}</Box>;
  }

  if (!widgetID) {
    return <Box>{t("widget/creating-widget")}</Box>;
  }

  if (!commentWidget) {
    return <Box>{t("widget/loading-widget")}</Box>;
  }

  return (
    <Box
      className={clsx(classes.commentWidget)}
      style={{ marginBottom: props.isPreview ? "16px" : "0" }}
    >
      <Box className={clsx(classes.topPanel)}>
        <WidgetTopPanel
          widget={commentWidget as any}
          removeSelf={props.removeSelf}
          isPreview={props.isPreview}
        ></WidgetTopPanel>
      </Box>
      <Box className={clsx(classes.interactionPanel)}>
        <Tooltip title={t("interaction-panel/add-comment")}>
          <Button
            className={clsx(classes.button)}
            onClick={() => {
              setCommentDialogOpen(true);
            }}
          >
            <CommentOutline></CommentOutline>
            {commentWidget.instance.commentWidget.messagesCount > 0 ? (
              <Typography style={{ marginLeft: "4px", marginBottom: "0" }}>
                {commentWidget.instance.commentWidget.messagesCount}
              </Typography>
            ) : null}
          </Button>
        </Tooltip>
        <Tooltip title={t("interaction-panel/add-reaction")}>
          <Button
            className={clsx(classes.button)}
            onClick={() => setEmojiPickerOpen(true)}
          >
            <Badge style={{ zIndex: 0 }} color={"secondary"}>
              {/* badgeContent={(note.reactions || "+").toString()} */}
              <StickerEmoji />
              {commentWidget.instance.commentWidget.reactionsCount > 0 ? (
                <Typography style={{ marginLeft: "4px", marginBottom: "0" }}>
                  {commentWidget.instance.commentWidget.reactionsCount}
                </Typography>
              ) : null}
            </Badge>
          </Button>
        </Tooltip>
        <Box>
          {commentWidget.instance.commentWidget.reactionSummaries
            .sort((x, y) => {
              let weightX = 1;
              let weightY = 1;
              if (x.selfAuthored) {
                weightX = 100;
              }
              if (y.selfAuthored) {
                weightY = 100;
              }
              return x.count * weightX - y.count * weightY;
            })
            .map((reactionSummary) => {
              return (
                <Chip
                  variant={
                    reactionSummary.selfAuthored ? "default" : "outlined"
                  }
                  size="medium"
                  label={reactionSummary.count.toString()}
                  color={"primary"}
                  key={reactionSummary.reaction}
                  style={{ marginRight: "8px" }}
                  className={clsx(classes.reactionChip)}
                  onClick={() => {
                    if (!globalContainers.cloudContainer.loggedIn) {
                      globalContainers.cloudContainer.setAuthDialogOpen(true);
                    } else if (reactionSummary.selfAuthored) {
                      executeRemoveReactionFromCommentWidgetMutation({
                        widgetID: commentWidget.id,
                        reaction: reactionSummary.reaction,
                      });
                      reactionSummary.selfAuthored = false;
                      reactionSummary.count -= 1;
                      commentWidget.instance.commentWidget.reactionsCount -= 1;
                      if (reactionSummary.count <= 0) {
                        commentWidget.instance.commentWidget.reactionSummaries = commentWidget.instance.commentWidget.reactionSummaries.filter(
                          (summary) =>
                            summary.reaction !== reactionSummary.reaction,
                        );
                        setForceUpdate(Date.now());
                      }
                    } else {
                      executeAddReactionToCommentWidgetMutation({
                        widgetID: commentWidget.id,
                        reaction: reactionSummary.reaction,
                      });
                      updateReactionSummaries(reactionSummary.reaction);
                    }
                  }}
                  avatar={
                    <Avatar>
                      <Emoji emoji={reactionSummary.reaction} size={16}></Emoji>
                    </Avatar>
                  }
                />
              );
            })}
        </Box>
      </Box>

      <Dialog open={emojiPickerOpen} onClose={() => setEmojiPickerOpen(false)}>
        <EmojiPicker
          emoji={""}
          showSkinTones={false}
          onSelect={(data) => {
            if (!globalContainers.cloudContainer.loggedIn) {
              setEmojiPickerOpen(false);
              globalContainers.cloudContainer.setAuthDialogOpen(true);
            } else {
              setEmojiPickerOpen(false);
              executeAddReactionToCommentWidgetMutation({
                widgetID: commentWidget.id,
                reaction: data.colons,
              });
              updateReactionSummaries(data.colons);
            }
          }}
        ></EmojiPicker>
      </Dialog>
      <CommentDialog
        open={commentDialogOpen}
        onClose={() => setCommentDialogOpen(false)}
        commentWidget={commentWidget}
      ></CommentDialog>
    </Box>
  );
}

export const CommentWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(
    <Provider value={GraphQLClient}>
      <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
        <CommentWidget {...args}></CommentWidget>
      </ThemeProvider>
    </Provider>,
    el,
  );
  return el;
};
