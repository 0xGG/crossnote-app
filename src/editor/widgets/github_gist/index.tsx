import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import {
  Box,
  Card,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { styled, ThemeProvider } from "@mui/material/styles";
import { TrashCan, TrashCanOutline } from "mdi-material-ui";
import React, { useCallback, useState } from "react";
import { renderWidget } from "../../../utilities/widgetRender";
import { useTranslation } from "react-i18next";
// @ts-ignore
import Gist from "super-react-gist"; // <-- import the library
import { globalContainers } from "../../../containers/global";

const WidgetCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  position: "relative",
}));

const ActionButtonsGroup = styled(Box)({
  position: "absolute",
  top: "0",
  right: "0",
  display: "flex",
  alignItems: "center",
});

function GitHubGistWidget(props: WidgetArgs) {
  const { t } = useTranslation();
  const [url, setURL] = useState<string>("");

  const setGistURL = useCallback(
    (url: string) => {
      try {
        const location = new URL(url);
        if (location.host !== "gist.github.com") {
          return;
        } else {
          props.setAttributes({
            url: location.origin + location.pathname,
          });
        }
      } catch (error) {}
    },
    [props],
  );

  if (props.attributes["url"]) {
    return (
      <Box className={"preview github-gist"} style={{ whiteSpace: "normal" }}>
        <Gist url={props.attributes["url"]}></Gist>
        {!props.isPreview && (
          <ActionButtonsGroup>
            <IconButton
              aria-label={t("general/Delete")}
              onClick={() => props.removeSelf()}
            >
              <TrashCanOutline></TrashCanOutline>
            </IconButton>
          </ActionButtonsGroup>
        )}
      </Box>
    );
  }

  if (props.isPreview) {
    return null;
  }

  return (
    <WidgetCard elevation={2}>
      <Typography variant={"h5"}>
        {t("widget/crossnote.github_gist/title")}
      </Typography>
      <TextField
        label={t("widget/crossnote/github_gist/enter-github-gist-url")}
        placeholder={"https://gist.github.com/..."}
        value={url}
        onChange={(event) => setURL(event.target.value)}
        fullWidth={true}
        onKeyUp={(event) => {
          if (event.which === 13) {
            setGistURL(url);
          }
        }}
      ></TextField>
      <ActionButtonsGroup>
        <Tooltip title={t("general/Delete")}>
          <IconButton
            aria-label={t("general/Delete")}
            onClick={() => props.removeSelf()}
          >
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </ActionButtonsGroup>
    </WidgetCard>
  );
}

export const GitHubGistWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  renderWidget(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <GitHubGistWidget {...args}></GitHubGistWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
