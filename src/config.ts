// Default CORS proxy used for git sync over HTTPS (clone/pull/push run in
// the browser via isomorphic-git and need a proxy for cross-origin remotes).
// Overridable at build time through the VITE_DEFAULT_CORS_PROXY environment
// variable; an explicitly empty value means "no proxy by default" (?? keeps
// it, || would swallow it). Each notebook can also set its own proxy in the
// UI.
export const DEFAULT_CORS_PROXY =
  import.meta.env.VITE_DEFAULT_CORS_PROXY ?? "https://cors.isomorphic-git.org";
