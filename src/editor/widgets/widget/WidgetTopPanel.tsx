import { renderPreview } from "@0xgg/echomd/preview";
import {
  Avatar,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Link,
  TextField,
  Tooltip,
  Typography,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { Editor as CodeMirrorEditor } from "codemirror";
import Identicon from "identicon.js";
import { sha256 } from "js-sha256";
import {
  Cancel,
  ContentSave,
  LinkVariant,
  Pencil,
  TrashCanOutline,
} from "mdi-material-ui";
import Noty from "noty";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { globalContainers } from "../../../containers/global";
import {
  useDeleteWidgetMutation,
  useUpdateWidgetMutation,
  Widget,
} from "../../../generated/graphql";
import { setTheme } from "../../../themes/manager";
import { browserHistory } from "../../../utilities/history";
const EchoMD = require("@0xgg/echomd/core");

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    topPanel: {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
    },
    avatar: {
      width: "24px",
      height: "24px",
      borderRadius: "4px",
    },
    widgetTitle: {
      marginLeft: `${theme.spacing(1)}px !important`,
    },
    widgetSourceLink: {
      marginTop: `8px`,
      marginLeft: theme.spacing(0.5),
    },
    actionButtons: {
      position: "absolute",
      right: "0",
      top: "0",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
    editorWrapper: {
      "marginTop": theme.spacing(2),
      // height: "160px",
      // border: "2px solid #96c3e6",
      "& .CodeMirror-gutters": {
        display: "none",
      },
    },
    textarea: {
      width: "100%",
      height: "100%",
    },
    preview: {
      "backgroundColor": "inherit !important",
      "paddingTop": theme.spacing(1),
      "paddingBottom": theme.spacing(1),
      "& p:last-child": {
        marginBottom: "0 !important",
      },
      "& br": {
        // display: "none"
      },
    },
  }),
);

interface Props {
  widget: Widget;
  removeSelf?: () => void;
  isPreview: Boolean;
}

export function WidgetTopPanel(props: Props) {
  const classes = useStyles(props);
  const widget = props.widget;
  const { t } = useTranslation();
  const [previewElement, setPreviewElement] = useState<HTMLElement>(null);
  const [textAreaElement, setTextAreaElement] = useState<HTMLTextAreaElement>(
    null,
  );
  const [editor, setEditor] = useState<CodeMirrorEditor>(null);
  const [editorDialogOpen, setEditDialogOpen] = useState<boolean>(false);

  const [
    resDeleteWidget,
    executeDeleteWidgetMutation,
  ] = useDeleteWidgetMutation();
  const [
    resUpdateWidget,
    executeUpdateWidgetMutation,
  ] = useUpdateWidgetMutation();
  const [forceUpdate, setForceUpdate] = useState<number>(Date.now());
  const [widgetSource, setWidgetSource] = useState<string>("");

  const deleteWidget = useCallback(() => {
    if (widget && widget.id) {
      executeDeleteWidgetMutation({
        id: widget.id,
      });
    }
  }, [widget, executeDeleteWidgetMutation]);

  const updateWidget = useCallback(() => {
    if (editor && widget) {
      const description = editor.getValue() || widget.description;
      executeUpdateWidgetMutation({
        id: widget.id,
        description,
        source: widgetSource,
      });
      widget.description = description;
      widget.source = widgetSource;
      setForceUpdate(Date.now());
    }
    setEditDialogOpen(false);
  }, [editor, widget, executeUpdateWidgetMutation, widgetSource]);

  const closeEditDialog = useCallback(() => {
    if (widget) {
      setWidgetSource(widget.source);
    }
    setEditDialogOpen(false);
  }, [widget]);

  // Delete widget
  useEffect(() => {
    if (!widget.id) {
      return;
    }
    const err = () => {
      new Noty({
        type: "error",
        text: t("error/failed-to-delete-widget"),
        layout: "topRight",
        theme: "relax",
        timeout: 5000,
      }).show();
    };
    if (resDeleteWidget.error) {
      err();
    } else if (resDeleteWidget.data) {
      if (resDeleteWidget.data.deleteWidget) {
        resDeleteWidget.data = null;
        if (props.removeSelf) {
          props.removeSelf();
        }
      } else {
        err();
      }
    }
  }, [resDeleteWidget, t, widget, props]);

  useEffect(() => {
    if (widget && previewElement) {
      renderPreview(previewElement, widget.description);
    }
  }, [widget, previewElement, forceUpdate]);

  useEffect(() => {
    if (!widget) {
      return;
    }

    if (textAreaElement) {
      const editor: CodeMirrorEditor = EchoMD.fromTextArea(textAreaElement, {
        mode: {
          name: "hypermd",
          hashtag: true,
        },
        // inputStyle: "textarea",
        // autofocus: false
        keyMap: globalContainers.settingsContainer.keyMap,
        showCursorWhenSelecting: true,
        inputStyle: "contenteditable",
      });
      editor.setValue(widget.description);
      editor.setOption("lineNumbers", false);
      editor.setOption("foldGutter", false);
      editor.setOption("autofocus", false);
      editor.focus();
      setEditor(editor);

      return () => {
        setEditor(null);
        setTextAreaElement(null);
      };
    }
  }, [textAreaElement, widget]);

  useEffect(() => {
    if (editor && globalContainers.settingsContainer.theme) {
      setTheme({
        editor,
        themeName: globalContainers.settingsContainer.theme.name,
      });
    }
  }, [editor]);

  useEffect(() => {
    if (widget) {
      setWidgetSource(widget.source);
    } else {
      setWidgetSource("");
    }
  }, [widget]);

  return (
    <Box className={clsx(classes.topPanel)}>
      <div
        className={clsx(classes.preview, "preview")}
        style={{ whiteSpace: "normal" }}
        ref={(element: HTMLElement) => {
          setPreviewElement(element);
        }}
      ></div>

      <Box className={clsx(classes.actionButtons)}>
        {widget.source && (
          <Tooltip title={t("general/Source")}>
            <Link
              href={widget.source}
              onClick={(event: any) => {
                event.preventDefault();
                if (widget.source.startsWith(window.location.origin)) {
                  browserHistory.push(
                    widget.source.replace(window.location.origin, ""),
                  );
                } else {
                  window.open(widget.source, "_blank");
                }
              }}
            >
              <IconButton>
                <LinkVariant></LinkVariant>
              </IconButton>
            </Link>
          </Tooltip>
        )}
        <Tooltip title={widget.owner.username}>
          <IconButton>
            <Avatar
              className={clsx(classes.avatar)}
              variant={"rounded"}
              src={
                widget.owner.avatar ||
                "data:image/png;base64," +
                  new Identicon(sha256(widget.owner.username), 80).toString()
              }
            ></Avatar>
          </IconButton>
        </Tooltip>
        {!props.isPreview && widget.canConfigure && (
          <Tooltip title={t("general/Edit")}>
            <IconButton onClick={() => setEditDialogOpen(true)}>
              <Pencil></Pencil>
            </IconButton>
          </Tooltip>
        )}
        {!props.isPreview && widget.canConfigure && (
          <Tooltip title={t("general/Delete")}>
            <IconButton onClick={deleteWidget}>
              <TrashCanOutline></TrashCanOutline>
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Dialog open={editorDialogOpen} onClose={closeEditDialog}>
        <DialogContent>
          <TextField
            label={t("general/Source")}
            value={widgetSource}
            onChange={(event) => setWidgetSource(event.target.value)}
            fullWidth={true}
          ></TextField>
          <Box
            className={clsx(classes.editorWrapper)}
            style={{ minWidth: "300px", maxWidth: "100%" }}
          >
            <Typography variant={"caption"} color={"textSecondary"}>
              {t("general/Description")}
            </Typography>
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
          <IconButton onClick={closeEditDialog}>
            <Cancel></Cancel>
          </IconButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
