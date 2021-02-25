import {
  Avatar,
  Badge,
  Box,
  CircularProgress,
  CssBaseline,
  Divider,
  Drawer,
  Fab,
  Hidden,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Tooltip,
} from "@material-ui/core";
import {
  createStyles,
  fade,
  makeStyles,
  Theme,
  useTheme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import Identicon from "identicon.js";
import { sha256 } from "js-sha256";
import {
  Bell,
  Cog as SettingsIcon,
  Menu,
  Notebook,
  PlusCircleOutline,
} from "mdi-material-ui";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AddNotebookDialog from "../components/AddNotebookDialog";
import { AuthDialog } from "../components/AuthDialog";
import LanguageSelectorDialog from "../components/LanguageSelectorDialog";
import { MainPanel } from "../components/MainPanel";
import NotebookTreeView from "../components/NotebookTreeView";
import { CloudContainer } from "../containers/cloud";
import { CrossnoteContainer, HomeSection } from "../containers/crossnote";
import { globalContainers } from "../containers/global";
import { SettingsContainer } from "../containers/settings";
const is = require("is_js");

const drawerWidth = 200;
const notesPanelWidth = 350;
const notesPanelMinWidth = 220;
const notesPanelMaxWidth = 400;
const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    page: {
      display: "flex",
      width: "100%",
      height: "100%",
    },
    appBar: {
      zIndex: theme.zIndex.drawer + 1,
      boxShadow: "none",
    },
    toolBar: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    search: {
      "position": "relative",
      "borderRadius": theme.shape.borderRadius,
      "backgroundColor": fade(theme.palette.common.white, 0.15),
      "&:hover": {
        backgroundColor: fade(theme.palette.common.white, 0.25),
      },
      "marginRight": theme.spacing(2),
      "marginLeft": 0,
      "width": "100%",
      [theme.breakpoints.up("sm")]: {
        marginLeft: theme.spacing(3),
        width: "auto",
      },
    },
    searchIcon: {
      width: theme.spacing(7),
      height: "100%",
      position: "absolute",
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    inputRoot: {
      color: "inherit",
    },
    inputInput: {
      padding: theme.spacing(1, 1, 1, 7),
      transition: theme.transitions.create("width"),
      width: "100%",
      [theme.breakpoints.up("md")]: {
        width: 200,
      },
    },
    displayNone: {
      display: "none",
    },
    drawer: {
      [theme.breakpoints.up("sm")]: {
        width: drawerWidth,
        flexShrink: 0,
      },
    },
    drawerPaper: {
      width: drawerWidth,
      backgroundColor: theme.palette.background.default,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      overflow: "hidden",
    },
    notebooksSection: {
      overflowY: "auto",
    },
    controllersSection: {
      // flex: 1,
    },
    listItemIcon: {
      color: theme.palette.text.secondary,
    },
    avatar: {
      width: "24px",
      height: "24px",
      borderRadius: "4px",
    },
    selectedSection: {
      backgroundColor: "#ccc",
    },
    left: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
    menuButton: {
      marginRight: theme.spacing(2),
      /*
      [theme.breakpoints.up("sm")]: {
        display: "none"
      }
      */
    },
    notesPanel: {
      maxWidth: "100%",
      height: "100%",
      borderRadius: 0,
      backgroundColor: theme.palette.background.default,
      [theme.breakpoints.down("xs")]: {
        width: "100%",
      },
    },
    editorPanel: {
      position: "absolute",
      width: "100%",
      height: "100%",
      borderRadius: 0,
      backgroundColor: theme.palette.background.default,
      [theme.breakpoints.down("md")]: {
        // width: `calc(100% - ${notesPanelWidth}px)`,
        // left: `${notesPanelWidth}px`
      },
      [theme.breakpoints.down("xs")]: {
        display: "none",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
      },
    },
    toolBarSpace: theme.mixins.toolbar,
    fab: {
      position: "fixed",
      bottom: theme.spacing(2),
      right: theme.spacing(2),
      zIndex: 999,
    },
  }),
);

interface QueryParams {
  notebookID?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
}

interface Props {
  section: HomeSection;
  queryParams: QueryParams;
}

export function Home(props: Props) {
  const classes = useStyles(props);
  const theme = useTheme();
  // const isMobile = useMediaQuery(theme.breakpoints.down("xs"));
  const [addNotebookDialogOpen, setAddNotebookDialogOpen] = useState<boolean>(
    false,
  );
  const [addNotebookRepo, setAddNotebookRepo] = useState<string>("");
  const [addNotebookBranch, setAddNotebookBranch] = useState<string>("");

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const cloudContainer = CloudContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();

  // HACK: Register globalContainers for widgets use
  globalContainers.cloudContainer = cloudContainer;
  globalContainers.settingsContainer = settingsContainer;
  globalContainers.crossnoteContainer = crossnoteContainer;

  const toggleDrawer = useCallback(() => {
    setDrawerOpen(!drawerOpen);
  }, [drawerOpen]);

  useEffect(() => {
    if (!crossnoteContainer.initialized) {
      return;
    }
    if (props.section === HomeSection.Notebooks) {
      if (props.queryParams) {
        if (props.queryParams.repo && props.queryParams.branch) {
          const repo = decodeURIComponent(props.queryParams.repo || "");
          const branch = decodeURIComponent(props.queryParams.branch || "");
          const filePath = decodeURIComponent(props.queryParams.filePath || "");
          const notebook = crossnoteContainer.notebooks.find(
            (nb) => nb.gitURL === repo && nb.gitBranch === branch,
          );
          if (notebook) {
            notebook
              .refreshNotesIfNotLoaded({
                dir: "./",
                includeSubdirectories: true,
              })
              .then((notes) => {
                if (filePath) {
                  const note = notes[filePath];
                  if (note) {
                    crossnoteContainer.addTabNode({
                      type: "tab",
                      component: "Note",
                      config: {
                        singleton: false,
                        note,
                        notebook: notebook,
                      },
                      name: `📝 ` + note.title,
                    });
                  } else {
                    //note not found
                    crossnoteContainer.addTabNode({
                      type: "tab",
                      component: "Notes",
                      id: "Notes: " + notebook.dir,
                      name: "📔 " + notebook.name,
                      config: {
                        singleton: true,
                        notebook: notebook,
                      },
                    });
                  }
                } else {
                  crossnoteContainer.addTabNode({
                    type: "tab",
                    component: "Notes",
                    id: "Notes: " + notebook.dir,
                    name: "📔 " + notebook.name,
                    config: {
                      singleton: true,
                      notebook: notebook,
                    },
                  });
                }
              });
          } else {
            // Show dialog
            setAddNotebookRepo(repo);
            setAddNotebookBranch(branch);
            setAddNotebookDialogOpen(true);
          }
        }
      }
    }
  }, [props.section, props.queryParams, crossnoteContainer.initialized]);

  useEffect(() => {
    crossnoteContainer.setHomeSection(props.section);
  }, [props.section]);

  const drawer = (
    <React.Fragment>
      <Box
        className={clsx(classes.notebooksSection)}
        style={{
          overflowY: crossnoteContainer.initialized ? "auto" : "hidden",
        }}
      >
        <List disablePadding={true}>
          <ListItem>
            <ListItemIcon className={clsx(classes.listItemIcon)}>
              <Notebook></Notebook>
            </ListItemIcon>
            <ListItemText primary={t("general/Notebooks")}></ListItemText>
            <ListItemSecondaryAction style={{ right: "0" }}>
              {crossnoteContainer.initialized && (
                <Tooltip title={t("general/add-a-notebook")}>
                  <IconButton
                    className={clsx(classes.listItemIcon)}
                    onClick={() => setAddNotebookDialogOpen(true)}
                  >
                    <PlusCircleOutline></PlusCircleOutline>
                  </IconButton>
                </Tooltip>
              )}
            </ListItemSecondaryAction>
          </ListItem>
        </List>
        <List disablePadding={true} style={{ marginBottom: theme.spacing(16) }}>
          {crossnoteContainer.notebooks.map((notebook) => {
            return (
              <ListItem
                disableGutters={true}
                style={{ padding: "0" }}
                key={notebook._id}
              >
                <NotebookTreeView
                  notebook={notebook}
                  onCloseDrawer={() => setDrawerOpen(false)}
                ></NotebookTreeView>
              </ListItem>
            );
          })}
          {!crossnoteContainer.initialized && (
            <ListItem>
              <CircularProgress style={{ margin: "0 auto" }}></CircularProgress>
            </ListItem>
          )}
        </List>
      </Box>

      <Box className={clsx(classes.controllersSection)}>
        <Divider></Divider>
        <List disablePadding={true}>
          {/*
          <ListItem
            button
            onClick={() => {
              browserHistory.push(`/explore`);
              setDrawerOpen(false);
            }}
            style={{ display: is.online() ? "flex" : "none" }}
          >
            <ListItemIcon className={clsx(classes.listItemIcon)}>
              <img
                src="/logo.svg"
                style={{ width: "28px", height: "28px" }}
                alt={"Crossnote"}
              ></img>
            </ListItemIcon>
            <ListItemText primary={t("general/Explore")}></ListItemText>
          </ListItem>
          */}
          <ListItem
            button
            onClick={() => {
              crossnoteContainer.addTabNode({
                type: "tab",
                component: "Settings",
                name: "⚙️ " + t("general/Settings"),
                id: "Settings",
                config: {
                  singleton: true,
                },
              });
              setDrawerOpen(false);
            }}
          >
            {cloudContainer.viewer ? (
              <ListItemIcon className={clsx(classes.listItemIcon)}>
                <Avatar
                  className={clsx(classes.avatar)}
                  variant={"rounded"}
                  src={
                    cloudContainer.viewer.avatar ||
                    "data:image/png;base64," +
                      new Identicon(
                        sha256(
                          cloudContainer.viewer &&
                            cloudContainer.viewer.username,
                        ),
                        80,
                      ).toString()
                  }
                ></Avatar>
              </ListItemIcon>
            ) : (
              <ListItemIcon className={clsx(classes.listItemIcon)}>
                <SettingsIcon></SettingsIcon>
              </ListItemIcon>
            )}
            <ListItemText primary={t("general/Settings")}></ListItemText>
          </ListItem>
          {cloudContainer.loggedIn && (
            <ListItem
              button
              onClick={() => {
                crossnoteContainer.addTabNode({
                  type: "tab",
                  component: "Notifications",
                  name: "🔔 " + t("general/Notifications"),
                  id: "Notifications",
                  config: {
                    singleton: true,
                  },
                });
                setDrawerOpen(false);
              }}
            >
              <ListItemIcon className={clsx(classes.listItemIcon)}>
                {cloudContainer.viewer.notifications.totalCount > 0 ? (
                  <Badge
                    color={"secondary"}
                    badgeContent={
                      cloudContainer.viewer.notifications.totalCount || ""
                    }
                  >
                    <Bell></Bell>
                  </Badge>
                ) : (
                  <Bell></Bell>
                )}
              </ListItemIcon>
              <ListItemText primary={t("general/Notifications")}></ListItemText>
            </ListItem>
          )}
        </List>
      </Box>
    </React.Fragment>
  );

  return (
    <Box className={clsx(classes.page)}>
      <CssBaseline></CssBaseline>
      <nav className={clsx(classes.drawer, "drawer")}>
        {/* The implementation can be swapped with js to avoid SEO duplication of links. */}
        <Hidden smUp implementation="css">
          <Drawer
            variant="temporary"
            open={drawerOpen}
            onClose={toggleDrawer}
            classes={{
              paper: classes.drawerPaper,
            }}
            ModalProps={{
              keepMounted: true, // Better open performance on mobile.
            }}
          >
            {drawer}
          </Drawer>
        </Hidden>
        <Hidden xsDown implementation="css">
          <Drawer
            classes={{
              paper: classes.drawerPaper,
            }}
            variant="permanent"
            open
          >
            {drawer}
          </Drawer>
        </Hidden>
        <Hidden smUp implementation="css">
          <Fab
            color="primary"
            size="small"
            onClick={toggleDrawer}
            className={clsx(classes.fab)}
          >
            <Menu></Menu>
          </Fab>
        </Hidden>
      </nav>
      <MainPanel toggleDrawer={toggleDrawer}></MainPanel>
      <AddNotebookDialog
        open={addNotebookDialogOpen}
        onClose={() => setAddNotebookDialogOpen(false)}
        canCancel={true}
        gitURL={addNotebookRepo}
        gitBranch={addNotebookBranch}
      ></AddNotebookDialog>
      <AuthDialog
        open={cloudContainer.authDialogOpen}
        onClose={() => cloudContainer.setAuthDialogOpen(false)}
      ></AuthDialog>
      <LanguageSelectorDialog></LanguageSelectorDialog>
    </Box>
  );
}
