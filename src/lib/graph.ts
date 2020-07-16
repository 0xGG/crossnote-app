import { Note } from "./crossnote";

export interface GraphNode {
  note: Note;
  sanitiedTitle: string;
  sanitizedFilePath: string;
  outCount: number;
  inCount: number;
}

export interface GraphEdge {
  from: GraphNode;
  to: GraphNode;
}

export interface Graph {
  edges: GraphEdge[];
  nodes: GraphNode[];
}

export function constructGraphFromNotes(notes: Note[]): Graph {
  const edges: GraphEdge[] = [];
  const nodes: GraphNode[] = [];
  const graph: Graph = {
    edges,
    nodes,
  };
  return graph;
}
