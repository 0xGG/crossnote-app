import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import {
  Box,
  Card,
  FormControlLabel,
  IconButton,
  Input,
  Switch,
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
    dropArea: {
      "textAlign": "center",
      "padding": "24px",
      "border": "4px dotted #c7c7c7",
      "backgroundColor": "#f1f1f1",
      "cursor": "pointer",
      "&:hover": {
        backgroundColor: "#eee",
      },
    },
    disabled: {
      cursor: "not-allowed",
    },
  }),
);

function NeteaseMusicWidget(props: WidgetArgs) {
  const attributes = props.attributes;
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [id, setID] = useState<string>(attributes["id"] || "");
  const [autoplay, setAutoplay] = useState<boolean>(
    attributes["autoplay"] || false,
  );

  if (attributes["id"]) {
    return (
      <iframe
        title={"netease_music_" + attributes["id"]}
        style={{
          maxWidth: "100%",
          width: "333px",
          height: "86px",
          border: "none",
        }}
        src={`https://music.163.com/outchain/player?type=3&id=${
          attributes["id"]
        }&auto=${attributes["autoplay"] ? "1" : "0"}&height=66`}
      ></iframe>
    );
  }

  if (props.isPreview) {
    return <span></span>;
  }

  return (
    <Card elevation={2} className={clsx(classes.card)}>
      <Typography variant={"h5"}>
        {t("editor/toolbar/netease-music")}
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
          {t("general/ID")}
        </Typography>
        <Input
          margin={"dense"}
          placeholder={t("widget/crossnote.neteasemusic/song-id-placeholder")}
          value={id}
          onChange={(event) => {
            setID(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.which === 13) {
              if (id) {
                const attrs = {
                  autoplay,
                  id,
                };
                props.setAttributes(attrs);
              }
            }
          }}
          fullWidth={true}
        ></Input>
      </Box>
      <Box className={clsx(classes.section)}>
        <FormControlLabel
          label={t("widget/autoplay")}
          control={
            <Switch
              checked={autoplay}
              onChange={() => setAutoplay(!autoplay)}
              color={"primary"}
            ></Switch>
          }
        ></FormControlLabel>
      </Box>
    </Card>
  );
}

export const NeteaseMusicWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <NeteaseMusicWidget {...args}></NeteaseMusicWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
