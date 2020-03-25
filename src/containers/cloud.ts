import { createContainer } from "unstated-next";
import { useState, useEffect, useCallback } from "react";
import { User, useViewerQuery } from "../generated/graphql";
import Noty from "noty";

interface InitialState {}

function useCloudContainer(initialState: InitialState) {
  const [authDialogOpen, setAuthDialogOpen] = useState<boolean>(false);
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [viewer, setViewer] = useState<User>(null);
  const [resViewer, executeViewerQuery] = useViewerQuery({
    requestPolicy: "network-only",
    pause: true
  });
  const [token, setToken] = useState<string>(
    localStorage.getItem("token") || ""
  );

  const refetchViewer = useCallback(() => {
    if (token) {
      executeViewerQuery({
        requestPolicy: "network-only",
        pollInterval: 20 * 1000 // Refetch the viewer every 20 seconds // Doesn't work here...
      });
    }
  }, [executeViewerQuery, token]);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.reload();
  };

  useEffect(() => {
    if (resViewer.fetching) {
    } else if (resViewer.error) {
      new Noty({
        type: "error",
        text: resViewer.error.message,
        layout: "topRight",
        theme: "relax",
        timeout: 2000
      }).show();
      // console.error(resViewer.error);
      // logout(); // <= Cause mobile device login failure.
    } else if (resViewer.data && resViewer.data.viewer) {
      setViewer(resViewer.data.viewer as User);
      setLoggedIn(true);
      // console.log(resViewer.data.viewer);
    }
  }, [resViewer]);

  useEffect(() => {
    if (token && refetchViewer) {
      refetchViewer();
    }
  }, [token, refetchViewer]);

  return {
    loggedIn,
    logout,
    authDialogOpen,
    setAuthDialogOpen,
    viewer,
    refetchViewer
  };
}

export const CloudContainer = createContainer(useCloudContainer);
