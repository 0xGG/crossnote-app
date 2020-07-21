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

interface TProps {
  label: string;
}
function TestComponent(props: TProps) {
  return <h1>{props.label}</h1>;
}
export function MainPanel() {
  const classes = useStyles();
  const container = useRef<HTMLDivElement>(null);
  const crossnoteContainer = CrossnoteContainer.useContainer();

  const factory = useCallback((node: TabNode) => {
    console.log("render component: ", node.getName(), node.getConfig());
    const component = node.getComponent();
    if (component === "testComponent") {
      return <TestComponent label={node.getName()}></TestComponent>;
    } else if (component === "Settings") {
      return <Settings></Settings>;
    }
  }, []);

  useEffect(() => {
    console.log("render MainPanel");
    if (container && crossnoteContainer.layoutModel) {
      console.log(
        "activeTabset: ",
        crossnoteContainer.layoutModel.getActiveTabset(),
      );
      let nodeId = "";
      crossnoteContainer.layoutModel.visitNodes((node, level) => {
        nodeId = node.getId();
      });
      if (nodeId) {
        crossnoteContainer.layoutModel.doAction(Actions.selectTab(nodeId));
      } else {
      }
    }
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
