import {
  Box,
  Button,
  Card,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  Typography,
} from "@material-ui/core";
import { createStyles, makeStyles, Theme } from "@material-ui/core/styles";
import clsx from "clsx";
import { Close } from "mdi-material-ui";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CloudContainer } from "../containers/cloud";
import { NotificationsContainer } from "../containers/notifications";
import { NotificationEventType } from "../generated/graphql";
import { CommentWidgetMessagePostingNotification } from "./notifications/CommentWidgetMessagePostingNotification";

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    notifications: {
      width: "100%",
      height: "100%",
      overflow: "auto",
      backgroundColor: theme.palette.background.default,
      padding: theme.spacing(2),
      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1),
      },
    },
    notificationsCard: {
      margin: theme.spacing(2),
      [theme.breakpoints.down("sm")]: {
        marginLeft: "0",
        marginRight: "0",
      },
    },
    topBar: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    row: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    },
  }),
);

interface Props {}
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
    ],
  );

  return (
    <Box className={clsx(classes.notifications)}>
      <Box className={clsx(classes.topBar)}>
        <Box className={clsx(classes.row)}>
          <Typography variant={"h6"} color={"textPrimary"}>
            {t("general/Notifications")}
          </Typography>
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
          <Typography color={"textPrimary"}>
            {t("general/loading-notifications")}
          </Typography>
        ) : (
          <Typography color={"textPrimary"}>
            {t("general/no-notifications-found")}
          </Typography>
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
                              notification.id,
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
