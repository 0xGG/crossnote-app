import { lighten } from "@mui/material/styles";
import { blueGrey, indigo } from "@mui/material/colors";
import { CrossnoteTheme } from "./theme";

export const OneDarkTheme: CrossnoteTheme = new CrossnoteTheme({
  name: "one-dark",
  muiThemeOptions: {
    palette: {
      mode: "dark",
      common: { black: "#000", white: "#fff" },
      background: {
        paper: lighten("#282c34", 0.05),
        default: "#282c34",
      },
      primary: indigo,
      secondary: blueGrey,
      error: {
        light: "#e57373",
        main: "#f44336",
        dark: "#d32f2f",
        contrastText: "rgba(197, 197, 197, 1)",
      },
      // divider: "#323944",
      text: {
        primary: "#ccc",
        secondary: "rgba(180, 180, 180, 1)",
      },
      action: {
        active: "rgba(180, 180, 180, 1)",
      },
    },
  },
});
