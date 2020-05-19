import { CrossnoteTheme } from "./theme";
import { lighten } from "@material-ui/core";
import { blueGrey, cyan } from "@material-ui/core/colors";

export const OneDarkTheme: CrossnoteTheme = new CrossnoteTheme({
  name: "one-dark",
  muiThemeOptions: {
    palette: {
      common: { black: "#000", white: "#fff" },
      background: {
        paper: lighten("#282c34", 0.05),
        default: "#282c34",
      },
      primary: cyan,
      secondary: blueGrey,
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
