import {
  Box,
  IconButton,
  List,
  ListItem,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { TrashCan } from "mdi-material-ui";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const AliasItem = styled(ListItem)(({ theme }) => ({
  "cursor": "default",
  "padding": `0 0 0 ${theme.spacing(2)}`,
  "&:hover": {
    backgroundColor: "inherit",
  },
}));

// The text field row carried both rules, with the second one injected later so
// its right padding won. Stacking the styled components keeps that order.
const AliasTextFieldItem = styled(AliasItem)(({ theme }) => ({
  paddingRight: theme.spacing(2),
}));
interface Props {
  anchorElement: HTMLElement;
  onClose: () => void;
  addAlias: (alias: string) => void;
  deleteAlias: (alias: string) => void;
  aliases: string[];
}
export function NoteAliasPopover(props: Props) {
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
        <AliasTextFieldItem>
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
        </AliasTextFieldItem>
        {props.aliases.length > 0 ? (
          props.aliases.map((alias) => {
            return (
              <AliasItem key={alias}>
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
                  <IconButton
                    aria-label={t("general/Delete")}
                    onClick={() => props.deleteAlias(alias)}
                  >
                    <TrashCan></TrashCan>
                  </IconButton>
                </Box>
              </AliasItem>
            );
          })
        ) : (
          <AliasItem>
            <Typography style={{ margin: "8px 0" }}>
              {t("general/no-aliases")}
            </Typography>
          </AliasItem>
        )}
      </List>
    </Popover>
  );
}
