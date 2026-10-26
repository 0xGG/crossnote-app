import "./polyfills";
import "@mdi/font/css/materialdesignicons.min.css";
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
import { keepStorage } from "./lib/storage";
import "./themes/manager";

// The notes in the browser's storage go when the browser clears it to free
// up space, unless it has granted the site to keep it.
keepStorage();

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
