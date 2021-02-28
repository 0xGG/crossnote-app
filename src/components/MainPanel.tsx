import { Box } from "@material-ui/core";
import {
  createStyles,
  darken,
  makeStyles,
  Theme,
  ThemeProvider,
} from "@material-ui/core/styles";
import clsx from "clsx";
import FlexLayout, { TabNode } from "flexlayout-react";
import "flexlayout-react/style/light.css";
import React, { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { TabNodeComponent, TabNodeConfig } from "../lib/tabNode";
import { PrivacyPolicy } from "../pages/Privacy";
import GraphView from "./GraphView";
import NotePanel from "./NotePanel";
import NotesPanel from "./NotesPanel";
import { Notifications } from "./Notifications";
import { Settings } from "./Settings";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    mainPanel: {
      "position": "relative",
      "display": "flex",
      "flexDirection": "row",
      "flexGrow": 1,
      "overflow": "auto",
      // overright the flexlayout style
      "& .flexlayout__tabset": {
        backgroundColor: theme.palette.background.paper,
      },
      "& .flexlayout__tabset_tabbar_outer.flexlayout__tabset_tabbar_outer_top": {
        backgroundColor: darken(theme.palette.background.default, 0.04),
        borderColor: theme.palette.divider,
        border: "none",
      },
      "& .flexlayout__tab_button": {
        color: theme.palette.text.primary,
      },
      "& .flexlayout__tab_button.flexlayout__tab_button--selected": {
        backgroundColor: theme.palette.background.paper,
      },
      "& .flexlayout__tab_button:hover": {
        backgroundColor: theme.palette.background.paper,
      },
      "& .flexlayout__splitter": {
        backgroundColor: darken(theme.palette.background.default, 0.04),
      },
      "& .flexlayout__tab": {
        backgroundColor: theme.palette.background.paper,
      },
      "& .flexlayout__popup_menu_container": {
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.background.paper,
        borderColor: theme.palette.divider,
      },
      "& .flexlayout__popup_menu_container .flexlayout__popup_menu_item:hover": {
        backgroundColor: darken(theme.palette.background.paper, 0.1),
        cursor: "pointer",
      },
      "& .flexlayout__outline_rect": {
        borderColor: theme.palette.primary.main,
      },
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
  const settingsContainer = SettingsContainer.useContainer();
  const { t } = useTranslation();

  const factory = useCallback(
    (node: TabNode) => {
      const config: TabNodeConfig = node.getConfig();
      /*
      console.log(
        "render component: \n",
        `* id: ${node.getId()}\n`,
        `* name: ${node.getName()}\n`,
        `* config: `,
        node.getConfig(),
      );
      */
      const component: TabNodeComponent = node.getComponent() as TabNodeComponent;
      let renderElement = <Box></Box>;
      if (component === "Settings") {
        renderElement = <Settings></Settings>;
      } else if (component === "Notes") {
        renderElement = (
          <NotesPanel
            tabNode={node}
            notebook={config.notebook}
            title={t("general/notes")}
          ></NotesPanel>
        );
      } else if (component === "Privacy") {
        renderElement = (
          <PrivacyPolicy toggleDrawer={props.toggleDrawer}></PrivacyPolicy>
        );
      } else if (component === "Note") {
        renderElement = (
          <NotePanel
            notebook={config.notebook}
            note={config.note}
            tabNode={node}
            reference={config.reference}
          ></NotePanel>
        );
      } else if (component === "Graph") {
        renderElement = (
          <GraphView notebook={config.notebook} tabNode={node}></GraphView>
        );
      } else if (component === "Notifications") {
        renderElement = <Notifications></Notifications>;
      } else {
        console.error("Invalid component: ", component);
      }

      return (
        <ThemeProvider theme={settingsContainer.theme.muiTheme}>
          {renderElement}
        </ThemeProvider>
      );
    },
    [props.toggleDrawer, t, settingsContainer.theme.muiTheme],
  );

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
