import { lighten } from "@mui/material/styles";
import { amber, orange } from "@mui/material/colors";
import { CrossnoteTheme } from "./theme";

export const SolarizedLight: CrossnoteTheme = new CrossnoteTheme({
  name: "solarized-light",
  muiThemeOptions: {
    palette: {
      mode: "light",
      primary: orange,
      secondary: amber,
      background: {
        paper: lighten("#fdf6e3", 0.05),
        default: "#fdf6e3",
      },
    },
  },
});
