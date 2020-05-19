import { CrossnoteTheme } from "./theme";
import { lighten } from "@material-ui/core";

export const DarkTheme: CrossnoteTheme = new CrossnoteTheme({
  name: "dark",
  muiThemeOptions: {
    palette: {
      common: { black: "#000", white: "#fff" },
      background: {
        paper: lighten("#1e1e1e", 0.05),
        default: "#1e1e1e",
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
      divider: "#222",
      text: {
        primary: "#ccc",
        secondary: "rgba(180, 180, 180, 1)",
        disabled: "rgba(121, 7, 7, 0.38)",
        hint: "rgba(0, 0, 0, 0.38)",
      },
      action: {
        active: "rgba(180, 180, 180, 1)",
        disabled: "#353535",
      },
    },
  },
});
