import Noty from "noty";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createContainer } from "unstated-next";
import {
  NotebookFieldsFragment,
  User,
  useSetUserInfoMutation,
  useViewerQuery,
} from "../generated/graphql";
import { SettingsContainer } from "./settings";

interface InitialState {}

function useCloudContainer(initialState: InitialState) {
  const { t } = useTranslation();

  const [authDialogOpen, setAuthDialogOpen] = useState<boolean>(false);
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [viewer, setViewer] = useState<User>(null);
  const [resViewer, executeViewerQuery] = useViewerQuery({
    requestPolicy: "network-only",
    pause: true,
  });
  const [resSetUserInfo, executeSetUserInfoMutation] = useSetUserInfoMutation();
  const [token, setToken] = useState<string>(
    localStorage.getItem("token") || "",
  );
  const [selectedNotebook, setSelectedNotebook] = useState<
    NotebookFieldsFragment
  >(null);
  const [displayNotebookPreview, setDisplayNotebookPreview] = useState<boolean>(
    false,
  );
  const settingsContainer = SettingsContainer.useContainer();

  const refetchViewer = useCallback(() => {
    if (token) {
      executeViewerQuery({
        requestPolicy: "network-only",
        pollInterval: 60 * 1000, // Refetch the viewer every 60 seconds for checking notifications
      });
    }
  }, [executeViewerQuery, token]);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.reload();
  };

  const setUserInfo = useCallback(
    ({
      name = "",
      cover = "",
      avatar = "",
      language = "en-US",
      editorCursorColor = "rgba(74, 144, 226, 1)",
    }) => {
      executeSetUserInfoMutation({
        cover,
        name,
        avatar,
        bio: "",
        language,
        location: "",
        editorCursorColor,
      });
    },
    [executeSetUserInfoMutation],
  );

  const reduceNotificationsCountByOne = useCallback(() => {
    if (viewer) {
      viewer.notifications.totalCount = Math.max(
        0,
        viewer.notifications.totalCount - 1,
      );
      setViewer(Object.assign({}, viewer) as User);
    }
  }, [viewer]);

  const clearNotificationsCount = useCallback(() => {
    viewer.notifications.totalCount = 0;
    setViewer(Object.assign({}, viewer) as User);
  }, [viewer]);

  useEffect(() => {
    if (resViewer.fetching) {
    } else if (resViewer.error) {
      /*
      // Don't display error message here
      // because the application might be offline now
      new Noty({
        type: "error",
        text: resViewer.error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
      */
      // logout(); // <= Cause mobile device login failure.
    } else if (resViewer.data && resViewer.data.viewer) {
      const viewer = resViewer.data.viewer as User;
      setViewer(viewer);
    }
  }, [resViewer]);

  useEffect(() => {
    if (viewer) {
      setLoggedIn(true);
      if (!loggedIn) {
        // NOTE: Stop syncing properties below from the cloud
        // settingsContainer.setLanguage(viewer.language);
        // settingsContainer.setAuthorName(viewer.name);
        // settingsContainer.setAuthorEmail(viewer.email);
        // settingsContainer.setEditorCursorColor(viewer.editorCursorColor);
      }
    }
  }, [loggedIn, viewer]);

  useEffect(() => {
    if (token && refetchViewer) {
      refetchViewer();
    }
  }, [token, refetchViewer]);

  useEffect(() => {
    if (resSetUserInfo.fetching) {
    } else if (resSetUserInfo.error) {
      new Noty({
        type: "error",
        text: resSetUserInfo.error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
    } else if (resSetUserInfo.data && resSetUserInfo.data.setUserInfo) {
      setViewer(resSetUserInfo.data.setUserInfo as User);
      new Noty({
        type: "success",
        text: t("general/profile-updated"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000,
      }).show();
    }
  }, [
    resSetUserInfo,
    /*
    t // TODO: Will cause repeated run
    */
  ]);

  return {
    loggedIn,
    logout,
    authDialogOpen,
    setAuthDialogOpen,
    viewer,
    refetchViewer,
    resSetUserInfo,
    setUserInfo,
    reduceNotificationsCountByOne,
    clearNotificationsCount,
    selectedNotebook,
    setSelectedNotebook,
    displayNotebookPreview,
    setDisplayNotebookPreview,
  };
}

export const CloudContainer = createContainer(useCloudContainer);
