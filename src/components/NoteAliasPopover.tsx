import {
  Box,
  IconButton,
  List,
  ListItem,
  Popover,
  TextField,
  Typography,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { TrashCan } from "mdi-material-ui";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    menuItemOverride: {
      "cursor": "default",
      "padding": `0 0 0 ${theme.spacing(2)}px`,
      "&:hover": {
        backgroundColor: "inherit",
      },
    },
    menuItemTextField: {
      paddingRight: theme.spacing(2),
    },
  }),
);
interface Props {
  anchorElement: HTMLElement;
  onClose: () => void;
  addAlias: (alias: string) => void;
  deleteAlias: (alias: string) => void;
  aliases: string[];
}
export function NoteAliasPopover(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const [alias, setAlias] = useState<string>("");

  const addAlias = useCallback(
    (alias: string) => {
      if (!alias || alias.trim().length === 0) {
        return;
      }
      props.addAlias(alias);
      setAlias("");
    },
    [props],
  );

  useEffect(() => {
    setAlias("");
  }, [props.anchorElement]);

  return (
    <Popover
      open={Boolean(props.anchorElement)}
      anchorEl={props.anchorElement}
      keepMounted
      onClose={props.onClose}
    >
      <List>
        <ListItem
          className={clsx(classes.menuItemOverride, classes.menuItemTextField)}
        >
          <TextField
            placeholder={t("general/add-an-alias")}
            fullWidth={true}
            autoFocus={true}
            onKeyUp={(event) => {
              if (event.which === 13) {
                addAlias(alias);
              }
            }}
            onChange={(event) => setAlias(event.target.value)}
            value={alias}
          ></TextField>
        </ListItem>
        {props.aliases.length > 0 ? (
          props.aliases.map((alias) => {
            return (
              <ListItem key={alias} className={clsx(classes.menuItemOverride)}>
                <Box
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <Typography>{alias}</Typography>
                  <IconButton onClick={() => props.deleteAlias(alias)}>
                    <TrashCan></TrashCan>
                  </IconButton>
                </Box>
              </ListItem>
            );
          })
        ) : (
          <ListItem className={clsx(classes.menuItemOverride)}>
            <Typography style={{ margin: "8px 0" }}>
              {t("general/no-aliases")}
            </Typography>
          </ListItem>
        )}
      </List>
    </Popover>
  );
}
