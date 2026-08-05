// Minimal replacement for the `history` package. The router was removed
// together with the backend (the app has a single view), so in-app
// navigation only needs to update the address bar for shareable URLs.
export const browserHistory = {
  push(path: string) {
    window.history.pushState(null, "", path);
  },
  replace(path: string) {
    window.history.replaceState(null, "", path);
  },
};
