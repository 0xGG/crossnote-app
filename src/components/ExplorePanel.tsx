import {
  Box,
  Button,
  Card,
  Hidden,
  IconButton,
  InputBase,
  Typography,
} from "@material-ui/core";
import {
  createStyles,
  fade,
  makeStyles,
  Theme,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { Magnify, Menu as MenuIcon, Publish } from "mdi-material-ui";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudContainer } from "../containers/cloud";
import { Notebooks } from "./Notebooks";
import PublishNotebookDialog from "./PublishNotebookDialog";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    explorePanel: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: theme.palette.background.default,
    },
    topPanel: {
      padding: theme.spacing(1),
      borderRadius: 0,
      backgroundColor: theme.palette.background.paper,
    },
    row: {
      display: "flex",
      alignItems: "center",
    },
    sectionName: {
      marginLeft: theme.spacing(1),
    },
    search: {
      "position": "relative",
      "borderRadius": theme.shape.borderRadius,
      "backgroundColor": fade(theme.palette.common.white, 0.15),
      "&:hover": {
        backgroundColor: fade(theme.palette.common.white, 0.25),
      },
      "marginRight": 0, // theme.spacing(2),
      "marginLeft": 0,
      "width": "100%",
      [theme.breakpoints.up("sm")]: {
        // marginLeft: theme.spacing(3),
        // width: "auto"
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
      border: "1px solid #bbb",
      borderRadius: "4px",
      width: "100%",
    },
    inputInput: {
      padding: theme.spacing(1, 1, 1, 7),
      transition: theme.transitions.create("width"),
      width: "100%",
      [theme.breakpoints.up("md")]: {
        // width: 200
      },
    },
  }),
);

interface Props {
  toggleDrawer: () => void;
}

export default function ExplorePanel(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const cloudContainer = CloudContainer.useContainer();

  const [publishNotebookDialogOpen, setPublishNotebookDialogOpen] = useState<
    boolean
  >(false);

  // Search
  const [searchValue, setSearchValue] = useState<string>("");
  const [searchValueInputTimeout, setSearchValueInputTimeout] = useState<
    NodeJS.Timeout
  >(null);
  const [finalSearchValue, setFinalSearchValue] = useState<string>("");

  const onChangeSearchValue = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const value = event.target.value;
      setSearchValue(value);
      if (searchValueInputTimeout) {
        clearTimeout(searchValueInputTimeout);
      }
      const timeout = setTimeout(() => {
        setFinalSearchValue(value);
      }, 600);
      setSearchValueInputTimeout(timeout);
    },
    [searchValueInputTimeout],
  );

  return (
    <Box className={clsx(classes.explorePanel)}>
      <Card className={clsx(classes.topPanel)}>
        <Box className={clsx(classes.row)}>
          <Hidden smUp implementation="css">
            <IconButton onClick={props.toggleDrawer}>
              <MenuIcon></MenuIcon>
            </IconButton>
          </Hidden>
          <div className={classes.search}>
            <div className={classes.searchIcon}>
              <Magnify />
            </div>
            <InputBase
              placeholder={t("search/notebooks")}
              classes={{
                root: classes.inputRoot,
                input: classes.inputInput,
              }}
              value={searchValue}
              inputProps={{ "aria-label": "search" }}
              onChange={onChangeSearchValue}
              autoComplete={"off"}
              autoCorrect={"off"}
            />
          </div>
        </Box>
        <Box
          className={clsx(classes.row)}
          style={{ justifyContent: "space-between", marginTop: "8px" }}
        >
          <Box className={clsx(classes.row)}>
            <span role="img" aria-label="folder">
              <img
                src="/logo.svg"
                style={{ width: "28px", height: "28px" }}
                alt={"Crossnote"}
              ></img>
            </span>
            <Typography className={clsx(classes.sectionName)}>
              {t("general/Explore")}
            </Typography>
          </Box>
          <Box>
            {/* TODO: Support OrderBy */}
            <Button
              variant={"contained"}
              color={"primary"}
              onClick={() => {
                if (cloudContainer.loggedIn) {
                  setPublishNotebookDialogOpen(true);
                } else {
                  cloudContainer.setAuthDialogOpen(true);
                }
              }}
            >
              <Publish></Publish>
              {t("general/Publish")}
            </Button>
          </Box>
        </Box>
      </Card>
      <PublishNotebookDialog
        open={publishNotebookDialogOpen}
        onClose={() => setPublishNotebookDialogOpen(false)}
      ></PublishNotebookDialog>

      <Notebooks searchValue={finalSearchValue}></Notebooks>
    </Box>
  );
}
