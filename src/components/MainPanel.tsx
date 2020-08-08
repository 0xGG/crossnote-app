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
import NotePanel from "./NotePanel";
import { useTranslation } from "react-i18next";
import GraphView from "./GraphView";

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
  const { t } = useTranslation();

  const factory = useCallback((node: TabNode) => {
    const config: TabNodeConfig = node.getConfig();
    console.log(
      "render component: \n",
      `* id: ${node.getId()}\n`,
      `* name: ${node.getName()}\n`,
      `* config: `,
      node.getConfig(),
    );

    const component: TabNodeComponent = node.getComponent() as TabNodeComponent;
    if (component === "Settings") {
      return <Settings></Settings>;
    } else if (component === "Notes") {
      return (
        <NotesPanel
          notebook={config.notebook}
          title={t("general/notes")}
        ></NotesPanel>
      );
    } else if (component === "Privacy") {
      return <PrivacyPolicy toggleDrawer={props.toggleDrawer}></PrivacyPolicy>;
    } else if (component === "Note") {
      return <NotePanel note={config.note} tabNode={node}></NotePanel>;
    } else if (component === "Graph") {
      return <GraphView notebook={config.notebook}></GraphView>;
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
