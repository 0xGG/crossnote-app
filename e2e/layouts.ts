// Saved layouts for the specs to start the app from (see
// CrossnoteApp.seedLayout).

// A note tab of a notebook that does not exist: its pane renders empty, which
// is all these layouts need from it.
export const noteTab = (id: string, name = id) => ({
  type: "tab",
  id,
  name,
  component: "Note",
  config: {
    component: "Note",
    singleton: false,
    notebookPath: "/missing",
    noteFilePath: `${id}.md`,
  },
});

// The settings: a pane with text fields to drag text between.
export const settingsTab = {
  type: "tab",
  id: "Settings",
  name: "Settings",
  component: "Settings",
  config: { component: "Settings", singleton: true },
};

export const tabset = (...children: object[]) => ({
  type: "tabset",
  children,
});

export const row = (...children: object[]) => ({ type: "row", children });

export const layoutOf = (root: object) => ({
  global: {},
  borders: [],
  layout: root,
});
