import { blue, orange } from "@material-ui/core/colors";
import { CrossnoteTheme } from "./theme";

export const LightTheme: CrossnoteTheme = new CrossnoteTheme({
  name: "light",
  muiThemeOptions: {
    palette: {
      type: "light",
      primary: blue,
      secondary: orange,
    },
  },
});
