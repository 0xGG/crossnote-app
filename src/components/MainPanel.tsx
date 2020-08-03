import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  fade,
  createStyles,
  makeStyles,
  Theme,
  useTheme,
  lighten,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { Box } from "@material-ui/core";
import FlexLayout, { Model, TabNode, Actions } from "flexlayout-react";
import "flexlayout-react/style/light.css";
import { CrossnoteContainer } from "../containers/crossnote";
import { Settings } from "./Settings";
import { TabNodeComponent, TabNodeConfig } from "../lib/tabNode";
import NotesPanel from "./NotesPanel";
import { PrivacyPolicy } from "../pages/Privacy";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    mainPanel: {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      flexGrow: 1,
      overflow: "auto",
      backgroundColor: theme.palette.background.default,
    },
  }),
);

interface Props {
  toggleDrawer: () => void;
}

export function MainPanel(props: Props) {
  const classes = useStyles();
  const container = useRef<HTMLDivElement>(null);
  const crossnoteContainer = CrossnoteContainer.useContainer();

  const factory = useCallback((node: TabNode) => {
    const config: TabNodeConfig = node.getConfig();
    console.log("render component: ", node.getName(), node.getConfig());
    const component: TabNodeComponent = node.getComponent() as TabNodeComponent;
    if (component === "Settings") {
      return <Settings></Settings>;
    } else if (component === "Notes") {
      return (
        <NotesPanel
          toggleDrawer={props.toggleDrawer}
          notebook={config.notebook}
        ></NotesPanel>
      );
    } else if (component === "Privacy") {
      return <PrivacyPolicy toggleDrawer={props.toggleDrawer}></PrivacyPolicy>;
    }
  }, []);

  useEffect(() => {
    console.log("render MainPanel");
  }, [container, crossnoteContainer.layoutModel]);

  return (
    <div className={clsx(classes.mainPanel)} ref={container} id="main-panel">
      <FlexLayout.Layout
        model={crossnoteContainer.layoutModel}
        factory={factory}
      ></FlexLayout.Layout>
    </div>
  );
}
