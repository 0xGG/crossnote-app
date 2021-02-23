import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import { Box, Card, IconButton, Tooltip } from "@material-ui/core";
import {
  createStyles,
  makeStyles,
  Theme,
  ThemeProvider,
} from "@material-ui/core/styles";
// @ts-ignore
import abcjs from "abcjs";
import "abcjs/abcjs-audio.css";
import clsx from "clsx";
import { ContentSave, TrashCan } from "mdi-material-ui";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { globalContainers } from "../../../containers/global";
import { generateUUID } from "../../../utilities/utils";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      padding: theme.spacing(2),
      position: "relative",
    },
    editorWrapper: {
      position: "relative",
      padding: "2px",
    },
    editor: {
      width: "100%",
      height: "128px",
      resize: "none",
      border: "none",
      backgroundColor: theme.palette.background.paper,
      color: theme.palette.text.primary,
    },
    canvas: {
      overflow: "auto !important",
      height: "100% !important",
    },
    actionButtonsGroup: {
      position: "absolute",
      top: "0",
      right: "0",
      display: "flex",
      alignItems: "center",
    },
  }),
);

function ABCWidget(props: WidgetArgs) {
  const attributes = props.attributes;
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [abcEditorID] = useState<string>("abc-editor-" + generateUUID());
  const [abcWarningsID] = useState<string>("abc-warnings-" + generateUUID());
  const [abcCanvasID] = useState<string>("abc-canvas-" + generateUUID());
  const [abcAudioID] = useState<string>("abc-audio-" + generateUUID());
  const [editorElement, setEditorElement] = useState<HTMLElement>(null);
  const [warningsElement, setWarningsElement] = useState<HTMLElement>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLElement>(null);
  const [audioControlElement, setAudioControlElement] = useState<HTMLElement>(
    null,
  );
  const [hideEditor, setHideEditor] = useState<boolean>(props.isPreview);

  const [abc, setABC] = useState<string>(
    attributes["abc"] ||
      `X: 1
T: Cooley's
M: 4/4
L: 1/8
K: Emin
|:D2|EB{c}BA B2 EB|~B2 AB dBAG|FDAD BDAD|FDAD dAFD|`,
  );

  useEffect(() => {
    if (
      editorElement &&
      warningsElement &&
      canvasElement &&
      audioControlElement &&
      editorElement.id
    ) {
      setTimeout(() => {
        if (!document.getElementById(editorElement.id)) {
          return;
        }
        const editor = new abcjs.Editor(editorElement.id, {
          canvas_id: canvasElement.id,
          warnings_id: warningsElement.id,
          generate_warnings: true,
          synth: {
            el: `#${audioControlElement.id}`,
            options: {
              displayLoop: true,
              displayRestart: true,
              displayPlay: true,
              displayProgress: true,
              displayWarp: true,
            },
          },
          abcjsParams: {
            generateDownload: true,
          },
        });

        // Test synth
      }, 1000);
    }
  }, [editorElement, warningsElement, canvasElement, audioControlElement]);

  return (
    <Box>
      {/*<Typography variant={"h5"}>{t("widget/crossnote.abc/title")}</Typography>*/}
      <Card
        elevation={2}
        className={clsx(classes.editorWrapper)}
        style={{
          display: hideEditor ? "none" : "block",
        }}
      >
        <textarea
          className={clsx(classes.editor)}
          id={abcEditorID}
          ref={(element: HTMLElement) => {
            setEditorElement(element);
          }}
          value={abc}
          onChange={(event) => {
            setABC(event.target.value);
          }}
          readOnly={props.isPreview}
        ></textarea>
        <Box className={clsx(classes.actionButtonsGroup)}>
          {!props.isPreview && attributes["abc"] !== abc && (
            <IconButton
              onClick={() => {
                props.setAttributes(Object.assign(props.attributes, { abc }));
              }}
            >
              <ContentSave></ContentSave>
            </IconButton>
          )}

          <Tooltip title={t("general/Delete")}>
            <IconButton onClick={() => props.removeSelf()}>
              <TrashCan></TrashCan>
            </IconButton>
          </Tooltip>
        </Box>
      </Card>
      <div
        id={abcWarningsID}
        ref={(element: HTMLElement) => {
          setWarningsElement(element);
        }}
      ></div>
      <div
        id={abcCanvasID}
        className={clsx(classes.canvas)}
        ref={(element: HTMLElement) => {
          setCanvasElement(element);
        }}
      ></div>
      <div
        id={abcAudioID}
        ref={(element: HTMLElement) => {
          setAudioControlElement(element);
        }}
      ></div>
    </Box>
  );
}

export const ABCWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <ABCWidget {...args}></ABCWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
