import "./polyfills";
import "@mdi/font/css/materialdesignicons.min.css";
import "noty/lib/noty.css";
import "noty/lib/themes/relax.css";
import { createRoot } from "react-dom/client";
import "typeface-noto-sans-sc/index.css";
import "typeface-roboto/index.css";
import App from "./App";
import { CrossnoteContainer } from "./containers/crossnote";
import { SettingsContainer } from "./containers/settings";
import "./i18n/i18n";
import "./index.css";
import Crossnote from "./lib/crossnote";
import "./lib/fs";
import "./themes/manager";

try {
  const crossnote = new Crossnote();
  createRoot(document.getElementById("root")).render(
    <CrossnoteContainer.Provider
      initialState={{
        crossnote: crossnote,
      }}
    >
      <SettingsContainer.Provider initialState={{}}>
        <App />
      </SettingsContainer.Provider>
    </CrossnoteContainer.Provider>,
  );
} catch (error) {
  console.log(error);
}
