import { WidgetCreator, WidgetArgs } from "vickymd/widget";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import {
  Card,
  Typography,
  IconButton,
  Box,
  Input,
  Tooltip
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { TrashCan } from "mdi-material-ui";
import { useTranslation } from "react-i18next";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      padding: theme.spacing(2),
      position: "relative"
    },
    actionButtons: {
      position: "absolute",
      top: "0",
      right: "0"
    },
    section: {
      marginTop: theme.spacing(2)
    },
    videoWrapper: {
      cursor: "default",
      position: "relative",
      width: "100%",
      height: "0",
      paddingTop: "56.25%"
    },
    video: {
      backgroundColor: "#ddd",
      border: "none",
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%"
    },
    errorMessage: {
      color: "#f44336",
      marginTop: theme.spacing(2)
    }
  })
);

function YoutubeWidget(props: WidgetArgs) {
  const attributes = props.attributes;
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [url, setURL] = useState<string>("");
  const [error, setError] = useState<string>("");

  if (attributes["videoID"]) {
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
            "widget/crossnote.youtube/youtube-video-url-placeholder"
          )}
          value={url}
          onChange={event => {
            setURL(event.target.value);
            setError("");
          }}
          onKeyDown={event => {
            if (event.which === 13) {
              if (url && url.match(/youtube\.com\/watch\?v=(.+?)$/)) {
                const videoID = url.match(/youtube\.com\/watch\?v=(.+?)$/)[1];
                const attrs = {
                  videoID
                };
                props.replaceSelf(
                  `\`@crossnote.youtube ${JSON.stringify(attrs)
                    .replace(/^{/, "")
                    .replace(/}$/, "")}\``
                );
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

export const YoutubeWidgetCreator: WidgetCreator = args => {
  const el = document.createElement("span");
  ReactDOM.render(<YoutubeWidget {...args}></YoutubeWidget>, el);
  return el;
};
