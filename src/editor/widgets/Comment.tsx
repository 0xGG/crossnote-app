import { WidgetCreator, WidgetArgs } from "vickymd/widget";
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { CloudContainer } from "../../containers/cloud";

const useStyles = makeStyles((theme: Theme) => createStyles({}));

function CommentWidget(props: WidgetArgs) {
  const cloudContainer = CloudContainer.useContainer();
  return <span>Comment: {cloudContainer.loggedIn}</span>;
}

export const CommentWidgetCreator: WidgetCreator = args => {
  const el = document.createElement("span");
  ReactDOM.render(<CommentWidget {...args}></CommentWidget>, el);
  return el;
};
