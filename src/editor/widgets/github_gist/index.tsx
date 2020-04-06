import { WidgetCreator, WidgetArgs } from "vickymd/widget";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import {
  Card,
  Typography,
  IconButton,
  Box,
  Input,
  Tooltip,
  TextField,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { TrashCan } from "mdi-material-ui";
import { useTranslation } from "react-i18next";
import { smmsUploadImages } from "../../../utilities/image_uploader";
import Noty from "noty";

const useStyles = makeStyles((theme: Theme) => createStyles({}));

function GitHubGistWidget(props: WidgetArgs) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [url, setURL] = useState<string>("");

  return (
    <Card elevation={2}>
      <TextField
        label={"Enter GitHub Gist URL"}
        value={url}
        onChange={(event) => setURL(event.target.value)}
      ></TextField>
    </Card>
  );
}

export const GitHubGistWidgetCreator: WidgetCreator = (args) => {
  const el = document.createElement("span");
  ReactDOM.render(<GitHubGistWidget {...args}></GitHubGistWidget>, el);
  return el;
};
