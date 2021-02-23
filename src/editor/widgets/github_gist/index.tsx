import { WidgetArgs, WidgetCreator } from "@0xgg/echomd/widget";
import {
  Box,
  Card,
  IconButton,
  TextField,
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
import { TrashCan, TrashCanOutline } from "mdi-material-ui";
import React, { useCallback, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
// @ts-ignore
import Gist from "super-react-gist"; // <-- import the library
import { globalContainers } from "../../../containers/global";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    card: {
      padding: theme.spacing(2),
      position: "relative",
    },
    actionButtonsGroup: {
      position: "absolute",
      top: "0",
      right: "0",
      display: "flex",
      alignItems: "center",
    },
  }),
);

function GitHubGistWidget(props: WidgetArgs) {
  const classes = useStyles(props);
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
          <Box className={clsx(classes.actionButtonsGroup)}>
            <IconButton onClick={() => props.removeSelf()}>
              <TrashCanOutline></TrashCanOutline>
            </IconButton>
          </Box>
        )}
      </Box>
    );
  }

  if (props.isPreview) {
    return null;
  }

  return (
    <Card elevation={2} className={clsx(classes.card)}>
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
      <Box className={clsx(classes.actionButtonsGroup)}>
        <Tooltip title={t("general/Delete")}>
          <IconButton onClick={() => props.removeSelf()}>
            <TrashCan></TrashCan>
          </IconButton>
        </Tooltip>
      </Box>
    </Card>
  );
}

export const GitHubGistWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(
    <ThemeProvider theme={globalContainers.settingsContainer.theme.muiTheme}>
      <GitHubGistWidget {...args}></GitHubGistWidget>
    </ThemeProvider>,
    el,
  );
  return el;
};
