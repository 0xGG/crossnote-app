// Type-level compatibility shims for libraries whose typings predate
// React 18 (where implicit children on component props were removed).
// These libraries work fine at runtime; only their .d.ts files are stale.
// This file can be deleted once the libraries are upgraded or replaced.
import * as React from "react";

declare module "@material-ui/core/Hidden" {
  interface HiddenProps {
    children?: React.ReactNode;
  }
}
