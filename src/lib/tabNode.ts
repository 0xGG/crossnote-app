import { Note, Notebook } from "./notebook";

export type TabNodeComponent =
  | "Settings"
  | "Note"
  | "Notes"
  | "Today"
  | "Todo"
  | "Conflicted"
  | "Privacy"
  | "Graph";

export interface TabNodeConfig {
  singleton: boolean;
  note?: Note;
  notebook?: Notebook;
}

export interface TabNode {
  type: "tab";
  name: string;
  component: TabNodeComponent;
  config: TabNodeConfig;
  id?: string;
}

export const TabHeight = 24;
