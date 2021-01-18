import Noty from "noty";
import { useCallback, useEffect, useState } from "react";
import { createContainer } from "unstated-next";
import {
  Notification,
  PageInfo,
  useDeleteAllNotificationsMutation,
  useDeleteNotificationMutation,
  useNotificationsQuery,
} from "../generated/graphql";
import { EmptyPageInfo } from "../utilities/note";

interface InitialState {}

function useNotificationsContainer(initialState: InitialState) {
  const [pageInfo, setPageInfo] = useState<PageInfo>(EmptyPageInfo);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [needsRefetch, setNeedsRefetch] = useState<boolean>(false);
  const [resNotifications, executeNotificationsQuery] = useNotificationsQuery({
    variables: {
      before: pageInfo.startCursor,
      after: pageInfo.endCursor,
      first: 0,
      last: 20,
    },
    requestPolicy: "network-only",
    pause: true,
  });
  const [
    resDeleteNotification,
    executeDeleteNotificationMutation,
  ] = useDeleteNotificationMutation();
  const [
    resDeleteAllNotifications,
    executeDeleteAllNotificationsMutation,
  ] = useDeleteAllNotificationsMutation();

  const fetchMoreNotifications = useCallback(() => {
    executeNotificationsQuery({
      requestPolicy: "network-only",
    });
  }, [executeNotificationsQuery]);

  const deleteNotification = useCallback(
    (notificationID: string) => {
      setNotifications((notifications) => {
        if (
          pageInfo.hasPreviousPage &&
          pageInfo.startCursor === notificationID
        ) {
          const notification = notifications[1];
          if (notification) {
            setPageInfo({
              startCursor: notification.id,
              endCursor: pageInfo.endCursor,
              hasPreviousPage: pageInfo.hasPreviousPage,
              hasNextPage: pageInfo.hasNextPage,
            });
          }
        }
        return notifications.filter((n) => n.id !== notificationID);
      });
      executeDeleteNotificationMutation({
        notificationID: notificationID,
      });
    },
    [executeDeleteNotificationMutation, pageInfo],
  );

  const deleteAllNotifications = useCallback(() => {
    setNotifications([]);
    setPageInfo(EmptyPageInfo);
    executeDeleteAllNotificationsMutation();
  }, [executeDeleteAllNotificationsMutation]);

  const refresh = useCallback(() => {
    setNotifications([]);
    setPageInfo(EmptyPageInfo);
    setNeedsRefetch(true);
  }, [executeNotificationsQuery]);

  useEffect(() => {
    if (resNotifications.fetching) {
    } /*else if (resNotifications.error) {
      // There might be records that are not found because origin(user) undo the action.
      new Noty({
        type: "error",
        text: resNotifications.error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
    } */ else if (
      resNotifications.data &&
      resNotifications.data.viewer.notifications
    ) {
      const ns = resNotifications.data.viewer.notifications;
      const pageInfo = ns.pageInfo;
      const edges = ns.edges;
      const newNotifications = (edges || [])
        .map((edge) => {
          if (edge) {
            return edge.node as any;
          } else {
            return null;
          }
        })
        .reverse()
        .filter((x) => x);
      setNotifications((notifications) =>
        [...notifications, ...newNotifications].filter(
          (notification, index, self) =>
            index === self.findIndex((m) => m.id === notification.id),
        ),
      );
      setPageInfo(pageInfo);
    }
  }, [resNotifications]);

  useEffect(() => {
    if (resDeleteNotification.fetching) {
    } else if (resDeleteNotification.error) {
      new Noty({
        type: "error",
        text: resDeleteNotification.error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
    } else if (
      resDeleteNotification.data &&
      resDeleteNotification.data.deleteNotification
    ) {
    }
  }, [resDeleteNotification]);

  useEffect(() => {
    if (resDeleteAllNotifications.fetching) {
    } else if (resDeleteAllNotifications.error) {
      new Noty({
        type: "error",
        text: resDeleteAllNotifications.error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
    } else if (
      resDeleteAllNotifications.data &&
      resDeleteAllNotifications.data.deleteAllNotifications
    ) {
      setNotifications([]);
      setPageInfo(EmptyPageInfo);
    }
  }, [resDeleteAllNotifications]);

  useEffect(() => {
    if (needsRefetch) {
      fetchMoreNotifications();
      setNeedsRefetch(false);
    }
  }, [needsRefetch, fetchMoreNotifications]);

  return {
    fetching: resNotifications.fetching,
    notifications,
    pageInfo,
    fetchMoreNotifications,
    deleteNotification,
    deleteAllNotifications,
    refresh,
  };
}

export const NotificationsContainer = createContainer(
  useNotificationsContainer,
);
