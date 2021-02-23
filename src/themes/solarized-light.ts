import { lighten } from "@material-ui/core";
import { amber, orange } from "@material-ui/core/colors";
import { CrossnoteTheme } from "./theme";

export const SolarizedLight: CrossnoteTheme = new CrossnoteTheme({
  name: "solarized-light",
  muiThemeOptions: {
    palette: {
      type: "light",
      primary: orange,
      secondary: amber,
      background: {
        paper: lighten("#fdf6e3", 0.05),
        default: "#fdf6e3",
      },
    },
  },
});
