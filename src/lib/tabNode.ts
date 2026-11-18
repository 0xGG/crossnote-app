import { Reference } from "./reference";

// Kept as a runtime list, not only a type: the layout persisted in
// localStorage outlives the components it names, so the restore boundary
// (lib/layout.ts) needs to tell a live component from a removed one.
export const TabNodeComponents = [
  "Settings",
  "Note",
  "Notes",
  "Graph",
] as const;

export type TabNodeComponent = (typeof TabNodeComponents)[number];

export function isTabNodeComponent(value: unknown): value is TabNodeComponent {
  return (TabNodeComponents as readonly unknown[]).includes(value);
}

export interface TabNodeConfig {
  component: TabNodeComponent;
  singleton: boolean;
  noteFilePath?: string;
  notebookPath?: string;
  reference?: Reference;
}

export interface CrossnoteTabNode {
  type: "tab";
  name: string;
  component: TabNodeComponent;
  config: TabNodeConfig;
  id?: string;
}

// Shared by tab creation and rendering; note and notebook names remain custom.
export const builtInTabLabels = {
  Settings: "general/Settings",
  Graph: "general/graph-view",
} as const;
