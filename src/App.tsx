import React, { useEffect, FC } from "react";
import "./App.css";
import { ThemeProvider } from "@material-ui/styles";
import * as qs from "qs";
import { Router, Route, Switch } from "react-router-dom";
import { browserHistory } from "./utilities/history";
import { Home } from "./pages/Home";
import { GitHubOAuthCallback } from "./components/GitHubOAuthCallback";
import "./editor";
import { HomeSection } from "./containers/crossnote";
import { SettingsContainer } from "./containers/settings";
import ServiceWorkerWrapper from "./components/ServiceWorkerWrapper";
// @ts-ignore
import PWAPrompt from "react-ios-pwa-prompt";
import { useTranslation } from "react-i18next";

const App: FC = () => {
  const { t } = useTranslation();
  const settingsContainer = SettingsContainer.useContainer();
  useEffect(() => {
    const handler = (event: any) => {
      event.preventDefault();
      event.prompt();
      event.userChoice.then((choiceResult: any) => {
        console.log(choiceResult);
      });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);
  return (
    <ThemeProvider theme={settingsContainer.theme.muiTheme}>
      <div className="App">
        <Router history={browserHistory}>
          <Switch>
            <Route
              path={`/settings`}
              exact={true}
              render={(props) => (
                <Home section={HomeSection.Settings} queryParams={{}}></Home>
              )}
            ></Route>
            <Route
              path={`/notifications`}
              exact={true}
              render={(props) => (
                <Home
                  section={HomeSection.Notifications}
                  queryParams={{}}
                ></Home>
              )}
            ></Route>
            <Route
              exact={true}
              path={`/github_oauth_callback`}
              render={(props) => (
                <GitHubOAuthCallback
                  code={
                    qs.parse(props.location.search.replace(/^\?/, ""))[
                      "code"
                    ] || ""
                  }
                ></GitHubOAuthCallback>
              )}
            ></Route>
            <Route
              path={`/`}
              render={(props) => (
                <Home
                  section={HomeSection.Notebooks}
                  queryParams={qs.parse(
                    props.location.search.replace(/^\?/, ""),
                  )}
                ></Home>
              )}
            ></Route>
          </Switch>
        </Router>
        <ServiceWorkerWrapper></ServiceWorkerWrapper>
        <PWAPrompt
          copyTitle={t("react-ios-pwa-prompt/copy-title")}
          copyBody={t("react-ios-pwa-prompt/copy-body")}
          copyShareButtonLabel={t(
            "react-ios-pwa-prompt/copy-share-button-label",
          )}
          copyAddHomeButtonLabel={t(
            "react-ios-pwa-prompt/copy-add-home-button-label",
          )}
          copyClosePrompt={t("general/cancel")}
        ></PWAPrompt>
      </div>
    </ThemeProvider>
  );
};

export default App;
