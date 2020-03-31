import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  Typography,
  DialogTitle,
  Box,
  IconButton,
  DialogActions,
  Button,
  useMediaQuery,
  Tooltip
} from "@material-ui/core";
import {
  createStyles,
  makeStyles,
  Theme,
  useTheme
} from "@material-ui/core/styles";
import clsx from "clsx";
import {
  CommentWidgetFieldsFragment,
  CommentWidgetMessageFieldsFragment,
  PageInfo,
  useCommentWidgetMessagesQuery,
  usePostCommentWidgetMessageMutation,
  useUpdateCommentWidgetMessageMutation,
  useSubscribeToCommentWidgetMutation,
  useUnsubscribeFromCommentWidgetMutation
} from "../../../generated/graphql";
import { useTranslation } from "react-i18next";
import {
  EmptyPageInfo,
  getMentionsFromMarkdown
} from "../../../utilities/note";
import { UUIDNil } from "../../../utilities/utils";
import { BellOutline, Bell, Close } from "mdi-material-ui";
import { CommentMessage } from "./CommentMessages";
import { Editor as CodeMirrorEditor } from "codemirror";
import { CommentEditor } from "./CommentEditor";
import Noty from "noty";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    topBar: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    },
    commentWrapper: {
      padding: "0"
    },
    messages: {}
  })
);

interface Props {
  open: boolean;
  onClose: () => void;
  commentWidget: CommentWidgetFieldsFragment;
}
export function CommentDialog(props: Props) {
  const classes = useStyles(props);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("xs"));
  const commentWidget = props.commentWidget;
  const { t } = useTranslation();
  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const [messages, setMessages] = useState<
    CommentWidgetMessageFieldsFragment[]
  >(commentWidget.instance.commentWidget.messages.edges.map(edge => edge.node));
  const [messagesElement, setMessagesElement] = useState<HTMLDivElement>(null);
  const [
    latestPulledMessagePageInfo,
    setLatestPulledMessagePageInfo
  ] = useState<PageInfo>(
    commentWidget.instance.commentWidget.messages.pageInfo
  );
  const [updateMessageID, setUpdateMessageID] = useState<string>("");
  const [
    resMessagesAfter,
    executeMessagesAfterQuery
  ] = useCommentWidgetMessagesQuery({
    variables: {
      widgetID: commentWidget.id,
      before: UUIDNil,
      after: latestPulledMessagePageInfo.endCursor,
      first: 20,
      last: 0
    },
    requestPolicy: "network-only",
    pause: true
  });
  const [
    resPostMessage,
    executePostMessageMutation
  ] = usePostCommentWidgetMessageMutation();
  const [
    resUpdateMessage,
    executeUpdateMessageMutation
  ] = useUpdateCommentWidgetMessageMutation();
  const [
    resSubscribeToCommentWidget,
    executeSubscribeToCommentWidgetMutation
  ] = useSubscribeToCommentWidgetMutation();
  const [
    resUnsubscribeFromCommentWidget,
    executeUnsubscribeFromCommentWidgetMutation
  ] = useUnsubscribeFromCommentWidgetMutation();

  const mentionUser = useCallback(
    (username: string) => {
      if (editor) {
        editor.focus();
        editor.replaceSelection(`@${username} `);
        editor.focus();
      }
    },
    [editor]
  );

  const subscribeToChatGroup = useCallback(() => {
    if (commentWidget) {
      commentWidget.instance.commentWidget.subscribed = true;
      executeSubscribeToCommentWidgetMutation({
        widgetID: commentWidget.id
      });
    }
  }, [commentWidget, executeSubscribeToCommentWidgetMutation]);

  const unsubscribeFromChatGroup = useCallback(() => {
    if (commentWidget) {
      commentWidget.instance.commentWidget.subscribed = false;
      executeUnsubscribeFromCommentWidgetMutation({
        widgetID: commentWidget.id
      });
    }
  }, [commentWidget, executeUnsubscribeFromCommentWidgetMutation]);

  const sendMessage = useCallback(
    (message: string = "") => {
      if (!commentWidget || !message.trim().length) {
        return;
      }
      executePostMessageMutation({
        widgetID: commentWidget.id,
        markdown: message,
        notifyUsers: getMentionsFromMarkdown(message)
      });
    },
    [commentWidget, executePostMessageMutation]
  );

  const updateMessage = useCallback(
    (messageID: string, message: string) => {
      if (!commentWidget || !message.trim().length) {
        return;
      }
      executeUpdateMessageMutation({
        messageID: messageID,
        markdown: message
      });
    },
    [commentWidget, executeUpdateMessageMutation]
  );

  const addMessage = useCallback(
    (message: CommentWidgetMessageFieldsFragment) => {
      setMessages(messages =>
        [message, ...messages]
          .filter(
            (message, index, self) =>
              index === self.findIndex(m => m.id === message.id)
          )
          .sort((x, y) => {
            const xC = new Date(x.createdAt);
            const yC = new Date(y.createdAt);
            return xC.getTime() - yC.getTime();
          })
      );
    },
    []
  );

  const scrollMessagesToBottom = useCallback(() => {
    if (messagesElement) {
      messagesElement.scrollTop = messagesElement.scrollHeight * 10;
    }
  }, [messagesElement]);

  const fetchPreviousMessages = useCallback(() => {
    if (latestPulledMessagePageInfo.hasNextPage) {
      executeMessagesAfterQuery({
        requestPolicy: "network-only"
      });
    }
  }, [executeMessagesAfterQuery, latestPulledMessagePageInfo]);

  useEffect(() => {
    if (resSubscribeToCommentWidget.error) {
      // console.log(resSubscribeToCommentWidget.error);
      new Noty({
        type: "error",
        text: t("error/failed-to-subscribe-to-comment-widget"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
    }
  }, [resSubscribeToCommentWidget, t]);

  useEffect(() => {
    if (resUnsubscribeFromCommentWidget.error) {
      // console.log(resUnsubscribeFromCommentWidget.error);
      new Noty({
        type: "error",
        text: t("error/failed-to-unsubscribe-from-comment-widget"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
    }
  }, [resUnsubscribeFromCommentWidget, t]);

  useEffect(() => {
    if (resPostMessage.fetching) {
    } else if (resPostMessage.error) {
      new Noty({
        type: "error",
        text: t("widget/crossnote.comment/post-comment-failure"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
    } else if (resPostMessage.data) {
      const message = resPostMessage.data.postCommentWidgetMessage;
      addMessage(message);
      scrollMessagesToBottom();
    }
  }, [resPostMessage, addMessage, scrollMessagesToBottom, t]);

  useEffect(() => {
    if (resUpdateMessage.data) {
      const message = resUpdateMessage.data.updateCommentWidgetMessage;
      addMessage(message);
      setUpdateMessageID("");
      if (editor) {
        editor.setValue("");
      }
    }
  }, [resUpdateMessage, addMessage, editor]);

  useEffect(() => {
    if (resMessagesAfter.fetching) {
    } else if (resMessagesAfter.error) {
    } else if (resMessagesAfter.data) {
      const connection =
        resMessagesAfter.data.widget.instance.commentWidget.messages;
      setLatestPulledMessagePageInfo(connection.pageInfo);
      if (!connection.edges.length) {
        return;
      }
      setMessages(messages =>
        [...connection.edges.map(edge => edge.node), ...messages]
          .filter(
            (message, index, self) =>
              index === self.findIndex(m => m.id === message.id)
          )
          .sort((x, y) => {
            const xC = new Date(x.createdAt);
            const yC = new Date(y.createdAt);
            return xC.getTime() - yC.getTime();
          })
      );
    }
  }, [resMessagesAfter]);

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      fullWidth={true}
      fullScreen={fullScreen}
    >
      <DialogTitle style={{ paddingBottom: "0" }}>
        <Box className={classes.topBar}>
          <Box className={classes.row}>
            {fullScreen && (
              <IconButton onClick={() => props.onClose()}>
                <Close></Close>
              </IconButton>
            )}
            <Typography>{t("general/Comments")}</Typography>
          </Box>
          <Tooltip
            title={
              commentWidget.instance.commentWidget.subscribed
                ? t("widget/crossnote.comment/unsubscribe-info")
                : t("widget/crossnote.comment/subscribe-info")
            }
          >
            <IconButton
              color={"primary"}
              onClick={() => {
                if (commentWidget.instance.commentWidget.subscribed) {
                  unsubscribeFromChatGroup();
                } else {
                  subscribeToChatGroup();
                }
              }}
            >
              {commentWidget.instance.commentWidget.subscribed ? (
                <Bell></Bell>
              ) : (
                <BellOutline></BellOutline>
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      <DialogContent className={clsx(classes.commentWrapper)}>
        <div
          className={clsx(classes.messages)}
          ref={(element: HTMLDivElement) => {
            setMessagesElement(element);
          }}
        >
          {messages.map((message, index) => {
            const commentMessage = (
              <CommentMessage
                commentWidget={commentWidget}
                message={message}
                previousMessage={index > 0 ? messages[index - 1] : null}
                mentionUser={mentionUser}
                key={message.id}
                onModifyChatMessage={(messageID: string) => {
                  setUpdateMessageID(messageID);
                }}
              ></CommentMessage>
            );
            if (
              latestPulledMessagePageInfo.hasNextPage &&
              latestPulledMessagePageInfo.endCursor === message.id
            ) {
              return (
                <Box key={message.id}>
                  {commentMessage}
                  <Box
                    style={{
                      textAlign: "center",
                      padding: "16px",
                      marginBottom: "16px"
                    }}
                  >
                    <Button
                      variant={"outlined"}
                      color={"secondary"}
                      onClick={fetchPreviousMessages}
                      disabled={resMessagesAfter.fetching}
                    >
                      {t("widget/crossnote.comment/view-more-comments")}
                    </Button>
                  </Box>
                </Box>
              );
            } else {
              return commentMessage;
            }
          })}
        </div>
      </DialogContent>
      <DialogActions style={{ padding: "0" }}>
        <CommentEditor
          sendMessage={message => {
            sendMessage(message);
          }}
          sendingMessage={resPostMessage.fetching}
          updateMessage={(messageID, message) => {
            updateMessage(messageID, message);
          }}
          cancelUpdatingMessage={() => {
            setUpdateMessageID("");
          }}
          updateMessageID={updateMessageID}
          updateMessageMarkdown={
            updateMessageID
              ? messages.filter(message => message.id === updateMessageID)[0]
                  .markdown
              : ""
          }
          updatingMessage={resUpdateMessage.fetching}
          setEditor={setEditor}
        ></CommentEditor>
      </DialogActions>
    </Dialog>
  );
}
