import { renderPreview } from "@0xgg/echomd/preview";
import {
  Avatar,
  Box,
  Card,
  Chip,
  Dialog,
  IconButton,
  Popover,
  Tooltip,
  Typography,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { formatRelative } from "date-fns/esm";
import { Emoji, Picker as EmojiPicker } from "emoji-mart";
import "emoji-mart/css/emoji-mart.css";
import Identicon from "identicon.js";
import { sha256 } from "js-sha256";
import { FileEditOutline, Reply, StickerEmoji } from "mdi-material-ui";
import Noty from "noty";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { globalContainers } from "../../../containers/global";
import {
  CommentWidgetFieldsFragment,
  CommentWidgetMessageFieldsFragment,
  useAddReactionToCommentWidgetMessageMutation,
  useRemoveReactionFromCommentWidgetMessageMutation,
} from "../../../generated/graphql";
import { languageCodeToDateFNSLocale } from "../../../i18n/i18n";
import { postprocessPreview } from "../../../utilities/preview";

const messageMarginLeft = 48;
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    chatMessage: {
      "width": "100%",
      "paddingLeft": theme.spacing(2),
      "paddingRight": theme.spacing(2),
      "boxSizing": "border-box",
      "cursor": "pointer",
      "&:first-child": {
        marginTop: theme.spacing(2),
      },
      /*
      "&:hover": {
        backgroundColor: "#f6f6f6",
      },
      "&:hover .preview": {
        backgroundColor: "#f6f6f6 !important",
      },
      */
    },
    avatarPanel: {
      display: "grid",
      gridTemplateAreas: `"avatar username"
                          "avatar time"`,
      justifyContent: "start",
      alignItems: "center",
      gridColumnGap: theme.spacing(2),
    },
    avatar: {
      borderRadius: "4px",
      width: "32px",
      height: "32px",
      gridArea: "avatar",
      cursor: "pointer",
    },
    username: {
      gridArea: "username",
    },
    time: {
      gridArea: "time",
    },
    message: {
      marginLeft: `${messageMarginLeft}px`,
      cursor: "pointer",
      backgroundColor: "inherit !important",
      /*
      "&:hover": {
        backgroundColor: "#f6f6f6 !important",
      },
      */
    },
    reactions: {
      marginLeft: `${messageMarginLeft}px`,
      marginBottom: theme.spacing(2),
    },
    singleTime: {
      marginLeft: `${messageMarginLeft}px`,
    },
    modifiedCaption: {
      marginLeft: `${messageMarginLeft}px`,
    },
    reactionChip: {
      "marginBottom": "2px",
      "&:hover": {
        cursor: "pointer",
      },
    },
  }),
);

const actionBtnClass = {
  width: "20px",
  height: "20px",
};

interface Props {
  commentWidget: CommentWidgetFieldsFragment;
  message: CommentWidgetMessageFieldsFragment;
  previousMessage?: CommentWidgetMessageFieldsFragment;
  mentionUser: (username: string) => void;
  onModifyChatMessage: (chatMessageID: string) => void;
}
export function CommentMessage(props: Props) {
  const classes = useStyles(props);
  const message = props.message;
  const previousMessage = props.previousMessage;
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState<boolean>(false);
  const [
    resAddReactionToCommentWidgetMessage,
    executeAddReactionToCommentWidgetMessageMutation,
  ] = useAddReactionToCommentWidgetMessageMutation();
  const [
    resRemoveReactionFromCommentWidgetMessage,
    executeRemoveReactionFromCommentWidgetMessageMutation,
  ] = useRemoveReactionFromCommentWidgetMessageMutation();
  const [forceUpdate, setForceUpdate] = useState<number>(Date.now());
  const { t } = useTranslation();
  const [previewElement, setPreviewElement] = React.useState<HTMLElement>(null);

  useEffect(() => {
    if (resAddReactionToCommentWidgetMessage.error) {
      new Noty({
        type: "error",
        text: resAddReactionToCommentWidgetMessage.error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
    }
  }, [resAddReactionToCommentWidgetMessage]);

  useEffect(() => {
    if (resRemoveReactionFromCommentWidgetMessage.error) {
      new Noty({
        type: "error",
        text: resRemoveReactionFromCommentWidgetMessage.error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
    }
  }, [resRemoveReactionFromCommentWidgetMessage]);

  useEffect(() => {
    if (previewElement) {
      renderPreview(previewElement, message.markdown);
      postprocessPreview(
        previewElement,
        null, // globalContainers.crossnoteContainer.selectedNote,
      );
    }
  }, [previewElement, message.markdown]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(anchorEl ? null : (event.target as any));
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleReply = () => {
    props.mentionUser(message.author.username);
    handleClose();
  };
  const openPopper = Boolean(anchorEl);
  const modified = message.createdAt !== message.updatedAt;

  function updateReactionSummaries(reaction: string) {
    let found = false;
    for (let i = 0; i < message.reactionSummaries.length; i++) {
      if (message.reactionSummaries[i].reaction === reaction) {
        found = true;
        message.reactionSummaries[i].count += 1;
        message.reactionSummaries[i].selfAuthored = true;
        break;
      }
    }
    if (!found) {
      message.reactionSummaries = [
        {
          reaction: reaction,
          count: 1,
          selfAuthored: true,
        },
        ...message.reactionSummaries,
      ];
    }
    setForceUpdate(Date.now());
  }
  return (
    <Box className={clsx(classes.chatMessage)} onClick={handleClick}>
      {previousMessage &&
      previousMessage.author.id === message.author.id &&
      previousMessage.author.username === message.author.username ? null : (
        <Box className={clsx(classes.avatarPanel)}>
          <Avatar
            onClick={() => {
              /*
              if (message.authorVisibility !== AuthorVisibility.Anonymous) {
                window.open(
                  `${CROSSNOTE_CONFIG.homePage}/user/${chatMessage.author.username}`
                );
              }
              */
            }}
            variant={"rounded"}
            className={clsx(classes.avatar)}
            src={
              message.author.avatar ||
              "data:image/png;base64," +
                new Identicon(sha256(message.author.username), 80).toString()
            }
          ></Avatar>
          <Typography className={clsx(classes.username)}>
            {message.author.username}
          </Typography>
          <Typography
            className={clsx(classes.time)}
            variant="body2"
            color={"textSecondary"}
          >
            {formatRelative(new Date(message.createdAt), new Date(), {
              locale: languageCodeToDateFNSLocale(
                globalContainers.settingsContainer.language,
              ),
            })}
          </Typography>
        </Box>
      )}
      {previousMessage &&
      previousMessage.author.id === message.author.id &&
      previousMessage.author.username === message.author.username &&
      new Date(message.createdAt).getTime() -
        new Date(previousMessage.createdAt).getTime() >=
        1000 * 60 ? (
        <Typography
          className={clsx(classes.time, classes.singleTime)}
          variant="body2"
          color={"textSecondary"}
        >
          {formatRelative(new Date(message.createdAt), new Date(), {
            locale: languageCodeToDateFNSLocale(
              globalContainers.settingsContainer.language,
            ),
          })}
        </Typography>
      ) : null}
      {modified && (
        <Typography
          variant={"caption"}
          color={"textSecondary"}
          className={clsx(classes.modifiedCaption)}
        >
          {t("widget/crossnote.comment/modified-comment")}
        </Typography>
      )}
      <div
        className={clsx(classes.message) + " preview"}
        ref={(element: HTMLElement) => {
          setPreviewElement(element);
        }}
      ></div>
      <Box className={clsx(classes.reactions)}>
        {message.reactionSummaries
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
                variant={reactionSummary.selfAuthored ? "default" : "outlined"}
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
                    executeRemoveReactionFromCommentWidgetMessageMutation({
                      messageID: message.id,
                      reaction: reactionSummary.reaction,
                    });
                    reactionSummary.selfAuthored = false;
                    reactionSummary.count -= 1; // TODO: Should we remove the reaction if it reaches 0?
                    setForceUpdate(Date.now());
                  } else {
                    executeAddReactionToCommentWidgetMessageMutation({
                      messageID: message.id,
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

      <Popover
        open={openPopper}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
      >
        <Card>
          <Tooltip title={t("widget/crossnote.comment/reply-to-this-user")}>
            <IconButton onClick={handleReply}>
              <Reply style={actionBtnClass}></Reply>
            </IconButton>
          </Tooltip>
          <Tooltip
            title={t("widget/crossnote.comment/add-reaction-to-this-comment")}
          >
            <IconButton onClick={() => setEmojiPickerOpen(true)}>
              <StickerEmoji style={actionBtnClass}></StickerEmoji>
            </IconButton>
          </Tooltip>
          {globalContainers.cloudContainer.loggedIn &&
            message.author.id === globalContainers.cloudContainer.viewer.id && (
              <Tooltip title={t("widget/crossnote.comment/edit-this-message")}>
                <IconButton
                  onClick={() => props.onModifyChatMessage(message.id)}
                >
                  <FileEditOutline style={actionBtnClass}></FileEditOutline>
                </IconButton>
              </Tooltip>
            )}
        </Card>
      </Popover>

      <Dialog open={emojiPickerOpen} onClose={() => setEmojiPickerOpen(false)}>
        <EmojiPicker
          emoji={""}
          showSkinTones={false /* Disable skin for now */}
          onSelect={(data) => {
            if (!globalContainers.cloudContainer.loggedIn) {
              setEmojiPickerOpen(false);
              globalContainers.cloudContainer.setAuthDialogOpen(true);
            } else {
              setEmojiPickerOpen(false);
              executeAddReactionToCommentWidgetMessageMutation({
                messageID: message.id,
                reaction: data.colons,
              });
              updateReactionSummaries(data.colons);
              handleClose();
            }
          }}
        />
      </Dialog>
      <Box style={{ display: "none" }}>{forceUpdate}</Box>
    </Box>
  );
}
