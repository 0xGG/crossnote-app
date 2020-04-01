import React from "react";
import { User } from "../../generated/graphql";
import { Typography, Box, Avatar, Tooltip } from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import Identicon from "identicon.js";
import { sha256 } from "js-sha256";
import { formatRelative } from "date-fns";
import { languageCodeToDateFNSLocale } from "../../i18n/i18n";
import { SettingsContainer } from "../../containers/settings";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    avatarPanel: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%"
    },
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    },
    avatar: {
      borderRadius: "4px",
      width: "32px",
      height: "32px",
      cursor: "pointer"
    },
    title: {
      marginLeft: theme.spacing(1)
    }
  })
);

interface NotificationAvatarPanelProps {
  user: User;
  createdAt: number;
  title: string;
}
export function NotificationAvatarPanel(props: NotificationAvatarPanelProps) {
  const classes = useStyles(props);
  const user = props.user;
  const createdAt = props.createdAt;
  const settingsContainer = SettingsContainer.useContainer();

  return (
    <Box className={clsx(classes.avatarPanel)}>
      <Box className={clsx(classes.row)}>
        <Tooltip title={user.username}>
          <Avatar
            className={clsx(classes.avatar)}
            onClick={() => {
              // browserHistory.push(`/user/${user.username}`);
            }}
            variant={"rounded"}
            src={
              user.avatar ||
              "data:image/png;base64," +
                new Identicon(sha256(user.username), 80).toString()
            }
          ></Avatar>
        </Tooltip>
        <Typography variant={"body1"} className={clsx(classes.title)}>
          {props.title}
        </Typography>
      </Box>
      <Typography variant="body2" color={"textSecondary"}>
        {formatRelative(new Date(createdAt), new Date(), {
          locale: languageCodeToDateFNSLocale(settingsContainer.language)
        })}
      </Typography>
    </Box>
  );
}
