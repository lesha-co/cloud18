import sqlite3 from "sqlite3";
import fs from "node:fs/promises";
import assert from "node:assert";
import type { Edge } from "./shared/subreddit-graph.ts";

interface Node {
  id: string;
  degree: number;
  meta: { nsfw: boolean; subs: number };
}

interface GraphData {
  nodes: Node[];
  edges: { from_subreddit: string; to_subreddit: string }[];
}

async function all(db: sqlite3.Database, query: string) {
  return new Promise((resolve, reject) => {
    db.all(query, (err, rows) => {
      if (err) {
        reject();
        return;
      }
      resolve(rows);
    });
  });
}

// Read graph data from database and process it for visualization
async function readAndProcessGraphData(dbPath: string): Promise<GraphData> {
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  const nodeMap = new Map<string, number>();
  const meta = new Map<string, { nsfw: boolean; subs: number }>();

  const rows = (await all(
    db,
    "SELECT subreddit, subscribers, nsfw FROM subreddit_queue",
  )) as any[];

  rows.forEach((row) => {
    meta.set(row.subreddit, { nsfw: row.nsfw === 1, subs: row.subscribers });
    // nodeMap.set(row.subreddit, 0);
  });

  const edges = (await all(
    db,
    "SELECT from_subreddit, to_subreddit FROM subreddit_edges",
  )) as Edge[];
  // Read edges

  // Process edges and count degree for each node
  edges.forEach((edge) => {
    // Count outgoing edges
    nodeMap.set(
      edge.from_subreddit,
      (nodeMap.get(edge.from_subreddit) || 0) + 1,
    );
    // Count incoming edges
    nodeMap.set(edge.to_subreddit, (nodeMap.get(edge.to_subreddit) || 0) + 1);
  });

  // Create nodes array with degree, subscriber, and nsfw information
  const nodes: Node[] = Array.from(nodeMap.entries()).map(([id, degree]) => {
    const thisMeta = meta.get(id);
    if (!thisMeta) throw new Error("no meta");
    return {
      id,
      degree,
      meta: thisMeta,
    };
  });
  console.log("edges.length", edges.length);
  console.log("nodes.length", nodes.length);
  console.log("rows.length", rows.length);
  console.log("nodeMap.size", nodeMap.size);
  db.close();

  return { nodes, edges };
}

// Generate HTML with D3.js visualization
async function generateHTML(graphData: GraphData) {
  const template = await fs.readFile("scripts/shared/template.html", "utf-8");
  return template.replace("%TEMPLATE%", JSON.stringify(graphData));
}

assert(process.env.DATABASE_FILE);
assert(process.env.OUT_NETWORK);

const graphData = await readAndProcessGraphData(process.env.DATABASE_FILE);

console.log(
  `Created graph with ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`,
);

const html = await generateHTML(graphData);

console.log("Writing output file...");
await fs.writeFile(process.env.OUT_NETWORK, html);

console.log("ok");
