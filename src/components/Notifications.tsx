import {
  Box,
  Button,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  IconButton,
  Card,
  Divider,
  Hidden
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import React, { useEffect, useState } from "react";
import { NotificationsContainer } from "../containers/notifications";
import { NotificationEventType } from "../generated/graphql";
import { useTranslation } from "react-i18next";
import { Close, Menu as MenuIcon } from "mdi-material-ui";
import { CloudContainer } from "../containers/cloud";
import { CommentWidgetMessagePostingNotification } from "./notifications/CommentWidgetMessagePostingNotification";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notifications: {
      width: "100%",
      padding: theme.spacing(2),
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1)
      }
    },
    notificationsCard: {
      margin: theme.spacing(2),
      [theme.breakpoints.down("sm")]: {
        marginLeft: "0",
        marginRight: "0"
      }
    },
    topBar: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    }
  })
);

interface Props {
  toggleDrawer: () => void;
}
export function Notifications(props: Props) {
  const classes = useStyles(props);
  const { t } = useTranslation();
  const cloudContainer = CloudContainer.useContainer();
  const notificationsContainer = NotificationsContainer.useContainer();

  /*
  useEffect(() => {
    const mainPanel = document.getElementById("main-panel");
    if (mainPanel) {
      mainPanel.onscroll = () => {
        if (mainPanel.scrollTop > mainPanel.offsetHeight / 2) {
          if (
            !notificationsContainer.fetching &&
            notificationsContainer.pageInfo.hasPreviousPage
          ) {
            notificationsContainer.fetchMoreNotifications();
          }
        }
      };
    }
  }, [notificationsContainer.fetchMoreNotifications, notificationsContainer]);
  */

  useEffect(
    () => {
      notificationsContainer.refresh();
    },
    [
      /*notificationsContainer*/
    ]
  );

  return (
    <Box className={clsx(classes.notifications)}>
      <Box className={clsx(classes.topBar)}>
        <Box className={clsx(classes.row)}>
          <Hidden smUp implementation="css">
            <IconButton onClick={props.toggleDrawer}>
              <MenuIcon></MenuIcon>
            </IconButton>
          </Hidden>
          <Typography variant={"h6"}>{t("general/Notifications")}</Typography>
        </Box>
        <Button
          variant={"contained"}
          color={"primary"}
          onClick={() => {
            notificationsContainer.deleteAllNotifications();
            cloudContainer.clearNotificationsCount();
          }}
        >
          {t("general/clear-all")}
        </Button>
      </Box>
      {!notificationsContainer.notifications.length ? (
        notificationsContainer.fetching ? (
          <Typography>{t("general/loading-notifications")}</Typography>
        ) : (
          <Typography>{t("general/no-notifications-found")}</Typography>
        )
      ) : (
        <>
          <Card className={clsx(classes.notificationsCard)}>
            <List dense={true}>
              {notificationsContainer.notifications.map((notification, idx) => {
                let notificationComponent = null;
                /*if (
                notification.event!.type === NotificationEventType.UserFollowing
              ) {
                notificationComponent = (
                  <UserFollowingNotificationWidget
                    notification={notification}
                  ></UserFollowingNotificationWidget>
                );
              }*/

                if (
                  notification.event!.type ===
                  NotificationEventType.CommentWidgetMessagePosting
                ) {
                  notificationComponent = (
                    <CommentWidgetMessagePostingNotification
                      notification={notification}
                      key={notification.id}
                    ></CommentWidgetMessagePostingNotification>
                  );
                } else {
                  return null;
                }
                return (
                  <React.Fragment key={notification.id}>
                    <ListItem key={notification.id}>
                      <ListItemIcon>
                        <IconButton
                          onClick={() => {
                            notificationsContainer.deleteNotification(
                              notification.id
                            );
                            cloudContainer.reduceNotificationsCountByOne();
                          }}
                        >
                          <Close></Close>
                        </IconButton>
                      </ListItemIcon>
                      {notificationComponent}
                    </ListItem>
                    {idx < notificationsContainer.notifications.length - 1 ? (
                      <Divider key={idx}></Divider>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </List>
          </Card>
          {notificationsContainer.pageInfo.hasPreviousPage && (
            <Box style={{ textAlign: "center" }}>
              {" "}
              <Button
                style={{ margin: "16px 0 64px" }}
                variant={"outlined"}
                color={"secondary"}
                disabled={notificationsContainer.fetching}
                onClick={() => notificationsContainer.fetchMoreNotifications()}
              >
                {t("notification/view-more-notifications")}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
