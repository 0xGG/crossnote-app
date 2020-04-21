import { CrossnoteTheme } from "./theme";
import { blue, orange } from "@material-ui/core/colors";

export const LightTheme: CrossnoteTheme = new CrossnoteTheme({
  name: "light",
  muiThemeOptions: {
    palette: {
      primary: blue,
      secondary: orange,
    },
  },
});
