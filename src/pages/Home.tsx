import {
  Box,
  CircularProgress,
  CssBaseline,
  Divider,
  Drawer,
  Fab,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Tooltip,
} from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import { drawerClasses } from "@mui/material/Drawer";
import {
  Cog as SettingsIcon,
  Menu,
  Notebook,
  PlusCircleOutline,
} from "mdi-material-ui";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AddNotebookDialog from "../components/AddNotebookDialog";
import LanguageSelectorDialog from "../components/LanguageSelectorDialog";
import { MainPanel } from "../components/MainPanel";
import NotebookTreeView from "../components/NotebookTreeView";
import { CrossnoteContainer } from "../containers/crossnote";
import { globalContainers } from "../containers/global";
import { SettingsContainer } from "../containers/settings";
import { getNoteIcon } from "../lib/note";

const drawerWidth = 200;
const notesPanelWidth = 350;
const notesPanelMinWidth = 220;
const notesPanelMaxWidth = 400;
const Page = styled(Box)({
  display: "flex",
  width: "100%",
  height: "100%",
});

const DrawerNav = styled("nav")(({ theme }) => ({
  [theme.breakpoints.up("sm")]: {
    width: drawerWidth,
    flexShrink: 0,
  },
}));

// The width and the hidden overflow used to arrive as the paper slot's class.
const SideDrawer = styled(Drawer)(({ theme }) => ({
  [`& .${drawerClasses.paper}`]: {
    width: drawerWidth,
    backgroundColor: theme.palette.background.default,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    overflow: "hidden",
  },
}));

const NotebooksSection = styled(Box)({
  overflowY: "auto",
});

const ControllersSection = styled(Box)({
  // flex: 1,
});

const SectionIcon = styled(ListItemIcon)(({ theme }) => ({
  color: theme.palette.text.secondary,
}));

const MenuFab = styled(Fab)(({ theme }) => ({
  position: "fixed",
  bottom: theme.spacing(2),
  right: theme.spacing(2),
  zIndex: 999,
}));

interface QueryParams {
  notebookID?: string;
  repo?: string;
  branch?: string;
  filePath?: string;
}

interface Props {
  queryParams: QueryParams;
}

export function Home(props: Props) {
  const theme = useTheme();
  // const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [addNotebookDialogOpen, setAddNotebookDialogOpen] =
    useState<boolean>(false);
  const [addNotebookRepo, setAddNotebookRepo] = useState<string>("");
  const [addNotebookBranch, setAddNotebookBranch] = useState<string>("");
  const [
    addNotebookDialogHideOpeningLocal,
    setAddNotebookDialogHideOpeningLocal,
  ] = useState<boolean>(false);

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();
  const settingsContainer = SettingsContainer.useContainer();

  // HACK: Register globalContainers for widgets use
  globalContainers.settingsContainer = settingsContainer;
  globalContainers.crossnoteContainer = crossnoteContainer;

  const toggleDrawer = useCallback(() => {
    setDrawerOpen(!drawerOpen);
  }, [drawerOpen]);

  useEffect(() => {
    if (!crossnoteContainer.initialized) {
      return;
    }
    if (props.queryParams) {
      if (props.queryParams.repo && props.queryParams.branch) {
        // The query values are already percent-decoded by URLSearchParams;
        // decoding again would corrupt values containing a literal "%" and
        // throw URIError on malformed sequences.
        const repo = props.queryParams.repo || "";
        const branch = props.queryParams.branch || "";
        const filePath = props.queryParams.filePath || "";
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
                      component: "Note",

                      singleton: false,
                      noteFilePath: note.filePath,
                      notebookPath: note.notebookPath,
                      icon: getNoteIcon(note),
                    },
                    name: note.title,
                  });
                } else {
                  //note not found
                  crossnoteContainer.addTabNode({
                    type: "tab",
                    component: "Notes",
                    id: "Notes: " + notebook.dir,
                    name: notebook.name,
                    config: {
                      component: "Note",

                      singleton: true,
                      notebookPath: notebook.dir,
                      icon: ":notebook_with_decorative_cover:",
                    },
                  });
                }
              } else {
                crossnoteContainer.addTabNode({
                  type: "tab",
                  component: "Notes",
                  id: "Notes: " + notebook.dir,
                  name: notebook.name,
                  config: {
                    component: "Notes",
                    singleton: true,
                    notebookPath: notebook.dir,
                    icon: ":notebook_with_decorative_cover:",
                  },
                });
              }
            })
            .catch((error) => {
              console.error(error);
            });
        } else {
          // Show dialog
          setAddNotebookRepo(repo);
          setAddNotebookBranch(branch);
          setAddNotebookDialogHideOpeningLocal(true);
          setAddNotebookDialogOpen(true);
        }
      }
    }
  }, [props.queryParams, crossnoteContainer.initialized]);

  const drawer = (
    <React.Fragment>
      <NotebooksSection
        style={{
          overflowY: crossnoteContainer.initialized ? "auto" : "hidden",
        }}
      >
        <List disablePadding={true}>
          <ListItem>
            <SectionIcon>
              <Notebook></Notebook>
            </SectionIcon>
            <ListItemText primary={t("general/Notebooks")}></ListItemText>
            <ListItemSecondaryAction style={{ right: "0" }}>
              {crossnoteContainer.initialized && (
                <Tooltip title={t("general/add-a-notebook")}>
                  <IconButton
                    aria-label={t("general/add-a-notebook")}
                    sx={{ color: "text.secondary" }}
                    onClick={() => {
                      setAddNotebookDialogHideOpeningLocal(false);
                      setAddNotebookDialogOpen(true);
                    }}
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
      </NotebooksSection>

      <ControllersSection>
        <Divider></Divider>
        <List disablePadding={true}>
          <ListItemButton
            onClick={() => {
              crossnoteContainer.addTabNode({
                type: "tab",
                component: "Settings",
                name: t("general/Settings"),
                id: "Settings",
                config: {
                  component: "Settings",
                  singleton: true,
                  icon: ":gear:",
                },
              });
              setDrawerOpen(false);
            }}
          >
            <SectionIcon>
              <SettingsIcon></SettingsIcon>
            </SectionIcon>
            <ListItemText primary={t("general/Settings")}></ListItemText>
          </ListItemButton>
        </List>
      </ControllersSection>
    </React.Fragment>
  );

  return (
    <Page>
      <CssBaseline></CssBaseline>
      <DrawerNav className={"drawer"}>
        <Box sx={{ display: { xs: "block", sm: "none" } }}>
          <SideDrawer
            variant="temporary"
            open={drawerOpen}
            onClose={toggleDrawer}
            ModalProps={{
              keepMounted: true, // Better open performance on mobile.
            }}
          >
            {drawer}
          </SideDrawer>
        </Box>
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
          <SideDrawer variant="permanent" open>
            {drawer}
          </SideDrawer>
        </Box>
        <Box sx={{ display: { xs: "block", sm: "none" } }}>
          <MenuFab
            aria-label={t("general/open-menu")}
            color="primary"
            size="small"
            onClick={toggleDrawer}
          >
            <Menu></Menu>
          </MenuFab>
        </Box>
      </DrawerNav>
      <MainPanel></MainPanel>
      <AddNotebookDialog
        open={addNotebookDialogOpen}
        onClose={() => {
          setAddNotebookDialogOpen(false);
          setAddNotebookDialogHideOpeningLocal(false);
        }}
        canCancel={true}
        gitURL={addNotebookRepo}
        gitBranch={addNotebookBranch}
        hideOpeningLocal={addNotebookDialogHideOpeningLocal}
      ></AddNotebookDialog>
      <LanguageSelectorDialog></LanguageSelectorDialog>
    </Page>
  );
}
