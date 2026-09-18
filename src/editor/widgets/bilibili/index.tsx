import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import {
  Box,
  Card,
  IconButton,
  Input,
  Tooltip,
  Typography,
} from "@mui/material";
import { styled, ThemeProvider } from "@mui/material/styles";
import { TrashCan } from "mdi-material-ui";
import React, { useState } from "react";
import { renderWidget } from "../../../utilities/widgetRender";
import { useTranslation } from "react-i18next";
import { globalContainers } from "../../../containers/global";

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

const VideoWrapper = styled(Box)({
  cursor: "default",
  position: "relative",
  width: "100%",
  height: "0",
  paddingTop: "56.25%",
});

const VideoFrame = styled("iframe")({
  backgroundColor: "#ddd",
  border: "none",
  position: "absolute",
  left: "0",
  top: "0",
  width: "100%",
  height: "100%",
});

const ErrorMessage = styled(Typography)(({ theme }) => ({
  color: "#f44336",
  marginTop: theme.spacing(2),
}));

function BilibiliWidget(props: WidgetArgs) {
  const attributes = props.attributes;
  const { t } = useTranslation();
  const [url, setURL] = useState<string>("");
  const [error, setError] = useState<string>("");

  if (attributes["aid"]) {
    return (
      <span style={{ cursor: "default" }}>
        <VideoWrapper>
          <VideoFrame
            title={"bilibili_" + attributes["id"]}
            src={`https://player.bilibili.com/player.html?aid=${attributes["aid"]}`}
            scrolling={"no"}
            frameBorder={"no"}
            allowFullScreen={true}
          ></VideoFrame>
        </VideoWrapper>
      </span>
    );
  }
  if (attributes["bvid"]) {
    return (
      <span style={{ cursor: "default" }}>
        <VideoWrapper>
          <VideoFrame
            title={"bilibili_" + attributes["id"]}
            src={`https://player.bilibili.com/player.html?bvid=BV${attributes["bvid"]}`}
            scrolling={"no"}
            frameBorder={"no"}
            allowFullScreen={true}
          ></VideoFrame>
        </VideoWrapper>
      </span>
    );
  }

  if (props.isPreview) {
    return <span></span>;
  }

  return (
    <WidgetCard elevation={2}>
      <Typography variant={"h5"}>
        {t("widget/crossnote.bilibili/Bilibili")}
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
      <Section>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("widget/crossnote.bilibili/bilibili-video-url")}
        </Typography>
        <Input
          margin={"dense"}
          placeholder={t("widget/crossnote.bilibili/url-placeholder")}
          value={url}
          onChange={(event) => {
            setURL(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.which === 13) {
              if (url && url.match(/\/av(\d+)/)) {
                const aid = url.match(/\/av(\d+)/)[1];
                const attrs = {
                  aid,
                };
                props.setAttributes(attrs);
              } else if (url && url.match(/\/BV(.+?)($|\/|\?)/)) {
                const bvid = url.match(/\/BV(.+?)($|\/|\?)/)[1];
                const attrs = {
                  bvid,
                };
                props.setAttributes(attrs);
              } else {
                setError(t("widget/crossnote.bilibili/error_message"));
              }
            }
          }}
          fullWidth={true}
        ></Input>
        <ErrorMessage>{error}</ErrorMessage>
      </Section>
    </WidgetCard>
  );
}

export const BilibiliWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  renderWidget(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <BilibiliWidget {...args}></BilibiliWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
