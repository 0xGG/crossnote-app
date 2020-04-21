import React from "react";
import ReactDOM from "react-dom";
import "typeface-noto-sans-sc";
import "typeface-roboto";
import "noty/lib/noty.css";
import "noty/lib/themes/relax.css";

import "./i18n/i18n";
import "./index.css";
import "./themes/manager";
import App from "./App";
import Crossnote from "./lib/crossnote";
import "./lib/fs";
import { CrossnoteContainer } from "./containers/crossnote";
import { SettingsContainer } from "./containers/settings";
import { CloudContainer } from "./containers/cloud";
import { NotificationsContainer } from "./containers/notifications";

import { Provider } from "urql";
import { GraphQLClient } from "./utilities/client";

try {
  const crossnote = new Crossnote();
  ReactDOM.render(
    <Provider value={GraphQLClient}>
      <CrossnoteContainer.Provider
        initialState={{
          crossnote: crossnote,
        }}
      >
        <SettingsContainer.Provider initialState={{}}>
          <CloudContainer.Provider initialState={{}}>
            <NotificationsContainer.Provider initialState={{}}>
              <App />
            </NotificationsContainer.Provider>
          </CloudContainer.Provider>
        </SettingsContainer.Provider>
      </CrossnoteContainer.Provider>
    </Provider>,
    document.getElementById("root"),
  );
} catch (error) {
  console.log(error);
}

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();
//// serviceWorker.register();
