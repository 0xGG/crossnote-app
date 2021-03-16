import { Reference } from "./reference";

export type TabNodeComponent =
  | "Settings"
  | "Note"
  | "Notes"
  | "Privacy"
  | "Graph"
  | "Notifications";

export interface TabNodeConfig {
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

export const TabHeight = 24;