import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
} from "@material-ui/core";
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
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { pfs } from "../lib/fs";
import { TabNodeComponent, TabNodeConfig } from "../lib/tabNode";
import { PrivacyPolicy } from "../pages/Privacy";
import GraphView from "./GraphView";
import { Loading } from "./Loading";
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
        "backgroundColor": theme.palette.background.paper,
        "&::before": {
          content: '"📖"',
          top: "50%",
          left: "50%",
          position: "absolute",
          transform: "translate(-50%, -50%)",
          color: theme.palette.text.hint,
          fontSize: "1.6rem",
        },
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
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();
  const { t } = useTranslation();

  const factory = useCallback(
    (node: TabNode) => {
      if (!crossnoteContainer.initialized || !ready) {
        return <Loading></Loading>;
      }
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
        const notebook = crossnoteContainer.getNotebookAtPath(
          config.notebookPath,
        );
        if (notebook) {
          renderElement = (
            <NotesPanel
              tabNode={node}
              notebook={notebook}
              title={t("general/notes")}
            ></NotesPanel>
          );
        }
      } else if (component === "Privacy") {
        renderElement = (
          <PrivacyPolicy toggleDrawer={props.toggleDrawer}></PrivacyPolicy>
        );
      } else if (component === "Note") {
        const notebook = crossnoteContainer.getNotebookAtPath(
          config.notebookPath,
        );
        if (notebook) {
          renderElement = (
            <NotePanel
              notebook={notebook}
              noteFilePath={config.noteFilePath}
              tabNode={node}
              reference={config.reference}
            ></NotePanel>
          );
        }
      } else if (component === "Graph") {
        const notebook = crossnoteContainer.getNotebookAtPath(
          config.notebookPath,
        );
        if (notebook) {
          renderElement = (
            <GraphView notebook={notebook} tabNode={node}></GraphView>
          );
        }
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
    [
      ready,
      props.toggleDrawer,
      t,
      settingsContainer.theme.muiTheme,
      crossnoteContainer.initialized,
      crossnoteContainer.getNotebookAtPath,
    ],
  );

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setReady(true);
  }, []);

  useEffect(() => {
    if (crossnoteContainer.layoutModel) {
      const data = crossnoteContainer.layoutModel.toJson();
      let hasLocalDirectory = false;
      const layout = data.layout || {};
      const children = layout.children || [];
      for (let i = 0; i < children.length; i++) {
        const children2 = children[i].children || [];
        for (let j = 0; j < children2.length; j++) {
          const child = children2[j];
          if (child && child.config.notebookPath) {
            if (pfs.isPathOfLocalFileSystem(child.config.notebookPath)) {
              hasLocalDirectory = true;
              break;
            }
          }
        }
        if (hasLocalDirectory) {
          break;
        }
      }
      if (hasLocalDirectory) {
        setDialogOpen(true);
      } else {
        setReady(true);
      }
    }
  }, [container, crossnoteContainer.layoutModel]);

  return (
    <div className={clsx(classes.mainPanel)} ref={container} id="main-panel">
      <FlexLayout.Layout
        model={crossnoteContainer.layoutModel}
        factory={factory}
        onModelChange={(model) => {
          crossnoteContainer.saveCurrentLayoutModel();
        }}
      ></FlexLayout.Layout>
      {/*
        The dialog here is useful for file system access API requestPermission from user interaction.
      */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth={"sm"}
        fullWidth={true}
      >
        <DialogContent>
          <DialogContentText>
            {t("general/welcome-back-to-crossnote")} 😆
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} color="primary" autoFocus>
            {t("general/continue")}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
