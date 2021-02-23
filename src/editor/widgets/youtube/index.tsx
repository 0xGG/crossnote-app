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
  makeStyles,
  Theme,
  ThemeProvider,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { TrashCan } from "mdi-material-ui";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { globalContainers } from "../../../containers/global";

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
    videoWrapper: {
      cursor: "default",
      position: "relative",
      width: "100%",
      height: "0",
      paddingTop: "56.25%",
    },
    video: {
      backgroundColor: "#ddd",
      border: "none",
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
    },
    errorMessage: {
      color: "#f44336",
      marginTop: theme.spacing(2),
    },
  }),
);

function YoutubeWidget(props: WidgetArgs) {
  const attributes = props.attributes;
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [url, setURL] = useState<string>("");
  const [error, setError] = useState<string>("");

  if (attributes["videoID"]) {
    if (!props.isPreview) {
      return (
        <span style={{ cursor: "default" }}>
          <img
            alt={"Youtube: " + attributes["videoID"]}
            src={`https://img.youtube.com/vi/${attributes["videoID"]}/0.jpg`}
            onClick={() => {
              window.open(
                `https://www.youtube.com/watch?v=${attributes["videoID"]}`,
                "_blank",
              );
            }}
            style={{
              cursor: "pointer",
              width: "100%",
            }}
          ></img>
        </span>
      );
    } else {
      return (
        <span style={{ cursor: "default" }}>
          <Box className={clsx(classes.videoWrapper)}>
            <iframe
              title={"youtube_" + attributes["videoID"]}
              className={clsx(classes.video)}
              src={`https://www.youtube.com/embed/${attributes["videoID"]}`}
              scrolling={"no"}
              frameBorder={"no"}
              allowFullScreen={true}
            ></iframe>
          </Box>
        </span>
      );
    }
  }

  if (props.isPreview) {
    return <span></span>;
  }

  return (
    <Card elevation={2} className={clsx(classes.card)}>
      <Typography variant={"h5"}>{t("Youtube")}</Typography>
      <Box className={clsx(classes.actionButtons)}>
        <Tooltip title={t("general/Delete")}>
          <IconButton onClick={() => props.removeSelf()}>
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </Box>
      <Box className={clsx(classes.section)}>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("Youtube video URL")}
        </Typography>
        <Input
          margin={"dense"}
          placeholder={t(
            "widget/crossnote.youtube/youtube-video-url-placeholder",
          )}
          value={url}
          onChange={(event) => {
            setURL(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.which === 13) {
              if (url && url.match(/\?v=(.+?)(&|$)/)) {
                const videoID = url.match(/\?v=(.+?)(&|$)/)[1];
                const attrs = {
                  videoID,
                };
                props.setAttributes(attrs);
              } else if (url && url.match(/\/youtu\.be\/(.+?)(\?|$)/)) {
                const videoID = url.match(/\/youtu\.be\/(.+?)(\?|$)/)[1];
                const attrs = {
                  videoID,
                };
                props.setAttributes(attrs);
              } else {
                setError(t("widget/crossnote.youtube/error_message"));
              }
            }
          }}
          fullWidth={true}
        ></Input>
        <Typography className={clsx(classes.errorMessage)}>{error}</Typography>
      </Box>
    </Card>
  );
}

export const YoutubeWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <YoutubeWidget {...args}></YoutubeWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
