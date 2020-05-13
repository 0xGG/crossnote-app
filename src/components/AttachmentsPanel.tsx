import React, { useState, useCallback, useEffect } from "react";
import {
  createStyles,
  makeStyles,
  Theme,
  fade,
} from "@material-ui/core/styles";
import clsx from "clsx";
import { CrossnoteContainer } from "../containers/crossnote";
import { useTranslation } from "react-i18next";
import {
  Box,
  Card,
  Hidden,
  IconButton,
  Tooltip,
  InputBase,
  CircularProgress,
} from "@material-ui/core";
import { Menu as MenuIcon, Magnify, Plus } from "mdi-material-ui";
import { Attachment } from "../lib/crossnote";
import Attachments from "./Attachments";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    attachmentsPanel: {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "100%",
    },
    topPanel: {
      padding: theme.spacing(1),
      borderRadius: "0",
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
      // color: "rgba(0, 0, 0, 0.54)",
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
    loading: {
      position: "absolute",
      top: "40%",
      left: "50%",
      transform: "translateX(-50%)",
    },
    sortSelected: {
      "color": theme.palette.primary.main,
      "& svg": {
        color: theme.palette.primary.main,
      },
    },
    iconBtnSVG: {
      color: theme.palette.text.secondary,
    },
  }),
);

interface Props {
  toggleDrawer: () => void;
}
export default function AttachmentsPanel(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const crossnoteContainer = CrossnoteContainer.useContainer();

  const [attachments, setAttachments] = useState<Attachment[]>([]);

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
      }, 400);
      setSearchValueInputTimeout(timeout);
    },
    [searchValueInputTimeout],
  );

  useEffect(() => {
    crossnoteContainer
      .loadAttachments()
      .then((attachments) => {
        setAttachments(attachments);
        crossnoteContainer.setSelectedAttachment(attachments[0] || null);
      })
      .catch((error) => {
        setAttachments([]);
      });
  }, []);

  return (
    <Box className={clsx(classes.attachmentsPanel)}>
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
              placeholder={t("search/attachments")}
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
          <IconButton disabled={!crossnoteContainer.initialized}>
            <Tooltip title={t("general/new-attachment")}>
              <Plus className={clsx(classes.iconBtnSVG)}></Plus>
            </Tooltip>
          </IconButton>
        </Box>
      </Card>

      {crossnoteContainer.isLoadingAttachments && (
        <CircularProgress className={clsx(classes.loading)}></CircularProgress>
      )}

      <Attachments
        searchValue={finalSearchValue}
        attachments={attachments}
      ></Attachments>
    </Box>
  );
}
