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
    disabled: {
      cursor: "not-allowed",
    },
  }),
);

function AudioWidget(props: WidgetArgs) {
  const attributes = props.attributes;
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [source, setSource] = useState<string>(attributes["source"] || "");
  const [autoplay, setAutoplay] = useState<boolean>(
    attributes["autoplay"] || false,
  );
  const [controls, setControls] = useState<boolean>(
    attributes["controls"] || true,
  );
  const [loop, setLoop] = useState<boolean>(attributes["loop"] || false);
  const [muted, setMuted] = useState<boolean>(attributes["muted"] || false);

  if (attributes["src"]) {
    return (
      <span style={{ cursor: "default" }}>
        <audio
          autoPlay={attributes["autoplay"] || attributes["autoPlay"]}
          controls={attributes["controls"]}
          loop={attributes["loop"]}
          muted={attributes["muted"]}
          style={attributes["style"]}
        >
          {t("widget/crossnote.audio/audio_element_fail")}
          <source src={attributes["src"]} type={attributes["type"]}></source>
        </audio>
        {!props.isPreview && !attributes["controls"] && "🎵"}
      </span>
    );
  }

  if (props.isPreview) {
    return <span></span>;
  }

  return (
    <Card elevation={2} className={clsx(classes.card)}>
      <Typography variant={"h5"}>{t("general/Audio")}</Typography>
      <Box className={clsx(classes.actionButtons)}>
        <Tooltip title={t("general/Delete")}>
          <IconButton onClick={() => props.removeSelf()}>
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </Box>
      <Box className={clsx(classes.section)}>
        <Typography variant={"subtitle1"} style={{ marginBottom: "8px" }}>
          {t("general/source-url")}
        </Typography>
        <Input
          margin={"dense"}
          placeholder={t("widget/crossnote.audio/source-url-placeholder")}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.which === 13) {
              if (source) {
                const attrs = {
                  autoplay,
                  controls,
                  loop,
                  muted,
                  src: source,
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
        <FormControlLabel
          label={t("widget/controls")}
          control={
            <Switch
              checked={controls}
              onChange={() => setControls(!controls)}
              color={"primary"}
            ></Switch>
          }
        ></FormControlLabel>
        <FormControlLabel
          label={t("widget/loop")}
          control={
            <Switch
              checked={loop}
              onChange={() => setLoop(!loop)}
              color={"primary"}
            ></Switch>
          }
        ></FormControlLabel>
        <FormControlLabel
          label={t("widget/muted")}
          control={
            <Switch
              checked={muted}
              onChange={() => setMuted(!muted)}
              color={"primary"}
            ></Switch>
          }
        ></FormControlLabel>
      </Box>
    </Card>
  );
}

export const AudioWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <AudioWidget {...args}></AudioWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
