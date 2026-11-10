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
  useMediaQuery,
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
import ConfigureNotebookDialog from "../components/ConfigureNotebookDialog";
import PushNotebookDialog from "../components/PushNotebookDialog";
import { CrossnoteContainer } from "../containers/crossnote";
import { globalContainers } from "../containers/global";
import type { Notebook as NotebookData } from "../lib/notebook";

const drawerWidth = 200;
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

interface NotebookDialog {
  notebook: NotebookData;
  open: boolean;
}

// Closes a notebook's dialog, and no other: an upload that ends after its
// dialog was cancelled closes it then, when another notebook's may be open.
const closing =
  (notebookId: string) =>
  (dialog: NotebookDialog | null): NotebookDialog | null =>
    dialog && dialog.notebook._id === notebookId
      ? { ...dialog, open: false }
      : dialog;

export function Home(props: Props) {
  const theme = useTheme();
  // Read at once rather than after the first render, so that a narrow
  // screen does not draw the drawer kept beside the page first.
  const narrow = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const [addNotebookDialogOpen, setAddNotebookDialogOpen] =
    useState<boolean>(false);
  const [addNotebookRepo, setAddNotebookRepo] = useState<string>("");
  const [addNotebookBranch, setAddNotebookBranch] = useState<string>("");
  const [
    addNotebookDialogHideOpeningLocal,
    setAddNotebookDialogHideOpeningLocal,
  ] = useState<boolean>(false);

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  // The drawer over the page closes when the screen gets wide: opened again
  // as the screen gets narrow, it would come in over a dialog left open and
  // take its keys.
  const narrowQuery = theme.breakpoints.down("sm").replace(/^@media\s*/, "");
  useEffect(() => {
    const query = window.matchMedia(narrowQuery);
    const onChange = () => {
      if (!query.matches) {
        setDrawerOpen(false);
      }
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [narrowQuery]);
  // Kept here rather than in the notebooks' trees, which the drawer draws
  // anew when the width of the screen changes it: what each tree has
  // expanded, by notebook, and a notebook's settings or upload dialog, open
  // or closing.
  const [expandedTrees, setExpandedTrees] = useState<Record<string, string[]>>(
    {},
  );
  const [settingsDialog, setSettingsDialog] = useState<NotebookDialog>(null);
  const [uploadDialog, setUploadDialog] = useState<NotebookDialog>(null);
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();

  // HACK: Register globalContainers for the preview, which opens notes
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
                  expanded={expandedTrees[notebook._id] ?? []}
                  onExpandedChange={(expanded) =>
                    setExpandedTrees((trees) => ({
                      ...trees,
                      [notebook._id]: expanded,
                    }))
                  }
                  onOpenSettings={() =>
                    setSettingsDialog({ notebook, open: true })
                  }
                  onOpenUpload={() => setUploadDialog({ notebook, open: true })}
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
          <ListItem disablePadding>
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
          </ListItem>
        </List>
      </ControllersSection>
    </React.Fragment>
  );

  return (
    <Page>
      <CssBaseline></CssBaseline>
      <DrawerNav className={"drawer"}>
        {/* One drawer, which a narrow screen opens over the page from a
            button and a wider one keeps beside it: rendered once, the
            notebooks' trees and the dialogs they open are there once. */}
        {narrow ? (
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
        ) : (
          <SideDrawer variant="permanent" open>
            {drawer}
          </SideDrawer>
        )}
        {narrow && (
          <MenuFab
            aria-label={t("general/open-menu")}
            color="primary"
            size="small"
            onClick={toggleDrawer}
          >
            <Menu></Menu>
          </MenuFab>
        )}
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
      {settingsDialog && (
        <ConfigureNotebookDialog
          key={settingsDialog.notebook._id}
          open={settingsDialog.open}
          onClose={() =>
            setSettingsDialog(closing(settingsDialog.notebook._id))
          }
          notebook={settingsDialog.notebook}
        ></ConfigureNotebookDialog>
      )}
      {uploadDialog && (
        <PushNotebookDialog
          key={uploadDialog.notebook._id}
          open={uploadDialog.open}
          onClose={() => setUploadDialog(closing(uploadDialog.notebook._id))}
          notebook={uploadDialog.notebook}
        ></PushNotebookDialog>
      )}
      <LanguageSelectorDialog></LanguageSelectorDialog>
    </Page>
  );
}
