import { ThemeProvider } from "@material-ui/styles";
import React, { FC } from "react";
import "./App.css";
import { HomeSection } from "./containers/crossnote";
import { SettingsContainer } from "./containers/settings";
import "./editor";
import { Home } from "./pages/Home";

// Without a router the URL only changes through a full page load, so the
// boot query string is parsed exactly once. Parsing per render would mint a
// fresh object each time and re-trigger Home's deep-link effect (which is
// keyed on the object's identity) on every unrelated re-render.
const queryParams = Object.fromEntries(
  new URLSearchParams(window.location.search),
);

const App: FC = () => {
  const settingsContainer = SettingsContainer.useContainer();
  return (
    <ThemeProvider theme={settingsContainer.theme.muiTheme}>
      <div className="App">
        <Home section={HomeSection.Notebooks} queryParams={queryParams}></Home>
      </div>
    </ThemeProvider>
  );
};

export default App;
