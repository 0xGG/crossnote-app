import { WidgetCreator, WidgetArgs } from "vickymd/widget";
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import clsx from "clsx";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import { Box, IconButton, Card } from "@material-ui/core";
import { useTranslation } from "react-i18next";
import { generateUUID } from "../../utilities/utils";

// @ts-ignore
import abcjs from "abcjs";
import "abcjs/abcjs-audio.css";
import { ContentSave } from "mdi-material-ui";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      padding: theme.spacing(2),
      position: "relative"
    },
    editorWrapper: {
      position: "relative",
      padding: "2px"
    },
    editor: {
      width: "100%",
      height: "128px",
      resize: "none",
      border: "none"
    },
    canvas: {
      overflow: "auto !important",
      height: "100% !important"
    },
    saveBtn: {
      position: "absolute",
      top: "0",
      right: "0"
    }
  })
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
    null
  );
  const [hideEditor, setHideEditor] = useState<boolean>(props.isPreview);

  const [abc, setABC] = useState<string>(
    attributes["abc"] ||
      `X: 1
T: Cooley's
M: 4/4
L: 1/8
K: Emin
|:D2|EB{c}BA B2 EB|~B2 AB dBAG|FDAD BDAD|FDAD dAFD|`
  );

  useEffect(() => {
    if (
      editorElement &&
      warningsElement &&
      canvasElement &&
      audioControlElement
    ) {
      setTimeout(() => {
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
              displayWarp: true
            }
          },
          abcjsParams: {
            generateDownload: true
          }
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
          display: hideEditor ? "none" : "block"
        }}
      >
        <textarea
          className={clsx(classes.editor)}
          id={abcEditorID}
          ref={(element: HTMLElement) => {
            setEditorElement(element);
          }}
          value={abc}
          onChange={event => {
            setABC(event.target.value);
          }}
          readOnly={props.isPreview}
        ></textarea>
        {!props.isPreview && attributes["abc"] !== abc && (
          <IconButton
            className={clsx(classes.saveBtn)}
            onClick={() => {
              props.setAttributes(Object.assign(props.attributes, { abc }));
            }}
          >
            <ContentSave></ContentSave>
          </IconButton>
        )}
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

export const ABCWidgetCreator: WidgetCreator = args => {
  const el = document.createElement("span");
  ReactDOM.render(<ABCWidget {...args}></ABCWidget>, el);
  return el;
};
