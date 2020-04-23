import React, { useState, useEffect } from "react";
import {
  makeStyles,
  createStyles,
  Theme,
  Button,
  Box,
  Card,
  Typography,
  darken,
} from "@material-ui/core";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Editor as CodeMirrorEditor } from "codemirror";
import { globalContainers } from "../../../containers/global";
import { setTheme } from "vickymd/theme";
const VickyMD = require("vickymd/core");

export const ChatMessageEditorHeight = "150";
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      width: "100%",
      height: `${ChatMessageEditorHeight}px`,
      display: "flex",
      flexDirection: "column",
      // position: "absolute",
      bottom: "0",
    },
    toolbar: {
      display: "flex",
      overflow: "hidden",
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "flex-end",
      padding: "1px 4px 1px 4px",
      backgroundColor: darken(theme.palette.background.paper, 0.05),
    },
    toolbarLeft: {
      display: "flex",
      alignItems: "center",
    },
    editorWrapper: {
      "height": "160px",
      // border: "2px solid #96c3e6",
      "& .CodeMirror-gutters": {
        display: "none",
      },
    },
    textarea: {
      width: "100%",
      height: "100%",
    },
    sendButton: {
      width: "100px",
    },
  }),
);
interface Props {
  sendMessage: (message: string) => void;
  sendingMessage?: boolean;
  updateMessage: (chatMessageID: string, message: string) => void;
  updateMessageID?: string;
  updateMessageMarkdown?: string;
  cancelUpdatingMessage: () => void;
  updatingMessage?: boolean;
  setEditor: (editor: CodeMirrorEditor) => void;
}

export function CommentEditor(props: Props) {
  const classes = useStyles(props);
  const [textAreaElement, setTextAreaElement] = useState<HTMLTextAreaElement>(
    null,
  );
  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (textAreaElement) {
      const editor: CodeMirrorEditor = VickyMD.fromTextArea(textAreaElement, {
        mode: {
          name: "hypermd",
          hashtag: true,
        },
        // inputStyle: "textarea",
      });
      editor.setValue("");
      editor.setOption("lineNumbers", false);
      editor.focus();
      setEditor(editor);
    }
  }, [textAreaElement]);

  useEffect(() => {
    if (editor && globalContainers.settingsContainer.theme) {
      setTheme({
        editor,
        themeName: globalContainers.settingsContainer.theme.name,
        baseUri: "/styles/",
      });
    }
  }, [editor]);

  useEffect(() => {
    props.setEditor(editor);
  }, [editor, props]);

  useEffect(() => {
    if (props.updateMessageID && props.updateMessageMarkdown) {
      editor.setValue(props.updateMessageMarkdown);
    }
  }, [props.updateMessageID, props.updateMessageMarkdown, editor]);

  return (
    <Box className={clsx(classes.root)}>
      <Box className={clsx(classes.toolbar)}>
        {props.updateMessageID ? (
          <Box>
            <Button
              variant={"contained"}
              color={"secondary"}
              onClick={() => {
                props.cancelUpdatingMessage();
              }}
            >
              {t("general/cancel")}
            </Button>
            <Button
              variant={"contained"}
              color={"primary"}
              onClick={() => {
                if (editor) {
                  props.updateMessage(
                    props.updateMessageID,
                    editor.getValue() || "",
                  );
                }
              }}
              disabled={props.updatingMessage}
              style={{ marginLeft: "8px" }}
            >
              {props.updatingMessage
                ? t("general/updating")
                : t("general/update")}
            </Button>
          </Box>
        ) : (
          <Box>
            {globalContainers.cloudContainer.loggedIn ? (
              <Button
                variant="contained"
                color="primary"
                onClick={() => {
                  if (editor) {
                    props.sendMessage(editor.getValue() || "");
                    editor.setValue("");
                  }
                }}
                disabled={props.sendingMessage}
                className={clsx(classes.sendButton)}
              >
                {props.sendingMessage
                  ? t("general/sending")
                  : t("general/send")}
              </Button>
            ) : (
              <Button
                variant={"contained"}
                color={"primary"}
                onClick={() => {
                  globalContainers.cloudContainer.setAuthDialogOpen(true);
                }}
              >
                <Typography variant={"body2"}>{"Log in"}</Typography>
              </Button>
            )}
          </Box>
        )}
      </Box>
      <Card className={clsx(classes.editorWrapper)} elevation={4}>
        <textarea
          id="outlined-multiline-flexible"
          className={classes.textarea}
          ref={(element: HTMLTextAreaElement) => {
            setTextAreaElement(element);
          }}
        />
      </Card>
    </Box>
  );
}
