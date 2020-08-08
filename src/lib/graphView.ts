import { Notebook, Note } from "./notebook";

export interface GraphViewNode {
  id: string;
  label: string;
}

export interface GraphViewLink {
  source: string;
  target: string;
}

export interface GraphViewData {
  nodes: GraphViewNode[];
  links: GraphViewLink[];
}

export function constructGraphView(notebook: Notebook): GraphViewData {
  const nodes: GraphViewNode[] = [];
  const links: GraphViewLink[] = [];

  for (let filePath in notebook.notes) {
    const note = notebook.notes[filePath];
    nodes.push({
      id: note.filePath,
      label: note.title,
    });

    for (let mentionedFilePath in note.mentions) {
      const mentionedNote = note.mentions[mentionedFilePath];
      links.push({
        source: note.filePath,
        target: mentionedNote.filePath,
      });
    }
  }
  return {
    nodes,
    links,
  };
}
