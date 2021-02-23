import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import {
  Box,
  Card,
  IconButton,
  Input,
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
import { TrashCan } from "mdi-material-ui";
import Noty from "noty";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { globalContainers } from "../../../containers/global";
import { smmsUploadImages } from "../../../utilities/image_uploader";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      padding: theme.spacing(2),
      position: "relative",
    },
    actionButtons: {
      position: "absolute",
      top: "0",
      right: "0",
    },
    section: {
      marginTop: theme.spacing(2),
    },
    dropArea: {
      "textAlign": "center",
      "padding": "24px",
      "border": "4px dotted #c7c7c7",
      "backgroundColor": darken(theme.palette.background.paper, 0.01),
      "cursor": "pointer",
      "&:hover": {
        backgroundColor: darken(theme.palette.background.paper, 0.2),
      },
    },
    disabled: {
      cursor: "not-allowed",
    },
  }),
);

function ImageWidget(props: WidgetArgs) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [url, setURL] = useState<string>("");
  const [imageUploaderElement, setImageUploaderElement] = useState<
    HTMLInputElement
  >(null);
  const [uploadingImages, setUploadingImages] = useState<boolean>(false);

  function clickDropArea(e: any) {
    e.preventDefault();
    e.stopPropagation();
    if (!imageUploaderElement || uploadingImages) return;
    imageUploaderElement.onchange = function (event) {
      const target = event.target as any;
      const files = target.files || [];
      new Noty({
        type: "info",
        text: t("utils/uploading-image"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
      setUploadingImages(true);
      smmsUploadImages(files)
        .then((urls) => {
          let markdown = ``;
          urls.forEach((url) => {
            markdown = markdown + `![](${url})  \n`;
          });
          props.replaceSelf(markdown);
        })
        .catch((error: any) => {
          // console.log(error);
          setUploadingImages(false);
          new Noty({
            type: "error",
            text: t("utils/upload-image-failure"),
            layout: "topRight",
            theme: "relax",
            timeout: 2000,
          }).show();
        });
    };
    imageUploaderElement.click();
  }

  if (props.isPreview) {
    return <span></span>;
  }

  return (
    <Card elevation={2} className={clsx(classes.card)}>
      <Typography variant={"h5"}>
        {t("widget/crossnote.image/image-helper")}
      </Typography>
      <Box className={clsx(classes.actionButtons)}>
        <Tooltip title={t("general/Delete")}>
          <IconButton onClick={() => props.removeSelf()}>
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </Box>
      {!uploadingImages && (
        <Box className={clsx(classes.section)}>
          <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
            {"URL"}
          </Typography>
          <Input
            margin={"dense"}
            placeholder={t("widget/crossnote.image/image-url-placeholder")}
            value={url}
            onChange={(event) => {
              setURL(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.which === 13) {
                props.replaceSelf(`![](${url})\n`);
              }
            }}
            fullWidth={true}
          ></Input>
        </Box>
      )}
      <Box className={clsx(classes.section)}>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("general/Upload")}
        </Typography>
        <Box
          className={clsx(
            classes.dropArea,
            uploadingImages ? classes.disabled : null,
          )}
          onClick={clickDropArea}
        >
          <Typography>
            {uploadingImages
              ? t("utils/uploading-image")
              : t("widget/crossnote.image/click-here-to-browse-image-file")}
          </Typography>
        </Box>
      </Box>
      <Box className={clsx(classes.section)}>
        <Typography variant={"caption"}>
          {t("widget/crossnote.image/thanks_sm_ms")}
        </Typography>
      </Box>
      <input
        type="file"
        multiple
        style={{ display: "none" }}
        ref={(element: HTMLInputElement) => {
          setImageUploaderElement(element);
        }}
      ></input>
    </Card>
  );
}

export const ImageWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <ImageWidget {...args}></ImageWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
