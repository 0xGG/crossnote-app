import { createContainer } from "unstated-next";
import { useState, useEffect, useCallback } from "react";
import {
  User,
  useViewerQuery,
  useSetUserInfoMutation
} from "../generated/graphql";
import Noty from "noty";
import { SettingsContainer } from "./settings";
import { useTranslation } from "react-i18next";

interface InitialState {}

function useCloudContainer(initialState: InitialState) {
  const [authDialogOpen, setAuthDialogOpen] = useState<boolean>(false);
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [viewer, setViewer] = useState<User>(null);
  const [resViewer, executeViewerQuery] = useViewerQuery({
    requestPolicy: "network-only",
    pause: true
  });
  const [resSetUserInfo, executeSetUserInfoMutation] = useSetUserInfoMutation();
  const [token, setToken] = useState<string>(
    localStorage.getItem("token") || ""
  );
  const settingsContainer = SettingsContainer.useContainer();
  const [t] = useTranslation();

  const refetchViewer = useCallback(() => {
    if (token) {
      executeViewerQuery({
        requestPolicy: "network-only",
        pollInterval: 30 * 1000 // Refetch the viewer every 30 seconds for checking notifications
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
      editorCursorColor = "rgba(51, 51, 51, 1)"
    }) => {
      executeSetUserInfoMutation({
        cover,
        name,
        avatar,
        bio: "",
        language,
        location: "",
        editorCursorColor
      });
    },
    [executeSetUserInfoMutation]
  );

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
      setLoggedIn(true);
      settingsContainer.setLanguage(viewer.language);
      settingsContainer.setAuthorName(viewer.name);
      settingsContainer.setAuthorEmail(viewer.email);
      settingsContainer.setEditorCursorColor(viewer.editorCursorColor);
    }
  }, [resViewer]);

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
        timeout: 2000
      }).show();
    } else if (resSetUserInfo.data && resSetUserInfo.data.setUserInfo) {
      setViewer(resSetUserInfo.data.setUserInfo as User);
      new Noty({
        type: "success",
        text: t("general/profile-updated"),
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
    }
  }, [
    resSetUserInfo
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
    setUserInfo
  };
}

export const CloudContainer = createContainer(useCloudContainer);
