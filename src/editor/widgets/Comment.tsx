import { WidgetCreator, WidgetArgs } from "vickymd/widget";
import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  createStyles,
  makeStyles,
  Theme,
  ThemeProvider
} from "@material-ui/core/styles";
import clsx from "clsx";
import Identicon from "identicon.js";
import { sha256 } from "js-sha256";
import {
  useCreateCommentWidgetMutation,
  useDeleteWidgetMutation,
  useCommentWidgetQuery,
  CommentWidgetFieldsFragment,
  useUpdateWidgetMutation
} from "../../generated/graphql";
import Noty from "noty";
import { useTranslation } from "react-i18next";
import { Editor as CodeMirrorEditor } from "codemirror";
import { getHeaderFromMarkdown } from "../../utilities/note";
import { Provider } from "urql";
import { GraphQLClient } from "../../utilities/client";
import {
  Button,
  Card,
  Box,
  Typography,
  Link,
  Avatar,
  Tooltip,
  Badge,
  IconButton,
  Dialog,
  DialogContent,
  DialogActions
} from "@material-ui/core";
import {
  LinkVariant,
  CommentOutline,
  StickerEmoji,
  TrashCanOutline,
  Pencil,
  ContentSave,
  Cancel
} from "mdi-material-ui";
import { crossnoteTheme } from "../../utilities/theme";
import { renderPreview } from "vickymd/preview";
const VickyMD = require("vickymd");

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    commentWidget: {
      position: "relative",
      borderLeft: `4px solid ${theme.palette.primary.light}`,
      backgroundColor: theme.palette.grey[100]
    },
    topBar: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(1)
    },
    avatar: {
      width: "24px",
      height: "24px",
      borderRadius: "4px"
    },
    widgetTitle: {
      marginLeft: `${theme.spacing(1)}px !important`
    },
    widgetSourceLink: {
      marginTop: `8px`,
      marginLeft: theme.spacing(0.5)
    },
    interactionPanel: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    },
    button: {
      color: "rgba(0, 0, 0, 0.54)"
    },
    actionButtons: {
      position: "absolute",
      right: "0",
      top: "0",
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    },
    editorWrapper: {
      // height: "160px",
      // border: "2px solid #96c3e6",
      "& .CodeMirror-gutters": {
        display: "none"
      }
    },
    textarea: {
      width: "100%",
      height: "100%"
    },
    preview: {
      backgroundColor: "inherit !important",
      paddingTop: theme.spacing(1),
      paddingBottom: theme.spacing(1),
      "& p:first-child": {
        marginBottom: "0 !important"
      }
    }
  })
);

function CommentWidget(props: WidgetArgs) {
  const classes = useStyles(props);
  const widgetID = props.attributes["id"];
  const editor = props.editor;
  const { t } = useTranslation();
  const [previewElement, setPreviewElement] = useState<HTMLElement>(null);
  const [textAreaElement, setTextAreaElement] = useState<HTMLTextAreaElement>(
    null
  );
  const [descriptionEditor, setDescriptionEditor] = useState<CodeMirrorEditor>(
    null
  );
  const [editorDialogOpen, setEditDialogOpen] = useState<boolean>(false);

  const [
    resCreateCommentWidget,
    executeCreateCommentWidgetMutation
  ] = useCreateCommentWidgetMutation();
  const [
    resDeleteWidget,
    executeDeleteWidgetMutation
  ] = useDeleteWidgetMutation();
  const [
    resUpdateWidget,
    executeUpdateWidgetMutation
  ] = useUpdateWidgetMutation();
  const [resCommentWidget, executeCommentWidgetQuery] = useCommentWidgetQuery({
    requestPolicy: "network-only",
    pause: true,
    variables: {
      widgetID
    }
  });
  const [commentWidget, setCommentWidget] = useState<
    CommentWidgetFieldsFragment
  >(null);
  const [widgetDescription, setWidgetDescription] = useState<string>("");

  const deleteWidget = useCallback(() => {
    if (widgetID) {
      executeDeleteWidgetMutation({
        id: widgetID
      });
    }
  }, [widgetID, executeDeleteWidgetMutation]);

  const updateWidget = useCallback(() => {
    if (descriptionEditor && commentWidget) {
      const description =
        descriptionEditor.getValue() || commentWidget.description;
      executeUpdateWidgetMutation({
        id: commentWidget.id,
        description
      });
      setWidgetDescription(description);
    }
    setEditDialogOpen(false);
  }, [descriptionEditor, commentWidget, executeUpdateWidgetMutation]);

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
        timeout: 5000
      }).show();
      props.removeSelf();
    } else if (resCreateCommentWidget.data) {
      const id = resCreateCommentWidget.data.createWidget.id;
      props.setAttributes(Object.assign(props.attributes, { id }));
    }
  }, [resCreateCommentWidget, t, props, widgetID]);

  // Delete comment widget
  useEffect(() => {
    if (props.isPreview || !widgetID) {
      return;
    }
    const err = () => {
      new Noty({
        type: "error",
        text: t("error/failed-to-delete-widget"),
        layout: "topRight",
        theme: "relax",
        timeout: 5000
      }).show();
    };
    if (resDeleteWidget.error) {
      err();
    } else if (resDeleteWidget.data) {
      if (resDeleteWidget.data.deleteWidget) {
        resDeleteWidget.data = null;
        props.removeSelf();
      } else {
        err();
      }
    }
  }, [resDeleteWidget, props, t, widgetID]);

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
      editor
    ) {
      const title =
        getHeaderFromMarkdown(editor.getValue()) || t("general/Untitled");
      const source = window.location.href;
      const description = `[ℹ️](${source}) **${title}**`;
      executeCreateCommentWidgetMutation({
        description
      });
    }
  }, [
    widgetID,
    resCreateCommentWidget,
    editor,
    t,
    executeCreateCommentWidgetMutation
  ]);

  // Query created widget
  useEffect(() => {
    if (widgetID && executeCommentWidgetQuery) {
      executeCommentWidgetQuery({
        requestPolicy: "network-only"
      });
    }
  }, [widgetID, executeCommentWidgetQuery]);

  useEffect(() => {
    if (commentWidget && previewElement) {
      renderPreview(previewElement, widgetDescription);
    }
  }, [commentWidget, previewElement, widgetDescription]);

  useEffect(() => {
    if (!commentWidget) {
      return;
    }

    if (textAreaElement) {
      const editor: CodeMirrorEditor = VickyMD.fromTextArea(textAreaElement, {
        mode: {
          name: "hypermd",
          hashtag: true
        },
        inputStyle: "textarea"
        // autofocus: false
      });
      editor.setValue(commentWidget.description);
      editor.setOption("lineNumbers", false);
      editor.setOption("foldGutter", false);
      editor.setOption("autofocus", false);
      editor.focus();
      setDescriptionEditor(editor);

      return () => {
        setDescriptionEditor(null);
        setTextAreaElement(null);
      };
    }
  }, [textAreaElement, commentWidget]);

  useEffect(() => {
    if (commentWidget) {
      setWidgetDescription(commentWidget.description);
    } else {
      setWidgetDescription("");
    }
  }, [commentWidget]);

  if (!widgetID) {
    return <Box>{"Creating widget"}</Box>;
  }

  if (!commentWidget) {
    return <Box>{"Loading widget"}</Box>;
  }

  return (
    <Box className={clsx(classes.commentWidget)}>
      <Box className={clsx(classes.topBar)}>
        <div
          className={clsx(classes.preview, "preview")}
          ref={(element: HTMLElement) => {
            setPreviewElement(element);
          }}
        ></div>
      </Box>
      <Box className={clsx(classes.interactionPanel)}>
        <Tooltip title={t("interaction-panel/add-comment")}>
          <Button
            className={clsx(classes.button)}
            onClick={() => {
              /*
              if (crossnoteContainer.loggedIn) {
                props.openChat(note);
              } else {
                crossnoteContainer.jumpToStartPage();
              }
              // console.log("Open chat");
              */
            }}
          >
            <CommentOutline></CommentOutline>
            {commentWidget.instance.commentWidget.messagesCount > 0 ? (
              <Typography style={{ marginLeft: "4px" }}>
                {commentWidget.instance.commentWidget.messagesCount}
              </Typography>
            ) : null}
          </Button>
        </Tooltip>
        <Tooltip title={t("interaction-panel/add-reaction")}>
          <Button
            className={clsx(classes.button)}
            // onClick={() => setEmojiPickerOpen(true)}
          >
            <Badge style={{ zIndex: 0 }} color={"secondary"}>
              {/* badgeContent={(note.reactions || "+").toString()} */}
              <StickerEmoji />
              {commentWidget.instance.commentWidget.reactionsCount > 0 ? (
                <Typography style={{ marginLeft: "4px" }}>
                  {commentWidget.instance.commentWidget.reactionsCount}
                </Typography>
              ) : null}
            </Badge>
          </Button>
        </Tooltip>
      </Box>

      <Box className={clsx(classes.actionButtons)}>
        <Tooltip title={commentWidget.owner.username}>
          <IconButton>
            <Avatar
              className={clsx(classes.avatar)}
              variant={"rounded"}
              src={
                commentWidget.owner.avatar ||
                "data:image/png;base64," +
                  new Identicon(
                    sha256(commentWidget.owner.username),
                    80
                  ).toString()
              }
            ></Avatar>
          </IconButton>
        </Tooltip>
        {!props.isPreview && (
          <IconButton onClick={() => setEditDialogOpen(true)}>
            <Pencil></Pencil>
          </IconButton>
        )}
        {!props.isPreview && (
          <IconButton onClick={deleteWidget}>
            <TrashCanOutline></TrashCanOutline>
          </IconButton>
        )}
      </Box>
      <Dialog open={editorDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogContent>
          <Box
            className={clsx(classes.editorWrapper)}
            style={{ minWidth: "300px", maxWidth: "100%" }}
          >
            <textarea
              className={classes.textarea}
              ref={(element: HTMLTextAreaElement) => {
                setTextAreaElement(element);
              }}
            ></textarea>
          </Box>
        </DialogContent>
        <DialogActions>
          <IconButton onClick={updateWidget}>
            <ContentSave></ContentSave>
          </IconButton>
          <IconButton
            onClick={() => {
              setEditDialogOpen(false);
            }}
          >
            <Cancel></Cancel>
          </IconButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export const CommentWidgetCreator: WidgetCreator = args => {
  const el = document.createElement("span");
  ReactDOM.render(
    <Provider value={GraphQLClient}>
      <ThemeProvider theme={crossnoteTheme}>
        <CommentWidget {...args}></CommentWidget>
      </ThemeProvider>
    </Provider>,
    el
  );
  return el;
};
