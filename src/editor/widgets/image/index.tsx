import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import {
  Box,
  Card,
  IconButton,
  Input,
  Tooltip,
  Typography,
} from "@mui/material";
import { ThemeProvider, darken, styled } from "@mui/material/styles";
import { TrashCan } from "mdi-material-ui";
import Noty from "noty";
import React, { useState } from "react";
import { renderWidget } from "../../../utilities/widgetRender";
import { useTranslation } from "react-i18next";
import { globalContainers } from "../../../containers/global";
import { smmsUploadImages } from "../../../utilities/image_uploader";

const WidgetCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  position: "relative",
}));

const ActionButtons = styled(Box)({
  position: "absolute",
  top: "0",
  right: "0",
});

const Section = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
}));

const DropArea = styled(Box)(({ theme }) => ({
  "textAlign": "center",
  "padding": "24px",
  "border": "4px dotted #c7c7c7",
  "backgroundColor": darken(theme.palette.background.paper, 0.01),
  "cursor": "pointer",
  "&:hover": {
    backgroundColor: darken(theme.palette.background.paper, 0.2),
  },
}));

// The drop area stops taking clicks while an upload runs, which is a state of
// this one element rather than a rule of its own.
const uploadingSx = { cursor: "not-allowed" } as const;

function ImageWidget(props: WidgetArgs) {
  const { t } = useTranslation();
  const [url, setURL] = useState<string>("");
  const [imageUploaderElement, setImageUploaderElement] =
    useState<HTMLInputElement>(null);
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
    <WidgetCard elevation={2}>
      <Typography variant={"h5"}>
        {t("widget/crossnote.image/image-helper")}
      </Typography>
      <ActionButtons>
        <Tooltip title={t("general/Delete")}>
          <IconButton
            aria-label={t("general/Delete")}
            onClick={() => props.removeSelf()}
          >
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </ActionButtons>
      {!uploadingImages && (
        <Section>
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
        </Section>
      )}
      <Section>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("general/Upload")}
        </Typography>
        <DropArea
          sx={uploadingImages ? uploadingSx : undefined}
          onClick={clickDropArea}
        >
          <Typography>
            {uploadingImages
              ? t("utils/uploading-image")
              : t("widget/crossnote.image/click-here-to-browse-image-file")}
          </Typography>
        </DropArea>
      </Section>
      <Section>
        <Typography variant={"caption"}>
          {t("widget/crossnote.image/thanks_sm_ms")}
        </Typography>
      </Section>
      <input
        type="file"
        multiple
        style={{ display: "none" }}
        ref={(element: HTMLInputElement) => {
          setImageUploaderElement(element);
        }}
      ></input>
    </WidgetCard>
  );
}

export const ImageWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  renderWidget(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <ImageWidget {...args}></ImageWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
