import { CrossnoteTheme } from "./theme";
import { orange, amber } from "@material-ui/core/colors";
import { lighten } from "@material-ui/core";

export const SolarizedLight: CrossnoteTheme = new CrossnoteTheme({
  name: "solarized-light",
  muiThemeOptions: {
    palette: {
      primary: orange,
      secondary: amber,
      background: {
        paper: lighten("#fdf6e3", 0.05),
        default: "#fdf6e3",
      },
    },
  },
});
