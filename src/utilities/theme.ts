/*
export const crossnoteTheme = createMuiTheme({
  palette: {
    primary: blue,
    secondary: orange,
  },
});
*/

import { createMuiTheme } from "@material-ui/core";

export const crossnoteTheme = createMuiTheme({
  palette: {
    common: { black: "#000", white: "#fff" },
    background: {
      paper: "#141414",
      default: "#0c0c0c",
    },
    primary: {
      light: "#7986cb",
      main: "rgba(144, 19, 254, 1)",
      dark: "#303f9f",
      contrastText: "#fff",
    },
    secondary: {
      light: "#ff4081",
      main: "#f50057",
      dark: "#c51162",
      contrastText: "#fff",
    },
    error: {
      light: "#e57373",
      main: "#f44336",
      dark: "#d32f2f",
      contrastText: "rgba(197, 197, 197, 1)",
    },
    text: {
      primary: "#ccc",
      secondary: "rgba(180, 180, 180, 1)",
      disabled: "rgba(121, 7, 7, 0.38)",
      hint: "rgba(0, 0, 0, 0.38)",
    },
  },
});
