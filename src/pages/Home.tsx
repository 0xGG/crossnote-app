import {
  Box,
  CssBaseline,
  Drawer,
  Hidden,
  List,
  ListItem,
  IconButton,
  Divider,
  ListItemIcon,
  ListItemText,
  Avatar,
  CircularProgress,
  Badge,
  useMediaQuery,
  ListItemSecondaryAction,
  Tooltip,
  Card,
} from "@material-ui/core";
import {
  fade,
  createStyles,
  makeStyles,
  Theme,
  useTheme,
  lighten,
} from "@material-ui/core/styles";
import clsx from "clsx";
import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Identicon from "identicon.js";
import { sha256 } from "js-sha256";
import {
  PlusCircleOutline,
  Cog as SettingsIcon,
  Bell,
  Notebook,
} from "mdi-material-ui";
import SplitPane from "react-split-pane";
import {
  CrossnoteContainer,
  SelectedSectionType,
  HomeSection,
} from "../containers/crossnote";
import Editor from "../components/Editor";
import AddNotebookDialog from "../components/AddNotebookDialog";
import NotebookTreeView from "../components/NotebookTreeView";
import NotesPanel from "../components/NotesPanel";
import WikiPanel from "../components/WikiPanel";
import { browserHistory } from "../utilities/history";
import { Settings } from "../components/Settings";
import { CloudContainer } from "../containers/cloud";
import { globalContainers } from "../containers/global";
import { SettingsContainer } from "../containers/settings";
import { AuthDialog } from "../components/AuthDialog";
import { Notifications } from "../components/Notifications";
import ExplorePanel from "../components/ExplorePanel";
import { NotebookPanel } from "../components/NotebookPanel";
import { PrivacyPolicy } from "./Privacy";
import AttachmentsPanel from "../components/AttachmentsPanel";
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
      backgroundColor: lighten(theme.palette.background.paper, 0.05),
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
    mainPanel: {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      flexGrow: 1,
      overflow: "auto",
      backgroundColor: theme.palette.background.default,
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
  const isMobile = useMediaQuery(theme.breakpoints.down("xs"));
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

  const toggleDrawer = useCallback(() => {
    setDrawerOpen(!drawerOpen);
  }, [drawerOpen]);

  useEffect(() => {
    if (!crossnoteContainer.initialized) {
      return;
    }
    if (props.section === HomeSection.Notebooks) {
      if (props.queryParams) {
        const notebookID = props.queryParams["notebookID"];
        if (notebookID) {
          const filePath = decodeURIComponent(props.queryParams.filePath || "");
          const notebook = crossnoteContainer.notebooks.find(
            (nb) => nb._id === notebookID,
          );
          if (notebook && crossnoteContainer.selectedNotebook !== notebook) {
            crossnoteContainer.setSelectedNotebook(notebook);
          }
          if (filePath) {
            crossnoteContainer.setPendingNote({
              notebookID: notebookID,
              filePath,
            });
          } else {
            crossnoteContainer.setPendingNote(null);
          }
        } else if (props.queryParams.repo && props.queryParams.branch) {
          const repo = decodeURIComponent(props.queryParams.repo || "");
          const branch = decodeURIComponent(props.queryParams.branch || "");
          const filePath = decodeURIComponent(props.queryParams.filePath || "");
          const notebook = crossnoteContainer.notebooks.find(
            (nb) => nb.gitURL === repo && nb.gitBranch === branch,
          );
          if (notebook) {
            if (crossnoteContainer.selectedNotebook !== notebook) {
              crossnoteContainer.setSelectedNotebook(notebook);
            }
            if (filePath) {
              crossnoteContainer.setPendingNote({
                repo,
                branch,
                filePath,
              });
            } else {
              crossnoteContainer.setPendingNote(null);
            }
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
                <NotebookTreeView notebook={notebook}></NotebookTreeView>
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
          <ListItem
            button
            onClick={() => {
              browserHistory.push(`/settings`);
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
                browserHistory.push(`/notifications`);
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

  const notesPanel =
    props.section === HomeSection.Notebooks &&
    (crossnoteContainer.selectedSection.type === SelectedSectionType.Wiki ? (
      <Box className={clsx(classes.notesPanel)} id={"notes-panel"}>
        <WikiPanel toggleDrawer={toggleDrawer}></WikiPanel>
      </Box>
    ) : crossnoteContainer.selectedSection.type ===
      SelectedSectionType.Attachments ? (
      <Box className={clsx(classes.notesPanel)} id={"notes-panel"}>
        <AttachmentsPanel toggleDrawer={toggleDrawer}></AttachmentsPanel>
      </Box>
    ) : (
      <Box className={clsx(classes.notesPanel)} id={"notes-panel"}>
        <NotesPanel toggleDrawer={toggleDrawer}></NotesPanel>
      </Box>
    ));

  const editorPanel = props.section === HomeSection.Notebooks && (
    <Card
      className={clsx(classes.editorPanel, "editor-panel")}
      style={{
        display: crossnoteContainer.displayMobileEditor && "block",
      }}
    >
      <Editor note={crossnoteContainer.selectedNote}></Editor>
    </Card>
  );

  const explorePanel = props.section === HomeSection.Explore && (
    <Box className={clsx(classes.notesPanel)}>
      <ExplorePanel toggleDrawer={toggleDrawer}></ExplorePanel>
    </Box>
  );

  const notebookPanel = props.section === HomeSection.Explore && (
    <Card
      className={clsx(classes.editorPanel)}
      style={{
        display: cloudContainer.displayNotebookPreview && "block",
      }}
    >
      <NotebookPanel notebook={cloudContainer.selectedNotebook}></NotebookPanel>
    </Card>
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
      </nav>
      <Box className={clsx(classes.mainPanel)} id="main-panel">
        {props.section === HomeSection.Notebooks &&
          (isMobile ? (
            <React.Fragment>
              {notesPanel}
              {editorPanel}
            </React.Fragment>
          ) : (
            <SplitPane
              defaultSize={notesPanelWidth}
              minSize={notesPanelMinWidth}
              maxSize={notesPanelMaxWidth}
              className={"main-panel-split-pane"}
            >
              {notesPanel}
              {editorPanel}
            </SplitPane>
          ))}
        {props.section === HomeSection.Explore &&
          (isMobile ? (
            <React.Fragment>
              {explorePanel}
              {notebookPanel}
            </React.Fragment>
          ) : (
            <SplitPane
              defaultSize={notesPanelWidth}
              minSize={notesPanelMinWidth}
              maxSize={notesPanelMaxWidth}
              className={"main-panel-split-pane"}
            >
              {explorePanel}
              {notebookPanel}
            </SplitPane>
          ))}
        {props.section === HomeSection.Settings && (
          <Settings toggleDrawer={toggleDrawer}></Settings>
        )}
        {props.section === HomeSection.Notifications && (
          <Notifications toggleDrawer={toggleDrawer}></Notifications>
        )}
        {props.section === HomeSection.Privacy && (
          <PrivacyPolicy toggleDrawer={toggleDrawer}></PrivacyPolicy>
        )}
      </Box>
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
    </Box>
  );
}
