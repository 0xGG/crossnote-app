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

function AudioWidget(props: WidgetArgs) {
  const attributes = props.attributes;
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
    <WidgetCard elevation={2}>
      <Typography variant={"h5"}>{t("general/Audio")}</Typography>
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
      </Section>
      <Section>
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
      </Section>
    </WidgetCard>
  );
}

export const AudioWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  renderWidget(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <AudioWidget {...args}></AudioWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
