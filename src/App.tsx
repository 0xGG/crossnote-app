import React, { useEffect } from "react";
import "./App.css";
import { Home } from "./pages/Home";
import { createMuiTheme } from "@material-ui/core";
import { orange, blue } from "@material-ui/core/colors";
import { ThemeProvider } from "@material-ui/styles";

import "./editor";

const theme = createMuiTheme({
  palette: {
    primary: blue,
    secondary: orange
  }
});

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
    <ThemeProvider theme={theme}>
      <div className="App">
        <Home></Home>
      </div>
    </ThemeProvider>
  );
};

export default App;
