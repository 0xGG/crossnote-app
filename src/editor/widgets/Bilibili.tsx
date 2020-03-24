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

function BilibiliWidget(props: WidgetArgs) {
  const attributes = props.attributes;
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [url, setURL] = useState<string>("");
  const [error, setError] = useState<string>("");

  if (attributes["aid"]) {
    return (
      <span style={{ cursor: "default" }}>
        <Box className={clsx(classes.videoWrapper)}>
          <iframe
            title={"bilibili_" + attributes["id"]}
            className={clsx(classes.video)}
            src={`https://player.bilibili.com/player.html?aid=${attributes["aid"]}`}
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
      <Typography variant={"h5"}>
        {t("widget/crossnote.bilibili/Bilibili")}
      </Typography>
      <Box className={clsx(classes.actionButtons)}>
        <Tooltip title={t("general/Delete")}>
          <IconButton onClick={() => props.removeSelf()}>
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </Box>
      <Box className={clsx(classes.section)}>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("widget/crossnote.bilibili/bilibili-video-url")}
        </Typography>
        <Input
          margin={"dense"}
          placeholder={t("widget/crossnote.bilibili/url-placeholder")}
          value={url}
          onChange={event => {
            setURL(event.target.value);
            setError("");
          }}
          onKeyDown={event => {
            if (event.which === 13) {
              if (url && url.match(/bilibili\.com\/video\/av(\d+)/)) {
                const aid = url.match(/bilibili\.com\/video\/av(\d+)/)[1];
                const attrs = {
                  aid
                };
                props.replaceSelf(
                  `\`@crossnote.bilibili ${JSON.stringify(attrs)
                    .replace(/^{/, "")
                    .replace(/}$/, "")}\``
                );
              } else {
                setError(t("widget/crossnote.bilibili/error_message"));
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

export const BilibiliWidgetCreator: WidgetCreator = args => {
  const el = document.createElement("span");
  ReactDOM.render(<BilibiliWidget {...args}></BilibiliWidget>, el);
  return el;
};
