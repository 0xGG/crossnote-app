import React, { useEffect } from "react";
import "./App.css";
import { createMuiTheme } from "@material-ui/core";
import { orange, blue } from "@material-ui/core/colors";
import { ThemeProvider } from "@material-ui/styles";
import * as qs from "qs";
import { Router, Route, Switch } from "react-router-dom";
import { browserHistory } from "./utilities/history";
import { Home, HomeSection } from "./pages/Home";
import { GitHubOAuthCallback } from "./components/GitHubOAuthCallback";
import "./editor";
import { crossnoteTheme } from "./utilities/theme";

const App: React.FC = () => {
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
    <ThemeProvider theme={crossnoteTheme}>
      <div className="App">
        <Router history={browserHistory}>
          <Switch>
            <Route
              path={`/settings`}
              exact={true}
              render={props => (
                <Home section={HomeSection.Settings} queryParams={{}}></Home>
              )}
            ></Route>
            <Route
              exact={true}
              path={`/github_oauth_callback`}
              render={props => (
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
              render={props => (
                <Home
                  section={HomeSection.Notebooks}
                  queryParams={qs.parse(
                    props.location.search.replace(/^\?/, "")
                  )}
                ></Home>
              )}
            ></Route>
          </Switch>
        </Router>
      </div>
    </ThemeProvider>
  );
};

export default App;
