import { blue, orange } from "@mui/material/colors";
import { CrossnoteTheme } from "./theme";

export const LightTheme: CrossnoteTheme = new CrossnoteTheme({
  name: "light",
  muiThemeOptions: {
    palette: {
      mode: "light",
      primary: blue,
      secondary: orange,
    },
  },
});
