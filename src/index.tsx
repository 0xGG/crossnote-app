import React from "react";
import ReactDOM from "react-dom";
//import "typeface-noto-sans";
//import "typeface-noto-sans-sc";
//import "typeface-noto-serif-sc";
//import "typeface-noto-sans-hk";
import "typeface-roboto";
import "noty/lib/noty.css";
import "noty/lib/themes/relax.css";
// @ts-ignore
import LightningFS from "@isomorphic-git/lightning-fs";

import "./i18n/i18n";
import "./index.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import Crossnote from "./lib/crossnote";
import { CrossnoteContainer } from "./containers/crossnote";

const fs = new LightningFS("fs");
(window as any)["fs"] = fs;

try {
  const crossnote = new Crossnote({
    fs: fs
  });
  (window as any)["crossnote"] = crossnote;

  ReactDOM.render(
    <CrossnoteContainer.Provider
      initialState={{
        crossnote: crossnote
      }}
    >
      <App />
    </CrossnoteContainer.Provider>,
    document.getElementById("root")
  );
} catch (error) {
  console.log(error);
}

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();
serviceWorker.register();
