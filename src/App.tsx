import { ThemeProvider } from "@material-ui/styles";
import * as qs from "qs";
import React, { FC } from "react";
import "./App.css";
import { HomeSection } from "./containers/crossnote";
import { SettingsContainer } from "./containers/settings";
import "./editor";
import { Home } from "./pages/Home";

const App: FC = () => {
  const settingsContainer = SettingsContainer.useContainer();
  return (
    <ThemeProvider theme={settingsContainer.theme.muiTheme}>
      <div className="App">
        <Home
          section={HomeSection.Notebooks}
          queryParams={qs.parse(window.location.search.replace(/^\?/, ""))}
        ></Home>
      </div>
    </ThemeProvider>
  );
};

export default App;
