import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
} from "@mui/material";
import { ThemeProvider, darken, styled } from "@mui/material/styles";
import {
  type Action,
  Actions,
  type ILayoutApi,
  type ITabRenderValues,
  Layout,
  TabNode,
} from "flexlayout-react";
import "flexlayout-react/style/light.css";
import React, {
  ComponentProps,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { CrossnoteContainer } from "../containers/crossnote";
import { SettingsContainer } from "../containers/settings";
import { pfs } from "../lib/fs";
import { layoutShowsNotebook } from "../lib/layout";
import { saverOfTab } from "../lib/noteSaver";
import { guardLayoutDrags } from "../lib/layoutDrag";
import { translateLayoutLabel } from "../lib/layoutLabels";
import { toReference } from "../lib/reference";
import { TabNodeComponent, TabNodeConfig } from "../lib/tabNode";
import { CloseUnsavedNoteDialog } from "./CloseUnsavedNoteDialog";
import { Emoji } from "./EmojiWrapper";
import { Loading } from "./Loading";
import NotePanel from "./NotePanel";
import NotesPanel from "./NotesPanel";
import { Settings } from "./Settings";

// The descendant selectors below reach into flexlayout's own DOM; styled
// keeps the class on the same element, so they address the same nodes.
const MainPanelRoot = styled("div")(({ theme }) => ({
  "position": "relative",
  "display": "flex",
  "flexDirection": "row",
  "flexGrow": 1,
  "overflow": "auto",
  // Read by flexlayout-react's theme, these keep what the app had under 0.5:
  // a 4px splitter that is also all there is to grab with a mouse (0.9 moved
  // the splitter size from the model to CSS; on touch screens the library
  // makes the grab area 30px wide) and the font the old theme set (0.11 went
  // over to the system font).
  "--flexlayout-splitter-size": "4px",
  "--flexlayout-splitter-active-size": "4px",
  "--flexlayout-font-family": "Roboto, Arial, sans-serif",
  // The theme's light colours for a hovered close or overflow button and for
  // the current tab in the overflow menu, taken from the app's theme instead.
  "--flexlayout-color-toolbar-button-hover": theme.palette.action.hover,
  "--flexlayout-color-tab-selected": theme.palette.text.primary,
  "--flexlayout-color-tab-selected-background": theme.palette.action.selected,
  // The layout draws every tab name off screen, unwrapped, to drag it by.
  // 0.5 clipped the layout; unclipped, a long name scrolls the whole panel
  // sideways.
  "& .flexlayout__layout": {
    overflow: "hidden",
  },
  // overright the flexlayout style
  "& .flexlayout__tabset": {
    "backgroundColor": theme.palette.background.paper,
    "&::before": {
      content: '"📖"',
      top: "50%",
      left: "50%",
      position: "absolute",
      transform: "translate(-50%, -50%)",
      color: theme.palette.text.disabled,
      fontSize: "1.6rem",
    },
  },
  "& .flexlayout__tabset_tabbar_outer.flexlayout__tabset_tabbar_outer_top": {
    backgroundColor: darken(theme.palette.background.default, 0.04),
    borderColor: theme.palette.divider,
    border: "none",
  },
  // Tabs as they were under 0.5: 22px tall under the strip's 2px top border
  // (a 24px strip), flush with the strip's start, the icon 4px before the
  // name and an 8px close button 8px after it. The library has since made
  // the close button a 1em icon and moved the spacing into a flex gap and a
  // padding.
  "& .flexlayout__tabset_tabbar_inner_tab_container": {
    paddingLeft: 0,
  },
  "& .flexlayout__tab_button": {
    color: theme.palette.text.primary,
    height: 22,
    gap: 0,
  },
  "& .flexlayout__tab_button_leading": {
    marginRight: 4,
    // No line box around the emoji, so it sits in the middle of the tab.
    lineHeight: 0,
  },
  "& .flexlayout__tab_button_trailing": {
    marginLeft: 8,
    fontSize: 8,
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
}));

// What a graph tab shows when the graph could not be loaded (offline, or the
// site updated since the page was opened): the rest of the app goes on.
function GraphViewUnavailable(
  _props: ComponentProps<typeof import("./GraphView").default>,
) {
  const { t } = useTranslation();
  return (
    <Box sx={{ padding: 2 }}>
      <DialogContentText>
        {t("general/graph-view-unavailable")}
      </DialogContentText>
    </Box>
  );
}

// The graph, with d3, is loaded the first time a graph tab is drawn rather
// than with the app.
const GraphView = lazy(() =>
  import("./GraphView").catch(() => ({ default: GraphViewUnavailable })),
);

// Tabs named after what they show rather than after a note or a notebook.
// The name a tab is saved with is in the language it was opened under, so
// these are named afresh each time they are drawn.
const builtInTabLabels: Partial<Record<TabNodeComponent, string>> = {
  Settings: "general/Settings",
  Graph: "general/graph-view",
};

// The emoji a tab shows, by what it shows. Each note has the same one; an
// emoji a layout saved before kept in a tab's config is no longer read.
const tabIcons: Record<TabNodeComponent, string> = {
  Settings: ":gear:",
  Note: ":memo:",
  Notes: ":notebook_with_decorative_cover:",
  Graph: ":spider_web:",
};

export function MainPanel() {
  const container = useRef<HTMLDivElement>(null);
  const layout = useRef<ILayoutApi>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();
  const { t, i18n } = useTranslation();

  // A note's tab closes once what its editor holds is written. When that
  // cannot be, the tab stays and the user is asked. Tabs the app closes
  // itself, as their note or notebook goes, do not come through here.
  const [unsavedTab, setUnsavedTab] = useState<string>(null);
  const closeTab = useCallback(
    (tabId: string) => {
      const model = crossnoteContainer.layoutModel;
      if (model?.getNodeById(tabId)) {
        model.doAction(Actions.deleteTab(tabId));
      }
    },
    [crossnoteContainer.layoutModel],
  );
  const onAction = useCallback(
    (action: Action) => {
      if (action.type !== Actions.DELETE_TAB) {
        return action;
      }
      const tabId: string = action.data.node;
      const saver = saverOfTab(tabId);
      if (!saver?.pending) {
        return action;
      }
      saver.flush().then(
        () => closeTab(tabId),
        () => setUnsavedTab(tabId),
      );
      return undefined;
    },
    [closeTab],
  );

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

      const component: TabNodeComponent =
        node.getComponent() as TabNodeComponent;
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
              reference={toReference(config.reference)}
            ></NotePanel>
          );
        }
      } else if (component === "Graph") {
        const notebook = crossnoteContainer.getNotebookAtPath(
          config.notebookPath,
        );
        if (notebook) {
          renderElement = (
            <Suspense fallback={<Loading></Loading>}>
              <GraphView notebook={notebook} tabNode={node}></GraphView>
            </Suspense>
          );
        }
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
      t,
      settingsContainer.theme.muiTheme,
      crossnoteContainer.initialized,
      crossnoteContainer.getNotebookAtPath,
    ],
  );

  // FlexLayout hands the translator to its model after a render, so one
  // bound to a single language, as `t` is, would leave the labels a render
  // behind each change of language. This one stays the same function and
  // looks labels up in the language the app is in when the layout draws.
  const i18nTranslator = useCallback(
    (key: string) => translateLayoutLabel((k) => i18n.t(k), key),
    [i18n],
  );

  // Tabs are dragged with the same events the panes use for their own drag
  // and drop, a note's editor among them.
  useEffect(() => guardLayoutDrags(container.current), []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setReady(true);
  }, []);

  useEffect(() => {
    if (crossnoteContainer.layoutModel) {
      if (
        layoutShowsNotebook(crossnoteContainer.layoutModel, (notebookPath) =>
          pfs.isPathOfLocalFileSystem(notebookPath),
        )
      ) {
        setDialogOpen(true);
      } else {
        setReady(true);
      }
    }
  }, [container, crossnoteContainer.layoutModel]);

  return (
    <MainPanelRoot ref={container} id="main-panel">
      <Layout
        ref={layout}
        model={crossnoteContainer.layoutModel}
        factory={factory}
        onAction={onAction}
        onModelChange={(model, action) => {
          crossnoteContainer.saveCurrentLayoutModel();
          crossnoteContainer.followLayout(model);
          // The factory reads a tab's config, but the layout calls it again
          // only when it is rendered anew or told to redraw, not when the
          // config changes: a note opened again at another reference would
          // not go to it.
          if (action.type === Actions.UPDATE_NODE_ATTRIBUTES) {
            layout.current?.redraw();
          }
        }}
        onRenderTab={(node, renderValues) => {
          const emoji =
            tabIcons[node.getComponent() as TabNodeComponent] ?? ":memo:";
          renderValues.leading = <Emoji size={16} emoji={emoji}></Emoji>;
          const label =
            builtInTabLabels[node.getComponent() as TabNodeComponent];
          if (label) {
            // The tab shows the content. Its accessible name, and its entry
            // in the menu of hidden tabs, come from the name, which the
            // render values carry although their type leaves it out.
            const name = t(label);
            renderValues.content = name;
            (renderValues as ITabRenderValues & { name: string }).name = name;
          }
        }}
        // Resize the panes once the splitter is dropped, as before. 0.11
        // resizes while dragging by default and warns that this turns choppy
        // when tabs are slow to draw, as editors and the graph are.
        realtimeResize={false}
        i18nTranslator={i18nTranslator}
      ></Layout>
      <CloseUnsavedNoteDialog
        open={unsavedTab !== null}
        onCancel={() => setUnsavedTab(null)}
        onDiscard={() => {
          saverOfTab(unsavedTab)?.discard();
          closeTab(unsavedTab);
          setUnsavedTab(null);
        }}
      ></CloseUnsavedNoteDialog>
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
          <DialogContentText color={"textPrimary"}>
            {t("general/welcome-back-to-crossnote")} 😆
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} color="primary" autoFocus>
            {t("general/continue")}
          </Button>
        </DialogActions>
      </Dialog>
    </MainPanelRoot>
  );
}
